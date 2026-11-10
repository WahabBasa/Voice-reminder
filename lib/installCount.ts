import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import { isExistingInstall } from "./usageCounts";

/**
 * How many times this phone has installed the app (1 = first install), so the
 * founder's "new device" email and new-user counts skip reinstalls.
 *
 * Privacy: no identifier survives a reinstall. The only thing kept in the iOS
 * Keychain (which outlives the app) is a small integer, the install counter.
 * Deleting the app still loses the device id, and a reinstall still gets a
 * brand-new one; the counter only says "this phone has had Remi N times".
 *
 * Once per install (the AsyncStorage record below marks it counted): read the
 * counter (missing = 0), add one, write it back, keep the result as this
 * install's number. An install that predates 1.0.6 (lib/usageCounts.ts
 * `isExistingInstall`) is not a new install: the counter is seeded to 1 when
 * empty and it reports 1.
 *
 * Any Keychain failure leaves the install uncounted and the number undefined
 * for this launch (the next launch tries again). Never throws.
 */

/** Keychain item: the counter, a decimal string "1".."99". */
export const INSTALL_COUNTER_KEY = "vr.installCount";
/** AsyncStorage record: `{"installNumber":N}`, present = this install is counted. */
export const INSTALL_RECORD_KEY = "vr.install.v1";
export const MAX_INSTALL_NUMBER = 99;

const KEYCHAIN_OPTIONS: SecureStore.SecureStoreOptions = {
  // Readable in the background after the first unlock (alarms, App Intents).
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK,
};

function validNumber(value: unknown): number | undefined {
  return typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 1 &&
    value <= MAX_INSTALL_NUMBER
    ? value
    : undefined;
}

async function readRecord(): Promise<number | undefined> {
  try {
    const raw = await AsyncStorage.getItem(INSTALL_RECORD_KEY);
    if (raw == null) return undefined;
    return validNumber(JSON.parse(raw)?.installNumber);
  } catch {
    return undefined;
  }
}

async function readCounter(): Promise<number> {
  const raw = await SecureStore.getItemAsync(INSTALL_COUNTER_KEY, KEYCHAIN_OPTIONS);
  if (raw == null) return 0;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? Math.min(n, MAX_INSTALL_NUMBER) : 0;
}

async function count(): Promise<number | undefined> {
  const recorded = await readRecord();
  if (recorded !== undefined) return recorded;

  let installNumber: number;
  try {
    const counter = await readCounter();
    if (await isExistingInstall()) {
      if (counter === 0) {
        await SecureStore.setItemAsync(INSTALL_COUNTER_KEY, "1", KEYCHAIN_OPTIONS);
      }
      installNumber = 1;
    } else {
      installNumber = Math.min(counter + 1, MAX_INSTALL_NUMBER);
      await SecureStore.setItemAsync(INSTALL_COUNTER_KEY, String(installNumber), KEYCHAIN_OPTIONS);
    }
  } catch (e) {
    console.log("[VR] installCount: keychain unavailable (ignored):", e);
    return undefined;
  }

  try {
    await AsyncStorage.setItem(INSTALL_RECORD_KEY, JSON.stringify({ installNumber }));
  } catch {
    // The number still goes out this launch.
  }
  return installNumber;
}

let pending: Promise<number | undefined> | null = null;

/**
 * This install's number (1 = first install on this phone), counting it on the
 * first call of its first launch. Undefined when the Keychain could not be
 * used. Shared by concurrent callers; never throws.
 */
export function getInstallNumber(): Promise<number | undefined> {
  if (!pending) pending = count().catch(() => undefined);
  return pending;
}

/** Test seam: forget this launch's answer. */
export function __resetInstallCountForTests(): void {
  pending = null;
}
