// Helper: run a test in an isolated module scope so the Zustand singleton
// and loadSettingsInFlight latch are fresh, AND the test and store share
// the same AsyncStorage mock instance.
async function withFreshStore(
  seed: string | null,
  fn: (useSettingsStore: any, AsyncStorage: any) => Promise<void>
) {
  await jest.isolateModulesAsync(async () => {
    const AsyncStorage =
      require("@react-native-async-storage/async-storage").default;
    AsyncStorage._reset();

    if (seed !== null) {
      await AsyncStorage.setItem("@app_settings", seed);
    }

    const { useSettingsStore } = require("../../lib/settingsStore");
    await fn(useSettingsStore, AsyncStorage);
  });
}

// ─── loadSettings ───────────────────────────────────────────────────────────

describe("loadSettings", () => {
  it("marks settings loaded when nothing is stored", async () => {
    await withFreshStore(null, async (useSettingsStore) => {
      await useSettingsStore.getState().loadSettings();
      expect(useSettingsStore.getState().hasLoadedSettings).toBe(true);
    });
  });

  it("falls back to defaults on malformed JSON", async () => {
    await withFreshStore("not json{", async (useSettingsStore) => {
      await useSettingsStore.getState().loadSettings();
      expect(useSettingsStore.getState().settings).toEqual({
        aiConsentAcceptedAt: null,
      });
      expect(useSettingsStore.getState().hasLoadedSettings).toBe(true);
    });
  });

  it("defaults aiConsentAcceptedAt to null when nothing is stored", async () => {
    await withFreshStore(null, async (useSettingsStore) => {
      await useSettingsStore.getState().loadSettings();
      expect(useSettingsStore.getState().settings.aiConsentAcceptedAt).toBeNull();
    });
  });

  it("treats settings written before consent existed as not consented", async () => {
    await withFreshStore(
      JSON.stringify({ aiConsentAcceptedAt: undefined }),
      async (useSettingsStore) => {
        await useSettingsStore.getState().loadSettings();
        expect(useSettingsStore.getState().settings.aiConsentAcceptedAt).toBeNull();
      }
    );
  });

  it("loads a stored aiConsentAcceptedAt timestamp", async () => {
    await withFreshStore(
      JSON.stringify({ aiConsentAcceptedAt: 1700000000000 }),
      async (useSettingsStore) => {
        await useSettingsStore.getState().loadSettings();
        expect(useSettingsStore.getState().settings.aiConsentAcceptedAt).toBe(
          1700000000000
        );
      }
    );
  });

  it("treats a non-numeric stored aiConsentAcceptedAt as not consented", async () => {
    await withFreshStore(
      JSON.stringify({ aiConsentAcceptedAt: "yes" }),
      async (useSettingsStore) => {
        await useSettingsStore.getState().loadSettings();
        expect(useSettingsStore.getState().settings.aiConsentAcceptedAt).toBeNull();
      }
    );
  });

  // The address term was removed (OLD-95): a spoken line never names the user,
  // so a term left behind by an older install must not survive the load.
  it("drops a legacy stored address term", async () => {
    await withFreshStore(
      JSON.stringify({ addressTerm: "Sir", aiConsentAcceptedAt: 1700000000000 }),
      async (useSettingsStore) => {
        await useSettingsStore.getState().loadSettings();
        expect(useSettingsStore.getState().settings).toEqual({
          aiConsentAcceptedAt: 1700000000000,
        });
      }
    );
  });
});

// ─── setAiConsent ───────────────────────────────────────────────────────────

describe("setAiConsent", () => {
  it("stamps a timestamp and persists it when accepted", async () => {
    await withFreshStore(null, async (useSettingsStore, AsyncStorage) => {
      const before = Date.now();
      await useSettingsStore.getState().setAiConsent(true);
      const stamped = useSettingsStore.getState().settings.aiConsentAcceptedAt;

      expect(typeof stamped).toBe("number");
      expect(stamped).toBeGreaterThanOrEqual(before);
      expect(JSON.parse(AsyncStorage._store.get("@app_settings"))).toEqual({
        aiConsentAcceptedAt: stamped,
      });
    });
  });

  it("clears the timestamp when revoked", async () => {
    await withFreshStore(
      JSON.stringify({ aiConsentAcceptedAt: 1700000000000 }),
      async (useSettingsStore, AsyncStorage) => {
        await useSettingsStore.getState().loadSettings();
        await useSettingsStore.getState().setAiConsent(false);
        expect(useSettingsStore.getState().settings.aiConsentAcceptedAt).toBeNull();
        expect(JSON.parse(AsyncStorage._store.get("@app_settings"))).toEqual({
          aiConsentAcceptedAt: null,
        });
      }
    );
  });

  // Consent is the only thing persisted now — writing it must not resurrect an
  // address term that an older install left in the same blob.
  it("does not write a legacy address term back out", async () => {
    await withFreshStore(
      JSON.stringify({ addressTerm: "Wahab" }),
      async (useSettingsStore, AsyncStorage) => {
        await useSettingsStore.getState().loadSettings();
        await useSettingsStore.getState().setAiConsent(true);
        const written = JSON.parse(AsyncStorage._store.get("@app_settings"));
        expect(written.addressTerm).toBeUndefined();
      }
    );
  });

  it("rolls back state when persistence fails", async () => {
    await withFreshStore(null, async (useSettingsStore, AsyncStorage) => {
      AsyncStorage.setItem.mockRejectedValueOnce(new Error("disk full"));
      await expect(
        useSettingsStore.getState().setAiConsent(true)
      ).rejects.toThrow("disk full");
      expect(useSettingsStore.getState().settings.aiConsentAcceptedAt).toBeNull();
    });
  });
});
