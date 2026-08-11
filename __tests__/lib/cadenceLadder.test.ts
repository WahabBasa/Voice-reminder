import {
  LADDER_OFFSETS_MS,
  LADDER_OFFSETS_PERSISTENT_MS,
  MAX_LADDER_RUNGS,
  ladderOffsetsMs,
  ladderRungCount,
  ladderRungTimes,
  ladderVariantIndex,
} from "../../lib/notificationDecisions";
import {
  buildAlarmLadder,
  dedupeByAppKey,
  ladderMetadata,
  parseAlarmAppKey,
  reconcileAlarmEvents,
  resetAppKeyDedupe,
} from "../../lib/alarmKit";

/**
 * CL-3 ladder policy + expansion.
 *
 * The frozen contract lives in docs/cadence-ladder-prd.md: rung counts mirror
 * `variantCountForTier` in convex/helpers.ts, and the offsets are the only
 * place rung timing is written down. These tests pin both, so a silent drift
 * between the client mirror and the server policy fails here first.
 */

const T = 1_786_000_000_000;
const MIN = 60_000;
const ID = "abc123";

// ─── Policy: rung counts ────────────────────────────────────────────────────

describe("ladderRungCount", () => {
  it("gives routine a single rung", () => {
    expect(ladderRungCount("routine", false)).toBe(1);
  });

  it("gives notice two rungs", () => {
    expect(ladderRungCount("notice", false)).toBe(2);
  });

  it("gives urgent the full three rungs", () => {
    expect(ladderRungCount("urgent", false)).toBe(3);
  });

  it("gives persistent three rungs regardless of tier", () => {
    expect(ladderRungCount("routine", true)).toBe(3);
    expect(ladderRungCount("notice", true)).toBe(3);
    expect(ladderRungCount("urgent", true)).toBe(3);
  });

  it("treats legacy/unknown urgency as notice, exactly like the ring policy", () => {
    expect(ladderRungCount(undefined, false)).toBe(2);
    expect(ladderRungCount("whatever", false)).toBe(2);
  });

  it("accepts the string persistent flags that travel in metadata", () => {
    expect(ladderRungCount("routine", "true")).toBe(3);
    expect(ladderRungCount("routine", "1")).toBe(3);
    expect(ladderRungCount("routine", "false")).toBe(1);
  });

  it("never exceeds the variant cap", () => {
    expect(ladderRungCount("urgent", true)).toBe(MAX_LADDER_RUNGS);
  });
});

// ─── Policy: offsets ────────────────────────────────────────────────────────

describe("ladder offsets", () => {
  it("pins the non-persistent table at T, T+3min, T+7min", () => {
    expect(LADDER_OFFSETS_MS).toEqual([0, 3 * MIN, 7 * MIN]);
  });

  it("pins the persistent table at T, T+2min, T+5min", () => {
    expect(LADDER_OFFSETS_PERSISTENT_MS).toEqual([0, 2 * MIN, 5 * MIN]);
  });

  it("slices the table to the tier's rung count", () => {
    expect(ladderOffsetsMs("routine", false)).toEqual([0]);
    expect(ladderOffsetsMs("notice", false)).toEqual([0, 3 * MIN]);
    expect(ladderOffsetsMs("urgent", false)).toEqual([0, 3 * MIN, 7 * MIN]);
  });

  it("switches to the persistent table when persistent is set", () => {
    expect(ladderOffsetsMs("notice", true)).toEqual([0, 2 * MIN, 5 * MIN]);
  });

  it("turns offsets into absolute fire times", () => {
    expect(ladderRungTimes(T, "urgent", false)).toEqual([T, T + 3 * MIN, T + 7 * MIN]);
    expect(ladderRungTimes(T, "routine", true)).toEqual([T, T + 2 * MIN, T + 5 * MIN]);
  });

  it("leaves the exported tables untouched when sliced", () => {
    ladderOffsetsMs("routine", false);
    expect(LADDER_OFFSETS_MS).toHaveLength(3);
  });
});

describe("ladderVariantIndex", () => {
  it("gives rung 0 the base line", () => {
    expect(ladderVariantIndex(0)).toBe(-1);
  });

  it("gives rung k the variant k-1", () => {
    expect(ladderVariantIndex(1)).toBe(0);
    expect(ladderVariantIndex(2)).toBe(1);
  });

  it("treats a negative rung as the base line", () => {
    expect(ladderVariantIndex(-1)).toBe(-1);
  });
});

// ─── Expansion: appKeys, siblings, metadata ─────────────────────────────────

describe("buildAlarmLadder", () => {
  it("expands an urgent occurrence into three rungs at T/T+3/T+7", () => {
    const rungs = buildAlarmLadder(ID, T, "urgent", false);

    expect(rungs.map((r) => r.fireDate)).toEqual([T, T + 3 * MIN, T + 7 * MIN]);
    expect(rungs.map((r) => r.appKey)).toEqual([
      `reminder_${ID}_${T}`,
      `reminder_${ID}_${T + 3 * MIN}`,
      `reminder_${ID}_${T + 7 * MIN}`,
    ]);
  });

  it("keeps the appKey scheme parseable — each rung uses its own fire time", () => {
    for (const rung of buildAlarmLadder(ID, T, "urgent", false)) {
      expect(parseAlarmAppKey(rung.appKey)).toEqual({
        reminderId: ID,
        scheduledFor: rung.fireDate,
      });
    }
  });

  it("lists exactly the OTHER rungs as siblings", () => {
    const rungs = buildAlarmLadder(ID, T, "urgent", false);

    expect(rungs[0].siblings).toEqual([rungs[1].appKey, rungs[2].appKey]);
    expect(rungs[1].siblings).toEqual([rungs[0].appKey, rungs[2].appKey]);
    expect(rungs[2].siblings).toEqual([rungs[0].appKey, rungs[1].appKey]);
  });

  it("gives a single-rung routine occurrence no siblings", () => {
    const rungs = buildAlarmLadder(ID, T, "routine", false);

    expect(rungs).toHaveLength(1);
    expect(rungs[0].siblings).toEqual([]);
    expect(rungs[0].rungCount).toBe(1);
  });

  it("walks variants up the ladder: base, variant 0, variant 1", () => {
    expect(buildAlarmLadder(ID, T, "urgent", false).map((r) => r.variantIndex)).toEqual([
      -1, 0, 1,
    ]);
  });

  it("uses the persistent offsets for a persistent reminder", () => {
    expect(buildAlarmLadder(ID, T, "notice", true).map((r) => r.fireDate)).toEqual([
      T,
      T + 2 * MIN,
      T + 5 * MIN,
    ]);
  });

  it("stamps every rung with the same rungCount", () => {
    expect(buildAlarmLadder(ID, T, "notice", false).map((r) => r.rungCount)).toEqual([2, 2]);
  });
});

describe("ladderMetadata", () => {
  it("emits string-only values through the metadata dict", () => {
    const [rung] = buildAlarmLadder(ID, T, "urgent", false);

    expect(ladderMetadata(rung)).toEqual({
      rung: "0",
      rungCount: "3",
      siblings: `reminder_${ID}_${T + 3 * MIN},reminder_${ID}_${T + 7 * MIN}`,
    });
  });

  it("emits an empty siblings string for a lone rung", () => {
    const [rung] = buildAlarmLadder(ID, T, "routine", false);

    expect(ladderMetadata(rung).siblings).toBe("");
  });
});

// ─── In-flight de-dup (the gap_resync vs create race) ───────────────────────

describe("dedupeByAppKey", () => {
  beforeEach(() => resetAppKeyDedupe());

  it("runs the work once when two callers race on the same appKey", async () => {
    const work = jest.fn(
      () => new Promise<string>((resolve) => setTimeout(() => resolve("done"), 5))
    );
    const key = `reminder_${ID}_${T}`;

    const [a, b] = await Promise.all([
      dedupeByAppKey(key, work),
      dedupeByAppKey(key, work),
    ]);

    expect(work).toHaveBeenCalledTimes(1);
    expect(a).toBe("done");
    expect(b).toBe("done");
  });

  it("does not collapse different appKeys", async () => {
    const work = jest.fn(async () => "done");

    await Promise.all([
      dedupeByAppKey(`reminder_${ID}_${T}`, work),
      dedupeByAppKey(`reminder_${ID}_${T + 3 * MIN}`, work),
    ]);

    expect(work).toHaveBeenCalledTimes(2);
  });

  it("releases the key once the work settles", async () => {
    const work = jest.fn(async () => "done");
    const key = `reminder_${ID}_${T}`;

    await dedupeByAppKey(key, work);
    await dedupeByAppKey(key, work);

    expect(work).toHaveBeenCalledTimes(2);
  });

  it("releases the key after a failure so the next attempt retries", async () => {
    const key = `reminder_${ID}_${T}`;
    const failing = jest.fn(async () => {
      throw new Error("AlarmKit refused");
    });

    await expect(dedupeByAppKey(key, failing)).rejects.toThrow("AlarmKit refused");
    await expect(dedupeByAppKey(key, async () => "ok")).resolves.toBe("ok");
  });

  it("propagates a failure to the caller that joined the in-flight run", async () => {
    const key = `reminder_${ID}_${T}`;
    const failing = () =>
      new Promise<string>((_, reject) => setTimeout(() => reject(new Error("boom")), 5));

    const first = dedupeByAppKey(key, failing);
    const joined = dedupeByAppKey(key, failing);

    await expect(first).rejects.toThrow("boom");
    await expect(joined).rejects.toThrow("boom");
  });

  it("turns a synchronous throw into a rejection instead of escaping", async () => {
    const key = `reminder_${ID}_${T}`;

    await expect(
      dedupeByAppKey(key, (() => {
        throw new Error("sync boom");
      }) as () => Promise<void>)
    ).rejects.toThrow("sync boom");
  });
});

// ─── Sibling-cancel events from the native intents (CL-2) ───────────────────

describe("reconcileAlarmEvents — sibling cancels", () => {
  const KEY = `reminder_${ID}_${T}`;

  it("collapses a cancelled rung to an inert outcome", () => {
    expect(reconcileAlarmEvents([{ type: "cancelled", id: KEY, at: T }], T + MIN)).toEqual([
      { id: KEY, outcome: "cancelled", allowReschedule: false },
    ]);
  });

  it("accepts the alternative spellings the native log may use", () => {
    for (const type of ["canceled", "sibling_cancelled", "sibling_canceled", "CANCELLED"]) {
      const [result] = reconcileAlarmEvents([{ type, id: KEY, at: T }], T + MIN);
      expect(result.outcome).toBe("cancelled");
    }
  });

  it("does not call a rung missed when it was cancelled after ringing", () => {
    const [result] = reconcileAlarmEvents(
      [
        { type: "fired", id: KEY, at: T },
        { type: "cancelled", id: KEY, at: T + 1000 },
      ],
      T + 30 * MIN
    );

    expect(result.outcome).toBe("cancelled");
    expect(result.allowReschedule).toBe(false);
  });

  it("still completes the rung the user actually answered", () => {
    const [result] = reconcileAlarmEvents(
      [
        { type: "fired", id: KEY, at: T },
        { type: "stopped", id: KEY, at: T + 500 },
        { type: "cancelled", id: KEY, at: T + 600 },
      ],
      T + MIN
    );

    expect(result.outcome).toBe("completed");
  });

  it("keeps a cancel from suppressing another rung's outcome", () => {
    const sibling = `reminder_${ID}_${T + 3 * MIN}`;
    const results = reconcileAlarmEvents(
      [
        { type: "stopped", id: KEY, at: T + 500 },
        { type: "cancelled", id: sibling, at: T + 510 },
      ],
      T + MIN
    );

    expect(results.map((r) => r.outcome)).toEqual(["completed", "cancelled"]);
  });

  it("leaves a ring that resumed after a cancel on the normal path", () => {
    const [result] = reconcileAlarmEvents(
      [
        { type: "cancelled", id: KEY, at: T },
        { type: "fired", id: KEY, at: T + 1000 },
      ],
      T + 1000
    );

    expect(result.outcome).toBe("pending");
  });

  it("still drops genuinely unknown event types", () => {
    expect(reconcileAlarmEvents([{ type: "exploded", id: KEY, at: T }], T)).toEqual([]);
  });
});
