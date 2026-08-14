import type { Reminder } from "./store";

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

/** The local reminder one take item becomes. */
export function buildReminderDraft(
  item: TakeItem,
  ctx: DraftContext
): Omit<Reminder, "id" | "createdAt"> {
  const frequency = item.frequency === "weekly" ? "custom" : item.frequency;
  const days = frequency === "custom" ? (item.days || []) : [];

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
    time: item.time ?? "00:00",
    date: item.date,
    frequency,
    days,
    audioUrl: item.audioUrl || "",
    audioStatus: ctx.usedFastPath ? "pending" : item.audioUrl ? "ready" : undefined,
    preReminderMinutes:
      Number.isFinite(preReminderMinutes) && preReminderMinutes > 0 ? preReminderMinutes : undefined,
    preAudioUrl: item.preAudioUrl || undefined,
    urgency: item.urgency,
    persistent: item.persistent === true || undefined,
    variants: variants?.length ? variants : undefined,
    variantAudioUrls: variantAudioUrls?.length ? variantAudioUrls : undefined,

    intervalMs: Number.isFinite(intervalMs) ? intervalMs : undefined,
    anchorAt: Number.isFinite(anchorAt) ? anchorAt : undefined,

    // New unified schedule fields
    scheduleType: item.scheduleType,
    onceAt: item.onceAt,
    rrule: item.rrule,
    dtstart: item.dtstart,
    tzid: ctx.tzid,
    until: item.until,
    parseWarnings: item.parseWarnings,

    schemaVersion: 4,
  };
}

export type TakeAllowance = {
  /** How many of the take's reminders may be kept. */
  allowed: number;
  dropped: number;
  isPro: boolean;
  limit: number;
  activeCount: number;
};

/**
 * How much of the take fits under the free cap.
 *
 * The gate before recording only knew about one reminder, so a three-task take
 * from a user with two active reminders would land five active on a free plan.
 * Allowance is counted the way usageGate counts it — free plans keep `limit`
 * ACTIVE reminders — and, like usageGate, the entitlement is only consulted
 * once the take would actually go over. `isPro: false` on that fast path means
 * "not asked", not "not a subscriber".
 */
export async function planTakeAllowance(params: {
  takeCount: number;
  activeCount: number;
  limit: number;
  checkPro: () => Promise<boolean>;
}): Promise<TakeAllowance> {
  const { takeCount, limit, checkPro } = params;
  const activeCount = Math.max(0, params.activeCount);
  const remaining = Math.max(0, limit - activeCount);

  if (takeCount <= remaining) {
    return { allowed: takeCount, dropped: 0, isPro: false, limit, activeCount };
  }

  const isPro = await checkPro().catch(() => false);
  if (isPro) {
    return { allowed: takeCount, dropped: 0, isPro: true, limit, activeCount };
  }

  return { allowed: remaining, dropped: takeCount - remaining, isPro: false, limit, activeCount };
}

export type TakeIntakeDeps = {
  addReminder: (draft: Omit<Reminder, "id" | "createdAt">) => Promise<Reminder>;
  /** Fire-and-forget audio hydration for a fast-path reminder. */
  startHydration?: (reminder: Reminder, convexId: string) => void;
  /** Server-side cleanup for a reminder the free cap won't let us keep. */
  discardOverflow: (item: TakeItem) => Promise<void>;
  onError?: (stage: "add" | "discard", error: unknown, index: number) => void;
};

export type TakeIntakeOutcome = {
  created: Reminder[];
  /** Items that reached the store and failed there. */
  failed: number;
  /** Items the free cap cut. */
  dropped: number;
  total: number;
};

/**
 * Store every reminder the take is allowed to keep, and delete the rows it is
 * not. Per-item failures are isolated — one reminder that won't save costs
 * only itself — but a take where nothing at all landed rethrows, so a
 * single-reminder take fails exactly the way it did before multi takes.
 */
export async function intakeTakeReminders(params: {
  items: TakeItem[];
  allowed: number;
  context: DraftContext;
  deps: TakeIntakeDeps;
}): Promise<TakeIntakeOutcome> {
  const { items, allowed, context, deps } = params;

  const created: Reminder[] = [];
  let failed = 0;
  let firstError: unknown;

  for (let index = 0; index < items.length; index++) {
    const item = items[index];

    if (index >= allowed) {
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
    dropped: Math.max(0, items.length - allowed),
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
};

/**
 * What to tell the user about a take. A plain single reminder says nothing —
 * the edit sheet opening on it is the feedback, same as before OLD-93.
 */
export function describeTakeOutcome(outcome: {
  created: number;
  dropped: number;
  failed: number;
  total: number;
  limit: number;
}): TakeFeedback | null {
  const { created, dropped, failed, total, limit } = outcome;
  if (created === 0) return null;

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
