/**
 * appUpdate — the "update available" prompt's server half: version maths, the
 * public `check`, the hourly store lookup, and the founder switches.
 */
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "../../convex/_generated/api";
import {
  compareVersions,
  decideUpdate,
  isOlder,
  parseVersion,
  testTagMode,
  versionFromLookup,
} from "../../convex/appUpdate";
import { deviceTagFor } from "../../convex/founderAlertsEmail";
import { DEVICE, OTHER_DEVICE, Harness, harness } from "./harness";

let t: Harness;

beforeEach(() => {
  t = harness();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("versions", () => {
  test("parse accepts 1-4 numeric parts and nothing else", () => {
    expect(parseVersion("1.0.2")).toEqual([1, 0, 2]);
    expect(parseVersion(" 1.0.10 ")).toEqual([1, 0, 10]);
    expect(parseVersion("2")).toEqual([2]);
    for (const bad of ["", "v1.0.2", "1.0.2-beta", "1..2", "1.0.2.3.4", "abc", undefined, null, 3]) {
      expect(parseVersion(bad as any)).toBeNull();
    }
  });

  test("compare is numeric per part, not lexical", () => {
    expect(compareVersions([1, 0, 10], [1, 0, 9])).toBe(1);
    expect(compareVersions([1, 0, 9], [1, 0, 10])).toBe(-1);
    expect(compareVersions([1, 0], [1, 0, 0])).toBe(0);
    expect(compareVersions([1, 1], [1, 0, 99])).toBe(1);
    expect(compareVersions([2], [1, 9, 9])).toBe(1);
  });

  test("isOlder is false for garbage on either side", () => {
    expect(isOlder("1.0.1", "1.0.2")).toBe(true);
    expect(isOlder("1.0.2", "1.0.2")).toBe(false);
    expect(isOlder("1.0.3", "1.0.2")).toBe(false);
    expect(isOlder("junk", "1.0.2")).toBe(false);
    expect(isOlder("1.0.1", undefined)).toBe(false);
    expect(isOlder("1.0.1", "junk")).toBe(false);
  });
});

describe("decideUpdate", () => {
  test("older than the store shows, skippable", () => {
    expect(decideUpdate({ installed: "1.0.1", storeVersion: "1.0.2" })).toEqual({
      show: true,
      required: false,
      latest: "1.0.2",
    });
  });

  test("same or newer than the store stays quiet", () => {
    expect(decideUpdate({ installed: "1.0.2", storeVersion: "1.0.2" }).show).toBe(false);
    expect(decideUpdate({ installed: "1.0.3", storeVersion: "1.0.2" }).show).toBe(false);
  });

  test("below the minimum is required", () => {
    expect(
      decideUpdate({ installed: "1.0.1", storeVersion: "1.0.3", minSupportedVersion: "1.0.2" })
    ).toEqual({ show: true, required: true, latest: "1.0.3" });
    expect(
      decideUpdate({ installed: "1.0.2", storeVersion: "1.0.3", minSupportedVersion: "1.0.2" })
    ).toEqual({ show: true, required: false, latest: "1.0.3" });
  });

  test("garbage installed version never shows, not even for a test device", () => {
    expect(
      decideUpdate({ installed: "nope", storeVersion: "9.9.9", minSupportedVersion: "9.0", testMode: "required" })
    ).toEqual({ show: false, required: false });
  });

  test("a test device sees it with no newer version; :required makes it blocking", () => {
    expect(decideUpdate({ installed: "1.0.3", storeVersion: "1.0.3", testMode: "show" })).toEqual({
      show: true,
      required: false,
      latest: "1.0.3",
    });
    expect(decideUpdate({ installed: "1.0.3", testMode: "required" })).toEqual({
      show: true,
      required: true,
    });
  });

  test("no store version known yet: quiet", () => {
    expect(decideUpdate({ installed: "1.0.1" })).toEqual({ show: false, required: false });
  });

  test("testTagMode", () => {
    expect(testTagMode(["aaaa0000"], "aaaa0000")).toBe("show");
    expect(testTagMode(["aaaa0000:required"], "aaaa0000")).toBe("required");
    expect(testTagMode(["bbbb0000"], "aaaa0000")).toBe("none");
    expect(testTagMode(undefined, "aaaa0000")).toBe("none");
  });

  test("versionFromLookup", () => {
    expect(versionFromLookup({ resultCount: 1, results: [{ version: "1.0.2" }] })).toBe("1.0.2");
    expect(versionFromLookup({ resultCount: 0, results: [] })).toBeNull();
    expect(versionFromLookup({ results: [{ version: "x" }] })).toBeNull();
    expect(versionFromLookup(null)).toBeNull();
  });
});

describe("check (public query)", () => {
  test("no config row yet: quiet", async () => {
    expect(await t.query(api.appUpdate.check, { deviceId: DEVICE, version: "1.0.1" })).toEqual({
      show: false,
      required: false,
    });
  });

  test("store version learned: older installs see it", async () => {
    await t.mutation(internal.appUpdate.recordStoreVersion, { version: "1.0.10" });
    expect(await t.query(api.appUpdate.check, { deviceId: DEVICE, version: "1.0.9" })).toEqual({
      show: true,
      required: false,
      latest: "1.0.10",
    });
    expect((await t.query(api.appUpdate.check, { deviceId: DEVICE, version: "1.0.10" })).show).toBe(false);
  });

  test("bad deviceId or version: quiet", async () => {
    await t.mutation(internal.appUpdate.recordStoreVersion, { version: "1.0.3" });
    expect((await t.query(api.appUpdate.check, { deviceId: "bad id!", version: "1.0.1" })).show).toBe(false);
    expect((await t.query(api.appUpdate.check, { deviceId: DEVICE, version: "1.0.1-beta" })).show).toBe(false);
  });

  test("test device tags: only the tagged install sees it", async () => {
    await t.mutation(internal.appUpdate.recordStoreVersion, { version: "1.0.3" });
    const tag = await deviceTagFor(DEVICE);
    await t.mutation(internal.appUpdate.setTestDeviceTags, { tags: [tag.toUpperCase()] });
    expect(await t.query(api.appUpdate.check, { deviceId: DEVICE, version: "1.0.3" })).toEqual({
      show: true,
      required: false,
      latest: "1.0.3",
    });
    expect((await t.query(api.appUpdate.check, { deviceId: OTHER_DEVICE, version: "1.0.3" })).show).toBe(false);

    await t.mutation(internal.appUpdate.setTestDeviceTags, { tags: [`${tag}:required`] });
    expect(await t.query(api.appUpdate.check, { deviceId: DEVICE, version: "1.0.3" })).toEqual({
      show: true,
      required: true,
      latest: "1.0.3",
    });
  });

  test("minimum version makes it required, and clearing it turns that off", async () => {
    await t.mutation(internal.appUpdate.recordStoreVersion, { version: "1.0.3" });
    await t.mutation(internal.appUpdate.setMinSupportedVersion, { version: "1.0.2" });
    expect((await t.query(api.appUpdate.check, { deviceId: DEVICE, version: "1.0.1" })).required).toBe(true);
    expect((await t.query(api.appUpdate.check, { deviceId: DEVICE, version: "1.0.2" })).required).toBe(false);
    await t.mutation(internal.appUpdate.setMinSupportedVersion, { version: null });
    expect((await t.query(api.appUpdate.check, { deviceId: DEVICE, version: "1.0.1" })).required).toBe(false);
    expect((await t.query(internal.appUpdate.status, {})).minSupportedVersion).toBeNull();
  });
});

describe("founder switches validate", () => {
  test("setMinSupportedVersion rejects garbage", async () => {
    await expect(
      t.mutation(internal.appUpdate.setMinSupportedVersion, { version: "one" })
    ).rejects.toThrow(/not a version/);
  });

  test("setTestDeviceTags rejects non-tags and dedupes", async () => {
    await expect(
      t.mutation(internal.appUpdate.setTestDeviceTags, { tags: ["xyz"] })
    ).rejects.toThrow(/8-hex/);
    expect(
      await t.mutation(internal.appUpdate.setTestDeviceTags, { tags: ["AAAA0000", "aaaa0000", "bbbb1111:required"] })
    ).toEqual({ testDeviceTags: ["aaaa0000", "bbbb1111:required"] });
  });
});

describe("refreshStoreVersion (cron action)", () => {
  function stubFetch(impl: () => Promise<unknown>) {
    vi.stubGlobal("fetch", vi.fn(impl));
  }

  test("stores the version Apple reports", async () => {
    stubFetch(async () => new Response(JSON.stringify({ resultCount: 1, results: [{ version: "1.0.3" }] })));
    expect(await t.action(internal.appUpdate.refreshStoreVersion, {})).toBe("1.0.3");
    const status = await t.query(internal.appUpdate.status, {});
    expect(status.storeVersion).toBe("1.0.3");
    expect(status.storeCheckedAt).toEqual(expect.any(Number));
  });

  test("empty results keep the last known version", async () => {
    await t.mutation(internal.appUpdate.recordStoreVersion, { version: "1.0.2" });
    stubFetch(async () => new Response(JSON.stringify({ resultCount: 0, results: [] })));
    expect(await t.action(internal.appUpdate.refreshStoreVersion, {})).toBeNull();
    expect((await t.query(internal.appUpdate.status, {})).storeVersion).toBe("1.0.2");
  });

  test("network error and HTTP error keep the last known version", async () => {
    await t.mutation(internal.appUpdate.recordStoreVersion, { version: "1.0.2" });
    stubFetch(async () => {
      throw new Error("offline");
    });
    expect(await t.action(internal.appUpdate.refreshStoreVersion, {})).toBeNull();
    stubFetch(async () => new Response("nope", { status: 503 }));
    expect(await t.action(internal.appUpdate.refreshStoreVersion, {})).toBeNull();
    expect((await t.query(internal.appUpdate.status, {})).storeVersion).toBe("1.0.2");
  });
});
