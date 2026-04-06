// usageGate.ts uses dynamic import("./purchases") which Babel transforms to require().
// We mock the resolved module path so the dynamic import gets our mock.
const mockCheckProStatus = jest.fn<() => Promise<boolean>>();

jest.mock("../../lib/purchases", () => ({
  __esModule: true,
  checkProStatus: (...args: unknown[]) => mockCheckProStatus(...args),
}));

// Must import AFTER jest.mock
import {
  checkCanCreateWithCount,
  ReminderLimitExceededError,
} from "../../lib/usageGate";

beforeEach(() => {
  mockCheckProStatus.mockReset();
  mockCheckProStatus.mockResolvedValue(false);
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
