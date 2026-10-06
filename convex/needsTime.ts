/**
 * "When should I remind you?" — the server half (founder decision, 2026-10-06).
 *
 * A take the guard turns away as `no_time` (a clear task, no time said) or
 * `past_time` (a one-off whose time had already gone by) is not a failure the
 * user should see. The worker keeps what it heard instead of dropping it: the
 * full plans (`heldPlans`, server-only) and a compact view of them for the card
 * (`pendingPlans`, on the watched document). The card asks for a time, and
 * `creationJobs.resolveWithTime` commits the held plans with it.
 *
 * Pure: no Convex, no env, no clock of its own — so every rule here is pinned
 * by jest rather than by the mocked backend.
 */

import { PAST_TIME_GRACE_MS, validateCreationPlan } from "./creationValidate";
import {
  legacyFieldsFromGrid,
  zonedTimeToUtcMs,
  type GridSchedule,
} from "./scheduleShape";

/** The two guard details that ask for a time instead of failing the take. */
export type NeedsTimeDetail = "no_time" | "past_time";

export function isNeedsTimeDetail(detail: unknown): detail is NeedsTimeDetail {
  return detail === "no_time" || detail === "past_time";
}

/**
 * One held plan: exactly `commitPlanValidator` in convex/schema.ts (the shape
 * `toCommitPlan` builds). Restated structurally so this module stays free of
 * Convex imports; creationJobs.ts checks the two agree.
 */
export type HeldPlan = {
  title: string;
  description: string;
  time: string;
  date?: string;
  frequency: string;
  days?: string[];
  schedule?: GridSchedule;
  scheduleType?: "once" | "interval" | "rrule" | "grid";
  onceAt?: number;
  rrule?: string;
  dtstart?: number;
  tzid?: string;
  until?: number;
  intervalMs?: number;
  anchorAt?: number;
  intervalDays?: number;
  parseWarnings?: string[];
  emoji?: string;
  preReminderMinutes?: number;
  urgency?: "urgent" | "notice" | "routine";
  persistent?: boolean;
  ttsText: string;
  preTtsText?: string;
  lang?: string;
};

/** Exactly `pendingPlanValidator` in convex/schema.ts. */
export type PendingPlan = {
  title: string;
  description: string;
  emoji?: string;
  lang?: string;
  frequency: string;
  days?: string[];
  saidTime?: string;
  needsTime: boolean;
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Is this planned reminder one the guard would ask about? The same two rules
 * `guardTake` applies: a one-off with no time said, or a one-off whose instant
 * is more than the grace window behind `now`.
 */
export function planNeedsTime(plan: unknown, now: number): boolean {
  if (!isPlainObject(plan) || plan.frequency !== "once") return false;
  if (plan.timeSpoken === false) return true;
  return typeof plan.onceAt === "number" && now - plan.onceAt > PAST_TIME_GRACE_MS;
}

/** The card's view of one held plan. */
export function toPendingPlan(
  plan: HeldPlan,
  needsTime: boolean,
  timeSpoken: unknown
): PendingPlan {
  // A time the user said that has gone by is worth showing as context ("10:00
  // has already passed today"); a time the model picked never is.
  const saidTime = needsTime && timeSpoken !== false ? plan.time : undefined;
  return {
    title: plan.title,
    description: plan.description,
    ...(plan.emoji ? { emoji: plan.emoji } : {}),
    ...(plan.lang ? { lang: plan.lang } : {}),
    frequency: plan.frequency,
    ...(plan.days && plan.days.length > 0 ? { days: plan.days } : {}),
    ...(saidTime ? { saidTime } : {}),
    needsTime,
  };
}

/**
 * Every column a chosen grid implies — the planner's projection
 * (convex/actions.ts `buildReminderPlan`), restated for a grid the user picked
 * rather than one the parse built. Null when a one-off cannot be placed in its
 * zone, which is a schedule this pipeline will not guess at.
 */
export function columnsForSchedule(
  schedule: GridSchedule,
  now: number
): Omit<HeldPlan, "title" | "description" | "ttsText"> | null {
  const legacy = legacyFieldsFromGrid(schedule);
  const columns: Omit<HeldPlan, "title" | "description" | "ttsText"> = {
    schedule,
    time: legacy.time,
    date: legacy.date,
    frequency: legacy.frequency,
    days: legacy.days.length > 0 ? legacy.days : undefined,
    intervalMs: legacy.intervalMs,
    intervalDays: legacy.intervalDays,
    tzid: schedule.tzid,
    until: schedule.until,
    // Every execution column is named, so laying these over a held plan can
    // never leave the old schedule's columns behind (a one-off's `onceAt` on a
    // plan that now repeats). The parse's warnings were about the old one.
    scheduleType: undefined,
    onceAt: undefined,
    rrule: undefined,
    dtstart: undefined,
    anchorAt: undefined,
    parseWarnings: undefined,
  };

  if (legacy.frequency === "interval") {
    return { ...columns, scheduleType: "interval", anchorAt: now };
  }
  if (legacy.frequency === "once") {
    const onceAt = zonedTimeToUtcMs(legacy.date, legacy.time, schedule.tzid);
    if (onceAt === null) return null;
    return { ...columns, scheduleType: "once", onceAt };
  }
  const [hours, minutes] = legacy.time.split(":").map(Number);
  const rrule =
    legacy.frequency === "custom"
      ? `FREQ=WEEKLY;BYDAY=${legacy.days.map((d) => d.slice(0, 2).toUpperCase()).join(",")};BYHOUR=${hours};BYMINUTE=${minutes}`
      : `FREQ=DAILY;BYHOUR=${hours};BYMINUTE=${minutes}`;
  return { ...columns, scheduleType: "rrule", rrule, dtstart: now };
}

/** What the user may change on the way in, from the pre-filled edit sheet. */
export type NeedsTimeEdits = { title: string; description: string; emoji?: string };

export type ResolveResult =
  | { ok: true; plans: HeldPlan[] }
  | { ok: false; reason: string };

/**
 * The plans a take commits once the user has picked a time.
 *
 * The chosen schedule goes on every plan that was waiting for one (a take that
 * flagged none applies it to its first plan); the rest keep the schedule they
 * were parsed with. Edits from the sheet land on the first waiting plan — the
 * one the card showed. Every plan then goes through the strict gate, with the
 * provenance flags off, so a one-off picked in the past is refused here rather
 * than committed as a reminder that never rings.
 */
export function resolveHeldPlans(input: {
  held: readonly HeldPlan[];
  pending: readonly PendingPlan[];
  schedule: GridSchedule;
  edits?: NeedsTimeEdits;
  /** The job's zone, for a held plan whose grid does not name one. */
  timezone: string;
  now: number;
}): ResolveResult {
  const { held, pending, schedule, edits, timezone, now } = input;
  if (held.length === 0) return { ok: false, reason: "no held plans" };

  const flagged = held.map((_, i) => pending[i]?.needsTime === true);
  const waiting = flagged.some(Boolean) ? flagged : held.map((_, i) => i === 0);
  const shown = waiting.indexOf(true);

  const columns = columnsForSchedule(schedule, now);
  if (!columns) return { ok: false, reason: "the chosen time cannot be placed in its zone" };

  const plans: HeldPlan[] = held.map((plan, i) => {
    if (!waiting[i]) return plan;
    const next: HeldPlan = { ...plan, ...columns };
    if (i === shown && edits) {
      const description = edits.description.trim();
      next.title = edits.title.trim();
      next.description = description;
      next.ttsText = description;
      next.emoji = edits.emoji?.trim() || undefined;
    }
    return next;
  });

  for (let i = 0; i < plans.length; i++) {
    const verdict = validateCreationPlan(gatePlanOf(plans[i]), {
      timezone: plans[i].schedule?.tzid ?? timezone,
      now,
    }, i);
    if (!verdict.ok) return { ok: false, reason: `plan ${i}: ${verdict.field}: ${verdict.reason}` };
  }
  return { ok: true, plans };
}

/**
 * A held plan as the strict gate reads a planner's output: the columns `commit`
 * drops when they are empty put back, and both provenance flags off.
 */
function gatePlanOf(plan: HeldPlan): Record<string, unknown> {
  const times =
    plan.schedule?.times.kind === "clock" ? plan.schedule.times.times : [plan.time];
  return {
    ...plan,
    times,
    urgency: plan.urgency ?? "routine",
    persistent: plan.persistent ?? false,
    preReminderMinutes: plan.preReminderMinutes ?? 0,
    preTtsText: plan.preTtsText ?? "",
    parseWarnings: plan.parseWarnings ?? [],
    explicitDate: false,
    explicitTime: false,
  };
}
