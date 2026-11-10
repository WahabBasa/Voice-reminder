/**
 * The install counter (lib/installCount.ts): one Keychain integer that
 * outlives the app, counted once per install. Covers: a fresh install counts
 * once and only once; a reinstall reads the next number; an install that
 * predates 1.0.6 is seeded to 1 and never looks new; any Keychain failure
 * leaves the number undefined, never throws, and the next launch retries.
 */

// Built inside the factory: the imports below are hoisted above this file's
// own declarations, so the factory cannot close over them.
jest.mock("expo-secure-store", () => ({
  AFTER_FIRST_UNLOCK: 0,
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
}));
const mockKeychain = new Map<string, string>();
const mockSecureStore = jest.requireMock("expo-secure-store") as {
  AFTER_FIRST_UNLOCK: number;
  getItemAsync: jest.Mock;
  setItemAsync: jest.Mock;
};

let mockExisting: boolean | "real" = false;
jest.mock("../../lib/usageCounts", () => {
  const actual = jest.requireActual("../../lib/usageCounts");
  return {
    ...actual,
    isExistingInstall: () =>
      mockExisting === "real" ? actual.isExistingInstall() : Promise.resolve(mockExisting),
  };
});

jest.mock("../../lib/pendingTakes", () => ({
  getPendingTakesSnapshot: () => [],
  subscribePendingTakes: () => () => {},
}));

import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  INSTALL_COUNTER_KEY,
  INSTALL_RECORD_KEY,
  MAX_INSTALL_NUMBER,
  __resetInstallCountForTests,
  getInstallNumber,
} from "../../lib/installCount";
import { __resetUsageForTests } from "../../lib/usageCounts";

const storage = AsyncStorage as unknown as { _reset: () => void; _store: Map<string, string> };

/** A new launch of the same install: module memory gone, storage kept. */
function relaunch() {
  __resetInstallCountForTests();
}

/** Delete the app: its own storage goes, the Keychain stays. */
function deleteApp() {
  storage._reset();
  __resetUsageForTests();
  relaunch();
}

beforeEach(() => {
  mockKeychain.clear();
  storage._reset();
  __resetUsageForTests();
  relaunch();
  mockExisting = false;
  mockSecureStore.getItemAsync.mockClear();
  mockSecureStore.setItemAsync.mockClear();
  mockSecureStore.getItemAsync.mockImplementation(async (key: string) => mockKeychain.get(key) ?? null);
  mockSecureStore.setItemAsync.mockImplementation(async (key: string, value: string) => {
    mockKeychain.set(key, value);
  });
});

it("a first install on this phone is install 1, kept in the Keychain as a bare number", async () => {
  expect(await getInstallNumber()).toBe(1);
  expect(mockKeychain.get(INSTALL_COUNTER_KEY)).toBe("1");
  expect(JSON.parse(storage._store.get(INSTALL_RECORD_KEY)!)).toEqual({ installNumber: 1 });
  // Readable in the background after the first unlock.
  expect(mockSecureStore.setItemAsync).toHaveBeenCalledWith(INSTALL_COUNTER_KEY, "1", {
    keychainAccessible: mockSecureStore.AFTER_FIRST_UNLOCK,
  });
});

it("counts once per install: later calls and later launches never increment", async () => {
  expect(await getInstallNumber()).toBe(1);
  expect(await getInstallNumber()).toBe(1);
  relaunch();
  expect(await getInstallNumber()).toBe(1);
  relaunch();
  expect(await getInstallNumber()).toBe(1);
  expect(mockKeychain.get(INSTALL_COUNTER_KEY)).toBe("1");
  expect(mockSecureStore.setItemAsync).toHaveBeenCalledTimes(1);
});

it("concurrent callers share one count", async () => {
  const [a, b] = await Promise.all([getInstallNumber(), getInstallNumber()]);
  expect([a, b]).toEqual([1, 1]);
  expect(mockSecureStore.setItemAsync).toHaveBeenCalledTimes(1);
});

it("each reinstall is the next number", async () => {
  expect(await getInstallNumber()).toBe(1);
  deleteApp();
  expect(await getInstallNumber()).toBe(2);
  relaunch();
  expect(await getInstallNumber()).toBe(2);
  deleteApp();
  expect(await getInstallNumber()).toBe(3);
  expect(mockKeychain.get(INSTALL_COUNTER_KEY)).toBe("3");
});

it("stops at 99", async () => {
  mockKeychain.set(INSTALL_COUNTER_KEY, String(MAX_INSTALL_NUMBER));
  expect(await getInstallNumber()).toBe(MAX_INSTALL_NUMBER);
  expect(mockKeychain.get(INSTALL_COUNTER_KEY)).toBe("99");
  deleteApp();
  mockKeychain.set(INSTALL_COUNTER_KEY, "500");
  expect(await getInstallNumber()).toBe(MAX_INSTALL_NUMBER);
});

it("an unreadable Keychain value counts as none", async () => {
  mockKeychain.set(INSTALL_COUNTER_KEY, "garbage");
  expect(await getInstallNumber()).toBe(1);
});

describe("an install from before 1.0.6", () => {
  it("is seeded to 1 when the Keychain is empty and reports 1", async () => {
    mockExisting = true;
    expect(await getInstallNumber()).toBe(1);
    expect(mockKeychain.get(INSTALL_COUNTER_KEY)).toBe("1");
    // A reinstall after that is install 2.
    deleteApp();
    mockExisting = false;
    expect(await getInstallNumber()).toBe(2);
  });

  it("never raises a counter that is already there, and still reports 1", async () => {
    mockExisting = true;
    mockKeychain.set(INSTALL_COUNTER_KEY, "4");
    expect(await getInstallNumber()).toBe(1);
    expect(mockKeychain.get(INSTALL_COUNTER_KEY)).toBe("4");
    expect(mockSecureStore.setItemAsync).not.toHaveBeenCalled();
  });

  it("is detected by the usage counts' own existing-install read (keys an older version wrote)", async () => {
    mockExisting = "real";
    storage._store.set("@device_id", "0123456789abcdef0123456789abcdef");
    expect(await getInstallNumber()).toBe(1);
    expect(mockKeychain.get(INSTALL_COUNTER_KEY)).toBe("1");

    // And a genuinely fresh install, by the same read, increments.
    mockKeychain.set(INSTALL_COUNTER_KEY, "1");
    deleteApp();
    expect(await getInstallNumber()).toBe(2);
  });
});

describe("Keychain failures", () => {
  it("a read failure leaves the number undefined, never throws, and the next launch retries", async () => {
    mockSecureStore.getItemAsync.mockRejectedValueOnce(new Error("locked"));
    await expect(getInstallNumber()).resolves.toBeUndefined();
    expect(storage._store.has(INSTALL_RECORD_KEY)).toBe(false);

    relaunch();
    expect(await getInstallNumber()).toBe(1);
  });

  it("a write failure leaves the number undefined and the install uncounted", async () => {
    mockSecureStore.setItemAsync.mockRejectedValueOnce(new Error("denied"));
    await expect(getInstallNumber()).resolves.toBeUndefined();
    expect(mockKeychain.has(INSTALL_COUNTER_KEY)).toBe(false);
    expect(storage._store.has(INSTALL_RECORD_KEY)).toBe(false);
  });

  it("a seeding failure on an older install is undefined too", async () => {
    mockExisting = true;
    mockSecureStore.setItemAsync.mockRejectedValueOnce(new Error("denied"));
    await expect(getInstallNumber()).resolves.toBeUndefined();
  });

  it("a module that throws synchronously is undefined", async () => {
    mockSecureStore.getItemAsync.mockImplementationOnce(() => {
      throw new Error("no native module");
    });
    await expect(getInstallNumber()).resolves.toBeUndefined();
  });
});

describe("the AsyncStorage record", () => {
  it("a failed record write still reports the number this launch", async () => {
    (AsyncStorage.setItem as jest.Mock).mockRejectedValueOnce(new Error("full"));
    expect(await getInstallNumber()).toBe(1);
  });

  it("an unreadable record is treated as uncounted", async () => {
    storage._store.set(INSTALL_RECORD_KEY, "{not json");
    expect(await getInstallNumber()).toBe(1);
    storage._store.set(INSTALL_RECORD_KEY, JSON.stringify({ installNumber: 0 }));
    relaunch();
    expect(await getInstallNumber()).toBe(2);
  });

  it("a stored record wins without touching the Keychain", async () => {
    storage._store.set(INSTALL_RECORD_KEY, JSON.stringify({ installNumber: 5 }));
    expect(await getInstallNumber()).toBe(5);
    expect(mockSecureStore.getItemAsync).not.toHaveBeenCalled();
  });

  it("an AsyncStorage read failure is treated as uncounted", async () => {
    (AsyncStorage.getItem as jest.Mock).mockRejectedValueOnce(new Error("io"));
    expect(await getInstallNumber()).toBe(1);
  });
});
