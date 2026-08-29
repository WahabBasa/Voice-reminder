/**
 * A one-off rings on the USER's clock, not the server's (OLD-120).
 *
 * Convex actions run with TZ=UTC, and `buildReminderPlan` used to stamp
 * `onceAt` with `new Date(y, m - 1, d, h, min).getTime()` — host-local math. A
 * Dubai user's 15:42 therefore became 15:42Z, four hours after the ring, and
 * the app's launch pass trusts `onceAt` for one-offs: missed-marking ran four
 * hours late and a reminder opened inside that window still read as due.
 *
 * These tests run under TZ=UTC (jest.config.js), which is exactly the server's
 * situation — so every expectation below is a literal UTC instant, and the old
 * code fails all of them for any zone that is not UTC.
 */
import { planRemindersFromRawParse } from "../../convex/actions";
import { zonedTimeToUtcMs } from "../../convex/scheduleShape";

const once = (over: Record<string, unknown> = {}) =>
  JSON.stringify({
    title: "Call mom",
    description: "Call your mother.",
    frequency: "once",
    time: "15:42",
    date: "2026-08-25",
    ...over,
  });

/** The clock context a device sends: local date, local time, IANA zone. */
const contextIn = (timezone: string | undefined, over: Record<string, unknown> = {}) => ({
  transcript: "",
  currentDate: "2026-08-25",
  currentTime: "15:00:00",
  timezone,
  ...over,
});

describe("zonedTimeToUtcMs", () => {
  it("resolves a wall clock in a fixed-offset zone", () => {
    // The row from the bug report: 15:42 on 2026-08-25 in Asia/Dubai (UTC+4).
    expect(zonedTimeToUtcMs("2026-08-25", "15:42", "Asia/Dubai")).toBe(
      Date.UTC(2026, 7, 25, 11, 42)
    );
  });

  it("is the identity in UTC", () => {
    expect(zonedTimeToUtcMs("2026-08-25", "15:42", "UTC")).toBe(Date.UTC(2026, 7, 25, 15, 42));
  });

  it("crosses back over midnight for a zone ahead of UTC", () => {
    expect(zonedTimeToUtcMs("2026-08-25", "00:30", "Asia/Dubai")).toBe(
      Date.UTC(2026, 7, 24, 20, 30)
    );
  });

  it("follows a zone's summer time rather than a fixed offset", () => {
    // Europe/London is BST (+1) in August and GMT (+0) in January.
    expect(zonedTimeToUtcMs("2026-08-25", "15:42", "Europe/London")).toBe(
      Date.UTC(2026, 7, 25, 14, 42)
    );
    expect(zonedTimeToUtcMs("2026-01-15", "15:42", "Europe/London")).toBe(
      Date.UTC(2026, 0, 15, 15, 42)
    );
  });

  it("corrects when the guess and the answer straddle a DST transition", () => {
    // New York springs forward 2026-03-08 at 02:00 EST → 03:00 EDT (07:00Z).
    // The naive guess (03:00 read as UTC) still measures EST, so the first pass
    // lands an hour late; the second pass is the one that gets it right.
    expect(zonedTimeToUtcMs("2026-03-08", "03:00", "America/New_York")).toBe(
      Date.UTC(2026, 2, 8, 7, 0)
    );
  });

  it("skips a wall time that the spring-forward gap deleted", () => {
    // 02:30 never happened in New York on 2026-03-08 — it lands just past the
    // gap, at 03:30 EDT.
    expect(zonedTimeToUtcMs("2026-03-08", "02:30", "America/New_York")).toBe(
      Date.UTC(2026, 2, 8, 7, 30)
    );
  });

  it("takes the first of an ambiguous fall-back hour", () => {
    // New York falls back 2026-11-01 at 02:00 EDT (06:00Z); 01:30 happens twice.
    expect(zonedTimeToUtcMs("2026-11-01", "01:30", "America/New_York")).toBe(
      Date.UTC(2026, 10, 1, 5, 30)
    );
  });

  it("is null for a date, time or zone it cannot use", () => {
    expect(zonedTimeToUtcMs("25-08-2026", "15:42", "Asia/Dubai")).toBeNull();
    expect(zonedTimeToUtcMs("2026-02-31", "15:42", "Asia/Dubai")).toBeNull();
    expect(zonedTimeToUtcMs("2026-08-25", "25:99", "Asia/Dubai")).toBeNull();
    expect(zonedTimeToUtcMs("2026-08-25", "15:42", "")).toBeNull();
    expect(zonedTimeToUtcMs("2026-08-25", "15:42", undefined)).toBeNull();
    expect(zonedTimeToUtcMs("2026-08-25", "15:42", "Mars/Olympus_Mons")).toBeNull();
  });
});

describe("buildReminderPlan — onceAt in the user's zone", () => {
  it("stamps a dated one-off at its Dubai wall clock, not at UTC", () => {
    const plans = planRemindersFromRawParse(once(), contextIn("Asia/Dubai"));

    expect(plans[0].scheduleType).toBe("once");
    // 1787672520000 — the value the dev deployment stored — is 15:42Z. This is
    // the four hours the bug was.
    expect(plans[0].onceAt).toBe(Date.UTC(2026, 7, 25, 11, 42));
    expect(new Date(plans[0].onceAt!).toISOString()).toBe("2026-08-25T11:42:00.000Z");
    expect(plans[0].parseWarnings).toEqual([]);
  });

  it("leaves a UTC user exactly where they were", () => {
    const plans = planRemindersFromRawParse(once(), contextIn("UTC"));

    expect(plans[0].onceAt).toBe(Date.UTC(2026, 7, 25, 15, 42));
    expect(plans[0].parseWarnings).toEqual([]);
  });

  it("follows summer time in a DST zone", () => {
    const summer = planRemindersFromRawParse(once(), contextIn("Europe/London"));
    expect(summer[0].onceAt).toBe(Date.UTC(2026, 7, 25, 14, 42));

    const winter = planRemindersFromRawParse(
      once({ date: "2026-01-15" }),
      contextIn("Europe/London", { currentDate: "2026-01-15" })
    );
    expect(winter[0].onceAt).toBe(Date.UTC(2026, 0, 15, 15, 42));
  });

  it("records the zone on the grid it built the schedule from", () => {
    const plans = planRemindersFromRawParse(once(), contextIn("Asia/Dubai"));

    expect(plans[0].schedule.tzid).toBe("Asia/Dubai");
    expect(plans[0].schedule.days).toEqual({ kind: "date", date: "2026-08-25" });
  });

  it("falls back to the server clock and says so when the zone is missing", () => {
    const plans = planRemindersFromRawParse(once(), contextIn(undefined));

    // TZ=UTC here, so the fallback is the old (wrong-for-Dubai) behavior — the
    // point is that it is now announced rather than silent.
    expect(plans[0].onceAt).toBe(new Date(2026, 7, 25, 15, 42).getTime());
    expect(plans[0].parseWarnings).toEqual([
      expect.stringContaining('timezone "unknown"'),
    ]);
  });

  it("falls back and warns when the zone is not one the runtime knows", () => {
    const plans = planRemindersFromRawParse(once(), contextIn("Mars/Olympus_Mons"));

    expect(plans[0].onceAt).toBe(new Date(2026, 7, 25, 15, 42).getTime());
    expect(plans[0].parseWarnings).toEqual([
      expect.stringContaining('timezone "Mars/Olympus_Mons"'),
    ]);
  });

  it("does not touch a recurring reminder", () => {
    const plans = planRemindersFromRawParse(
      JSON.stringify({ title: "Water", description: "Drink your water.", frequency: "daily", time: "09:00" }),
      contextIn("Asia/Dubai")
    );

    expect(plans[0].scheduleType).toBe("rrule");
    expect(plans[0].onceAt).toBeUndefined();
    expect(plans[0].parseWarnings).toEqual([]);
  });
});

describe("buildReminderPlan — an undated one-off picks its day on the user's clock", () => {
  const undated = (time: string) =>
    JSON.stringify({ title: "Trash", description: "Take the bins out.", frequency: "once", time });

  it("keeps a ring that is still ahead on the user's own day", () => {
    // 23:00 Dubai on 2026-08-25 is 19:00Z — the server's day is the same one
    // here, but the answer now comes from the device's date either way.
    const plans = planRemindersFromRawParse(
      undated("23:00"),
      contextIn("Asia/Dubai", { currentTime: "15:00:00" })
    );

    expect(plans[0].date).toBe("2026-08-25");
    expect(plans[0].onceAt).toBe(Date.UTC(2026, 7, 25, 19, 0));
  });

  it("rolls to tomorrow on the user's calendar, not the server's", () => {
    // 03:00 in Dubai on the 26th is still the 25th in UTC. The old code asked
    // the server what day it was and rolled the wrong one forward.
    const plans = planRemindersFromRawParse(
      undated("02:00"),
      contextIn("Asia/Dubai", { currentDate: "2026-08-26", currentTime: "03:00:00" })
    );

    expect(plans[0].date).toBe("2026-08-27");
    expect(plans[0].schedule.days).toEqual({ kind: "date", date: "2026-08-27" });
    expect(plans[0].onceAt).toBe(Date.UTC(2026, 7, 26, 22, 0));
  });

  it("uses the earliest of several times to decide today or tomorrow", () => {
    const plans = planRemindersFromRawParse(
      JSON.stringify({
        title: "Pills",
        description: "Take your pills.",
        frequency: "once",
        time: "20:00",
        times: ["20:00", "08:00"],
      }),
      contextIn("Asia/Dubai", { currentTime: "12:00:00" })
    );

    // 08:00 is behind 12:00, so the whole day moves — the same call
    // scheduleShape.firstDateFor makes, asked of the user's clock.
    expect(plans[0].date).toBe("2026-08-26");
    expect(plans[0].times).toEqual(["08:00", "20:00"]);
    expect(plans[0].onceAt).toBe(Date.UTC(2026, 7, 26, 4, 0));
  });

  it("still produces a day when the device sent no date at all", () => {
    const plans = planRemindersFromRawParse(undated("09:00"), {
      transcript: "",
      currentTime: "14:00:00",
      timezone: "Asia/Dubai",
    });

    expect(plans[0].date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(plans[0].onceAt).toBeGreaterThan(0);
  });
});
