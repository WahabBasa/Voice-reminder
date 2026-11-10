/**
 * Anonymous usage counts (1.0.6) against a real (mocked) Convex: the two public
 * mutations store exactly the allow-listed fields and drop anything outside
 * the shape; the prune deletes rows past 365 days in batches.
 */

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "../../convex/_generated/api";
import type { Doc } from "../../convex/_generated/dataModel";
import {
  USAGE_PRUNE_BATCH_SIZE,
  USAGE_RETENTION_MS,
} from "../../convex/usage";
import {
  screenValidator,
  stepValidator,
  tapValidator,
  variantValidator,
} from "../../convex/usageValidators";
import {
  MAX_SCREENS,
  MAX_TAPS,
  USAGE_SCREENS,
  USAGE_STEPS,
  USAGE_TAPS,
  USAGE_VARIANTS,
} from "../../convex/usageShape";
import { DAY, Harness, harness, scheduledOf } from "./harness";

const T0 = Date.UTC(2026, 10, 10, 12, 0, 0);
const META = {
  appVersion: "1.0.6",
  buildNumber: "14",
  lang: "en",
  variant: "production" as const,
};
const VISIT = {
  visitNumber: 1,
  durationSec: 42,
  screens: ["home" as const, "recording" as const, "home" as const],
  taps: ["mic" as const],
  madeReminder: true,
};

let t: Harness;

beforeEach(() => {
  t = harness();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(T0);
});

afterEach(() => {
  vi.useRealTimers();
});

async function steps(): Promise<Doc<"usageSteps">[]> {
  return await t.run(async (ctx) => await ctx.db.query("usageSteps").collect());
}

async function visits(): Promise<Doc<"usageVisits">[]> {
  return await t.run(async (ctx) => await ctx.db.query("usageVisits").collect());
}

function literals(validator: { members: readonly { value: unknown }[] }): unknown[] {
  return validator.members.map((m) => m.value);
}

describe("allow-lists", () => {
  test("the validators carry exactly the shared lists", () => {
    expect(literals(stepValidator as any)).toEqual([...USAGE_STEPS]);
    expect(literals(screenValidator as any)).toEqual([...USAGE_SCREENS]);
    expect(literals(tapValidator as any)).toEqual([...USAGE_TAPS]);
    expect(literals(variantValidator as any)).toEqual([...USAGE_VARIANTS]);
  });
});

describe("recordStep", () => {
  test("stores the step with the server's clock and nothing else", async () => {
    const stored = await t.mutation(api.usage.recordStep, { step: "first_open", ...META });
    expect(stored).toBe(true);
    const rows = await steps();
    expect(rows).toHaveLength(1);
    const { _id, _creationTime, ...row } = rows[0];
    expect(row).toEqual({ step: "first_open", ...META, at: T0 });
  });

  test("a step outside the list is rejected by the validator", async () => {
    await expect(
      t.mutation(api.usage.recordStep, { step: "made_up" as any, ...META })
    ).rejects.toThrow();
    expect(await steps()).toHaveLength(0);
  });

  test("an extra field (an id, say) is rejected by the validator", async () => {
    await expect(
      t.mutation(api.usage.recordStep, {
        step: "first_open",
        ...META,
        deviceId: "0123456789abcdef0123456789abcdef",
      } as any)
    ).rejects.toThrow();
    expect(await steps()).toHaveLength(0);
  });

  test.each([
    ["appVersion", "1.0.6-beta"],
    ["appVersion", "x".repeat(200)],
    ["buildNumber", "14a"],
    ["buildNumber", "1234567"],
    ["lang", "en-US"],
    ["lang", "EN"],
    ["lang", "e"],
    ["lang", "Asia/Dubai"],
  ])("a %s of %j is dropped without a write", async (field, value) => {
    const stored = await t.mutation(api.usage.recordStep, {
      step: "first_open",
      ...META,
      [field]: value,
    });
    expect(stored).toBe(false);
    expect(await steps()).toHaveLength(0);
  });

  test("a variant outside the list is rejected", async () => {
    await expect(
      t.mutation(api.usage.recordStep, { step: "first_open", ...META, variant: "preview" as any })
    ).rejects.toThrow();
  });
});

describe("recordVisit", () => {
  test("stores the visit with the server's clock", async () => {
    const stored = await t.mutation(api.usage.recordVisit, { ...VISIT, ...META });
    expect(stored).toBe(true);
    const rows = await visits();
    expect(rows).toHaveLength(1);
    const { _id, _creationTime, ...row } = rows[0];
    expect(row).toEqual({ ...VISIT, ...META, at: T0 });
  });

  test("visit 0 (an install that predates 1.0.6) is accepted", async () => {
    expect(await t.mutation(api.usage.recordVisit, { ...VISIT, ...META, visitNumber: 0 })).toBe(
      true
    );
  });

  test("a screen or tap outside its list is rejected by the validator", async () => {
    await expect(
      t.mutation(api.usage.recordVisit, { ...VISIT, ...META, screens: ["somewhere" as any] })
    ).rejects.toThrow();
    await expect(
      t.mutation(api.usage.recordVisit, { ...VISIT, ...META, taps: ["anything" as any] })
    ).rejects.toThrow();
    expect(await visits()).toHaveLength(0);
  });

  test.each([
    ["visitNumber", 11],
    ["visitNumber", -1],
    ["visitNumber", 1.5],
    ["durationSec", 3601],
    ["durationSec", -3],
    ["durationSec", Number.NaN],
    ["screens", Array.from({ length: MAX_SCREENS + 1 }, () => "home")],
    ["taps", Array.from({ length: MAX_TAPS + 1 }, () => "mic")],
  ])("a %s of %j is dropped without a write", async (field, value) => {
    const stored = await t.mutation(api.usage.recordVisit, {
      ...VISIT,
      ...META,
      [field]: value as any,
    });
    expect(stored).toBe(false);
    expect(await visits()).toHaveLength(0);
  });

  test("the caps themselves are accepted", async () => {
    const stored = await t.mutation(api.usage.recordVisit, {
      ...VISIT,
      ...META,
      visitNumber: 10,
      durationSec: 3600,
      screens: Array.from({ length: MAX_SCREENS }, () => "home" as const),
      taps: Array.from({ length: MAX_TAPS }, () => "mic" as const),
    });
    expect(stored).toBe(true);
  });
});

describe("prune", () => {
  async function seed(count: number, at: number) {
    await t.run(async (ctx) => {
      for (let i = 0; i < count; i++) {
        await ctx.db.insert("usageSteps", { step: "first_open", ...META, at });
        await ctx.db.insert("usageVisits", { ...VISIT, ...META, at });
      }
    });
  }

  test("deletes rows older than 365 days and keeps the rest", async () => {
    await seed(2, T0 - USAGE_RETENTION_MS - DAY);
    await seed(3, T0 - USAGE_RETENTION_MS + DAY);
    const result = await t.mutation(internal.usage.prune, {});
    expect(result).toEqual({ deleted: 4 });
    expect(await steps()).toHaveLength(3);
    expect(await visits()).toHaveLength(3);
    expect(await scheduledOf(t, "usage:prune")).toHaveLength(0);
  });

  test("a full batch reschedules itself", async () => {
    await seed(USAGE_PRUNE_BATCH_SIZE + 1, T0 - USAGE_RETENTION_MS - DAY);
    const result = await t.mutation(internal.usage.prune, {});
    expect(result.deleted).toBe(USAGE_PRUNE_BATCH_SIZE * 2);
    expect(await scheduledOf(t, "usage:prune")).toHaveLength(1);
    expect(await steps()).toHaveLength(1);
  });
});
