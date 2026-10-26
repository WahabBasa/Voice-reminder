/**
 * Left-to-right vs right-to-left layout (ar, he, fa, ur).
 *
 * How React Native decides the direction on iOS (RN 0.81, RCTI18nUtil.m):
 *   isRTL = forceRTL || (allowRTL && the app's own language is RTL)
 * Both flags live in NSUserDefaults (`RCTI18nUtil_forceRTL` / `_allowRTL`,
 * allowRTL defaults to YES) and are read when the React surface is laid out,
 * so a change applies on the next JS reload, never live. "The app's own
 * language" is the bundle's preferred localization: with ar/he/fa/ur in
 * CFBundleLocalizations (app.json), an iPhone set to Arabic launches RTL by
 * itself, before any JS runs.
 *
 * Remi has its own language pick, which can disagree with the device either
 * way (an English pick on a Hebrew iPhone, an Arabic pick on an English one).
 * So the JS owns the direction: it sets BOTH flags to the wanted direction —
 * allowRTL(rtl) + forceRTL(rtl) makes isRTL exactly `rtl`, whatever the device
 * — and reloads the bundle when the running direction is wrong.
 *
 * When it runs: once at launch after the stored pick is read (app/_layout),
 * and after every pick (lib/pickLanguage), never on a mere UI-locale change,
 * so the reload can't race the pick's persist. A loop guard stops a second
 * reload to the same direction within LOOP_GUARD_MS (the flags didn't stick):
 * the app then stays as it is and logs it.
 *
 * expo-localization's own `supportsRTL` / `forcesRTL` plugin flags are NOT
 * used: its native OnCreate rewrites forceRTL from the DEVICE language on every
 * launch, which would undo an in-app pick.
 *
 * left/right styles: RN swaps them in RTL by default
 * (`swapLeftAndRightInRTL`, on unless turned off), so `marginLeft`, `left:`,
 * `paddingRight` already mirror. What does not mirror on its own: transforms
 * (translateX), gesture translations, and arrow icons — see `directionSign`.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import { DevSettings, I18nManager } from "react-native";
import { vrLog } from "./vrLog";

/** Base language codes written right to left. */
export const RTL_LANGUAGE_CODES: readonly string[] = ["ar", "he", "fa", "ur"];

/** "ar", "he-IL", "fa_IR" → true; "en", "pt-BR", junk → false. */
export function isRtlLanguage(tag: string | null | undefined): boolean {
  if (typeof tag !== "string") return false;
  const base = tag.trim().replace(/_/g, "-").split("-")[0].toLowerCase();
  // iw is the legacy code for Hebrew.
  return RTL_LANGUAGE_CODES.includes(base) || base === "iw";
}

/** Whether THIS launch lays out right to left (fixed until the next reload). */
export function isLayoutRTL(): boolean {
  return I18nManager.isRTL === true;
}

/**
 * +1 under LTR, -1 under RTL. Multiply a horizontal transform or a gesture
 * translation by it to keep "swipe toward the end to discard / page forward"
 * meaning the same in both directions: logical x = sign × physical x.
 */
export function directionSign(): 1 | -1 {
  return isLayoutRTL() ? -1 : 1;
}

// ─── the decision (pure) ─────────────────────────────────────────────────────

export const LOOP_GUARD_MS = 30_000;
const ATTEMPT_KEY = "vr.layoutDirection.lastReload";

export type ReloadAttempt = { rtl: boolean; at: number };

export type DirectionPlan =
  | { kind: "in-sync"; rtl: boolean }
  | { kind: "switch"; rtl: boolean }
  /** The same switch was just tried and the launch still has the old direction. */
  | { kind: "loop-guard"; rtl: boolean };

/** What to do for a UI locale, given the direction this launch is running in. */
export function planLayoutDirection(
  uiLocale: string,
  runningRTL: boolean,
  lastAttempt: ReloadAttempt | null,
  now: number
): DirectionPlan {
  const rtl = isRtlLanguage(uiLocale);
  if (rtl === runningRTL) return { kind: "in-sync", rtl };
  if (lastAttempt && lastAttempt.rtl === rtl && now - lastAttempt.at >= 0 && now - lastAttempt.at < LOOP_GUARD_MS) {
    return { kind: "loop-guard", rtl };
  }
  return { kind: "switch", rtl };
}

// ─── the effect ──────────────────────────────────────────────────────────────

export type DirectionOutcome = "in-sync" | "reloading" | "restart-needed" | "loop-guard";

export type DirectionDeps = {
  runningRTL: () => boolean;
  setNativeRTL: (rtl: boolean) => void;
  readAttempt: () => Promise<ReloadAttempt | null>;
  writeAttempt: (attempt: ReloadAttempt) => Promise<void>;
  /** Reloads the JS bundle (the flags then apply). Rejects/throws when it can't. */
  reload: () => Promise<void>;
  now: () => number;
};

function parseAttempt(raw: string | null): ReloadAttempt | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw);
    return typeof value?.rtl === "boolean" && typeof value?.at === "number" ? value : null;
  } catch {
    return null;
  }
}

/**
 * expo-updates' reload in a release build; it refuses in development (Metro,
 * dev client), where DevSettings.reload does the same job.
 */
async function reloadBundle(): Promise<void> {
  try {
    // Required lazily: a native module, absent in some test environments.
    const Updates = require("expo-updates") as typeof import("expo-updates");
    await Updates.reloadAsync();
    return;
  } catch (error) {
    if (typeof DevSettings?.reload !== "function") throw error;
  }
  DevSettings.reload("layout direction");
}

export const defaultDirectionDeps: DirectionDeps = {
  runningRTL: isLayoutRTL,
  setNativeRTL: (rtl) => {
    I18nManager.allowRTL(rtl);
    I18nManager.forceRTL(rtl);
  },
  readAttempt: async () => {
    try {
      return parseAttempt(await AsyncStorage.getItem(ATTEMPT_KEY));
    } catch {
      return null;
    }
  },
  writeAttempt: async (attempt) => {
    try {
      await AsyncStorage.setItem(ATTEMPT_KEY, JSON.stringify(attempt));
    } catch {
      // Without storage the guard can't remember; the reload still happens.
    }
  },
  reload: reloadBundle,
  now: () => Date.now(),
};

/**
 * Makes the native direction match `uiLocale` and reloads when the running
 * layout is the other way. Never throws. "restart-needed" means the flags are
 * set but no reload was possible: the next cold start has the new direction.
 */
export async function syncLayoutDirection(
  uiLocale: string,
  deps: DirectionDeps = defaultDirectionDeps
): Promise<DirectionOutcome> {
  try {
    const runningRTL = deps.runningRTL();
    const plan = planLayoutDirection(uiLocale, runningRTL, await deps.readAttempt(), deps.now());
    if (plan.kind === "in-sync") {
      // Keep the stored flags pinned to the pick, so a later device-language
      // change can't flip the next launch on its own.
      deps.setNativeRTL(plan.rtl);
      return "in-sync";
    }
    vrLog("i18n", "layout_direction", { uiLocale, runningRTL, wantRTL: plan.rtl, plan: plan.kind });
    deps.setNativeRTL(plan.rtl);
    if (plan.kind === "loop-guard") return "loop-guard";
    await deps.writeAttempt({ rtl: plan.rtl, at: deps.now() });
    try {
      await deps.reload();
      return "reloading";
    } catch {
      return "restart-needed";
    }
  } catch {
    return "restart-needed";
  }
}
