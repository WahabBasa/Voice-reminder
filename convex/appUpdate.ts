/**
 * "Update available" prompt — the server half.
 *
 * The app asks `check` once Home settles: "I am version X, should I show the
 * prompt?" The answer comes from one config row (`appConfig`, a singleton):
 *
 *   - storeVersion: what the App Store sells right now. Learned by itself — an
 *     hourly cron asks Apple's public lookup endpoint, so nobody flips a flag
 *     when a release is approved. A failed or empty lookup keeps the last value.
 *   - minSupportedVersion (optional, off by default): installs below it get the
 *     prompt without "Later" and cannot dismiss it.
 *   - testDeviceTags: installs (by the 8-hex tag the founder emails carry) that
 *     always see the prompt, as if a newer version existed, for device testing.
 *     A tag written "1a2b3c4d:required" also sees it in the blocking form.
 *
 * Founder commands (internal, `npx convex run`):
 *
 *   npx convex run appUpdate:setTestDeviceTags '{"tags":["1a2b3c4d"]}'
 *   npx convex run appUpdate:setTestDeviceTags '{"tags":[]}'
 *   npx convex run appUpdate:setMinSupportedVersion '{"version":"1.0.3"}'
 *   npx convex run appUpdate:setMinSupportedVersion '{"version":null}'
 *   npx convex run appUpdate:refreshStoreVersion
 *   npx convex run appUpdate:status
 */

import {
  internalAction,
  internalMutation,
  internalQuery,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { deviceTagFor, validDeviceId } from "./founderAlertsEmail";

/** Remi's App Store id. */
export const APP_STORE_ID = "6801797784";
export const LOOKUP_URL = `https://itunes.apple.com/lookup?id=${APP_STORE_ID}`;

// ─── versions (pure) ─────────────────────────────────────────────────────────

/**
 * "1.0.10" → [1, 0, 10]. One to four dot-separated numeric parts, no
 * prerelease suffix, no leading "v". Anything else is null — an unknown
 * version never triggers the prompt.
 */
export function parseVersion(value: unknown): number[] | null {
  if (typeof value !== "string") return null;
  const s = value.trim();
  if (!/^\d{1,6}(\.\d{1,6}){0,3}$/.test(s)) return null;
  return s.split(".").map((p) => Number(p));
}

/** -1 / 0 / 1, numeric per part, missing parts count as 0 (1.0 == 1.0.0). */
export function compareVersions(a: number[], b: number[]): number {
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i++) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    if (x !== y) return x < y ? -1 : 1;
  }
  return 0;
}

/** Whether `installed` is strictly older than `target`. False if either is garbage. */
export function isOlder(installed: string, target: string | undefined): boolean {
  const a = parseVersion(installed);
  const b = parseVersion(target);
  if (!a || !b) return false;
  return compareVersions(a, b) < 0;
}

export type UpdateDecision = { show: boolean; required: boolean; latest?: string };

export type TestTagMode = "none" | "show" | "required";

/** A tag list entry: "1a2b3c4d" or "1a2b3c4d:required". */
const TAG_RE = /^[0-9a-f]{8}(:required)?$/;

export function testTagMode(tags: readonly string[] | undefined, deviceTag: string): TestTagMode {
  if (!tags) return "none";
  if (tags.includes(`${deviceTag}:required`)) return "required";
  if (tags.includes(deviceTag)) return "show";
  return "none";
}

/** The whole decision, given the config and the install. */
export function decideUpdate(args: {
  installed: string;
  storeVersion?: string;
  minSupportedVersion?: string;
  testMode?: TestTagMode;
}): UpdateDecision {
  if (!parseVersion(args.installed)) return { show: false, required: false };
  const latest = parseVersion(args.storeVersion) ? args.storeVersion!.trim() : undefined;
  const testMode = args.testMode ?? "none";
  const required = isOlder(args.installed, args.minSupportedVersion) || testMode === "required";
  const show = required || isOlder(args.installed, latest) || testMode === "show";
  const out: UpdateDecision = { show, required: show && required };
  if (latest !== undefined) out.latest = latest;
  return out;
}

/** The version out of an iTunes lookup body, or null when it has none. */
export function versionFromLookup(body: unknown): string | null {
  const results = (body as any)?.results;
  if (!Array.isArray(results) || results.length === 0) return null;
  const version = results[0]?.version;
  return parseVersion(version) ? String(version).trim() : null;
}

// ─── the config row ──────────────────────────────────────────────────────────

async function getConfig(ctx: QueryCtx | MutationCtx): Promise<Doc<"appConfig"> | null> {
  return await ctx.db.query("appConfig").first();
}

async function patchConfig(
  ctx: MutationCtx,
  patch: Partial<Omit<Doc<"appConfig">, "_id" | "_creationTime">>
): Promise<void> {
  const row = await getConfig(ctx);
  if (row) {
    await ctx.db.patch(row._id, patch);
  } else {
    await ctx.db.insert("appConfig", { testDeviceTags: [], ...patch });
  }
}

// ─── public ──────────────────────────────────────────────────────────────────

/**
 * Should this install show the update prompt? Keyed on the bearer deviceId like
 * every public entry point; a malformed id or version is simply "no".
 */
export const check = query({
  args: { deviceId: v.string(), version: v.string() },
  returns: v.object({
    show: v.boolean(),
    required: v.boolean(),
    latest: v.optional(v.string()),
  }),
  handler: async (ctx, args) => {
    const deviceId = validDeviceId(args.deviceId);
    if (!deviceId || !parseVersion(args.version)) return { show: false, required: false };
    const config = await getConfig(ctx);
    const tags = config?.testDeviceTags ?? [];
    const testMode = tags.length > 0 ? testTagMode(tags, await deviceTagFor(deviceId)) : "none";
    return decideUpdate({
      installed: args.version,
      storeVersion: config?.storeVersion,
      minSupportedVersion: config?.minSupportedVersion,
      testMode,
    });
  },
});

// ─── the store version (cron) ────────────────────────────────────────────────

/** Asks Apple what the store sells now; keeps the last value on any failure. */
export const refreshStoreVersion = internalAction({
  args: {},
  returns: v.union(v.string(), v.null()),
  handler: async (ctx) => {
    let version: string | null = null;
    try {
      const res = await fetch(LOOKUP_URL, { headers: { Accept: "application/json" } });
      if (!res.ok) {
        console.log(`[appUpdate] lookup HTTP ${res.status}; keeping the last store version`);
        return null;
      }
      version = versionFromLookup(await res.json());
    } catch (e) {
      console.log("[appUpdate] lookup failed; keeping the last store version:", String(e));
      return null;
    }
    if (!version) {
      console.log("[appUpdate] lookup had no usable version; keeping the last store version");
      return null;
    }
    await ctx.runMutation(internal.appUpdate.recordStoreVersion, { version });
    return version;
  },
});

export const recordStoreVersion = internalMutation({
  args: { version: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    if (!parseVersion(args.version)) return null;
    const row = await getConfig(ctx);
    if (row?.storeVersion !== args.version) {
      console.log(`[appUpdate] store version ${row?.storeVersion ?? "(none)"} -> ${args.version}`);
    }
    await patchConfig(ctx, { storeVersion: args.version.trim(), storeCheckedAt: Date.now() });
    return null;
  },
});

// ─── founder switches ────────────────────────────────────────────────────────

/** Blocking prompt below this version; null clears it (the default: off). */
export const setMinSupportedVersion = internalMutation({
  args: { version: v.union(v.string(), v.null()) },
  returns: v.object({ minSupportedVersion: v.union(v.string(), v.null()) }),
  handler: async (ctx, args) => {
    if (args.version === null || args.version.trim() === "") {
      await patchConfig(ctx, { minSupportedVersion: undefined });
      return { minSupportedVersion: null };
    }
    if (!parseVersion(args.version)) {
      throw new Error(`appUpdate.setMinSupportedVersion: "${args.version}" is not a version like 1.0.3`);
    }
    const version = args.version.trim();
    await patchConfig(ctx, { minSupportedVersion: version });
    return { minSupportedVersion: version };
  },
});

/** Replaces the test list. Each entry: an 8-hex device tag, optionally ":required". */
export const setTestDeviceTags = internalMutation({
  args: { tags: v.array(v.string()) },
  returns: v.object({ testDeviceTags: v.array(v.string()) }),
  handler: async (ctx, args) => {
    const tags: string[] = [];
    for (const raw of args.tags) {
      const tag = raw.trim().toLowerCase();
      if (!TAG_RE.test(tag)) {
        throw new Error(
          `appUpdate.setTestDeviceTags: "${raw}" is not an 8-hex device tag (optionally ":required")`
        );
      }
      if (!tags.includes(tag)) tags.push(tag);
    }
    await patchConfig(ctx, { testDeviceTags: tags });
    return { testDeviceTags: tags };
  },
});

/** What the config row holds now. */
export const status = internalQuery({
  args: {},
  returns: v.object({
    storeVersion: v.union(v.string(), v.null()),
    storeCheckedAt: v.union(v.number(), v.null()),
    minSupportedVersion: v.union(v.string(), v.null()),
    testDeviceTags: v.array(v.string()),
  }),
  handler: async (ctx) => {
    const row = await getConfig(ctx);
    return {
      storeVersion: row?.storeVersion ?? null,
      storeCheckedAt: row?.storeCheckedAt ?? null,
      minSupportedVersion: row?.minSupportedVersion ?? null,
      testDeviceTags: row?.testDeviceTags ?? [],
    };
  },
});
