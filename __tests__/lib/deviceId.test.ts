// Helper: run a test in an isolated module scope so the module-level cache and
// the single-flight latch are fresh, AND the test and the module under test
// share the same AsyncStorage mock instance.
async function withFreshDeviceId(
  seed: string | null,
  fn: (deviceIdModule: any, AsyncStorage: any) => Promise<void>
) {
  await jest.isolateModulesAsync(async () => {
    const AsyncStorage =
      require("@react-native-async-storage/async-storage").default;
    AsyncStorage._reset();

    if (seed !== null) {
      await AsyncStorage.setItem("@device_id", seed);
      // Seeding is setup, not behaviour under test.
      AsyncStorage.setItem.mockClear();
    }

    const deviceIdModule = require("../../lib/deviceId");
    await fn(deviceIdModule, AsyncStorage);
  });
}

// ─── generation + persistence ───────────────────────────────────────────────

describe("getDeviceId", () => {
  it("mints and persists an id on first use", async () => {
    await withFreshDeviceId(null, async ({ getDeviceId }, AsyncStorage) => {
      const id = await getDeviceId();

      expect(id).toMatch(/^[0-9a-f]{32}$/);
      expect(await AsyncStorage.getItem("@device_id")).toBe(id);
    });
  });

  it("returns the stored id instead of minting a new one", async () => {
    await withFreshDeviceId("stored_device_id", async ({ getDeviceId }, AsyncStorage) => {
      expect(await getDeviceId()).toBe("stored_device_id");
      // Nothing was written — the stored id is authoritative.
      expect(AsyncStorage.setItem).not.toHaveBeenCalled();
    });
  });

  it("is stable across calls and only reads storage once", async () => {
    await withFreshDeviceId(null, async ({ getDeviceId }, AsyncStorage) => {
      const first = await getDeviceId();
      const second = await getDeviceId();

      expect(second).toBe(first);
      expect(AsyncStorage.getItem).toHaveBeenCalledTimes(1);
    });
  });

  it("hands concurrent callers the same id", async () => {
    await withFreshDeviceId(null, async ({ getDeviceId }, AsyncStorage) => {
      const [a, b, c] = await Promise.all([
        getDeviceId(),
        getDeviceId(),
        getDeviceId(),
      ]);

      expect(b).toBe(a);
      expect(c).toBe(a);
      // One mint, not three.
      expect(AsyncStorage.setItem).toHaveBeenCalledTimes(1);
    });
  });

  it("gives two installs different ids", async () => {
    let first = "";
    await withFreshDeviceId(null, async ({ getDeviceId }) => {
      first = await getDeviceId();
    });
    await withFreshDeviceId(null, async ({ getDeviceId }) => {
      expect(await getDeviceId()).not.toBe(first);
    });
  });
});

// ─── storage failures ───────────────────────────────────────────────────────

describe("getDeviceId when storage is broken", () => {
  it("falls back to a session id when the read throws", async () => {
    await withFreshDeviceId(null, async ({ getDeviceId }, AsyncStorage) => {
      AsyncStorage.getItem.mockRejectedValueOnce(new Error("storage unavailable"));

      expect(await getDeviceId()).toMatch(/^[0-9a-f]{32}$/);
    });
  });

  it("still returns an id when the write throws", async () => {
    await withFreshDeviceId(null, async ({ getDeviceId }, AsyncStorage) => {
      AsyncStorage.setItem.mockRejectedValueOnce(new Error("disk full"));

      const id = await getDeviceId();
      expect(id).toMatch(/^[0-9a-f]{32}$/);
      // Unpersisted, but cached — the session keeps one identity.
      expect(await getDeviceId()).toBe(id);
    });
  });
});

// ─── cached accessor ────────────────────────────────────────────────────────

describe("getCachedDeviceId", () => {
  it("is null before the id has been loaded", async () => {
    await withFreshDeviceId("stored_device_id", async ({ getCachedDeviceId }) => {
      expect(getCachedDeviceId()).toBeNull();
    });
  });

  it("returns the id once loaded", async () => {
    await withFreshDeviceId(
      "stored_device_id",
      async ({ getDeviceId, getCachedDeviceId }) => {
        await getDeviceId();
        expect(getCachedDeviceId()).toBe("stored_device_id");
      }
    );
  });
});
