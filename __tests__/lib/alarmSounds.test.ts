jest.mock("expo-file-system/legacy", () => ({
  documentDirectory: "file:///var/mobile/Containers/Data/Application/ABC/Documents/",
  getInfoAsync: jest.fn(),
  downloadAsync: jest.fn(),
  deleteAsync: jest.fn(),
}));

const STAGING_PREFIX =
  "file:///var/mobile/Containers/Data/Application/ABC/Documents/alarm_staging_";

let alarmSounds: typeof import("../../lib/alarmSounds");
let fs: {
  getInfoAsync: jest.Mock;
  downloadAsync: jest.Mock;
  deleteAsync: jest.Mock;
};
let bridge: { placeAlarmSound: jest.Mock; removeAlarmSound: jest.Mock };

/**
 * jest.resetModules gives the module under test fresh react-native and
 * expo-file-system instances, so every handle (Platform, NativeModules, fs
 * mocks) must be re-required alongside it — stale references assert nothing.
 */
function loadModule(opts: { platform?: "ios" | "android"; withBridge?: boolean } = {}) {
  jest.resetModules();

  const RN = require("react-native");
  Object.defineProperty(RN.Platform, "OS", {
    value: opts.platform ?? "ios",
    configurable: true,
  });

  bridge = {
    placeAlarmSound: jest.fn().mockResolvedValue("/Library/Sounds/x.wav"),
    removeAlarmSound: jest.fn().mockResolvedValue(true),
  };
  if (opts.withBridge === false) {
    delete RN.NativeModules.AlarmKitBridge;
  } else {
    RN.NativeModules.AlarmKitBridge = bridge;
  }

  fs = require("expo-file-system/legacy");
  fs.getInfoAsync.mockReset().mockResolvedValue({ exists: true, size: 220_500 });
  fs.downloadAsync.mockReset().mockResolvedValue({ status: 200 });
  fs.deleteAsync.mockReset().mockResolvedValue(undefined);

  alarmSounds = require("../../lib/alarmSounds");
}

beforeEach(() => loadModule());

// ─── path helpers ───────────────────────────────────────────────────────────

describe("getAlarmSoundFileName", () => {
  it("uses the reminder_{id}.wav name the native contract expects", () => {
    expect(alarmSounds.getAlarmSoundFileName("abc123")).toBe("reminder_abc123.wav");
  });

  it("replaces characters that would break the Library/Sounds path", () => {
    expect(alarmSounds.getAlarmSoundFileName("a/b c.d")).toBe("reminder_a_b_c_d.wav");
  });
});

describe("getAlarmSoundStagingPath", () => {
  it("stages inside the Documents directory expo-file-system may write to", () => {
    expect(alarmSounds.getAlarmSoundStagingPath("abc123")).toBe(
      `${STAGING_PREFIX}abc123.wav`
    );
  });

  it("returns null off iOS", () => {
    loadModule({ platform: "android" });
    expect(alarmSounds.getAlarmSoundStagingPath("abc123")).toBeNull();
  });
});

// ─── ensureAlarmSound ───────────────────────────────────────────────────────

describe("ensureAlarmSound", () => {
  it("downloads to staging, hands off to the native bridge, and returns the bare filename", async () => {
    const result = await alarmSounds.ensureAlarmSound("abc123", "https://cdn/x.wav");

    expect(result).toBe("reminder_abc123.wav");
    expect(fs.downloadAsync).toHaveBeenCalledWith(
      "https://cdn/x.wav",
      `${STAGING_PREFIX}abc123.wav`
    );
    expect(bridge.placeAlarmSound).toHaveBeenCalledWith(
      `${STAGING_PREFIX}abc123.wav`,
      "reminder_abc123.wav"
    );
  });

  it("cleans up the staging file after a successful placement", async () => {
    await alarmSounds.ensureAlarmSound("abc123", "https://cdn/x.wav");

    expect(fs.deleteAsync).toHaveBeenCalledWith(`${STAGING_PREFIX}abc123.wav`, {
      idempotent: true,
    });
  });

  it("skips download and native copy when already placed this session", async () => {
    await alarmSounds.ensureAlarmSound("abc123", "https://cdn/x.wav");
    fs.downloadAsync.mockClear();
    bridge.placeAlarmSound.mockClear();

    const again = await alarmSounds.ensureAlarmSound("abc123", "https://cdn/x.wav");

    expect(again).toBe("reminder_abc123.wav");
    expect(fs.downloadAsync).not.toHaveBeenCalled();
    expect(bridge.placeAlarmSound).not.toHaveBeenCalled();
  });

  it("returns null on Android without touching the filesystem or bridge", async () => {
    loadModule({ platform: "android" });

    expect(await alarmSounds.ensureAlarmSound("abc123", "https://cdn/x.wav")).toBeNull();
    expect(fs.downloadAsync).not.toHaveBeenCalled();
    expect(bridge.placeAlarmSound).not.toHaveBeenCalled();
  });

  it("returns null when the reminder has no wav url", async () => {
    expect(await alarmSounds.ensureAlarmSound("abc123", null)).toBeNull();
    expect(await alarmSounds.ensureAlarmSound("abc123", undefined)).toBeNull();
    expect(await alarmSounds.ensureAlarmSound("abc123", "")).toBeNull();
    expect(fs.downloadAsync).not.toHaveBeenCalled();
  });

  it("returns null when the native bridge is not linked", async () => {
    loadModule({ withBridge: false });

    expect(await alarmSounds.ensureAlarmSound("abc123", "https://cdn/x.wav")).toBeNull();
    expect(fs.downloadAsync).not.toHaveBeenCalled();
  });

  it("returns null when the download leaves no usable file", async () => {
    fs.getInfoAsync.mockResolvedValue({ exists: true, size: 0 });

    expect(await alarmSounds.ensureAlarmSound("abc123", "https://cdn/x.wav")).toBeNull();
    expect(bridge.placeAlarmSound).not.toHaveBeenCalled();
  });

  it("returns null and cleans staging when the native copy fails", async () => {
    bridge.placeAlarmSound.mockRejectedValueOnce(new Error("sandbox denied"));

    expect(await alarmSounds.ensureAlarmSound("abc123", "https://cdn/x.wav")).toBeNull();
    expect(fs.deleteAsync).toHaveBeenCalledWith(`${STAGING_PREFIX}abc123.wav`, {
      idempotent: true,
    });
  });

  it("does not cache a failed placement", async () => {
    bridge.placeAlarmSound.mockRejectedValueOnce(new Error("busy"));
    await alarmSounds.ensureAlarmSound("abc123", "https://cdn/x.wav");

    const retry = await alarmSounds.ensureAlarmSound("abc123", "https://cdn/x.wav");

    expect(retry).toBe("reminder_abc123.wav");
    expect(bridge.placeAlarmSound).toHaveBeenCalledTimes(2);
  });

  it("swallows download failures so scheduling falls back to the default sound", async () => {
    fs.downloadAsync.mockRejectedValueOnce(new Error("offline"));

    expect(await alarmSounds.ensureAlarmSound("abc123", "https://cdn/x.wav")).toBeNull();
  });
});

// ─── removeAlarmSound ───────────────────────────────────────────────────────

describe("removeAlarmSound", () => {
  it("asks the native bridge to delete the placed sound", async () => {
    await alarmSounds.removeAlarmSound("abc123");

    expect(bridge.removeAlarmSound).toHaveBeenCalledWith("reminder_abc123.wav");
  });

  // Nothing places these any more (OLD-108), but an install that rang before
  // the strip has them in Library/Sounds and deletion is the only sweep.
  it("still sweeps the retired ladder rungs alongside the base", async () => {
    await alarmSounds.removeAlarmSound("abc123");

    expect(bridge.removeAlarmSound.mock.calls.map((c: string[]) => c[0])).toEqual([
      "reminder_abc123.wav",
      "reminder_abc123_v1.wav",
      "reminder_abc123_v2.wav",
      "reminder_abc123_v3.wav",
    ]);
  });

  it("clears the session cache so a re-created reminder re-places its sound", async () => {
    await alarmSounds.ensureAlarmSound("abc123", "https://cdn/x.wav");
    await alarmSounds.removeAlarmSound("abc123");
    bridge.placeAlarmSound.mockClear();

    await alarmSounds.ensureAlarmSound("abc123", "https://cdn/x.wav");

    expect(bridge.placeAlarmSound).toHaveBeenCalledTimes(1);
  });

  it("is a no-op off iOS", async () => {
    loadModule({ platform: "android" });
    await alarmSounds.removeAlarmSound("abc123");

    expect(bridge.removeAlarmSound).not.toHaveBeenCalled();
  });

  it("never throws when the native deletion fails", async () => {
    bridge.removeAlarmSound.mockRejectedValueOnce(new Error("busy"));

    await expect(alarmSounds.removeAlarmSound("abc123")).resolves.toBeUndefined();
  });
});
