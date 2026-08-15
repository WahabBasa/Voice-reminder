import { CURRENT_SCHEMA_VERSION, type Reminder } from "./store";
import { buildGridSchedule, legacyFieldsFromGrid, type GridSchedule } from "./schedule";
import { isPremiumSchedule } from "./usageGate";
import type { PaywallContext } from "./paywallContent";

/**
 * One voice take, several reminders (OLD-93).
 *
 * The processing actions return the first reminder's fields top-level (where
 * every pre-OLD-93 caller reads them) with the whole take alongside in
 * `reminders`. Everything here is deliberately dependency-free so the screen's
 * loop is testable: the store, Notifee, hydration and the Convex delete all
 * arrive as injected deps.
 */

/** One reminder as the action returned it. Field-for-field the old result. */
export type TakeItem = Record<string, any>;

export type DraftContext = {
  /** Fast path returns rows with audio still pending. */
  usedFastPath: boolean;
  tzid: string;
};

/**
 * The reminders in an action result. A result without a usable array is the
 * legacy single-reminder shape, which is a take of exactly one.
 */
export function extractTakeItems(result: any): TakeItem[] {
  if (!result || typeof result !== "object") return [];

  const items: TakeItem[] = Array.isArray(result.reminders)
    ? result.reminders.filter((item: unknown) => !!item && typeof item === "object")
    : [];

  return items.length > 0 ? items : [result];
}

/**
 * The grid one take item means.
 *
 * The grid is what the action now sends (OLD-97). A result from an older deploy
 * carries none, so it is rebuilt from the flat fields that result does have —
 * the same builder the parse itself runs. Read before the reminder is stored
 * too, because whether it needs Pro is a question about this grid (OLD-100).
 */
export function scheduleForItem(item: TakeItem, tzid?: string): GridSchedule {
  if (isGridSchedule(item.schedule)) return item.schedule;

  return buildGridSchedule(
    {
      frequency: item.frequency,
      time: item.time,
      times: item.times,
      date: item.date,
      days: item.days,
      everyNDays: item.everyNDays ?? item.intervalDays,
      intervalMs: item.intervalMs,
      windowStart: item.windowStart,
      windowEnd: item.windowEnd,
      until: item.until,
    },
    { tzid }
  );
}

/** Whether this item's schedule is one only a subscriber may keep. */
export function isPremiumTakeItem(item: TakeItem, tzid?: string): boolean {
  return isPremiumSchedule(scheduleForItem(item, tzid));
}

/** The local reminder one take item becomes. */
export function buildReminderDraft(
  item: TakeItem,
  ctx: DraftContext
): Omit<Reminder, "id" | "createdAt"> {
  const schedule = scheduleForItem(item, ctx.tzid);

  // Legacy projection: `time`/`date`/`frequency`/`days` stay in lockstep with
  // the grid so nothing that still reads them can disagree with it.
  const legacy = legacyFieldsFromGrid(schedule);
  const frequency = legacy.frequency;
  const days = legacy.days;

  const intervalMs = Number(item.intervalMs);
  const anchorAt = Number(item.anchorAt);
  const preReminderMinutes = Number(item.preReminderMinutes);

  // Card-chip emoji from the parse (absent = neutral bell chip)
  const emoji = typeof item.emoji === "string" && item.emoji ? (item.emoji as string) : undefined;

  // Assistant replay fields (OLD-53). Fast path returns urgency/persistent/
  // variants at parse time; variantAudioUrls arrive via hydration.
  const variants = Array.isArray(item.variants) ? (item.variants as string[]) : undefined;
  const variantAudioUrls = Array.isArray(item.variantAudioUrls)
    ? (item.variantAudioUrls as string[])
    : undefined;

  return {
    convexId: item.id,
    title: item.title,
    description: item.description,
    emoji,
    schedule,
    time: legacy.time,
    date: legacy.date,
    frequency,
    days,
    intervalDays: legacy.intervalDays,
    audioUrl: item.audioUrl || "",
    audioStatus: ctx.usedFastPath ? "pending" : item.audioUrl ? "ready" : undefined,
    preReminderMinutes:
      Number.isFinite(preReminderMinutes) && preReminderMinutes > 0 ? preReminderMinutes : undefined,
    preAudioUrl: item.preAudioUrl || undefined,
    urgency: item.urgency,
    persistent: item.persistent === true || undefined,
    variants: variants?.length ? variants : undefined,
    variantAudioUrls: variantAudioUrls?.length ? variantAudioUrls : undefined,

    intervalMs: Number.isFinite(intervalMs) ? intervalMs : legacy.intervalMs,
    anchorAt: Number.isFinite(anchorAt) ? anchorAt : undefined,

    // New unified schedule fields
    scheduleType: item.scheduleType,
    onceAt: item.onceAt,
    rrule: item.rrule,
    dtstart: item.dtstart,
    tzid: ctx.tzid,
    until: schedule.until ?? item.until,
    parseWarnings: item.parseWarnings,

    schemaVersion: CURRENT_SCHEMA_VERSION,
  };
}

/** A `schedule` that survived the wire as an actual grid, not model junk. */
function isGridSchedule(value: unknown): value is GridSchedule {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<GridSchedule>;
  return (
    candidate.type === "grid" &&
    !!candidate.days &&
    typeof candidate.days === "object" &&
    !!candidate.times &&
    typeof candidate.times === "object"
  );
}

/** What the plan says about one reminder of the take. */
export type TakeDecision = "keep" | "drop_cap" | "drop_premium";

export type TakeAllowance = {
  /** How many of the take's reminders may be kept. */
  allowed: number;
  dropped: number;
  /** Cut because their schedule needs Pro — interval mode (OLD-100). */
  blockedPremium: number;
  /** Index-aligned with the take: what happens to each reminder. */
  decisions: TakeDecision[];
  isPro: boolean;
  limit: number;
  activeCount: number;
};

/**
 * How much of the take a free plan may keep.
 *
 * Two gates, one entitlement check. The cap: the gate before recording only
 * knew about one reminder, so a three-task take from a user with two active
 * reminders would land five active on a free plan — allowance is counted the
 * way usageGate counts it, over ACTIVE reminders. The premium gate: an interval
 * schedule is Pro-only whatever the count says (decision 6), so those reminders
 * are cut first and the cap is spent on what is left.
 *
 * Like usageGate, the entitlement is only consulted once one of the two would
 * actually bite. `isPro: false` on that fast path means "not asked", not "not a
 * subscriber".
 */
export async function planTakeAllowance(params: {
  takeCount: number;
  activeCount: number;
  limit: number;
  checkPro: () => Promise<boolean>;
  /** Index-aligned with the take: which reminders need Pro to exist at all. */
  premium?: boolean[];
}): Promise<TakeAllowance> {
  const { takeCount, limit, checkPro } = params;
  const activeCount = Math.max(0, params.activeCount);
  const remaining = Math.max(0, limit - activeCount);
  const premium = params.premium ?? [];
  const premiumCount = premium.filter(Boolean).length;

  const keepAll = (isPro: boolean): TakeAllowance => ({
    allowed: takeCount,
    dropped: 0,
    blockedPremium: 0,
    decisions: Array<TakeDecision>(takeCount).fill("keep"),
    isPro,
    limit,
    activeCount,
  });

  if (premiumCount === 0 && takeCount <= remaining) {
    return keepAll(false);
  }

  const isPro = await checkPro().catch(() => false);
  if (isPro) {
    return keepAll(true);
  }

  let free = remaining;
  const decisions: TakeDecision[] = [];
  for (let index = 0; index < takeCount; index++) {
    if (premium[index]) {
      decisions.push("drop_premium");
    } else if (free > 0) {
      free -= 1;
      decisions.push("keep");
    } else {
      decisions.push("drop_cap");
    }
  }

  return {
    allowed: decisions.filter((d) => d === "keep").length,
    dropped: decisions.filter((d) => d === "drop_cap").length,
    blockedPremium: decisions.filter((d) => d === "drop_premium").length,
    decisions,
    isPro: false,
    limit,
    activeCount,
  };
}

export type TakeIntakeDeps = {
  addReminder: (draft: Omit<Reminder, "id" | "createdAt">) => Promise<Reminder>;
  /** Fire-and-forget audio hydration for a fast-path reminder. */
  startHydration?: (reminder: Reminder, convexId: string) => void;
  /** Server-side cleanup for a reminder the free plan won't let us keep. */
  discardOverflow: (item: TakeItem) => Promise<void>;
  onError?: (stage: "add" | "discard", error: unknown, index: number) => void;
};

export type TakeIntakeOutcome = {
  created: Reminder[];
  /** Items that reached the store and failed there. */
  failed: number;
  /** Items the free cap cut. */
  dropped: number;
  /** Items cut because their schedule needs Pro. */
  blockedPremium: number;
  total: number;
};

/**
 * Store every reminder the take is allowed to keep, and delete the rows it is
 * not. Per-item failures are isolated — one reminder that won't save costs
 * only itself — but a take where nothing at all landed rethrows, so a
 * single-reminder take fails exactly the way it did before multi takes.
 *
 * `decisions` comes from planTakeAllowance and is per item, because the premium
 * gate does not cut a suffix the way the cap does: the interval reminder can be
 * the first of three. Without it, the old prefix rule still applies.
 */
export async function intakeTakeReminders(params: {
  items: TakeItem[];
  allowed: number;
  decisions?: TakeDecision[];
  context: DraftContext;
  deps: TakeIntakeDeps;
}): Promise<TakeIntakeOutcome> {
  const { items, allowed, decisions, context, deps } = params;

  const created: Reminder[] = [];
  let failed = 0;
  let firstError: unknown;

  const isKept = (index: number) =>
    decisions ? decisions[index] === "keep" : index < allowed;

  for (let index = 0; index < items.length; index++) {
    const item = items[index];

    if (!isKept(index)) {
      // The row already exists on the server with its audio, so it leaves
      // through the same delete the rest of the app uses.
      await deps.discardOverflow(item).catch((e) => deps.onError?.("discard", e, index));
      continue;
    }

    try {
      const reminder = await deps.addReminder(buildReminderDraft(item, context));
      created.push(reminder);

      const convexId = typeof item.id === "string" ? item.id : undefined;
      if (context.usedFastPath && convexId) {
        deps.startHydration?.(reminder, convexId);
      }
    } catch (e) {
      failed += 1;
      if (firstError === undefined) firstError = e;
      deps.onError?.("add", e, index);
    }
  }

  if (created.length === 0 && firstError !== undefined) {
    throw firstError;
  }

  return {
    created,
    failed,
    dropped: decisions
      ? decisions.filter((d) => d === "drop_cap").length
      : Math.max(0, items.length - allowed),
    blockedPremium: decisions ? decisions.filter((d) => d === "drop_premium").length : 0,
    total: items.length,
  };
}

/**
 * Schedule each reminder the take created. A reminder that won't schedule
 * doesn't stop its siblings from ringing.
 */
export async function scheduleTakeReminders(
  created: Reminder[],
  scheduleOne: (reminder: Reminder) => Promise<void>,
  onError?: (error: unknown, reminder: Reminder) => void
): Promise<void> {
  for (const reminder of created) {
    try {
      await scheduleOne(reminder);
    } catch (e) {
      onError?.(e, reminder);
    }
  }
}

export type TakeFeedback = {
  title: string;
  message?: string;
  type: "success" | "warning";
  /** Tapping the toast should open the paywall. */
  upgrade: boolean;
  /** Which pitch the paywall should lead with when it does. */
  upgradeContext?: PaywallContext;
};

/**
 * What to tell the user about a take. A plain single reminder says nothing —
 * the edit sheet opening on it is the feedback, same as before OLD-93.
 */
export function describeTakeOutcome(outcome: {
  created: number;
  dropped: number;
  blockedPremium?: number;
  failed: number;
  total: number;
  limit: number;
}): TakeFeedback | null {
  const { created, dropped, failed, total, limit } = outcome;
  const blockedPremium = outcome.blockedPremium ?? 0;
  if (created === 0) return null;

  // The premium cut is named first: it is the specific thing the user asked for
  // and did not get, where the cap is a number they can also read off the list.
  if (blockedPremium > 0) {
    return {
      title: `${created} of ${total} reminders created`,
      message: "Repeating every few minutes is a Pro feature — tap to upgrade.",
      type: "warning",
      upgrade: true,
      upgradeContext: "interval",
    };
  }

  if (dropped > 0) {
    return {
      title: `${created} of ${total} reminders created`,
      message: `Free plan keeps ${limit} reminders active — tap to upgrade.`,
      type: "warning",
      upgrade: true,
    };
  }

  if (failed > 0) {
    return {
      title: `${created} of ${total} reminders created`,
      message: "The rest couldn't be saved. Try recording them again.",
      type: "warning",
      upgrade: false,
    };
  }

  if (created > 1) {
    return { title: `${created} reminders created`, type: "success", upgrade: false };
  }

  return null;
}
