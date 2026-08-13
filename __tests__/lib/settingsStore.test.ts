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
  it("defaults addressTerm to empty string when nothing is stored", async () => {
    await withFreshStore(null, async (useSettingsStore) => {
      await useSettingsStore.getState().loadSettings();
      expect(useSettingsStore.getState().settings.addressTerm).toBe("");
      expect(useSettingsStore.getState().hasLoadedSettings).toBe(true);
    });
  });

  it("loads a stored addressTerm", async () => {
    await withFreshStore(
      JSON.stringify({ addressTerm: "Wahab" }),
      async (useSettingsStore) => {
        await useSettingsStore.getState().loadSettings();
        expect(useSettingsStore.getState().settings.addressTerm).toBe("Wahab");
      }
    );
  });

  it("loads an Arabic addressTerm as-is", async () => {
    await withFreshStore(
      JSON.stringify({ addressTerm: "وهاب" }),
      async (useSettingsStore) => {
        await useSettingsStore.getState().loadSettings();
        expect(useSettingsStore.getState().settings.addressTerm).toBe("وهاب");
      }
    );
  });

  it("falls back to defaults on malformed JSON", async () => {
    await withFreshStore("not json{", async (useSettingsStore) => {
      await useSettingsStore.getState().loadSettings();
      expect(useSettingsStore.getState().settings.addressTerm).toBe("");
      expect(useSettingsStore.getState().hasLoadedSettings).toBe(true);
    });
  });

  it("treats a non-string stored addressTerm as unset", async () => {
    await withFreshStore(
      JSON.stringify({ addressTerm: 42 }),
      async (useSettingsStore) => {
        await useSettingsStore.getState().loadSettings();
        expect(useSettingsStore.getState().settings.addressTerm).toBe("");
      }
    );
  });

  it("defaults aiConsentAcceptedAt to null when nothing is stored", async () => {
    await withFreshStore(null, async (useSettingsStore) => {
      await useSettingsStore.getState().loadSettings();
      expect(useSettingsStore.getState().settings.aiConsentAcceptedAt).toBeNull();
    });
  });

  it("treats settings written before consent existed as not consented", async () => {
    await withFreshStore(
      JSON.stringify({ addressTerm: "Sir" }),
      async (useSettingsStore) => {
        await useSettingsStore.getState().loadSettings();
        expect(useSettingsStore.getState().settings.aiConsentAcceptedAt).toBeNull();
      }
    );
  });

  it("loads a stored aiConsentAcceptedAt timestamp", async () => {
    await withFreshStore(
      JSON.stringify({ addressTerm: "", aiConsentAcceptedAt: 1700000000000 }),
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
        addressTerm: "",
        aiConsentAcceptedAt: stamped,
      });
    });
  });

  it("clears the timestamp when revoked", async () => {
    await withFreshStore(
      JSON.stringify({ addressTerm: "Sir", aiConsentAcceptedAt: 1700000000000 }),
      async (useSettingsStore, AsyncStorage) => {
        await useSettingsStore.getState().loadSettings();
        await useSettingsStore.getState().setAiConsent(false);
        expect(useSettingsStore.getState().settings.aiConsentAcceptedAt).toBeNull();
        expect(JSON.parse(AsyncStorage._store.get("@app_settings"))).toEqual({
          addressTerm: "Sir",
          aiConsentAcceptedAt: null,
        });
      }
    );
  });

  it("keeps the address term when consent changes", async () => {
    await withFreshStore(
      JSON.stringify({ addressTerm: "Wahab" }),
      async (useSettingsStore) => {
        await useSettingsStore.getState().loadSettings();
        await useSettingsStore.getState().setAiConsent(true);
        expect(useSettingsStore.getState().settings.addressTerm).toBe("Wahab");
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

// ─── setAddressTerm ─────────────────────────────────────────────────────────

describe("setAddressTerm", () => {
  it("persists the term to AsyncStorage", async () => {
    await withFreshStore(null, async (useSettingsStore, AsyncStorage) => {
      await useSettingsStore.getState().setAddressTerm("Sir");
      expect(useSettingsStore.getState().settings.addressTerm).toBe("Sir");
      expect(JSON.parse(AsyncStorage._store.get("@app_settings"))).toEqual({
        addressTerm: "Sir",
        aiConsentAcceptedAt: null,
      });
    });
  });

  it("trims surrounding whitespace", async () => {
    await withFreshStore(null, async (useSettingsStore) => {
      await useSettingsStore.getState().setAddressTerm("  Wahab  ");
      expect(useSettingsStore.getState().settings.addressTerm).toBe("Wahab");
    });
  });

  it("clears the term with an empty string", async () => {
    await withFreshStore(
      JSON.stringify({ addressTerm: "Sir" }),
      async (useSettingsStore, AsyncStorage) => {
        await useSettingsStore.getState().loadSettings();
        await useSettingsStore.getState().setAddressTerm("");
        expect(useSettingsStore.getState().settings.addressTerm).toBe("");
        expect(JSON.parse(AsyncStorage._store.get("@app_settings"))).toEqual({
          addressTerm: "",
          aiConsentAcceptedAt: null,
        });
      }
    );
  });

  it("rolls back state when persistence fails", async () => {
    await withFreshStore(null, async (useSettingsStore, AsyncStorage) => {
      AsyncStorage.setItem.mockRejectedValueOnce(new Error("disk full"));
      await expect(
        useSettingsStore.getState().setAddressTerm("Sir")
      ).rejects.toThrow("disk full");
      expect(useSettingsStore.getState().settings.addressTerm).toBe("");
    });
  });
});
