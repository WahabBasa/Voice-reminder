/**
 * The feedback backend against a real (mocked) Convex: submit's idempotency and
 * validation, the founder-set status, and the device-scoped read. The notify
 * action is only asserted to be scheduled — its email shaping is unit-tested in
 * __tests__/convex/feedbackEmail.test.ts.
 */

import { beforeEach, describe, expect, test } from "vitest";
import { api, internal } from "../../convex/_generated/api";
import { DEVICE, OTHER_DEVICE, Harness, harness, scheduledOf } from "./harness";
import type { Doc } from "../../convex/_generated/dataModel";

const NOTIFY = "feedback:notify";

let t: Harness;

beforeEach(() => {
  t = harness();
});

async function submit(over: Record<string, unknown> = {}) {
  return await t.mutation(api.feedback.submit, {
    deviceId: DEVICE,
    clientId: "fb_1",
    text: "the app crashed",
    createdAt: 1000,
    ...over,
  });
}

async function allFeedback(): Promise<Doc<"feedback">[]> {
  return await t.run(async (ctx) => await ctx.db.query("feedback").collect());
}

// ─── submit ──────────────────────────────────────────────────────────────────

describe("submit", () => {
  test("inserts a received report with no respondedAt and schedules exactly one notify", async () => {
    const res = await submit({ context: { kind: "creation" } });
    expect(res.duplicate).toBe(false);

    const rows = await allFeedback();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      deviceId: DEVICE,
      clientId: "fb_1",
      text: "the app crashed",
      createdAt: 1000,
      status: "received",
      context: { kind: "creation" },
    });
    expect(rows[0].respondedAt).toBeUndefined();
    expect(rows[0].note).toBeUndefined();
    expect(rows[0].receivedAt).toEqual(expect.any(Number));
    expect(rows[0].updatedAt).toEqual(expect.any(Number));

    const notifies = await scheduledOf(t, NOTIFY);
    expect(notifies).toHaveLength(1);
    expect(notifies[0].args[0]).toMatchObject({ id: res.id });
  });

  test("trims the text before storing it", async () => {
    await submit({ text: "  ring failed  " });
    expect((await allFeedback())[0].text).toBe("ring failed");
  });

  test("is idempotent: a second submit returns the same row, changes nothing, and re-notifies nothing", async () => {
    const first = await submit();
    const second = await submit({ text: "a totally different report", createdAt: 5000 });

    expect(second.duplicate).toBe(true);
    expect(second.id).toBe(first.id);

    const rows = await allFeedback();
    expect(rows).toHaveLength(1);
    // Nothing about the stored row moved.
    expect(rows[0].text).toBe("the app crashed");
    expect(rows[0].createdAt).toBe(1000);
    expect(await scheduledOf(t, NOTIFY)).toHaveLength(1);
  });

  test("the same clientId on another device is a different report", async () => {
    await submit();
    const theirs = await submit({ deviceId: OTHER_DEVICE });
    expect(theirs.duplicate).toBe(false);
    expect(await allFeedback()).toHaveLength(2);
    expect(await scheduledOf(t, NOTIFY)).toHaveLength(2);
  });
});

describe("submit — validation", () => {
  test("rejects empty / whitespace-only text and writes nothing", async () => {
    await expect(submit({ text: "   " })).rejects.toThrow(/empty/i);
    expect(await allFeedback()).toHaveLength(0);
    expect(await scheduledOf(t, NOTIFY)).toHaveLength(0);
  });

  test("rejects text longer than 2000 characters", async () => {
    await expect(submit({ clientId: "fb_long", text: "x".repeat(2001) })).rejects.toThrow(
      /2000/
    );
    // A report exactly at the limit is accepted.
    const ok = await submit({ clientId: "fb_ok", text: "y".repeat(2000) });
    expect(ok.duplicate).toBe(false);
    expect((await allFeedback())).toHaveLength(1);
  });

  test("rejects a context larger than 8 KB and writes nothing", async () => {
    const big = { blob: "z".repeat(9000) };
    await expect(submit({ context: big })).rejects.toThrow(/context is too large/i);
    expect(await allFeedback()).toHaveLength(0);

    // A small context sails through.
    const ok = await submit({ clientId: "fb_small", context: { kind: "reminder" } });
    expect(ok.duplicate).toBe(false);
  });
});

// ─── listForDevice ───────────────────────────────────────────────────────────

describe("listForDevice", () => {
  test("returns only the caller's rows, newest first, without context or deviceId", async () => {
    await submit({ clientId: "a", text: "first", createdAt: 100, context: { kind: "x" } });
    await submit({ clientId: "b", text: "second", createdAt: 200 });
    await submit({ deviceId: OTHER_DEVICE, clientId: "c", text: "theirs", createdAt: 300 });

    const rows = await t.query(api.feedback.listForDevice, { deviceId: DEVICE });
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.text)).toEqual(["second", "first"]);

    const first = rows[0] as Record<string, unknown>;
    expect(first).toMatchObject({ clientId: "b", status: "received", createdAt: 200 });
    expect(first.context).toBeUndefined();
    expect(first.deviceId).toBeUndefined();
    expect(first.id).toEqual(expect.any(String));
  });

  test("caps at 50 rows", async () => {
    for (let i = 0; i < 55; i++) {
      await submit({ clientId: `bulk_${i}`, text: `report ${i}`, createdAt: 1000 + i });
    }
    const rows = await t.query(api.feedback.listForDevice, { deviceId: DEVICE });
    expect(rows).toHaveLength(50);
    // Newest first: the last created is at the head.
    expect(rows[0].text).toBe("report 54");
  });
});

// ─── setStatus ───────────────────────────────────────────────────────────────

describe("setStatus", () => {
  test("sets status, note, respondedAt and updatedAt; omitting note leaves it; empty note clears it", async () => {
    const { id } = await submit();
    expect((await allFeedback())[0].respondedAt).toBeUndefined();

    await t.mutation(internal.feedback.setStatus, { id, status: "looking", note: "on it" });
    let row = (await allFeedback())[0];
    expect(row.status).toBe("looking");
    expect(row.note).toBe("on it");
    expect(row.respondedAt).toEqual(expect.any(Number));
    expect(row.updatedAt).toEqual(expect.any(Number));

    // Note omitted → unchanged.
    await t.mutation(internal.feedback.setStatus, { id, status: "fixed" });
    row = (await allFeedback())[0];
    expect(row.status).toBe("fixed");
    expect(row.note).toBe("on it");

    // Note "" → cleared.
    await t.mutation(internal.feedback.setStatus, { id, status: "fixed", note: "" });
    row = (await allFeedback())[0];
    expect(row.note).toBeUndefined();
  });
});
