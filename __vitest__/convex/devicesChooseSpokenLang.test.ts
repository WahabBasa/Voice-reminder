/**
 * devices.chooseSpokenLang — the user picks their language in the app.
 */
import { beforeEach, describe, expect, test } from "vitest";
import { api } from "../../convex/_generated/api";
import { DEVICE, OTHER_DEVICE, Harness, harness } from "./harness";

let t: Harness;

beforeEach(() => {
  t = harness();
});

async function addDevice(deviceId: string, deviceTag: string, extra: Record<string, unknown> = {}) {
  await t.run(async (ctx) => {
    await ctx.db.insert("devices", {
      deviceId,
      deviceTag,
      firstSeenAt: 1,
      lastSeenAt: 1,
      seeded: false,
      ...extra,
    });
  });
}

async function deviceRow(deviceId: string) {
  return await t.run(async (ctx) =>
    ctx.db
      .query("devices")
      .withIndex("by_deviceId", (q) => q.eq("deviceId", deviceId))
      .first()
  );
}

describe("chooseSpokenLang", () => {
  test("sets the caller's language, clears a pending switch, leaves others alone", async () => {
    await addDevice(DEVICE, "237dcc2b", {
      spokenLang: "en",
      spokenLangCandidate: "pt",
      spokenLangCandidateCount: 1,
    });
    await addDevice(OTHER_DEVICE, "aaaa0000", { spokenLang: "en" });

    const res = await t.mutation(api.devices.chooseSpokenLang, { deviceId: DEVICE, lang: "pt-BR" });

    expect(res).toEqual({ ok: true, spokenLang: "pt" });
    const row = await deviceRow(DEVICE);
    expect(row?.spokenLang).toBe("pt");
    expect(row?.spokenLangAt).toEqual(expect.any(Number));
    expect(row?.spokenLangCandidate).toBeUndefined();
    expect(row?.spokenLangCandidateCount).toBeUndefined();
    expect((await deviceRow(OTHER_DEVICE))?.spokenLang).toBe("en");
  });

  test("the watch reads the pick back", async () => {
    await addDevice(DEVICE, "237dcc2b");
    await t.mutation(api.devices.chooseSpokenLang, { deviceId: DEVICE, lang: "es" });
    expect(await t.query(api.devices.preferences, { deviceId: DEVICE })).toEqual({ spokenLang: "es" });
  });

  test("the same language again writes nothing", async () => {
    await addDevice(DEVICE, "237dcc2b", { spokenLang: "es", spokenLangAt: 5 });
    const res = await t.mutation(api.devices.chooseSpokenLang, { deviceId: DEVICE, lang: "es" });
    expect(res).toEqual({ ok: true, spokenLang: "es" });
    expect((await deviceRow(DEVICE))?.spokenLangAt).toBe(5);
  });

  test("an install with no row yet, or junk language, is a quiet no-op", async () => {
    expect(await t.mutation(api.devices.chooseSpokenLang, { deviceId: DEVICE, lang: "pt" })).toEqual({
      ok: false,
    });
    await addDevice(DEVICE, "237dcc2b");
    expect(
      await t.mutation(api.devices.chooseSpokenLang, { deviceId: DEVICE, lang: "klingon" })
    ).toEqual({ ok: false });
    expect((await deviceRow(DEVICE))?.spokenLang).toBeUndefined();
  });

  test("rejects an invalid deviceId", async () => {
    await expect(
      t.mutation(api.devices.chooseSpokenLang, { deviceId: "bad id!", lang: "pt" })
    ).rejects.toThrow(/invalid deviceId/);
  });
});
