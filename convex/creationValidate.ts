/**
 * The creation job's strict gate (spec 1.3 step 6).
 *
 * This module answers one question — "is this plan something we are willing to
 * turn into reminder rows?" — and it answers it with DIRECT predicates. It
 * imports nothing from convex/actions.ts or convex/scheduleShape.ts on purpose:
 * those builders exist to REPAIR a sloppy parse (a missing time becomes the
 * current time, a 3-minute interval becomes 5, an upside-down window becomes
 * 08:00–22:00), which is exactly right for the legacy path and exactly wrong
 * here. The job pipeline has a pending card on screen and a retry button under
 * it, so a take it cannot represent faithfully is better failed as
 * `unparseable` than quietly bent into a reminder the user did not ask for.
 *
 * Consequence, and the reason every accepted shape below is spelled out
 * field-for-field: this is a SECOND, independent statement of what a schedule
 * may look like. It is deliberately duplicated from convex/scheduleShape.ts
 * rather than imported. If the grid grows an axis, this file must be taught the
 * new shape by hand — until then it rejects it, which is the safe direction.
 *
 * Pure: no Convex, no network, no ambient clock (`context.now` is injected).
 */

/** A title is a card label, not an essay. */
export const MAX_TITLE_LENGTH = 200;

/**
 * Ceiling on reminders per take. Mirrors MAX_REMINDERS_PER_TAKE in
 * convex/helpers.ts; restated here so this module keeps its zero-import rule.
 */
export const MAX_PLANS_PER_TAKE = 5;

/** Mirrors MAX_TIMES_PER_DAY in convex/scheduleShape.ts. */
export const MAX_TIMES_PER_DAY = 12;

/** Mirrors MIN/MAX_INTERVAL_MINUTES in convex/scheduleShape.ts. */
export const MIN_INTERVAL_MINUTES = 5;
export const MAX_INTERVAL_MINUTES = 24 * 60;

/**
 * An every-N-days schedule below 2 is "every day" and is expressed that way;
 * above a year the client's own occurrence scan (400-day horizon,
 * scheduleShape.horizonDays) can no longer be relied on to find the next ring,
 * so such a schedule would be a reminder that never fires.
 */
export const MIN_EVERY_N_DAYS = 2;
export const MAX_EVERY_N_DAYS = 366;

/** Mirrors MAX_PRE_REMINDER_MINUTES in convex/helpers.ts. */
export const MAX_PRE_REMINDER_MINUTES = 120;

/** Calendar order, the only order a validated weekday list may be in. */
export const WEEKDAY_ORDER = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;

const URGENCIES = ["urgent", "notice", "routine"] as const;
const FREQUENCIES = ["once", "daily", "custom", "interval"] as const;
const SCHEDULE_TYPES = ["once", "interval", "rrule"] as const;

export type CreationValidationResult =
  | { ok: true }
  | {
      ok: false;
      /** Which plan in the take failed; -1 for a take-level failure. */
      index: number;
      /** Dotted path of the offending field, for logs — never user-facing. */
      field: string;
      reason: string;
    };

export type CreationValidateContext = {
  /** The job's own timezone snapshot. Must be a zone this runtime knows. */
  timezone: unknown;
  /** Injected clock. A one-off must ring strictly after this instant. */
  now: number;
};

// ─── Predicates ─────────────────────────────────────────────────────────────

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Exactly these keys — no more, no fewer. A missing field is not defaulted. */
function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value);
  if (actual.length !== keys.length) return false;
  return keys.every((key) => Object.prototype.hasOwnProperty.call(value, key));
}

/** Strict 24-hour "HH:MM". No "8", no "8:5", no "0800" — those are repairs. */
export function isClockTime(value: unknown): value is string {
  return typeof value === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

/** "YYYY-MM-DD" that names a day the calendar actually has. */
export function isCalendarDate(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return false;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  // UTC arithmetic as pure calendar math — no zone is implied, and it keeps the
  // round-trip independent of the host clock this runs on.
  const probe = new Date(Date.UTC(year, month - 1, day));
  return (
    probe.getUTCFullYear() === year &&
    probe.getUTCMonth() === month - 1 &&
    probe.getUTCDate() === day
  );
}

/** A zone this runtime can actually resolve. Intl throws on anything else. */
export function isIanaTimezone(value: unknown): value is string {
  if (typeof value !== "string" || value.trim() === "") return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim() !== "";
}

function minutesOfClock(time: string): number {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

/**
 * Did the parse name BOTH halves of this one-off's wall clock?
 *
 * Absent flags read as "no", which keeps the strict direction the default: a
 * producer that does not carry provenance gets the old rule, not a pass.
 */
function saidInFull(plan: Record<string, unknown>): boolean {
  return plan.explicitDate === true && plan.explicitTime === true;
}

function sameStringArray(a: unknown, b: readonly string[] | undefined): boolean {
  if (b === undefined) return a === undefined;
  if (!Array.isArray(a) || a.length !== b.length) return false;
  return b.every((entry, i) => a[i] === entry);
}

// ─── The gate ───────────────────────────────────────────────────────────────

function fail(index: number, field: string, reason: string): CreationValidationResult {
  return { ok: false, index, field, reason };
}

const OK: CreationValidationResult = { ok: true };

/**
 * Every plan in one take, or the first reason the take is unusable.
 *
 * All N are checked before the caller writes anything (spec 1.3 step 6): one
 * bad item fails the whole take rather than half-importing it.
 */
export function validateCreationPlans(
  plans: unknown,
  context: CreationValidateContext
): CreationValidationResult {
  if (!isIanaTimezone(context.timezone)) {
    return fail(-1, "timezone", "not a resolvable IANA timezone");
  }
  if (!Array.isArray(plans)) return fail(-1, "plans", "not an array");
  if (plans.length === 0) return fail(-1, "plans", "take produced no reminders");
  if (plans.length > MAX_PLANS_PER_TAKE) {
    return fail(-1, "plans", `take produced more than ${MAX_PLANS_PER_TAKE} reminders`);
  }
  for (let index = 0; index < plans.length; index++) {
    const verdict = validateCreationPlan(plans[index], context, index);
    if (!verdict.ok) return verdict;
  }
  return OK;
}

/** One plan. `index` only decorates the failure so the caller can log it. */
export function validateCreationPlan(
  plan: unknown,
  context: CreationValidateContext,
  index = 0
): CreationValidationResult {
  if (!isPlainObject(plan)) return fail(index, "plan", "not an object");

  // ── The spoken half ──────────────────────────────────────────────────────
  if (typeof plan.title !== "string" || plan.title.trim() === "") {
    return fail(index, "title", "missing or blank");
  }
  if (plan.title.trim().length > MAX_TITLE_LENGTH) {
    return fail(index, "title", `longer than ${MAX_TITLE_LENGTH} characters`);
  }
  // The line the reminder speaks. guardSpokenLine only returns "" when the
  // parse had neither a description nor a title, which is not a reminder.
  if (typeof plan.description !== "string" || plan.description.trim() === "") {
    return fail(index, "description", "missing or blank");
  }
  if (plan.emoji !== undefined && !isNonEmptyString(plan.emoji)) {
    return fail(index, "emoji", "present but not a non-empty string");
  }
  if (!URGENCIES.includes(plan.urgency as (typeof URGENCIES)[number])) {
    return fail(index, "urgency", "not one of urgent|notice|routine");
  }
  if (typeof plan.persistent !== "boolean") {
    return fail(index, "persistent", "not a boolean");
  }
  if (
    typeof plan.preReminderMinutes !== "number" ||
    !Number.isInteger(plan.preReminderMinutes) ||
    plan.preReminderMinutes < 0 ||
    plan.preReminderMinutes > MAX_PRE_REMINDER_MINUTES
  ) {
    return fail(index, "preReminderMinutes", "not a whole number of minutes in range");
  }
  if (typeof plan.preTtsText !== "string") {
    return fail(index, "preTtsText", "not a string");
  }
  // A heads-up with no line to speak is a notification with nothing in it.
  if (plan.preReminderMinutes > 0 && plan.preTtsText.trim() === "") {
    return fail(index, "preTtsText", "pre-reminder asked for with no spoken line");
  }
  if (
    !Array.isArray(plan.parseWarnings) ||
    plan.parseWarnings.some((entry) => typeof entry !== "string")
  ) {
    return fail(index, "parseWarnings", "not an array of strings");
  }

  // ── The schedule ─────────────────────────────────────────────────────────
  const grid = validateGrid(plan.schedule, context, index);
  if (!grid.ok) return grid.failure;

  const { days, times, until } = grid;
  const isInterval = times.kind === "interval";

  // What the grid implies for every flat column the row also carries. These
  // mirror legacyFieldsFromGrid, restated as expectations rather than derived
  // by calling it — a projection that disagrees with its own grid is a bug we
  // want to see, not one we want to inherit.
  const expectedTime = isInterval ? times.windowStart : times.times[0];
  const expectedFrequency = isInterval
    ? "interval"
    : days.kind === "date"
      ? "once"
      : days.kind === "weekdays"
        ? "custom"
        : "daily";
  const expectedDays = !isInterval && days.kind === "weekdays" ? days.days : undefined;
  const expectedDate = !isInterval && days.kind === "date" ? days.date : undefined;
  const expectedIntervalMs = isInterval ? times.everyMinutes * 60000 : undefined;
  const expectedIntervalDays =
    !isInterval && days.kind === "everyNDays" ? days.interval : undefined;
  const expectedTimes = isInterval ? [times.windowStart] : times.times;
  const expectedScheduleType = isInterval ? "interval" : days.kind === "date" ? "once" : "rrule";

  if (plan.time !== expectedTime) {
    return fail(index, "time", "does not match the grid's first ring");
  }
  if (!sameStringArray(plan.times, expectedTimes)) {
    return fail(index, "times", "does not match the grid's clock times");
  }
  if (plan.frequency !== expectedFrequency) {
    return fail(index, "frequency", `does not match the grid (expected ${expectedFrequency})`);
  }
  if (!sameStringArray(plan.days, expectedDays)) {
    return fail(index, "days", "does not match the grid's weekdays");
  }
  if (plan.date !== expectedDate) {
    return fail(index, "date", "does not match the grid's dated day");
  }
  if (plan.intervalMs !== expectedIntervalMs) {
    return fail(index, "intervalMs", "does not match the grid's interval");
  }
  if (plan.intervalDays !== expectedIntervalDays) {
    return fail(index, "intervalDays", "does not match the grid's every-N-days axis");
  }
  if (plan.until !== until) {
    return fail(index, "until", "does not match the grid's bound");
  }
  if (!SCHEDULE_TYPES.includes(plan.scheduleType as (typeof SCHEDULE_TYPES)[number])) {
    return fail(index, "scheduleType", "not one of once|interval|rrule");
  }
  if (plan.scheduleType !== expectedScheduleType) {
    return fail(index, "scheduleType", `does not match the grid (expected ${expectedScheduleType})`);
  }

  // Each schedule type owns exactly one set of execution columns. A column
  // belonging to another type means the parse went somewhere the prompt never
  // asked it to go (an explicit `rrule`, say) and the builder followed.
  if (expectedScheduleType === "once") {
    if (!isFiniteNumber(plan.onceAt)) {
      return fail(index, "onceAt", "one-off has no resolved instant");
    }
    // A one-off in the past is only a failure when WE put it there. "Today at
    // three", said at half past, is a reminder the user asked for and the app
    // has an Overdue group built for it — failing the take would lose it, and
    // every retry would resolve to the same instant and burn the attempt cap.
    // A past instant that fell out of a missing date or a missing time is the
    // other thing entirely: a parse that went wrong, which is what this gate is
    // for. `explicitDate`/`explicitTime` are the only way to tell them apart —
    // by the time a plan is built, a day the user named and a day the clock
    // supplied look identical (convex/actions.ts).
    if (plan.onceAt <= context.now && !saidInFull(plan)) {
      return fail(index, "onceAt", "one-off resolves to an instant that has already passed");
    }
    if (plan.rrule !== undefined) return fail(index, "rrule", "set on a one-off");
    if (plan.dtstart !== undefined) return fail(index, "dtstart", "set on a one-off");
    if (plan.anchorAt !== undefined) return fail(index, "anchorAt", "set on a one-off");
  } else if (expectedScheduleType === "interval") {
    if (!isFiniteNumber(plan.anchorAt)) {
      return fail(index, "anchorAt", "interval has no anchor");
    }
    if (plan.onceAt !== undefined) return fail(index, "onceAt", "set on an interval");
    if (plan.rrule !== undefined) return fail(index, "rrule", "set on an interval");
    if (plan.dtstart !== undefined) return fail(index, "dtstart", "set on an interval");
  } else {
    if (!isNonEmptyString(plan.rrule)) {
      return fail(index, "rrule", "recurring schedule has no rule");
    }
    if (!isFiniteNumber(plan.dtstart)) {
      return fail(index, "dtstart", "recurring schedule has no start");
    }
    if (plan.onceAt !== undefined) return fail(index, "onceAt", "set on a recurring schedule");
    if (plan.anchorAt !== undefined) return fail(index, "anchorAt", "set on a recurring schedule");
  }

  return OK;
}

// ─── The grid, shape by shape ───────────────────────────────────────────────

type DaysShape =
  | { kind: "everyday" }
  | { kind: "weekdays"; days: string[] }
  | { kind: "everyNDays"; interval: number; startDate: string }
  | { kind: "date"; date: string };

type TimesShape =
  | { kind: "clock"; times: string[] }
  | { kind: "interval"; everyMinutes: number; windowStart: string; windowEnd: string };

type GridVerdict =
  | { ok: true; days: DaysShape; times: TimesShape; until: number | undefined }
  | { ok: false; failure: CreationValidationResult };

/**
 * The only schedules this pipeline will commit. Every accepted object is
 * matched key-for-key: an extra field means the producer knows something this
 * gate does not, and a missing one means it left a default to be filled in.
 */
function validateGrid(
  schedule: unknown,
  context: CreationValidateContext,
  index: number
): GridVerdict {
  const no = (field: string, reason: string): GridVerdict => ({
    ok: false,
    failure: fail(index, field, reason),
  });

  if (!isPlainObject(schedule)) return no("schedule", "not an object");
  if (schedule.type !== "grid") return no("schedule.type", 'not "grid"');

  const hasUntil = Object.prototype.hasOwnProperty.call(schedule, "until");
  const expectedKeys = ["type", "days", "times", "tzid", ...(hasUntil ? ["until"] : [])];
  if (!hasExactKeys(schedule, expectedKeys)) {
    return no("schedule", "carries fields outside type|days|times|until|tzid");
  }
  // The grid records the zone its wall-clock times were meant in, and it must
  // be the zone the job was begun in — otherwise a one-off's instant was
  // resolved against a clock nobody was standing on.
  if (schedule.tzid !== context.timezone) {
    return no("schedule.tzid", "does not match the job's timezone");
  }
  if (hasUntil && !isFiniteNumber(schedule.until)) {
    return no("schedule.until", "present but not a finite timestamp");
  }

  const days = validateDaysRule(schedule.days);
  if (typeof days === "string") return no("schedule.days", days);

  const times = validateTimesRule(schedule.times);
  if (typeof times === "string") return no("schedule.times", times);

  // A dated one-off is the one combination the builders never produce with an
  // interval times axis, and an interval that rings on exactly one day is not
  // a schedule anybody asked for.
  if (days.kind === "date" && times.kind === "interval") {
    return no("schedule", "a dated one-off cannot have an interval times axis");
  }

  return {
    ok: true,
    days,
    times,
    until: hasUntil ? (schedule.until as number) : undefined,
  };
}

/** The days axis, or the reason it is not one of the four supported shapes. */
function validateDaysRule(value: unknown): DaysShape | string {
  if (!isPlainObject(value)) return "not an object";
  switch (value.kind) {
    case "everyday": {
      if (!hasExactKeys(value, ["kind"])) return "everyday carries extra fields";
      return { kind: "everyday" };
    }
    case "weekdays": {
      if (!hasExactKeys(value, ["kind", "days"])) return "weekdays must carry exactly kind+days";
      const days = value.days;
      if (!Array.isArray(days) || days.length === 0) return "weekdays names no day";
      if (days.length > WEEKDAY_ORDER.length) return "weekdays names more days than exist";
      // Calendar order, deduped — the same normal form normalizeWeekdays emits.
      let previous = -1;
      for (const day of days) {
        const position = WEEKDAY_ORDER.indexOf(day as (typeof WEEKDAY_ORDER)[number]);
        if (position < 0) return `unknown weekday "${String(day)}"`;
        if (position <= previous) return "weekdays are not in calendar order, or repeat";
        previous = position;
      }
      return { kind: "weekdays", days: days as string[] };
    }
    case "everyNDays": {
      if (!hasExactKeys(value, ["kind", "interval", "startDate"])) {
        return "everyNDays must carry exactly kind+interval+startDate";
      }
      const interval = value.interval;
      if (
        typeof interval !== "number" ||
        !Number.isInteger(interval) ||
        interval < MIN_EVERY_N_DAYS ||
        interval > MAX_EVERY_N_DAYS
      ) {
        return `interval must be a whole number of days between ${MIN_EVERY_N_DAYS} and ${MAX_EVERY_N_DAYS}`;
      }
      if (!isCalendarDate(value.startDate)) return "startDate is not a real calendar date";
      return { kind: "everyNDays", interval, startDate: value.startDate };
    }
    case "date": {
      if (!hasExactKeys(value, ["kind", "date"])) return "date must carry exactly kind+date";
      if (!isCalendarDate(value.date)) return "date is not a real calendar date";
      return { kind: "date", date: value.date };
    }
    default:
      return `unknown days rule "${String(value.kind)}"`;
  }
}

/** The times axis, or the reason it is not one of the two supported shapes. */
function validateTimesRule(value: unknown): TimesShape | string {
  if (!isPlainObject(value)) return "not an object";
  switch (value.kind) {
    case "clock": {
      if (!hasExactKeys(value, ["kind", "times"])) return "clock must carry exactly kind+times";
      const times = value.times;
      if (!Array.isArray(times) || times.length === 0) return "clock names no time";
      if (times.length > MAX_TIMES_PER_DAY) {
        return `clock names more than ${MAX_TIMES_PER_DAY} times`;
      }
      // Sorted and deduped — "HH:MM" sorts in clock order, so ascending is the
      // whole test, and it is the normal form normalizeClockTimes emits.
      let previous = -1;
      for (const time of times) {
        if (!isClockTime(time)) return `"${String(time)}" is not a 24-hour HH:MM time`;
        const minute = minutesOfClock(time);
        if (minute <= previous) return "clock times are not in ascending order, or repeat";
        previous = minute;
      }
      return { kind: "clock", times: times as string[] };
    }
    case "interval": {
      if (!hasExactKeys(value, ["kind", "everyMinutes", "windowStart", "windowEnd"])) {
        return "interval must carry exactly kind+everyMinutes+windowStart+windowEnd";
      }
      const everyMinutes = value.everyMinutes;
      if (
        typeof everyMinutes !== "number" ||
        !Number.isInteger(everyMinutes) ||
        everyMinutes < MIN_INTERVAL_MINUTES ||
        everyMinutes > MAX_INTERVAL_MINUTES
      ) {
        return `everyMinutes must be a whole number between ${MIN_INTERVAL_MINUTES} and ${MAX_INTERVAL_MINUTES}`;
      }
      if (!isClockTime(value.windowStart)) return "windowStart is not a 24-hour HH:MM time";
      if (!isClockTime(value.windowEnd)) return "windowEnd is not a 24-hour HH:MM time";
      if (minutesOfClock(value.windowEnd) <= minutesOfClock(value.windowStart)) {
        return "window does not span a stretch of the day";
      }
      return {
        kind: "interval",
        everyMinutes,
        windowStart: value.windowStart,
        windowEnd: value.windowEnd,
      };
    }
    default:
      return `unknown times rule "${String(value.kind)}"`;
  }
}
