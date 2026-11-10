/**
 * The App Store rating prompt's gating (lib/ratingPrompt.ts): only a RUNG
 * reminder's Done counts; asked from the 2nd one; at most once per app
 * version (across launches); never while inactive, blocked or an alarm is
 * still sounding; only when the store says it can.
 */

type Rating = typeof import("../../lib/ratingPrompt");

function storage() {
  return require("@react-native-async-storage/async-storage").default;
}

// A fresh launch: memory goes, storage stays.
function launch(): Rating {
  const mod: Rating = require("../../lib/ratingPrompt");
  mod.__resetRatingPromptForTests();
  return mod;
}

const NOW = 1_800_000_000_000;
const RUNG = NOW - 60_000;
const FUTURE = NOW + 60_000;

let requestReview: jest.Mock;
let isAvailable: jest.Mock;
let isAlarmSounding: jest.Mock;
let active: boolean;
let blocker: string | null;

function deps(over: Partial<import("../../lib/ratingPrompt").ReviewDeps> = {}) {
  return {
    appVersion: "1.0.6",
    isAppActive: () => active,
    blocker: () => blocker,
    isAlarmSounding,
    isAvailable,
    requestReview,
    ...over,
  };
}

beforeEach(() => {
  storage()._reset();
  const store: Map<string, string> = storage()._store;
  storage().getItem.mockImplementation(async (key: string) => store.get(key) ?? null);
  storage().setItem.mockImplementation(async (key: string, value: string) => {
    store.set(key, value);
  });
  requestReview = jest.fn(async () => {});
  isAvailable = jest.fn(async () => true);
  isAlarmSounding = jest.fn(async () => false);
  active = true;
  blocker = null;
});

test("isRungDone: only an occurrence whose time has come", () => {
  const { isRungDone } = launch();
  expect(isRungDone(RUNG, NOW)).toBe(true);
  expect(isRungDone(NOW, NOW)).toBe(true);
  expect(isRungDone(FUTURE, NOW)).toBe(false);
  expect(isRungDone(Number.NaN, NOW)).toBe(false);
});

test("the first rung Done does not ask; the second does", async () => {
  const mod = launch();
  await mod.noteRungDone(RUNG, NOW);
  expect(await mod.maybeAskForReview(deps())).toBe("not_due");
  await mod.noteRungDone(RUNG, NOW);
  expect(await mod.maybeAskForReview(deps())).toBe("asked");
  expect(requestReview).toHaveBeenCalledTimes(1);
});

test("a Done on a reminder that has not rung does not count", async () => {
  const mod = launch();
  await mod.noteRungDone(FUTURE, NOW);
  await mod.noteRungDone(FUTURE, NOW);
  await mod.noteRungDone(RUNG, NOW);
  expect(await mod.maybeAskForReview(deps())).toBe("not_due");
});

test("the count survives a restart", async () => {
  let mod = launch();
  await mod.noteRungDone(RUNG, NOW);
  mod = launch();
  await mod.noteRungDone(RUNG, NOW);
  expect(await mod.maybeAskForReview(deps())).toBe("asked");
});

test("two Dones in the same tick both count", async () => {
  const mod = launch();
  await Promise.all([mod.noteRungDone(RUNG, NOW), mod.noteRungDone(RUNG, NOW)]);
  expect(await mod.maybeAskForReview(deps())).toBe("asked");
});

test("at most once per app version, across launches; a new version may ask again", async () => {
  let mod = launch();
  await mod.noteRungDone(RUNG, NOW);
  await mod.noteRungDone(RUNG, NOW);
  expect(await mod.maybeAskForReview(deps())).toBe("asked");

  await mod.noteRungDone(RUNG, NOW);
  expect(await mod.maybeAskForReview(deps())).toBe("asked_this_version");

  mod = launch();
  await mod.noteRungDone(RUNG, NOW);
  expect(await mod.maybeAskForReview(deps())).toBe("asked_this_version");

  await mod.noteRungDone(RUNG, NOW);
  expect(await mod.maybeAskForReview(deps({ appVersion: "1.0.7" }))).toBe("asked");
  expect(requestReview).toHaveBeenCalledTimes(2);
});

test("never while an alarm is still sounding; asks at the next calm check", async () => {
  const mod = launch();
  await mod.noteRungDone(RUNG, NOW);
  await mod.noteRungDone(RUNG, NOW);
  isAlarmSounding.mockResolvedValueOnce(true);
  expect(await mod.maybeAskForReview(deps())).toBe("sounding");
  expect(requestReview).not.toHaveBeenCalled();
  expect(await mod.maybeAskForReview(deps())).toBe("asked");
});

test("an alarm check that fails counts as sounding", async () => {
  const mod = launch();
  await mod.noteRungDone(RUNG, NOW);
  await mod.noteRungDone(RUNG, NOW);
  isAlarmSounding.mockRejectedValueOnce(new Error("bridge"));
  expect(await mod.maybeAskForReview(deps())).toBe("sounding");
});

test("never while inactive or with something on screen, before or after the awaits", async () => {
  const mod = launch();
  await mod.noteRungDone(RUNG, NOW);
  await mod.noteRungDone(RUNG, NOW);
  active = false;
  expect(await mod.maybeAskForReview(deps())).toBe("inactive");
  active = true;
  blocker = "recording";
  expect(await mod.maybeAskForReview(deps())).toBe("blocked");
  blocker = null;

  isAvailable.mockImplementationOnce(async () => {
    blocker = "edit_sheet";
    return true;
  });
  expect(await mod.maybeAskForReview(deps())).toBe("blocked");
  blocker = null;

  isAvailable.mockImplementationOnce(async () => {
    active = false;
    return true;
  });
  expect(await mod.maybeAskForReview(deps())).toBe("inactive");
  active = true;
  expect(requestReview).not.toHaveBeenCalled();
  expect(await mod.maybeAskForReview(deps())).toBe("asked");
});

test("only if the store can show it", async () => {
  const mod = launch();
  await mod.noteRungDone(RUNG, NOW);
  await mod.noteRungDone(RUNG, NOW);
  isAvailable.mockResolvedValueOnce(false);
  expect(await mod.maybeAskForReview(deps())).toBe("unavailable");
  expect(await mod.maybeAskForReview(deps())).toBe("not_due");

  await mod.noteRungDone(RUNG, NOW);
  isAvailable.mockRejectedValueOnce(new Error("native"));
  expect(await mod.maybeAskForReview(deps())).toBe("unavailable");
  expect(requestReview).not.toHaveBeenCalled();
});

test("no version known: never asks", async () => {
  const mod = launch();
  await mod.noteRungDone(RUNG, NOW);
  await mod.noteRungDone(RUNG, NOW);
  expect(await mod.maybeAskForReview(deps({ appVersion: null }))).toBe("no_version");
  expect(requestReview).not.toHaveBeenCalled();
});

test("the version is written before asking; a failed write does not ask", async () => {
  const mod = launch();
  await mod.noteRungDone(RUNG, NOW);
  await mod.noteRungDone(RUNG, NOW);
  storage().setItem.mockImplementationOnce(async () => {
    throw new Error("full");
  });
  expect(await mod.maybeAskForReview(deps())).toBe("storage_failed");
  expect(requestReview).not.toHaveBeenCalled();
});

test("a requestReview that throws is swallowed", async () => {
  const mod = launch();
  await mod.noteRungDone(RUNG, NOW);
  await mod.noteRungDone(RUNG, NOW);
  requestReview.mockRejectedValueOnce(new Error("native"));
  expect(await mod.maybeAskForReview(deps())).toBe("asked");
});

test("a concurrent check is busy", async () => {
  const mod = launch();
  await mod.noteRungDone(RUNG, NOW);
  await mod.noteRungDone(RUNG, NOW);
  const first = mod.maybeAskForReview(deps());
  expect(await mod.maybeAskForReview(deps())).toBe("busy");
  expect(await first).toBe("asked");
});

test("listeners hear a due Done; one failing listener does not stop the rest", async () => {
  const mod = launch();
  const bad = jest.fn(() => {
    throw new Error("x");
  });
  const good = jest.fn();
  mod.subscribeReviewCheck(bad);
  const unsubscribe = mod.subscribeReviewCheck(good);
  await mod.noteRungDone(RUNG, NOW);
  expect(good).not.toHaveBeenCalled();
  await mod.noteRungDone(RUNG, NOW);
  expect(bad).toHaveBeenCalledTimes(1);
  expect(good).toHaveBeenCalledTimes(1);
  unsubscribe();
  await mod.noteRungDone(RUNG, NOW);
  expect(good).toHaveBeenCalledTimes(1);
});

test("storage that fails on a Done never throws", async () => {
  const mod = launch();
  storage().getItem.mockImplementation(async () => {
    throw new Error("disk");
  });
  await expect(mod.noteRungDone(RUNG, NOW)).resolves.toBeUndefined();
});

test("corrupt saved state starts the count over", async () => {
  storage()._store.set("vr.rating.v1", "{oops");
  const mod = launch();
  await mod.noteRungDone(RUNG, NOW);
  expect(await mod.maybeAskForReview(deps())).toBe("not_due");
  await mod.noteRungDone(RUNG, NOW);
  expect(await mod.maybeAskForReview(deps())).toBe("asked");
});

test("a saved state with odd values is read defensively", async () => {
  storage()._store.set("vr.rating.v1", JSON.stringify({ rungDone: -4, askedVersion: 7 }));
  const mod = launch();
  await mod.noteRungDone(RUNG, NOW);
  expect(await mod.maybeAskForReview(deps())).toBe("not_due");
});
