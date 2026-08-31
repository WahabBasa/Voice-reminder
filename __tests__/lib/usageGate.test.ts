// usageGate.ts uses dynamic import("./purchases") which Babel transforms to require().
// We mock the resolved module path so the dynamic import gets our mock.
// jest 29's jest.fn takes <ReturnType, ArgsArray>, not a single function type.
const mockCheckProStatus = jest.fn<Promise<boolean>, unknown[]>();
const mockGetCachedProStatus = jest.fn<{ isPro: boolean | null; updatedAtMs: number }, unknown[]>();

jest.mock("../../lib/purchases", () => ({
  __esModule: true,
  checkProStatus: (...args: unknown[]) => mockCheckProStatus(...args),
  getCachedProStatus: (...args: unknown[]) => mockGetCachedProStatus(...args),
}));

// Must import AFTER jest.mock
import {
  checkCanCreateWithCount,
  checkCanUsePremiumSchedule,
  getCapGateBlockContent,
  isPremiumSchedule,
  resolveCapGateOutcome,
  ReminderLimitExceededError,
  type CapGateBlock,
} from "../../lib/usageGate";
import type { GridSchedule } from "../../lib/schedule";
import type { ProStatus } from "../../lib/proCardContent";

beforeEach(() => {
  mockCheckProStatus.mockReset();
  mockCheckProStatus.mockResolvedValue(false);
  mockGetCachedProStatus.mockReset();
  mockGetCachedProStatus.mockReturnValue({ isPro: null, updatedAtMs: 0 });
});

// ─── checkCanCreateWithCount ────────────────────────────────────────────────

describe("checkCanCreateWithCount", () => {
  describe("under limit — does not call RevenueCat", () => {
    it("count 0 allows creation without checking pro status", async () => {
      const result = await checkCanCreateWithCount(0);
      expect(result.canCreate).toBe(true);
      expect(result.isPro).toBe(false);
      expect(result.currentCount).toBe(0);
      expect(result.limit).toBe(5);
      expect(mockCheckProStatus).not.toHaveBeenCalled();
    });

    it("count 3 allows creation without checking pro status", async () => {
      const result = await checkCanCreateWithCount(3);
      expect(result.canCreate).toBe(true);
      expect(result.isPro).toBe(false);
      expect(result.limit).toBe(5);
      expect(mockCheckProStatus).not.toHaveBeenCalled();
    });

    it("count 4 (one below limit) allows creation", async () => {
      const result = await checkCanCreateWithCount(4);
      expect(result.canCreate).toBe(true);
      expect(result.isPro).toBe(false);
      expect(mockCheckProStatus).not.toHaveBeenCalled();
    });
  });

  describe("at limit — checks RevenueCat exactly once", () => {
    it("count 5, not pro, denies creation", async () => {
      mockCheckProStatus.mockResolvedValue(false);
      const result = await checkCanCreateWithCount(5);
      expect(result.canCreate).toBe(false);
      expect(result.isPro).toBe(false);
      expect(result.currentCount).toBe(5);
      expect(result.limit).toBe(5);
      expect(mockCheckProStatus).toHaveBeenCalledTimes(1);
    });

    it("count 5, is pro, allows creation", async () => {
      mockCheckProStatus.mockResolvedValue(true);
      const result = await checkCanCreateWithCount(5);
      expect(result.canCreate).toBe(true);
      expect(result.isPro).toBe(true);
      expect(mockCheckProStatus).toHaveBeenCalledTimes(1);
    });
  });

  describe("over limit — checks RevenueCat exactly once", () => {
    it("count 7, not pro, denies creation", async () => {
      mockCheckProStatus.mockResolvedValue(false);
      const result = await checkCanCreateWithCount(7);
      expect(result.canCreate).toBe(false);
      expect(result.isPro).toBe(false);
      expect(mockCheckProStatus).toHaveBeenCalledTimes(1);
    });

    it("count 7, is pro, allows creation", async () => {
      mockCheckProStatus.mockResolvedValue(true);
      const result = await checkCanCreateWithCount(7);
      expect(result.canCreate).toBe(true);
      expect(result.isPro).toBe(true);
      expect(mockCheckProStatus).toHaveBeenCalledTimes(1);
    });
  });

  describe("non-finite counts clamped to 0", () => {
    it("negative count clamped to 0, allows creation", async () => {
      const result = await checkCanCreateWithCount(-3);
      expect(result.canCreate).toBe(true);
      expect(result.currentCount).toBe(0);
      expect(result.limit).toBe(5);
      expect(mockCheckProStatus).not.toHaveBeenCalled();
    });

    it("NaN clamped to 0, allows creation", async () => {
      const result = await checkCanCreateWithCount(NaN);
      expect(result.canCreate).toBe(true);
      expect(result.currentCount).toBe(0);
      expect(mockCheckProStatus).not.toHaveBeenCalled();
    });

    it("Infinity clamped to 0, allows creation", async () => {
      const result = await checkCanCreateWithCount(Infinity);
      expect(result.canCreate).toBe(true);
      expect(result.currentCount).toBe(0);
      expect(mockCheckProStatus).not.toHaveBeenCalled();
    });
  });
});

// ─── the tap-time cap gate ──────────────────────────────────────────────────

const LIMIT = 5;
const ALL_STATUSES: ProStatus[] = ["pro", "free", "unknown"];

describe("resolveCapGateOutcome", () => {
  describe("under the cap", () => {
    it("allows everyone, whatever we know about their plan", () => {
      // The point of the cheap path: an unresolved entitlement costs nothing
      // to the overwhelming majority of taps, because the cap isn't in play.
      for (const status of ALL_STATUSES) {
        expect(resolveCapGateOutcome(status, 4, LIMIT)).toBe("allow");
        expect(resolveCapGateOutcome(status, 0, LIMIT)).toBe("allow");
      }
    });
  });

  describe("at or over the cap", () => {
    it("allows a confirmed subscriber — there is no cap on Pro", () => {
      expect(resolveCapGateOutcome("pro", LIMIT, LIMIT)).toBe("allow");
      expect(resolveCapGateOutcome("pro", 99, LIMIT)).toBe("allow");
    });

    it("blocks a confirmed free user with the upgrade pitch, exactly as before", () => {
      expect(resolveCapGateOutcome("free", LIMIT, LIMIT)).toBe("blocked_upgrade");
      expect(resolveCapGateOutcome("free", 7, LIMIT)).toBe("blocked_upgrade");
    });

    it("still blocks when the entitlement is unresolved — unknown never grants", () => {
      // The conservative direction does not move. Nobody gets Pro they haven't
      // paid for just because the check failed.
      expect(resolveCapGateOutcome("unknown", LIMIT, LIMIT)).not.toBe("allow");
      expect(resolveCapGateOutcome("unknown", 7, LIMIT)).not.toBe("allow");
    });

    it("blocks an unresolved entitlement differently from a confirmed free plan", () => {
      // This is the whole fix: the two used to be the same block, so a
      // subscriber whose check failed was asked to buy their subscription
      // a second time.
      expect(resolveCapGateOutcome("unknown", LIMIT, LIMIT)).toBe("blocked_unverified");
      expect(resolveCapGateOutcome("unknown", LIMIT, LIMIT)).not.toBe(
        resolveCapGateOutcome("free", LIMIT, LIMIT)
      );
    });
  });

  describe("non-finite counts clamped to 0, like checkCanCreateWithCount", () => {
    it("treats a broken count as no reminders rather than as being capped", () => {
      for (const count of [NaN, Infinity, -3]) {
        expect(resolveCapGateOutcome("unknown", count, LIMIT)).toBe("allow");
        expect(resolveCapGateOutcome("free", count, LIMIT)).toBe("allow");
      }
    });
  });
});

describe("getCapGateBlockContent", () => {
  const upgrade = getCapGateBlockContent("blocked_upgrade", LIMIT);
  const unverified = getCapGateBlockContent("blocked_unverified", LIMIT);

  it("keeps the shipped upgrade copy byte for byte", () => {
    // Both surfaces' existing strings, unchanged — this branch is today's
    // behavior and must stay that way.
    expect(upgrade.statusText).toBe("You've reached 5 active reminders. Upgrade for unlimited.");
    expect(upgrade.toastTitle).toBe("You've reached 5 active reminders");
    expect(upgrade.toastMessage).toBe("Tap to upgrade for unlimited.");
    expect(upgrade.offersUpgrade).toBe(true);
  });

  it("counts the limit into the upgrade copy rather than hardcoding five", () => {
    expect(getCapGateBlockContent("blocked_upgrade", 12).toastTitle).toContain("12");
  });

  it("tells an unverified user it is a connection problem, not a plan problem", () => {
    expect(unverified.toastTitle).toMatch(/can't verify your subscription/i);
    expect(unverified.toastMessage).toMatch(/connection/i);
    expect(unverified.statusText).toMatch(/can't verify your subscription/i);
    expect(unverified.statusText).toMatch(/connection/i);
  });

  it("pitches nothing on the unverified block, and offers no route to the paywall", () => {
    expect(unverified.offersUpgrade).toBe(false);
    for (const copy of [unverified.statusText, unverified.toastTitle, unverified.toastMessage]) {
      expect(copy).not.toMatch(/upgrade|unlimited|subscribe|pro\b/i);
    }
    // It must not quietly reuse the cap copy either.
    expect(unverified.statusText).not.toBe(upgrade.statusText);
    expect(unverified.toastTitle).not.toBe(upgrade.toastTitle);
  });

  it("never mentions the reminder cap when the cap isn't the reason", () => {
    // The user is at the cap, but we can't say that's why they're blocked —
    // for all we know they're a subscriber with no cap at all.
    expect(`${unverified.statusText} ${unverified.toastTitle} ${unverified.toastMessage}`)
      .not.toContain(String(LIMIT));
  });

  it("names no external provider in anything the user reads", () => {
    for (const block of ["blocked_upgrade", "blocked_unverified"] as CapGateBlock[]) {
      const content = getCapGateBlockContent(block, LIMIT);
      expect(`${content.statusText} ${content.toastTitle} ${content.toastMessage}`).not.toMatch(
        /revenuecat|openai|elevenlabs|apple pay|google play|app store server/i
      );
    }
  });
});

describe("the cap gate's wiring in app/index", () => {
  // No renderer for the home screen in this suite, so the source is the
  // evidence — same pattern as proCardContent.test and legalLinks.test.
  const index = require("fs").readFileSync(
    require("path").resolve(__dirname, "../..", "app/index.tsx"),
    "utf8"
  ) as string;

  it("reads the tri-state, not a boolean, at both tap gates", () => {
    expect(index).toContain("const proStatus = getProStatusSnapshot()");
    expect(index.match(/resolveCapGateOutcome\(proStatus, currentCount, limit\)/g)?.length).toBe(2);
    // The old boolean collapse is gone from the gate decision.
    expect(index).not.toContain("!cachedPro && currentCount >= limit");
  });

  it("routes the toast to the paywall only when the block actually offers an upgrade", () => {
    expect(index).toContain("onPress: content.offersUpgrade ? openPaywall : undefined");
  });

  it("heals the entitlement behind both blocks with a forced refresh", () => {
    expect(index.match(/forceRefreshProStatus\(\)/g)?.length).toBe(2);
  });

  it("re-locks the mic overlay when a pending check settles to a different block", () => {
    // The overlay is already open, so the unverified lock can become the real
    // upgrade lock in place rather than waiting for another tap.
    expect(index).toContain("const settled = resolveCapGateOutcome(settledStatus, currentCount, limit)");
    expect(index).toMatch(/if \(settled !== gate\) \{\s*lockRecordingForLimit\(traceId, settled/);
  });
});

// ─── interval mode is Pro (OLD-100) ─────────────────────────────────────────

const clockGrid: GridSchedule = {
  type: "grid",
  days: { kind: "everyday" },
  times: { kind: "clock", times: ["08:00", "21:00"] },
};

const intervalGrid: GridSchedule = {
  type: "grid",
  days: { kind: "weekdays", days: ["thu"] },
  times: { kind: "interval", everyMinutes: 30, windowStart: "09:00", windowEnd: "17:00" },
};

describe("isPremiumSchedule", () => {
  it("gates interval mode and nothing else on the times axis", () => {
    expect(isPremiumSchedule(intervalGrid)).toBe(true);
    // Several clock times a day is the pill use-case — free on both tiers.
    expect(isPremiumSchedule(clockGrid)).toBe(false);
  });

  it("says no for a reminder with no grid at all", () => {
    expect(isPremiumSchedule(undefined)).toBe(false);
    expect(isPremiumSchedule(null)).toBe(false);
  });
});

describe("checkCanUsePremiumSchedule", () => {
  it("answers from a cached subscription without a round trip", async () => {
    mockGetCachedProStatus.mockReturnValue({ isPro: true, updatedAtMs: 1 });

    const result = await checkCanUsePremiumSchedule();

    expect(result).toEqual({ allowed: true, isPro: true });
    expect(mockCheckProStatus).not.toHaveBeenCalled();
  });

  it("asks the store when the cache is empty, and blocks a free plan", async () => {
    mockCheckProStatus.mockResolvedValue(false);

    const result = await checkCanUsePremiumSchedule();

    expect(result).toEqual({ allowed: false, isPro: false });
    expect(mockCheckProStatus).toHaveBeenCalledTimes(1);
  });

  it("asks again when the cache says free — an upgrade may have just landed", async () => {
    mockGetCachedProStatus.mockReturnValue({ isPro: false, updatedAtMs: 1 });
    mockCheckProStatus.mockResolvedValue(true);

    const result = await checkCanUsePremiumSchedule();

    expect(result).toEqual({ allowed: true, isPro: true });
    expect(mockCheckProStatus).toHaveBeenCalledTimes(1);
  });

  it("treats an unreachable entitlement check as not subscribed", async () => {
    mockCheckProStatus.mockRejectedValue(new Error("offline"));

    await expect(checkCanUsePremiumSchedule()).resolves.toEqual({ allowed: false, isPro: false });
  });
});

// ─── ReminderLimitExceededError ──────────────────────────────────────────────

describe("ReminderLimitExceededError", () => {
  it("sets currentCount and limit fields", () => {
    const err = new ReminderLimitExceededError(7, 5);
    expect(err.currentCount).toBe(7);
    expect(err.limit).toBe(5);
  });

  it("includes both values in the message", () => {
    const err = new ReminderLimitExceededError(7, 5);
    expect(err.message).toContain("7");
    expect(err.message).toContain("5");
  });

  it("has correct error name", () => {
    const err = new ReminderLimitExceededError(7, 5);
    expect(err.name).toBe("ReminderLimitExceededError");
  });

  it("is an instance of Error", () => {
    const err = new ReminderLimitExceededError(7, 5);
    expect(err).toBeInstanceOf(Error);
  });
});
