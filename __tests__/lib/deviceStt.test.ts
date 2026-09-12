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
});
