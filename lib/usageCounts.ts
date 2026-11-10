import AsyncStorage from "@react-native-async-storage/async-storage";
import { AppState, type AppStateStatus } from "react-native";
import {
  APP_VERSION_PATTERN,
  BUILD_NUMBER_PATTERN,
  LANG_PATTERN,
  MAX_DURATION_SEC,
  MAX_SCREENS,
  MAX_TAPS,
  MAX_VISIT_NUMBER,
  USAGE_STEPS,
  isUsageScreen,
  isUsageStep,
  isUsageTap,
  type UsageMeta,
  type UsageScreen,
  type UsageStep,
  type UsageTap,
  type UsageVariant,
} from "../convex/usageShape";
import { getPendingTakesSnapshot, subscribePendingTakes } from "./pendingTakes";

/**
 * Anonymous usage counts (1.0.6), the client half. Server: convex/usage.ts.
 *
 * The question it answers: why do most new installs never make a first
 * reminder? Two kinds of row, both anonymous:
 *
 *   - steps: first-run milestones (first open, consent shown / answered, mic
 *     answered, first record tap, first take ok / failed, paywall shown), each
 *     sent at most ONCE per install.
 *   - visits: one summary per foreground session, sent when the app goes to the
 *     background: which visit (1..10, 0 = install predates 1.0.6), how long,
 *     which screens in order, which named controls, whether a reminder was made.
 *
 * What is never sent: the device id (lib/deviceId.ts is not imported here),
 * any session id, the timezone, a region, free text, reminder content. Every
 * value passes through the allow-lists in convex/usageShape.ts first.
 *
 * Fire-and-forget throughout: nothing here is awaited on a UI path, nothing
 * throws, there is no retry and no queue. A count that cannot be sent (offline,
 * a server error) is simply lost. The voice pipeline is performance-sensitive
 * (see lib/sentry.ts): while the recorder is up, a step or tap costs one array
 * push, and the flush waits until the recorder is gone.
 *
 * Existing installs: an install that already existed before 1.0.6 must not
 * count as new. The first time this runs, before anything else at launch
 * touches storage, it reads the keys every earlier version wrote (device id,
 * settings, reminders, history, language pick, pending takes). Any of them
 * present means the install predates 1.0.6: every step is marked done WITHOUT
 * being sent, and its visits report visitNumber 0. (The device id alone would
 * miss a 1.0.0 install that never made a reminder: the launch check-in that
 * mints it everywhere only arrived in 1.0.1.)
 */

export const USAGE_STATE_KEY = "vr.usage.v1";

/** Keys some earlier version wrote. Any one present = not a new install. */
export const PRIOR_INSTALL_KEYS = [
  "@device_id",
  "@app_settings",
  "@reminders",
  "@reminder_history",
  "@pending_takes",
  "vr.appLanguage",
] as const;

export type StepPayload = UsageMeta & { step: UsageStep };
export type VisitPayload = UsageMeta & {
  visitNumber: number;
  durationSec: number;
  screens: UsageScreen[];
  taps: UsageTap[];
  madeReminder: boolean;
};

export type UsageSender = {
  step: (payload: StepPayload) => unknown;
  visit: (payload: VisitPayload) => unknown;
};

/** Raw facts from the runtime; sanitized here before they go anywhere. */
export type RawUsageMeta = {
  appVersion: unknown;
  buildNumber: unknown;
  locale: unknown;
  variant: UsageVariant;
};

export type UsageOptions = {
  send: UsageSender;
  meta: () => RawUsageMeta;
  now?: () => number;
};

type PersistedState = {
  /** The install existed before 1.0.6. */
  existing: boolean;
  /** Visits reported so far (capped at MAX_VISIT_NUMBER). */
  visits: number;
  /** Steps already counted (sent, or marked done without sending). */
  done: UsageStep[];
};

type Visit = {
  startedAt: number;
  screens: UsageScreen[];
  taps: UsageTap[];
  madeReminder: boolean;
};

// ─── sanitizing (pure) ───────────────────────────────────────────────────────

/** "pt-BR" → "pt", "zh_Hans" → "zh", "EN" → "en"; anything else → "und". */
export function languageCode(locale: unknown): string {
  if (typeof locale !== "string") return "und";
  const code = locale.trim().split(/[-_]/)[0].toLowerCase();
  return LANG_PATTERN.test(code) ? code : "und";
}

/** `__DEV__` or any channel but `production` is a development build. */
export function resolveVariant(channel: unknown, isDev: boolean): UsageVariant {
  return !isDev && channel === "production" ? "production" : "development";
}

/** The four common fields, each reduced to something its pattern accepts. */
export function sanitizeMeta(raw: RawUsageMeta): UsageMeta {
  const version = typeof raw.appVersion === "string" ? raw.appVersion.trim() : "";
  const build =
    typeof raw.buildNumber === "number" ? String(raw.buildNumber) :
    typeof raw.buildNumber === "string" ? raw.buildNumber.trim() : "";
  return {
    appVersion: APP_VERSION_PATTERN.test(version) ? version : "0",
    buildNumber: BUILD_NUMBER_PATTERN.test(build) ? build : "0",
    lang: languageCode(raw.locale),
    variant: raw.variant === "production" ? "production" : "development",
  };
}

/** expo-router pathname → screen. "/" is Home, whose own surface decides. */
export function screenForPath(pathname: unknown): UsageScreen | null {
  if (typeof pathname !== "string") return "other";
  const path = pathname.split("?")[0].replace(/\/+$/, "") || "/";
  switch (path) {
    case "/":
    case "/index":
      return null;
    case "/settings":
      return "settings";
    case "/diagnostics":
      return "diagnostics";
    case "/reminder/new":
      return "new_reminder";
    case "/paywall":
      return "paywall";
    case "/alarm":
      return "alarm";
    default:
      return "other";
  }
}

function clampDuration(ms: number): number {
  if (!Number.isFinite(ms) || ms <= 0) return 0;
  return Math.min(MAX_DURATION_SEC, Math.round(ms / 1000));
}

function parseState(raw: string): PersistedState | null {
  try {
    const value = JSON.parse(raw);
    if (!value || typeof value !== "object" || typeof value.existing !== "boolean") return null;
    const visits = Number.isInteger(value.visits)
      ? Math.max(0, Math.min(MAX_VISIT_NUMBER, value.visits))
      : 0;
    const done = Array.isArray(value.done) ? value.done.filter(isUsageStep) : [];
    return { existing: value.existing, visits, done };
  } catch {
    return null;
  }
}

// ─── module state ────────────────────────────────────────────────────────────

let options: UsageOptions | null = null;
let state: PersistedState | null = null;
let loadPromise: Promise<void> | null = null;
let chain: Promise<void> = Promise.resolve();
let pendingSteps: UsageStep[] = [];
let visit: Visit | null = null;
let routeScreen: UsageScreen | null = null;
let homeSurface: UsageScreen = "home";
let routeKnown = false;
let currentScreen: UsageScreen | null = null;
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let unsubscribers: (() => void)[] = [];

const FLUSH_DELAY_MS = 1500;

function now(): number {
  try {
    return options?.now ? options.now() : Date.now();
  } catch {
    return Date.now();
  }
}

/** Runs async work one piece at a time, so state writes never interleave. */
function enqueue(work: () => Promise<void>): Promise<void> {
  chain = chain.then(work).catch(() => {});
  return chain;
}

function send<P>(fn: ((payload: P) => unknown) | undefined, payload: P): void {
  if (!fn) return;
  try {
    const result = fn(payload);
    if (result && typeof (result as Promise<unknown>).catch === "function") {
      (result as Promise<unknown>).catch(() => {});
    }
  } catch {
    // Lost, by design.
  }
}

function currentMeta(): UsageMeta | null {
  try {
    return options ? sanitizeMeta(options.meta()) : null;
  } catch {
    return null;
  }
}

async function persist(next: PersistedState): Promise<boolean> {
  try {
    await AsyncStorage.setItem(USAGE_STATE_KEY, JSON.stringify(next));
    return true;
  } catch {
    return false;
  }
}

function load(): Promise<void> {
  if (loadPromise) return loadPromise;
  loadPromise = (async () => {
    try {
      // All reads are issued in this tick, ahead of any write this launch makes.
      const keys = [USAGE_STATE_KEY, ...PRIOR_INSTALL_KEYS];
      const values = await Promise.all(keys.map((key) => AsyncStorage.getItem(key)));
      const map = new Map(keys.map((key, i) => [key, values[i]]));
      const stored = map.get(USAGE_STATE_KEY);
      if (stored != null) {
        // Unreadable state: assume the safe side (counted, nothing to resend).
        state = parseState(stored) ?? { existing: true, visits: 0, done: [...USAGE_STEPS] };
        return;
      }
      const existing = PRIOR_INSTALL_KEYS.some((key) => map.get(key) != null);
      state = { existing, visits: 0, done: existing ? [...USAGE_STEPS] : [] };
      await persist(state);
    } catch {
      // Storage unreadable: send no first-run steps, report visits as 0.
      state = { existing: true, visits: 0, done: [...USAGE_STEPS] };
    }
  })();
  return loadPromise;
}

// ─── steps ───────────────────────────────────────────────────────────────────

function scheduleFlush(): void {
  if (flushTimer || currentScreen === "recording" || !options) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    if (currentScreen === "recording") return;
    void flushSteps();
  }, FLUSH_DELAY_MS);
}

/** Count every pending step that has not been counted yet. Never throws. */
export function flushSteps(): Promise<void> {
  return enqueue(async () => {
    await load();
    if (!state || pendingSteps.length === 0) return;
    const fresh = pendingSteps.filter((step) => !state!.done.includes(step));
    pendingSteps = [];
    if (fresh.length === 0) return;
    const next: PersistedState = { ...state, done: [...state.done, ...fresh] };
    state = next;
    // Written before sending: a crash can lose a step, never send one twice.
    if (!(await persist(next))) return;
    if (next.existing) return;
    const meta = currentMeta();
    if (!meta) return;
    for (const step of fresh) send(options?.send.step, { step, ...meta });
  });
}

/** A first-run milestone. Counted once per install; never throws. */
export function markStep(step: UsageStep): void {
  try {
    if (!isUsageStep(step)) return;
    if (state?.done.includes(step)) return;
    if (!pendingSteps.includes(step)) pendingSteps.push(step);
    scheduleFlush();
  } catch {
    // Never let a count break the app.
  }
}

/** Whether a step has been counted (or is waiting to be). */
export function isStepCounted(step: UsageStep): boolean {
  return pendingSteps.includes(step) || state?.done.includes(step) === true;
}

// ─── visits ──────────────────────────────────────────────────────────────────

function pushScreen(screen: UsageScreen): void {
  if (!visit) return;
  const last = visit.screens[visit.screens.length - 1];
  if (last === screen || visit.screens.length >= MAX_SCREENS) return;
  visit.screens.push(screen);
}

function updateScreen(): void {
  if (!routeKnown) return;
  const next = routeScreen ?? homeSurface;
  if (next === currentScreen) return;
  const leavingRecording = currentScreen === "recording";
  currentScreen = next;
  pushScreen(next);
  if (leavingRecording && pendingSteps.length > 0) scheduleFlush();
}

/** The router's pathname changed (app/_layout.tsx). Never throws. */
export function noteRoute(pathname: string): void {
  try {
    routeScreen = screenForPath(pathname);
    routeKnown = true;
    updateScreen();
  } catch {
    // ignore
  }
}

/** What Home is showing over or within itself (app/index.tsx). Never throws. */
export function noteHomeSurface(surface: UsageScreen): void {
  try {
    if (!isUsageScreen(surface)) return;
    homeSurface = surface;
    updateScreen();
  } catch {
    // ignore
  }
}

/** A named control was tapped. Never throws. */
export function noteTap(tap: UsageTap): void {
  try {
    if (!visit || !isUsageTap(tap) || visit.taps.length >= MAX_TAPS) return;
    visit.taps.push(tap);
  } catch {
    // ignore
  }
}

/** A reminder was created during this visit. Never throws. */
export function noteReminderMade(): void {
  if (visit) visit.madeReminder = true;
}

function startVisit(): void {
  if (visit) return;
  visit = { startedAt: now(), screens: [], taps: [], madeReminder: false };
  if (currentScreen) visit.screens.push(currentScreen);
}

function endVisit(): void {
  const ended = visit;
  visit = null;
  if (!ended) return;
  const durationSec = clampDuration(now() - ended.startedAt);
  void enqueue(async () => {
    await load();
    if (!state) return;
    let visitNumber = 0;
    if (!state.existing) {
      const next = { ...state, visits: Math.min(MAX_VISIT_NUMBER, state.visits + 1) };
      state = next;
      await persist(next);
      visitNumber = next.visits;
    }
    const meta = currentMeta();
    if (!meta) return;
    send(options?.send.visit, {
      visitNumber,
      durationSec,
      screens: ended.screens.filter(isUsageScreen).slice(0, MAX_SCREENS),
      taps: ended.taps.filter(isUsageTap).slice(0, MAX_TAPS),
      madeReminder: ended.madeReminder === true,
      ...meta,
    });
  });
}

/** AppState transitions. "inactive" (a system sheet, Control Center) is neither. */
export function handleAppState(next: AppStateStatus): void {
  try {
    if (next === "active") {
      startVisit();
    } else if (next === "background") {
      endVisit();
      if (flushTimer) {
        clearTimeout(flushTimer);
        flushTimer = null;
      }
      if (pendingSteps.length > 0) void flushSteps();
    }
  } catch {
    // ignore
  }
}

// A take that ends up failed: the first one counts (cap_unverified is the
// subscription check, not the take).
function onPendingTakes(): void {
  if (isStepCounted("first_take_failed")) return;
  const failed = getPendingTakesSnapshot().some(
    (take) => take.phase === "failed" && take.errorKind !== "cap_unverified"
  );
  if (failed) markStep("first_take_failed");
}

/**
 * Start counting. Called once, at module scope in app/_layout.tsx, so the
 * existing-install read is the first storage access of the launch. Never throws.
 */
export function startUsage(opts: UsageOptions): void {
  try {
    if (options) return;
    options = opts;
    void load();
    markStep("first_open");
    if (AppState.currentState !== "background") startVisit();
    const sub = AppState.addEventListener("change", handleAppState);
    unsubscribers.push(() => sub.remove());
    unsubscribers.push(subscribePendingTakes(onPendingTakes));
  } catch {
    // Counting is optional; the app is not.
  }
}

/** Test seam: forget everything. */
export function __resetUsageForTests(): void {
  for (const unsubscribe of unsubscribers) {
    try {
      unsubscribe();
    } catch {
      // ignore
    }
  }
  unsubscribers = [];
  if (flushTimer) clearTimeout(flushTimer);
  flushTimer = null;
  options = null;
  state = null;
  loadPromise = null;
  chain = Promise.resolve();
  pendingSteps = [];
  visit = null;
  routeScreen = null;
  homeSurface = "home";
  routeKnown = false;
  currentScreen = null;
}

/** Test seam: wait for queued storage work and sends to settle. */
export function __settleUsageForTests(): Promise<void> {
  return chain;
}
