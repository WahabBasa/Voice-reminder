/**
 * The layout direction follows the UI language (lib/layoutDirection.ts): when
 * a launch runs the other way, both native flags are set to the wanted
 * direction and the bundle reloads once; a reload that didn't take is not
 * retried in a loop.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import { DevSettings, I18nManager } from "react-native";
import {
  LOOP_GUARD_MS,
  defaultDirectionDeps,
  directionSign,
  isLayoutRTL,
  isRtlLanguage,
  planLayoutDirection,
  syncLayoutDirection,
  type DirectionDeps,
  type ReloadAttempt,
} from "../../lib/layoutDirection";
import { RTL_LANGUAGES } from "../../lib/appLanguage";

const mockReloadAsync = jest.fn(async () => {});
jest.mock("expo-updates", () => ({ reloadAsync: () => mockReloadAsync() }));

/** A fake device: the running direction, the stored flags, the reload. */
function fakeDevice(runningRTL: boolean, attempt: ReloadAttempt | null = null, now = 1_000_000) {
  const state = {
    runningRTL,
    flags: [] as boolean[],
    attempt,
    reloads: 0,
    reloadFails: false,
  };
  const deps: DirectionDeps = {
    runningRTL: () => state.runningRTL,
    setNativeRTL: (rtl) => {
      state.flags.push(rtl);
    },
    readAttempt: async () => state.attempt,
    writeAttempt: async (a) => {
      state.attempt = a;
    },
    reload: async () => {
      if (state.reloadFails) throw new Error("no reload here");
      state.reloads += 1;
    },
    now: () => now,
  };
  return { state, deps };
}

describe("which languages are RTL", () => {
  it("ar, he, fa, ur and their regional tags", () => {
    for (const tag of ["ar", "ar-SA", "ar_EG", "he", "he-IL", "iw", "fa", "fa-IR", "ur", "ur-PK"]) {
      expect([tag, isRtlLanguage(tag)]).toEqual([tag, true]);
    }
  });

  it("everything else, and junk, is LTR", () => {
    for (const tag of ["en", "pt-BR", "zh-Hant", "hi", "sw", "", null, undefined]) {
      expect([tag, isRtlLanguage(tag as string)]).toEqual([tag, false]);
    }
  });

  it("matches the wheel's RTL list", () => {
    for (const code of RTL_LANGUAGES) expect(isRtlLanguage(code)).toBe(true);
  });
});

describe("planLayoutDirection", () => {
  const now = 5_000_000;

  it("in sync: LTR language on an LTR launch, RTL on an RTL launch", () => {
    expect(planLayoutDirection("en", false, null, now)).toEqual({ kind: "in-sync", rtl: false });
    expect(planLayoutDirection("ar", true, null, now)).toEqual({ kind: "in-sync", rtl: true });
  });

  it("LTR → RTL and RTL → LTR need a switch", () => {
    expect(planLayoutDirection("he", false, null, now)).toEqual({ kind: "switch", rtl: true });
    expect(planLayoutDirection("de", true, null, now)).toEqual({ kind: "switch", rtl: false });
  });

  it("the same switch just tried and not taken: loop guard", () => {
    const recent = { rtl: true, at: now - 1_000 };
    expect(planLayoutDirection("ar", false, recent, now)).toEqual({ kind: "loop-guard", rtl: true });
  });

  it("an old attempt, or one the other way, does not block", () => {
    expect(planLayoutDirection("ar", false, { rtl: true, at: now - LOOP_GUARD_MS }, now).kind).toBe("switch");
    expect(planLayoutDirection("ar", false, { rtl: false, at: now - 1_000 }, now).kind).toBe("switch");
    // A clock that went backwards doesn't freeze the direction either.
    expect(planLayoutDirection("ar", false, { rtl: true, at: now + 10_000 }, now).kind).toBe("switch");
  });
});

describe("syncLayoutDirection", () => {
  it("picking Arabic on an LTR launch: both flags on, reload once", async () => {
    const { state, deps } = fakeDevice(false);
    await expect(syncLayoutDirection("ar", deps)).resolves.toBe("reloading");
    expect(state.flags).toEqual([true]);
    expect(state.reloads).toBe(1);
    expect(state.attempt).toEqual({ rtl: true, at: 1_000_000 });
  });

  it("back to English on an RTL launch: both flags off, reload once", async () => {
    const { state, deps } = fakeDevice(true);
    await expect(syncLayoutDirection("en", deps)).resolves.toBe("reloading");
    expect(state.flags).toEqual([false]);
    expect(state.reloads).toBe(1);
  });

  it("ar → en → ar: each crossing reloads, the attempts don't block each other", async () => {
    const device = fakeDevice(false);
    await expect(syncLayoutDirection("ar", device.deps)).resolves.toBe("reloading");
    device.state.runningRTL = true; // the reload took
    await expect(syncLayoutDirection("en", device.deps)).resolves.toBe("reloading");
    device.state.runningRTL = false; // and back
    // Within seconds of the first: the last attempt was LTR, so RTL isn't guarded.
    await expect(syncLayoutDirection("ar", device.deps)).resolves.toBe("reloading");
    expect(device.state.reloads).toBe(3);
    expect(device.state.flags).toEqual([true, false, true]);
  });

  it("first launch on an Arabic iPhone: iOS already launched RTL, nothing to do", async () => {
    const { state, deps } = fakeDevice(true);
    await expect(syncLayoutDirection("ar", deps)).resolves.toBe("in-sync");
    expect(state.reloads).toBe(0);
    // The flags are pinned to the language, so a later device change can't flip it alone.
    expect(state.flags).toEqual([true]);
  });

  it("an English pick on a Hebrew iPhone that launched RTL: flip to LTR", async () => {
    const { state, deps } = fakeDevice(true);
    await expect(syncLayoutDirection("en", deps)).resolves.toBe("reloading");
    expect(state.flags).toEqual([false]);
  });

  it("in sync LTR: no reload, flags pinned off", async () => {
    const { state, deps } = fakeDevice(false);
    await expect(syncLayoutDirection("pt-BR", deps)).resolves.toBe("in-sync");
    expect(state.reloads).toBe(0);
    expect(state.flags).toEqual([false]);
  });

  it("a reload that didn't take is not retried within the guard window", async () => {
    const { state, deps } = fakeDevice(false, { rtl: true, at: 1_000_000 - 2_000 });
    await expect(syncLayoutDirection("ar", deps)).resolves.toBe("loop-guard");
    expect(state.reloads).toBe(0);
    // The flags are still set, so the next cold start comes up RTL.
    expect(state.flags).toEqual([true]);
  });

  it("no way to reload: the flags are set, the next cold start applies them", async () => {
    const { state, deps } = fakeDevice(false);
    state.reloadFails = true;
    await expect(syncLayoutDirection("fa", deps)).resolves.toBe("restart-needed");
    expect(state.flags).toEqual([true]);
  });

  it("never throws", async () => {
    const { deps } = fakeDevice(false);
    deps.readAttempt = async () => {
      throw new Error("storage down");
    };
    await expect(syncLayoutDirection("ar", deps)).resolves.toBe("restart-needed");
  });
});

describe("the real native seam", () => {
  let allowRTL: jest.SpyInstance;
  let forceRTL: jest.SpyInstance;
  beforeEach(() => {
    (AsyncStorage as any)._reset();
    mockReloadAsync.mockReset();
    allowRTL = jest.spyOn(I18nManager, "allowRTL").mockImplementation(() => {});
    forceRTL = jest.spyOn(I18nManager, "forceRTL").mockImplementation(() => {});
  });
  afterEach(() => {
    allowRTL.mockRestore();
    forceRTL.mockRestore();
  });

  it("this launch is LTR in tests; the sign is +1", () => {
    expect(isLayoutRTL()).toBe(false);
    expect(directionSign()).toBe(1);
  });

  it("sets allowRTL and forceRTL together, remembers the attempt, reloads through expo-updates", async () => {
    await expect(syncLayoutDirection("ur")).resolves.toBe("reloading");
    expect(allowRTL).toHaveBeenCalledWith(true);
    expect(forceRTL).toHaveBeenCalledWith(true);
    expect(mockReloadAsync).toHaveBeenCalledTimes(1);
    const stored = JSON.parse((await AsyncStorage.getItem("vr.layoutDirection.lastReload")) ?? "null");
    expect(stored.rtl).toBe(true);
    // Reading it back feeds the loop guard.
    await expect(defaultDirectionDeps.readAttempt()).resolves.toEqual(stored);
  });

  it("falls back to DevSettings.reload when expo-updates refuses (development)", async () => {
    mockReloadAsync.mockRejectedValue(new Error("ERR_UPDATES_DISABLED"));
    const devReload = jest.spyOn(DevSettings, "reload").mockImplementation(() => {});
    await expect(syncLayoutDirection("he")).resolves.toBe("reloading");
    expect(devReload).toHaveBeenCalled();
    devReload.mockRestore();
  });

  it("ignores a corrupt stored attempt", async () => {
    await AsyncStorage.setItem("vr.layoutDirection.lastReload", "{not json");
    await expect(defaultDirectionDeps.readAttempt()).resolves.toBeNull();
    await AsyncStorage.setItem("vr.layoutDirection.lastReload", JSON.stringify({ rtl: "yes" }));
    await expect(defaultDirectionDeps.readAttempt()).resolves.toBeNull();
  });

  it("in sync LTR: no reload", async () => {
    await expect(syncLayoutDirection("en")).resolves.toBe("in-sync");
    expect(mockReloadAsync).not.toHaveBeenCalled();
    expect(forceRTL).toHaveBeenCalledWith(false);
  });
});
