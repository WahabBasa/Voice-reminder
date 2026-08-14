// The first-run AI consent card: the copy it shows and what each button does.
// The component itself is .tsx (Jest here only picks up .ts), so the behaviour
// under test is the module the card and the recorder both call.

jest.mock("../../lib/audio", () => ({
  requestMicrophonePermission: jest.fn(async () => "granted"),
}));

type Harness = {
  resolveAiConsent: any;
  AI_CONSENT_COPY: any;
  AI_CONSENT_LEARN_MORE_URL: string;
  useSettingsStore: any;
  audio: { requestMicrophonePermission: jest.Mock };
  AsyncStorage: any;
};

// Same isolation trick as settingsStore.test.ts: a fresh Zustand singleton and
// a fresh AsyncStorage mock per test, shared with the module under test.
async function withFreshConsent(fn: (h: Harness) => Promise<void>) {
  await jest.isolateModulesAsync(async () => {
    const AsyncStorage =
      require("@react-native-async-storage/async-storage").default;
    AsyncStorage._reset();

    const audio = require("../../lib/audio");
    audio.requestMicrophonePermission.mockClear();
    audio.requestMicrophonePermission.mockResolvedValue("granted");

    const {
      resolveAiConsent,
      AI_CONSENT_COPY,
      AI_CONSENT_LEARN_MORE_URL,
    } = require("../../lib/aiConsent");
    const { useSettingsStore } = require("../../lib/settingsStore");

    await fn({
      resolveAiConsent,
      AI_CONSENT_COPY,
      AI_CONSENT_LEARN_MORE_URL,
      useSettingsStore,
      audio,
      AsyncStorage,
    });
  });
}

// ─── Allow ──────────────────────────────────────────────────────────────────

describe("resolveAiConsent('allow')", () => {
  it("persists consent", async () => {
    await withFreshConsent(async ({ resolveAiConsent, useSettingsStore, AsyncStorage }) => {
      const before = Date.now();
      const outcome = await resolveAiConsent("allow");

      const stamped = useSettingsStore.getState().settings.aiConsentAcceptedAt;
      expect(typeof stamped).toBe("number");
      expect(stamped).toBeGreaterThanOrEqual(before);
      expect(JSON.parse(AsyncStorage._store.get("@app_settings")).aiConsentAcceptedAt).toBe(
        stamped
      );
      expect(outcome.consented).toBe(true);
      expect(outcome.error).toBeUndefined();
    });
  });

  it("chains into the system microphone prompt once consent is saved", async () => {
    await withFreshConsent(async ({ resolveAiConsent, useSettingsStore, audio }) => {
      audio.requestMicrophonePermission.mockImplementationOnce(async () => {
        // Consent is already on disk by the time the OS alert goes up: the user
        // answers the card, then the alert, with nothing in between.
        expect(useSettingsStore.getState().settings.aiConsentAcceptedAt).not.toBeNull();
        return "granted";
      });

      const outcome = await resolveAiConsent("allow");

      expect(audio.requestMicrophonePermission).toHaveBeenCalledTimes(1);
      expect(outcome.mic).toBe("granted");
      expect(outcome.proceedToRecording).toBe(true);
    });
  });

  it("still continues to the recorder when the mic is denied", async () => {
    await withFreshConsent(async ({ resolveAiConsent, audio }) => {
      audio.requestMicrophonePermission.mockResolvedValueOnce("denied");

      const outcome = await resolveAiConsent("allow");

      expect(outcome.consented).toBe(true);
      expect(outcome.mic).toBe("denied");
      // The recorder owns the "Microphone access required" message.
      expect(outcome.proceedToRecording).toBe(true);
    });
  });

  it("reports a save failure and never shows the mic prompt", async () => {
    await withFreshConsent(async ({ resolveAiConsent, useSettingsStore, audio, AsyncStorage }) => {
      AsyncStorage.setItem.mockRejectedValueOnce(new Error("disk full"));

      const outcome = await resolveAiConsent("allow");

      expect(outcome).toEqual({
        consented: false,
        mic: null,
        proceedToRecording: false,
        error: "persist_failed",
      });
      expect(audio.requestMicrophonePermission).not.toHaveBeenCalled();
      expect(useSettingsStore.getState().settings.aiConsentAcceptedAt).toBeNull();
    });
  });

  it("keeps consent when the mic request itself throws", async () => {
    await withFreshConsent(async ({ resolveAiConsent, useSettingsStore, audio }) => {
      audio.requestMicrophonePermission.mockRejectedValueOnce(new Error("no such module"));

      const outcome = await resolveAiConsent("allow");

      expect(useSettingsStore.getState().settings.aiConsentAcceptedAt).not.toBeNull();
      expect(outcome.mic).toBeNull();
      expect(outcome.proceedToRecording).toBe(true);
    });
  });
});

// ─── Not now ────────────────────────────────────────────────────────────────

describe("resolveAiConsent('not_now')", () => {
  it("saves nothing, asks for nothing, records nothing", async () => {
    await withFreshConsent(async ({ resolveAiConsent, useSettingsStore, audio, AsyncStorage }) => {
      const outcome = await resolveAiConsent("not_now");

      expect(outcome).toEqual({ consented: false, mic: null, proceedToRecording: false });
      expect(useSettingsStore.getState().settings.aiConsentAcceptedAt).toBeNull();
      expect(AsyncStorage.setItem).not.toHaveBeenCalled();
      expect(audio.requestMicrophonePermission).not.toHaveBeenCalled();
    });
  });

  it("leaves the card re-promptable: a later allow still works", async () => {
    await withFreshConsent(async ({ resolveAiConsent, useSettingsStore }) => {
      await resolveAiConsent("not_now");
      await resolveAiConsent("allow");

      expect(useSettingsStore.getState().settings.aiConsentAcceptedAt).not.toBeNull();
    });
  });
});

// ─── Copy ───────────────────────────────────────────────────────────────────

describe("AI_CONSENT_COPY", () => {
  const copyValues = () => {
    const { AI_CONSENT_COPY } = require("../../lib/aiConsent");
    return Object.values(AI_CONSENT_COPY) as string[];
  };

  it("never names an AI provider", () => {
    const all = copyValues().join(" ");
    expect(all).not.toMatch(
      /openai|whisper|gpt|elevenlabs|eleven labs|resemble|openrouter|gemini|google|anthropic|claude|deepgram/i
    );
  });

  it("stays a two-sentence card — no bullets, no headings, no line breaks", () => {
    const { AI_CONSENT_COPY } = require("../../lib/aiConsent");
    const sentence = `${AI_CONSENT_COPY.body} ${AI_CONSENT_COPY.learnMorePrefix}${AI_CONSENT_COPY.learnMoreLabel}${AI_CONSENT_COPY.learnMoreSuffix}`;

    expect(sentence.length).toBeLessThanOrEqual(200);
    expect((sentence.match(/\./g) ?? []).length).toBe(2);
    expect(sentence).not.toMatch(/[\n••]/);
  });

  it("says the recording leaves the device for third parties (5.1.2(i))", () => {
    const { AI_CONSENT_COPY } = require("../../lib/aiConsent");
    expect(AI_CONSENT_COPY.body).toMatch(/third-party/i);
    expect(AI_CONSENT_COPY.body).toMatch(/voice/i);
  });

  it("offers an explicit allow and an explicit decline", () => {
    const { AI_CONSENT_COPY } = require("../../lib/aiConsent");
    expect(AI_CONSENT_COPY.allowLabel).toBe("Allow");
    expect(AI_CONSENT_COPY.declineLabel).toBe("Not now");
  });

  it("points Learn more at the shared privacy policy constant", () => {
    const { AI_CONSENT_LEARN_MORE_URL } = require("../../lib/aiConsent");
    const { PRIVACY_POLICY_URL } = require("../../lib/legalLinks");
    expect(AI_CONSENT_LEARN_MORE_URL).toBe(PRIVACY_POLICY_URL);
  });
});
