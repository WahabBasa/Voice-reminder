/**
 * Anonymous usage counts, client half (lib/usageCounts.ts).
 *
 * Covers: nothing outside the allow-lists can reach a payload; payloads carry
 * exactly the agreed fields (no id, no timezone, no locale region); steps are
 * sent once per install, across launches; an install that predates 1.0.6 sends
 * no first-run steps and reports visit 0; visits are numbered 1..10; the
 * recorder never triggers a flush; nothing throws, whatever fails.
 */
import {
  MAX_DURATION_SEC,
  MAX_SCREENS,
  MAX_TAPS,
  USAGE_SCREENS,
  USAGE_STEPS,
  USAGE_TAPS,
} from "../../convex/usageShape";

let mockTakes: any[] = [];
const mockTakeListeners = new Set<() => void>();
jest.mock("../../lib/pendingTakes", () => ({
  getPendingTakesSnapshot: () => mockTakes,
  subscribePendingTakes: (listener: () => void) => {
    mockTakeListeners.add(listener);
    return () => mockTakeListeners.delete(listener);
  },
}));

type Usage = typeof import("../../lib/usageCounts");

const STEP_KEYS = ["appVersion", "buildNumber", "lang", "step", "variant"];
const VISIT_KEYS = [
  "appVersion",
  "buildNumber",
  "durationSec",
  "lang",
  "madeReminder",
  "screens",
  "taps",
  "variant",
  "visitNumber",
];

function storage() {
  return require("@react-native-async-storage/async-storage").default;
}

let clock = 1_000_000;
let sentSteps: any[] = [];
let sentVisits: any[] = [];
let rawMeta: any;

function launch(over: Partial<Parameters<Usage["startUsage"]>[0]> = {}): Usage {
  const mod: Usage = require("../../lib/usageCounts");
  mod.__resetUsageForTests();
  mod.startUsage({
    send: {
      step: (p) => {
        sentSteps.push(p);
      },
      visit: (p) => {
        sentVisits.push(p);
      },
    },
    meta: () => rawMeta,
    now: () => clock,
    ...over,
  });
  mod.handleAppState("active");
  return mod;
}

async function settle(mod: Usage) {
  await mod.flushSteps();
  await mod.__settleUsageForTests();
}

beforeEach(() => {
  storage()._reset();
  // A test may make storage fail; every test starts with a working one.
  const store: Map<string, string> = storage()._store;
  storage().getItem.mockImplementation(async (key: string) => store.get(key) ?? null);
  storage().setItem.mockImplementation(async (key: string, value: string) => {
    store.set(key, value);
  });
  sentSteps = [];
  sentVisits = [];
  mockTakes = [];
  mockTakeListeners.clear();
  clock = 1_000_000;
  rawMeta = { appVersion: "1.0.6", buildNumber: "14", locale: "en", variant: "production" };
});

afterEach(() => {
  (require("../../lib/usageCounts") as Usage).__resetUsageForTests();
  jest.useRealTimers();
});

describe("pure helpers", () => {
  test("languageCode strips region and script, rejects the rest", () => {
    const { languageCode } = require("../../lib/usageCounts") as Usage;
    expect(languageCode("pt-BR")).toBe("pt");
    expect(languageCode("zh_Hans")).toBe("zh");
    expect(languageCode("EN")).toBe("en");
    expect(languageCode("fil")).toBe("fil");
    expect(languageCode("Asia/Dubai")).toBe("und");
    expect(languageCode("english")).toBe("und");
    expect(languageCode(undefined)).toBe("und");
  });

  test("resolveVariant: only a non-dev production channel is production", () => {
    const { resolveVariant } = require("../../lib/usageCounts") as Usage;
    expect(resolveVariant("production", false)).toBe("production");
    expect(resolveVariant("production", true)).toBe("development");
    expect(resolveVariant("development", false)).toBe("development");
    expect(resolveVariant("preview", false)).toBe("development");
    expect(resolveVariant(undefined, false)).toBe("development");
  });

  test("sanitizeMeta reduces every field to its pattern", () => {
    const { sanitizeMeta } = require("../../lib/usageCounts") as Usage;
    expect(
      sanitizeMeta({ appVersion: "1.0.6", buildNumber: 14, locale: "ar-AE", variant: "production" })
    ).toEqual({ appVersion: "1.0.6", buildNumber: "14", lang: "ar", variant: "production" });
    expect(
      sanitizeMeta({
        appVersion: "1.0.6-beta",
        buildNumber: "abc",
        locale: "x",
        variant: "weird" as any,
      })
    ).toEqual({ appVersion: "0", buildNumber: "0", lang: "und", variant: "development" });
    expect(
      sanitizeMeta({ appVersion: null, buildNumber: null, locale: null, variant: "development" })
    ).toEqual({ appVersion: "0", buildNumber: "0", lang: "und", variant: "development" });
  });

  test("screenForPath maps the real routes, Home to its own surface", () => {
    const { screenForPath } = require("../../lib/usageCounts") as Usage;
    expect(screenForPath("/")).toBeNull();
    expect(screenForPath("/index")).toBeNull();
    expect(screenForPath("/settings")).toBe("settings");
    expect(screenForPath("/settings/")).toBe("settings");
    expect(screenForPath("/diagnostics")).toBe("diagnostics");
    expect(screenForPath("/reminder/new")).toBe("new_reminder");
    expect(screenForPath("/paywall?source=x")).toBe("paywall");
    expect(screenForPath("/alarm")).toBe("alarm");
    expect(screenForPath("/reminder/abc123")).toBe("other");
    expect(screenForPath(42)).toBe("other");
  });
});

describe("new install", () => {
  test("first_open is sent once, with exactly the agreed fields", async () => {
    const mod = launch();
    await settle(mod);
    expect(sentSteps).toEqual([
      { step: "first_open", appVersion: "1.0.6", buildNumber: "14", lang: "en", variant: "production" },
    ]);
    expect(Object.keys(sentSteps[0]).sort()).toEqual(STEP_KEYS);
  });

  test("each step is sent at most once per install, across launches", async () => {
    let mod = launch();
    mod.markStep("consent_shown");
    mod.markStep("consent_shown");
    await settle(mod);
    expect(sentSteps.map((p) => p.step)).toEqual(["first_open", "consent_shown"]);

    // Next launch: memory gone, storage kept.
    mod = launch();
    mod.markStep("consent_shown");
    mod.markStep("consent_accepted");
    await settle(mod);
    expect(sentSteps.map((p) => p.step)).toEqual([
      "first_open",
      "consent_shown",
      "consent_accepted",
    ]);
    expect(mod.isStepCounted("consent_shown")).toBe(true);
  });

  test("visits are numbered 1, 2, … and stop at 10", async () => {
    const mod = launch();
    for (let i = 0; i < 12; i++) {
      mod.handleAppState("background");
      mod.handleAppState("active");
    }
    await settle(mod);
    expect(sentVisits.map((v) => v.visitNumber)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 10, 10]);
  });

  test("a visit carries ordered screens, named taps and whether a reminder was made", async () => {
    const mod = launch();
    mod.noteRoute("/");
    mod.noteHomeSurface("recording");
    mod.noteTap("mic");
    mod.noteHomeSurface("home");
    mod.noteHomeSurface("home");
    mod.noteRoute("/paywall");
    mod.noteHomeSurface("composer"); // under the paywall: not on screen
    mod.noteRoute("/");
    mod.noteReminderMade();
    clock += 42_400;
    mod.handleAppState("background");
    await settle(mod);
    expect(sentVisits).toHaveLength(1);
    expect(sentVisits[0]).toEqual({
      visitNumber: 1,
      durationSec: 42,
      screens: ["home", "recording", "home", "paywall", "composer"],
      taps: ["mic"],
      madeReminder: true,
      appVersion: "1.0.6",
      buildNumber: "14",
      lang: "en",
      variant: "production",
    });
    expect(Object.keys(sentVisits[0]).sort()).toEqual(VISIT_KEYS);
  });

  test("inactive (a system sheet) neither ends nor starts a visit", async () => {
    const mod = launch();
    mod.handleAppState("inactive");
    mod.handleAppState("active");
    await settle(mod);
    expect(sentVisits).toHaveLength(0);
  });

  test("duration is capped at an hour; screens and taps at their caps", async () => {
    const mod = launch();
    mod.noteRoute("/");
    for (let i = 0; i < 40; i++) {
      mod.noteHomeSurface(i % 2 ? "home" : "days");
      mod.noteTap("reminder_card");
    }
    clock += 10 * 3600 * 1000;
    mod.handleAppState("background");
    await settle(mod);
    expect(sentVisits[0].durationSec).toBe(MAX_DURATION_SEC);
    expect(sentVisits[0].screens).toHaveLength(MAX_SCREENS);
    expect(sentVisits[0].taps).toHaveLength(MAX_TAPS);
  });

  test("a clock that went backwards gives 0 seconds", async () => {
    const mod = launch();
    clock -= 5000;
    mod.handleAppState("background");
    await settle(mod);
    expect(sentVisits[0].durationSec).toBe(0);
  });

  test("the first failed take counts once; a cap check is not a failed take", async () => {
    const mod = launch();
    mockTakes = [{ phase: "failed", errorKind: "cap_unverified" }];
    mockTakeListeners.forEach((l) => l());
    await settle(mod);
    expect(sentSteps.map((p) => p.step)).not.toContain("first_take_failed");

    mockTakes = [{ phase: "failed", errorKind: "silent" }];
    mockTakeListeners.forEach((l) => l());
    mockTakeListeners.forEach((l) => l());
    await settle(mod);
    expect(sentSteps.filter((p) => p.step === "first_take_failed")).toHaveLength(1);
  });
});

describe("install that predates 1.0.6", () => {
  test.each([
    "@device_id",
    "@app_settings",
    "@reminders",
    "@reminder_history",
    "@pending_takes",
    "vr.appLanguage",
  ])("with %s on disk: no steps sent, visits report 0", async (key) => {
    storage()._store.set(key, "x");
    let mod = launch();
    mod.markStep("first_record_tap");
    mod.markStep("paywall_shown");
    mod.handleAppState("background");
    await settle(mod);
    expect(sentSteps).toEqual([]);
    expect(sentVisits.map((v) => v.visitNumber)).toEqual([0]);

    const saved = JSON.parse(storage()._store.get("vr.usage.v1"));
    expect(saved.existing).toBe(true);
    expect([...saved.done].sort()).toEqual([...USAGE_STEPS].sort());

    // Still existing next launch, even after this launch wrote keys of its own.
    mod = launch();
    mod.markStep("first_take_ok");
    mod.handleAppState("background");
    await settle(mod);
    expect(sentSteps).toEqual([]);
    expect(sentVisits.map((v) => v.visitNumber)).toEqual([0, 0]);
  });

  test("a new install that later writes those keys stays new", async () => {
    let mod = launch();
    await settle(mod);
    storage()._store.set("@device_id", "abc");
    mod = launch();
    mod.markStep("first_record_tap");
    await settle(mod);
    expect(sentSteps.map((p) => p.step)).toEqual(["first_open", "first_record_tap"]);
  });

  test("unreadable saved state is treated as counted", async () => {
    storage()._store.set("vr.usage.v1", "{not json");
    const mod = launch();
    mod.markStep("first_record_tap");
    mod.handleAppState("background");
    await settle(mod);
    expect(sentSteps).toEqual([]);
    expect(sentVisits[0].visitNumber).toBe(0);
  });
});

describe("allow-list", () => {
  test("no payload can carry a string outside its union", async () => {
    const mod = launch();
    rawMeta = {
      appVersion: "1.0.6 (14) Asia/Dubai",
      buildNumber: "0123456789abcdef",
      locale: "en-US-u-tz-dubai",
      variant: "production",
    };
    mod.markStep("deviceId:0123" as any);
    mod.markStep("first_record_tap");
    mod.noteRoute("/reminder/0123456789abcdef");
    mod.noteHomeSurface("Buy milk at 5pm" as any);
    mod.noteHomeSurface("days");
    mod.noteTap("Buy milk" as any);
    mod.noteTap("upgrade");
    mod.handleAppState("background");
    await settle(mod);

    for (const p of sentSteps) {
      expect(Object.keys(p).sort()).toEqual(STEP_KEYS);
      expect(USAGE_STEPS).toContain(p.step);
      expect(p.appVersion).toMatch(/^\d{1,4}(\.\d{1,4}){0,3}$/);
      expect(p.buildNumber).toMatch(/^\d{1,6}$/);
      expect(p.lang).toMatch(/^[a-z]{2,3}$/);
    }
    expect(sentSteps.map((p) => p.step)).toEqual(["first_open", "first_record_tap"]);
    expect(sentSteps[0]).toMatchObject({ appVersion: "0", buildNumber: "0", lang: "en" });

    const visit = sentVisits[0];
    expect(Object.keys(visit).sort()).toEqual(VISIT_KEYS);
    for (const s of visit.screens) expect(USAGE_SCREENS).toContain(s);
    for (const tap of visit.taps) expect(USAGE_TAPS).toContain(tap);
    expect(visit.screens).toEqual(["other"]);
    expect(visit.taps).toEqual(["upgrade"]);
    expect(JSON.stringify([...sentSteps, ...sentVisits])).not.toMatch(/0123456789abcdef|Dubai|milk/);
  });
});

describe("recording", () => {
  test("a step marked while the recorder is up waits until it closes", async () => {
    jest.useFakeTimers();
    const mod = launch();
    await settle(mod); // first_open out of the way
    mod.noteRoute("/");
    mod.noteHomeSurface("recording");
    mod.markStep("mic_allowed");
    jest.advanceTimersByTime(10_000);
    await mod.__settleUsageForTests();
    expect(sentSteps.map((p) => p.step)).toEqual(["first_open"]);

    mod.noteHomeSurface("home");
    jest.advanceTimersByTime(2000);
    await mod.__settleUsageForTests();
    await mod.__settleUsageForTests();
    expect(sentSteps.map((p) => p.step)).toEqual(["first_open", "mic_allowed"]);
  });

  test("outside the recorder a marked step flushes on its own", async () => {
    jest.useFakeTimers();
    const mod = launch();
    jest.advanceTimersByTime(2000);
    await mod.__settleUsageForTests();
    await mod.__settleUsageForTests();
    expect(sentSteps.map((p) => p.step)).toEqual(["first_open"]);
  });

  test("going to the background flushes pending steps", async () => {
    const mod = launch();
    mod.markStep("consent_declined");
    mod.handleAppState("background");
    await mod.__settleUsageForTests();
    await mod.__settleUsageForTests();
    expect(sentSteps.map((p) => p.step)).toEqual(["first_open", "consent_declined"]);
  });
});

describe("never throws", () => {
  test("a sender that throws or rejects is swallowed", async () => {
    const mod = launch({
      send: {
        step: () => {
          throw new Error("boom");
        },
        visit: () => Promise.reject(new Error("offline")),
      },
    });
    expect(() => mod.markStep("first_record_tap")).not.toThrow();
    expect(() => mod.handleAppState("background")).not.toThrow();
    await expect(settle(mod)).resolves.toBeUndefined();
  });

  test("meta that throws drops the payload, nothing else", async () => {
    const mod = launch({
      meta: () => {
        throw new Error("no constants");
      },
    });
    mod.handleAppState("background");
    await settle(mod);
    expect(sentSteps).toEqual([]);
    expect(sentVisits).toEqual([]);
  });

  test("unreadable storage: nothing first-run is sent, visits still report 0", async () => {
    storage().getItem.mockImplementation(async () => {
      throw new Error("disk");
    });
    const mod = launch();
    mod.markStep("first_record_tap");
    mod.handleAppState("background");
    await settle(mod);
    expect(sentSteps).toEqual([]);
    expect(sentVisits.map((v) => v.visitNumber)).toEqual([0]);
  });

  test("unwritable storage: steps are not sent (a resend could follow)", async () => {
    storage().setItem.mockImplementation(async () => {
      throw new Error("full");
    });
    const mod = launch();
    mod.markStep("first_record_tap");
    mod.handleAppState("background");
    await settle(mod);
    expect(sentSteps).toEqual([]);
    expect(sentVisits.map((v) => v.visitNumber)).toEqual([1]);
  });

  test("calls before startUsage are harmless", () => {
    const mod: Usage = require("../../lib/usageCounts");
    mod.__resetUsageForTests();
    expect(() => {
      mod.markStep("first_open");
      mod.noteTap("mic");
      mod.noteRoute("/");
      mod.noteHomeSurface("home");
      mod.noteReminderMade();
      mod.handleAppState("background");
    }).not.toThrow();
  });

  test("startUsage twice keeps the first options", async () => {
    const mod = launch();
    const other = jest.fn();
    mod.startUsage({ send: { step: other, visit: other }, meta: () => rawMeta });
    await settle(mod);
    expect(other).not.toHaveBeenCalled();
    expect(sentSteps).toHaveLength(1);
  });
});
