/**
 * On-device STT config + orchestration (spec §1, §3).
 *
 * The locale resolver and the handoff decision are pure; runDeviceStt is the
 * one piece with a clock, so its timeout/late-resolve behaviour is driven with
 * real (short) timers rather than a fake clock, which keeps the microtask
 * ordering around the awaited status check honest.
 */
import {
  resolveVoiceLocale,
  resolveVoicePlan,
  runDeviceStt,
  runVoiceHandoff,
  type DeviceSttDeps,
  type DeviceSttSuccess,
} from "../../lib/deviceStt";
import type { SpeechStatus, SpeechTranscript } from "../../lib/vrSpeech";

const installed = (over: Partial<SpeechStatus> = {}): SpeechStatus => ({
  resolvedLocale: "en-US",
  supported: true,
  installed: true,
  ...over,
});

const transcript = (over: Partial<SpeechTranscript> = {}): SpeechTranscript => ({
  text: "call mom at six",
  resolvedLocale: "en-US",
  engine: "dictation",
  ms: 42,
  ...over,
});

function makeDeps(over: Partial<DeviceSttDeps> = {}): DeviceSttDeps {
  return {
    speechStatus: async () => installed(),
    speechTranscribeFile: async () => transcript(),
    speechCancel: async () => {},
    ...over,
  };
}

// ─── resolveVoiceLocale ─────────────────────────────────────────────────────

describe("resolveVoiceLocale", () => {
  it("maps the explicit choices to canonical locales", () => {
    expect(resolveVoiceLocale("en", [])).toBe("en-US");
    expect(resolveVoiceLocale("ar", [])).toBe("ar-SA");
    // The explicit choice wins over whatever the device prefers.
    expect(resolveVoiceLocale("en", ["ar-EG"])).toBe("en-US");
  });

  it("auto takes the first en/ar device language", () => {
    expect(resolveVoiceLocale("auto", ["en-GB", "fr-FR"])).toBe("en-US");
    expect(resolveVoiceLocale("auto", ["ar-EG", "en-US"])).toBe("ar-SA");
    // Non-matching languages ahead of a match are skipped.
    expect(resolveVoiceLocale("auto", ["fr-FR", "de-DE", "en-US"])).toBe("en-US");
  });

  it("auto falls back to English when nothing matches or the list is empty", () => {
    expect(resolveVoiceLocale("auto", ["fr-FR", "de-DE"])).toBe("en-US");
    expect(resolveVoiceLocale("auto", [])).toBe("en-US");
    expect(resolveVoiceLocale("auto", undefined)).toBe("en-US");
  });

  it("ignores non-string entries in the device list", () => {
    expect(resolveVoiceLocale("auto", [undefined as any, 5 as any, "ar"])).toBe("ar-SA");
  });

  // OLD-140: the language the server learned this device speaks in.
  it("auto listens in a learned non-English language", () => {
    expect(resolveVoiceLocale("auto", ["en-US"], "sv")).toBe("sv-SE");
    expect(resolveVoiceLocale("auto", ["en-GB"], "he")).toBe("he-IL");
    expect(resolveVoiceLocale("auto", ["en-US"], "de")).toBe("de-DE");
    // It outranks the device's own Arabic too.
    expect(resolveVoiceLocale("auto", ["ar-EG"], "sv")).toBe("sv-SE");
  });

  it("a learned English, or nothing learned, leaves auto exactly as it was", () => {
    for (const spoken of ["en", null, undefined, "", "bogus"]) {
      expect(resolveVoiceLocale("auto", ["en-GB", "fr-FR"], spoken)).toBe("en-US");
      expect(resolveVoiceLocale("auto", ["ar-EG", "en-US"], spoken)).toBe("ar-SA");
      expect(resolveVoiceLocale("auto", [], spoken)).toBe("en-US");
    }
  });

  it("an explicit Settings choice still wins over a learned language", () => {
    expect(resolveVoiceLocale("en", ["en-US"], "sv")).toBe("en-US");
    expect(resolveVoiceLocale("ar", ["en-US"], "he")).toBe("ar-SA");
  });
});

// ─── resolveVoicePlan (OLD-140) ─────────────────────────────────────────────

describe("resolveVoicePlan", () => {
  const plan = (
    over: Partial<Parameters<typeof resolveVoicePlan>[0]> = {}
  ): Parameters<typeof resolveVoicePlan>[0] => ({
    setting: "auto",
    deviceLocales: ["en-US"],
    spokenLang: "sv",
    engine: "dictation",
    available: true,
    speechStatus: jest.fn(async () => installed()),
    ...over,
  });

  it("listens on-device in the learned language when the phone has it", async () => {
    const params = plan();
    expect(await resolveVoicePlan(params)).toEqual({ path: "device", localeId: "sv-SE" });
    expect(params.speechStatus).toHaveBeenCalledWith("sv-SE", "dictation");
  });

  it("goes straight to the cloud when the phone cannot listen in it", async () => {
    const unsupported = plan({
      spokenLang: "he",
      speechStatus: async () => installed({ supported: false, installed: false }),
    });
    expect(await resolveVoicePlan(unsupported)).toEqual({
      path: "cloud",
      localeId: "he-IL",
      reason: "spoken_lang_unavailable",
    });
    // Supported but assets not on the phone yet: cloud too, never a wait.
    const notInstalled = plan({ speechStatus: async () => installed({ installed: false }) });
    expect((await resolveVoicePlan(notInstalled)).path).toBe("cloud");
    // A status check that throws is the same answer.
    const throwing = plan({
      speechStatus: async () => {
        throw new Error("boom");
      },
    });
    expect((await resolveVoicePlan(throwing)).path).toBe("cloud");
  });

  it("English devices are unchanged: no extra status check, today's locale", async () => {
    for (const spokenLang of ["en", null, undefined]) {
      const params = plan({ spokenLang });
      expect(await resolveVoicePlan(params)).toEqual({ path: "device", localeId: "en-US" });
      expect(params.speechStatus).not.toHaveBeenCalled();
    }
  });

  it("an explicit Settings choice is never second-guessed", async () => {
    const params = plan({ setting: "en" });
    expect(await resolveVoicePlan(params)).toEqual({ path: "device", localeId: "en-US" });
    expect(params.speechStatus).not.toHaveBeenCalled();
  });

  it("without the module there is nothing to check", async () => {
    const params = plan({ available: false });
    expect(await resolveVoicePlan(params)).toEqual({ path: "device", localeId: "sv-SE" });
    expect(params.speechStatus).not.toHaveBeenCalled();
  });
});

// ─── env defaults ───────────────────────────────────────────────────────────

describe("env defaults", () => {
  const ENGINE = "EXPO_PUBLIC_VR_STT_ENGINE";
  const TIMEOUT = "EXPO_PUBLIC_VR_STT_TIMEOUT_MS";

  afterEach(() => {
    delete process.env[ENGINE];
    delete process.env[TIMEOUT];
    jest.resetModules();
  });

  it("defaults to dictation and 4000ms when unset", () => {
    jest.isolateModules(() => {
      const mod = require("../../lib/deviceStt");
      expect(mod.DEFAULT_STT_ENGINE).toBe("dictation");
      expect(mod.DEFAULT_STT_TIMEOUT_MS).toBe(4000);
    });
  });

  it("honours a transcriber engine and a custom timeout", () => {
    process.env[ENGINE] = "transcriber";
    process.env[TIMEOUT] = "2500";
    jest.isolateModules(() => {
      const mod = require("../../lib/deviceStt");
      expect(mod.DEFAULT_STT_ENGINE).toBe("transcriber");
      expect(mod.DEFAULT_STT_TIMEOUT_MS).toBe(2500);
    });
  });

  it("falls back to dictation/4000 for a bogus engine or non-positive timeout", () => {
    process.env[ENGINE] = "wobble";
    process.env[TIMEOUT] = "0";
    jest.isolateModules(() => {
      const mod = require("../../lib/deviceStt");
      expect(mod.DEFAULT_STT_ENGINE).toBe("dictation");
      expect(mod.DEFAULT_STT_TIMEOUT_MS).toBe(4000);
    });
  });
});

// ─── runDeviceStt ───────────────────────────────────────────────────────────

describe("runDeviceStt", () => {
  const args = {
    fileUri: "file:///take.m4a",
    localeId: "en-US",
    engine: "dictation" as const,
    timeoutMs: 1000,
    requestId: "req-1",
  };

  it("returns the trimmed transcript on success", async () => {
    const res = await runDeviceStt(
      makeDeps({ speechTranscribeFile: async () => transcript({ text: "  hello world  " }) }),
      args
    );
    expect(res).toEqual({
      ok: true,
      text: "hello world",
      ms: 42,
      engine: "dictation",
      locale: "en-US",
    });
  });

  it("skips when the engine is not installed — never waits on a download", async () => {
    const transcribe = jest.fn();
    const res = await runDeviceStt(
      makeDeps({
        speechStatus: async () => installed({ installed: false, reason: "assets missing" }),
        speechTranscribeFile: transcribe as any,
      }),
      args
    );
    expect(res).toEqual({ ok: false, reason: "not_ready" });
    expect(transcribe).not.toHaveBeenCalled();
  });

  it("reports an empty transcript as empty, not success", async () => {
    const res = await runDeviceStt(
      makeDeps({ speechTranscribeFile: async () => transcript({ text: "   " }) }),
      args
    );
    expect(res).toEqual({ ok: false, reason: "empty" });
  });

  it("passes a native reject code straight through as the reason", async () => {
    const res = await runDeviceStt(
      makeDeps({
        speechTranscribeFile: async () => {
          throw Object.assign(new Error("no assets"), { code: "assets_missing" });
        },
      }),
      args
    );
    expect(res).toEqual({ ok: false, reason: "assets_missing" });
  });

  it("uses 'error' for a reject without a code", async () => {
    const res = await runDeviceStt(
      makeDeps({
        speechTranscribeFile: async () => {
          throw new Error("boom");
        },
      }),
      args
    );
    expect(res).toEqual({ ok: false, reason: "error" });
  });

  it("treats a thrown status check as a coded failure", async () => {
    const res = await runDeviceStt(
      makeDeps({
        speechStatus: async () => {
          throw Object.assign(new Error("x"), { code: "io" });
        },
      }),
      args
    );
    expect(res).toEqual({ ok: false, reason: "io" });
  });

  it("cancels on timeout and ignores a transcript that resolves afterwards", async () => {
    let resolveLate: (t: SpeechTranscript) => void = () => {};
    const speechCancel = jest.fn(async () => {});
    const res = await runDeviceStt(
      makeDeps({
        speechTranscribeFile: () =>
          new Promise<SpeechTranscript>((resolve) => {
            resolveLate = resolve;
          }),
        speechCancel,
      }),
      { ...args, timeoutMs: 20 }
    );

    expect(res).toEqual({ ok: false, reason: "timeout" });
    expect(speechCancel).toHaveBeenCalledWith("req-1");

    // The native side answers late; the settled latch must swallow it silently.
    resolveLate(transcript({ text: "too late" }));
    await new Promise((r) => setTimeout(r, 5));
    expect(res).toEqual({ ok: false, reason: "timeout" });
  });
});

// ─── runVoiceHandoff (spec §3) ──────────────────────────────────────────────

describe("runVoiceHandoff", () => {
  const base = {
    fileUri: "file:///take.m4a",
    localeId: "en-US",
    engine: "dictation" as const,
    timeoutMs: 1000,
    requestId: "req-1",
  };

  it("takes the device path on success — onDevice, no upload", async () => {
    const onDevice = jest.fn(async (_s: DeviceSttSuccess) => {});
    const onCloud = jest.fn(async () => {});
    const onPerf = jest.fn();

    const result = await runVoiceHandoff({
      ...base,
      available: true,
      hasAudioStorageId: false,
      stt: makeDeps(),
      onDevice,
      onCloud,
      onPerf,
    });

    expect(result).toEqual({ path: "device", stt: expect.objectContaining({ ok: true }) });
    expect(onDevice).toHaveBeenCalledTimes(1);
    expect(onCloud).not.toHaveBeenCalled();
    expect(onPerf).toHaveBeenCalledWith(
      "device_stt",
      expect.objectContaining({ engine: "dictation", locale: "en-US", chars: expect.any(Number) })
    );
  });

  it("falls back to the cloud path with the failure reason", async () => {
    const onDevice = jest.fn(async () => {});
    const onCloud = jest.fn(async () => {});
    const onPerf = jest.fn();

    const result = await runVoiceHandoff({
      ...base,
      available: true,
      hasAudioStorageId: false,
      stt: makeDeps({ speechTranscribeFile: async () => transcript({ text: "" }) }),
      onDevice,
      onCloud,
      onPerf,
    });

    expect(result).toEqual({ path: "cloud", reason: "empty" });
    expect(onDevice).not.toHaveBeenCalled();
    expect(onCloud).toHaveBeenCalledTimes(1);
    expect(onPerf).toHaveBeenCalledWith("device_stt_fallback", { reason: "empty" });
  });

  it("goes straight to cloud, with no device attempt, when the module is missing", async () => {
    const stt = makeDeps({ speechTranscribeFile: jest.fn() as any });
    const onCloud = jest.fn(async () => {});
    const onPerf = jest.fn();

    const result = await runVoiceHandoff({
      ...base,
      available: false,
      hasAudioStorageId: false,
      stt,
      onDevice: async () => {},
      onCloud,
      onPerf,
    });

    expect(result).toEqual({ path: "cloud" });
    expect(onCloud).toHaveBeenCalledTimes(1);
    expect(stt.speechTranscribeFile).not.toHaveBeenCalled();
    expect(onPerf).not.toHaveBeenCalled();
  });

  it("skips the device attempt when the take already uploaded", async () => {
    const stt = makeDeps({ speechTranscribeFile: jest.fn() as any });
    const onCloud = jest.fn(async () => {});

    const result = await runVoiceHandoff({
      ...base,
      available: true,
      hasAudioStorageId: true,
      stt,
      onDevice: async () => {},
      onCloud,
    });

    expect(result).toEqual({ path: "cloud" });
    expect(onCloud).toHaveBeenCalledTimes(1);
    expect(stt.speechTranscribeFile).not.toHaveBeenCalled();
  });

  it("goes straight to the cloud when the plan said so, and says why (OLD-140)", async () => {
    const stt = makeDeps({ speechStatus: jest.fn() as any, speechTranscribeFile: jest.fn() as any });
    const onCloud = jest.fn(async () => {});
    const onPerf = jest.fn();

    const result = await runVoiceHandoff({
      ...base,
      localeId: "he-IL",
      available: true,
      hasAudioStorageId: false,
      skipDeviceReason: "spoken_lang_unavailable",
      stt,
      onDevice: async () => {},
      onCloud,
      onPerf,
    });

    expect(result).toEqual({ path: "cloud", reason: "spoken_lang_unavailable" });
    expect(onCloud).toHaveBeenCalledTimes(1);
    expect(stt.speechStatus).not.toHaveBeenCalled();
    expect(stt.speechTranscribeFile).not.toHaveBeenCalled();
    expect(onPerf).toHaveBeenCalledWith("device_stt_fallback", {
      reason: "spoken_lang_unavailable",
    });
  });
});
