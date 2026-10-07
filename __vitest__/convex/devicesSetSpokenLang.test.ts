/**
 * devices.setSpokenLang — the founder sets an install's spoken language by hand.
 */
import { beforeEach, describe, expect, test } from "vitest";
import { internal } from "../../convex/_generated/api";
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

describe("setSpokenLang", () => {
  test("sets the language by tag and clears a pending switch candidate", async () => {
    await addDevice(DEVICE, "237dcc2b", { spokenLangCandidate: "en", spokenLangCandidateCount: 1 });
    await addDevice(OTHER_DEVICE, "aaaa0000");

    const res = await t.mutation(internal.devices.setSpokenLang, { device: " 237DCC2B ", lang: "he" });

    expect(res).toEqual({ deviceTag: "237dcc2b", spokenLang: "he" });
    const row = await deviceRow(DEVICE);
    expect(row?.spokenLang).toBe("he");
    expect(row?.spokenLangAt).toEqual(expect.any(Number));
    expect(row?.spokenLangCandidate).toBeUndefined();
    expect(row?.spokenLangCandidateCount).toBeUndefined();
    expect((await deviceRow(OTHER_DEVICE))?.spokenLang).toBeUndefined();
  });

  test("accepts a full deviceId", async () => {
    await addDevice(DEVICE, "237dcc2b");
    await t.mutation(internal.devices.setSpokenLang, { device: DEVICE, lang: "sv" });
    expect((await deviceRow(DEVICE))?.spokenLang).toBe("sv");
  });

  test("rejects an unknown device or language", async () => {
    await addDevice(DEVICE, "237dcc2b");
    await expect(
      t.mutation(internal.devices.setSpokenLang, { device: "deadbeef", lang: "he" })
    ).rejects.toThrow(/no device matches/);
    await expect(
      t.mutation(internal.devices.setSpokenLang, { device: "237dcc2b", lang: "klingon" })
    ).rejects.toThrow(/unknown language/);
  });
});
