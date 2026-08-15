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
  isPremiumSchedule,
  ReminderLimitExceededError,
} from "../../lib/usageGate";
import type { GridSchedule } from "../../lib/schedule";

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
