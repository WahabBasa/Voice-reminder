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
});

// ─── setAddressTerm ─────────────────────────────────────────────────────────

describe("setAddressTerm", () => {
  it("persists the term to AsyncStorage", async () => {
    await withFreshStore(null, async (useSettingsStore, AsyncStorage) => {
      await useSettingsStore.getState().setAddressTerm("Sir");
      expect(useSettingsStore.getState().settings.addressTerm).toBe("Sir");
      expect(JSON.parse(AsyncStorage._store.get("@app_settings"))).toEqual({
        addressTerm: "Sir",
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
