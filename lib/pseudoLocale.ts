/**
 * Pseudo-localization, a dev-only switch: every t() string comes back
 * accented, ~40% longer and bracketed ("[Ŕéḿíńď ḿé ~~~~]"), so cramped or
 * clipped spots show on a device without waiting for a long translation.
 *
 * Where: Settings › Notifications & alarms (the Diagnostics screen), last row
 * "Pseudo-localization (dev)". It is there only in development (Metro) and in
 * builds on the "development" update channel (the dev client, including an
 * EAS update loaded into it); a production or preview build never shows it
 * and ignores any stored value. The choice survives restarts.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import { isPseudoLocalization, setPseudoLocalization } from "./i18n";

const STORAGE_KEY = "vr.dev.pseudoLocalization";

function updatesChannel(): string | null {
  try {
    // Required lazily: a native module, absent in some test environments.
    const Updates = require("expo-updates") as typeof import("expo-updates");
    return Updates.channel ?? null;
  } catch {
    return null;
  }
}

/** Whether this build offers the switch (never in production). */
export function pseudoLocalizationAvailable(
  dev: boolean = typeof __DEV__ !== "undefined" && __DEV__,
  channel: string | null = updatesChannel()
): boolean {
  return dev || channel === "development";
}

/** Restore the stored switch at startup; a no-op where it isn't offered. */
export async function loadPseudoLocalization(available = pseudoLocalizationAvailable()): Promise<void> {
  if (!available) return;
  try {
    if ((await AsyncStorage.getItem(STORAGE_KEY)) === "1") setPseudoLocalization(true);
  } catch {
    // Off.
  }
}

export async function togglePseudoLocalization(available = pseudoLocalizationAvailable()): Promise<boolean> {
  if (!available) return false;
  const next = !isPseudoLocalization();
  setPseudoLocalization(next);
  try {
    await AsyncStorage.setItem(STORAGE_KEY, next ? "1" : "0");
  } catch {
    // This launch only.
  }
  return next;
}
