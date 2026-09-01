/**
 * Reactive audio hydration (spec §3.2).
 *
 * The seam under test is lib/audioHydration against a fake Convex client: a
 * watch goes in, and what the device does with it comes out — when a row gets
 * downloaded and written locally, when the hydration is over, and when the
 * subscription is dropped. Downloads, notifications and the device id all
 * arrive mocked, so nothing native is in reach here.
 *
 * The sharp edge this suite exists for is `localQueryResult()` answering three
 * ways: `undefined` (not loaded — indistinguishable from a missing row, so it
 * must not be acted on), `null` (loaded, and the row is gone — terminal), or a
 * row. The old poll loop only ever saw the last two.
 */
jest.mock("../../lib/notifications", () => ({
  downloadReminderAudio: jest.fn(async () => {}),
  downloadPreReminderAudio: jest.fn(async () => {}),
  refreshNotificationWithAudio: jest.fn(async () => {}),
}));

jest.mock("../../lib/deviceId", () => ({
  getDeviceId: jest.fn(async () => "device-1"),
}));

import { hydrateReminderAudio } from "../../lib/audioHydration";
import {
  downloadPreReminderAudio,
  downloadReminderAudio,
  refreshNotificationWithAudio,
} from "../../lib/notifications";

const download = downloadReminderAudio as jest.Mock;
const downloadPre = downloadPreReminderAudio as jest.Mock;
const refresh = refreshNotificationWithAudio as jest.Mock;

type Row = Record<string, any> | null | undefined;

/** One `watchQuery` subscription: remembers its callbacks and its disposal. */
class FakeWatch {
  listeners = new Set<() => void>();
  disposed = false;

  constructor(private convex: FakeConvex) {}

  localQueryResult(): Row {
    if (this.convex.throwsLeft > 0) {
      this.convex.throwsLeft -= 1;
      throw new Error("query exploded");
    }
    return this.convex.value;
  }

  onUpdate = (cb: () => void): (() => void) => {
    this.listeners.add(cb);
    return () => {
      this.disposed = true;
      this.listeners.delete(cb);
    };
  };
}

/**
 * Stands in for ConvexReactClient. `value` is what the local query result
 * holds right now — `undefined` until the first server response, exactly like
 * the real thing.
 */
class FakeConvex {
  value: Row = undefined;
  /** How many further reads should throw (a query that errored server-side). */
  throwsLeft = 0;
  watches: FakeWatch[] = [];

  watchQuery = jest.fn((_query: unknown, _args: unknown) => {
    const watch = new FakeWatch(this);
    this.watches.push(watch);
    return watch;
  });

  /** Subscriptions still open. */
  get live(): FakeWatch[] {
    return this.watches.filter((w) => !w.disposed);
  }

  /** Server pushes a new result to every open subscription. */
  push(value: Row): void {
    this.value = value;
    for (const watch of this.live) {
      for (const cb of [...watch.listeners]) cb();
    }
  }
}

/** Let queued promise handlers run; nothing here needs the clock. */
const flush = async (ticks = 20): Promise<void> => {
  for (let i = 0; i < ticks; i++) await Promise.resolve();
};

type Patch = Parameters<Parameters<typeof hydrateReminderAudio>[0]["updateLocal"]>[0];

function start(convex: FakeConvex, convexId: string) {
  const updateLocal = jest.fn(async (_patch: Patch) => {});
  const onSuccess = jest.fn(async (_audioUrl: string) => {});
  const task = hydrateReminderAudio({
    convexClient: convex as any,
    convexId,
    localReminderId: `local-${convexId}`,
    updateLocal,
    onSuccess,
  });
  return { task, updateLocal, onSuccess };
}

beforeEach(() => {
  jest.useFakeTimers();
  for (const mock of [download, downloadPre, refresh]) {
    mock.mockReset();
    mock.mockResolvedValue(undefined);
  }
});

afterEach(() => {
  jest.useRealTimers();
});

// ─── undefined vs null ──────────────────────────────────────────────────────

describe("an unloaded query", () => {
  it("is not treated as a missing row: it waits, writes nothing, keeps watching", async () => {
    const convex = new FakeConvex();
    const { task, updateLocal } = start(convex, "loading");
    await flush();

    expect(convex.watchQuery).toHaveBeenCalledTimes(1);
    expect(convex.watchQuery).toHaveBeenCalledWith(expect.anything(), {
      id: "loading",
      deviceId: "device-1",
    });
    expect(updateLocal).not.toHaveBeenCalled();
    expect(download).not.toHaveBeenCalled();
    expect(convex.live).toHaveLength(1);

    // An update that still resolves to undefined changes nothing.
    convex.push(undefined);
    await flush();
    expect(updateLocal).not.toHaveBeenCalled();
    expect(convex.live).toHaveLength(1);

    // Only the watchdog ends it.
    await jest.advanceTimersByTimeAsync(30_000);
    await task;
    expect(convex.live).toHaveLength(0);
  });
});

describe("a loaded null row", () => {
  it("is terminal: nothing written, subscription dropped", async () => {
    const convex = new FakeConvex();
    const { task, updateLocal, onSuccess } = start(convex, "gone");
    await flush();

    convex.push(null);
    await task;

    expect(updateLocal).not.toHaveBeenCalled();
    expect(onSuccess).not.toHaveBeenCalled();
    expect(download).not.toHaveBeenCalled();
    expect(convex.live).toHaveLength(0);
  });
});

// ─── the happy paths ────────────────────────────────────────────────────────

describe("a row with audio and no extras phase", () => {
  it("downloads, writes the reminder, refreshes notifications, and stops", async () => {
    const convex = new FakeConvex();
    const { task, updateLocal, onSuccess } = start(convex, "base");
    await flush();

    convex.push({ audioUrl: "https://a.m4a", wavUrl: "https://a.wav", audioStatus: "ready" });
    await task;

    expect(download).toHaveBeenCalledWith("local-base", "https://a.m4a");
    expect(updateLocal).toHaveBeenCalledTimes(1);
    expect(updateLocal).toHaveBeenCalledWith({
      audioUrl: "https://a.m4a",
      wavUrl: "https://a.wav",
      audioStatus: "ready",
      // Absent extras status = nothing coming, so it settles as ready.
      audioExtrasStatus: "ready",
    });
    expect(refresh).toHaveBeenCalledWith("local-base", "https://a.m4a", undefined);
    expect(onSuccess).toHaveBeenCalledTimes(1);
    expect(onSuccess).toHaveBeenCalledWith("https://a.m4a");
    expect(convex.live).toHaveLength(0);
  });
});

describe("a row that still owes its pre-alert line", () => {
  it("applies the base line, keeps watching, then applies the extras patch once", async () => {
    const convex = new FakeConvex();
    const { task, updateLocal, onSuccess } = start(convex, "extras");
    await flush();

    convex.push({ audioUrl: "https://a.m4a", audioExtrasStatus: "pending" });
    await flush();

    expect(updateLocal).toHaveBeenCalledTimes(1);
    expect(updateLocal.mock.calls[0][0]).toMatchObject({
      audioStatus: "ready",
      audioExtrasStatus: "pending",
    });
    expect(convex.live).toHaveLength(1);

    convex.push({
      audioUrl: "https://a.m4a",
      preAudioUrl: "https://pre.m4a",
      audioExtrasStatus: "ready",
    });
    await task;

    expect(updateLocal).toHaveBeenCalledTimes(2);
    expect(updateLocal.mock.calls[1][0]).toMatchObject({
      audioStatus: "ready",
      audioExtrasStatus: "ready",
      preAudioUrl: "https://pre.m4a",
    });
    expect(downloadPre).toHaveBeenCalledWith("local-extras", "https://pre.m4a");
    // The base line is the success — the second patch does not re-announce it.
    expect(onSuccess).toHaveBeenCalledTimes(1);
    expect(convex.live).toHaveLength(0);
  });

  it("records a failed extras patch and stops, keeping the base line", async () => {
    const convex = new FakeConvex();
    const { task, updateLocal } = start(convex, "extras-failed");
    await flush();

    convex.push({ audioUrl: "https://a.m4a", audioExtrasStatus: "pending" });
    await flush();
    convex.push({ audioUrl: "https://a.m4a", audioExtrasStatus: "failed" });
    await task;

    expect(updateLocal.mock.calls[1][0]).toMatchObject({
      audioStatus: "ready",
      audioExtrasStatus: "failed",
    });
    expect(convex.live).toHaveLength(0);
  });
});

// ─── serialization ──────────────────────────────────────────────────────────

describe("two updates arriving on top of each other", () => {
  it("runs them one at a time: the base line lands before the extras patch starts", async () => {
    const convex = new FakeConvex();
    let releaseBase: () => void = () => {};
    download.mockImplementationOnce(
      () => new Promise<void>((resolve) => { releaseBase = resolve; })
    );

    const { task, updateLocal, onSuccess } = start(convex, "race");
    await flush();

    convex.push({ audioUrl: "https://a.m4a", audioExtrasStatus: "pending" });
    await flush();
    expect(download).toHaveBeenCalledTimes(1);
    expect(updateLocal).not.toHaveBeenCalled(); // base download still in flight

    // The extras patch lands mid-download.
    convex.push({
      audioUrl: "https://a.m4a",
      preAudioUrl: "https://pre.m4a",
      audioExtrasStatus: "ready",
    });
    await flush();

    // Queued behind the base apply, not run alongside it.
    expect(download).toHaveBeenCalledTimes(1);
    expect(updateLocal).not.toHaveBeenCalled();

    releaseBase();
    await task;

    expect(download).toHaveBeenCalledTimes(2);
    expect(updateLocal.mock.calls.map((c) => c[0].audioExtrasStatus)).toEqual([
      "pending",
      "ready",
    ]);
    expect(onSuccess).toHaveBeenCalledTimes(1);
    expect(convex.live).toHaveLength(0);
  });
});

// ─── failure terminals ──────────────────────────────────────────────────────

describe("a row whose TTS failed", () => {
  it("writes the failure locally, downloads nothing, and stops", async () => {
    const convex = new FakeConvex();
    const { task, updateLocal, onSuccess } = start(convex, "tts-failed");
    await flush();

    convex.push({ audioUrl: "", audioStatus: "failed", audioError: "tts blew up" });
    await task;

    expect(updateLocal).toHaveBeenCalledTimes(1);
    expect(updateLocal).toHaveBeenCalledWith({
      audioStatus: "failed",
      audioError: "tts blew up",
    });
    expect(download).not.toHaveBeenCalled();
    expect(onSuccess).not.toHaveBeenCalled();
    expect(convex.live).toHaveLength(0);
  });

  it("falls back to a generic reason when the row carries none", async () => {
    const convex = new FakeConvex();
    const { task, updateLocal } = start(convex, "tts-failed-bare");
    await flush();

    convex.push({ audioUrl: "", audioStatus: "failed" });
    await task;

    expect(updateLocal).toHaveBeenCalledWith({
      audioStatus: "failed",
      audioError: "TTS failed",
    });
  });
});

describe("a query that throws", () => {
  it("re-watches once, then gives up and disposes both subscriptions", async () => {
    const convex = new FakeConvex();
    convex.throwsLeft = 99;

    const { task, updateLocal } = start(convex, "thrower");
    await task;

    expect(convex.watchQuery).toHaveBeenCalledTimes(2);
    expect(convex.watches).toHaveLength(2);
    expect(convex.live).toHaveLength(0);
    expect(updateLocal).not.toHaveBeenCalled();
  });

  it("carries on normally when the fresh watch reads clean", async () => {
    const convex = new FakeConvex();
    convex.throwsLeft = 1;
    convex.value = { audioUrl: "https://a.m4a" };

    const { task, updateLocal, onSuccess } = start(convex, "recovered");
    await task;

    expect(convex.watchQuery).toHaveBeenCalledTimes(2);
    expect(updateLocal).toHaveBeenCalledTimes(1);
    expect(onSuccess).toHaveBeenCalledTimes(1);
    expect(convex.live).toHaveLength(0);
  });
});

describe("a download that fails", () => {
  it("keeps the subscription and retries the same row a second later", async () => {
    const convex = new FakeConvex();
    download.mockRejectedValueOnce(new Error("network"));

    const { task, updateLocal } = start(convex, "flaky-download");
    await flush();

    convex.push({ audioUrl: "https://a.m4a" });
    await flush();

    expect(download).toHaveBeenCalledTimes(1);
    expect(updateLocal).not.toHaveBeenCalled();
    expect(convex.live).toHaveLength(1);

    await jest.advanceTimersByTimeAsync(1_000);
    await task;

    expect(download).toHaveBeenCalledTimes(2);
    expect(updateLocal).toHaveBeenCalledTimes(1);
    expect(convex.live).toHaveLength(0);
  });
});

// ─── watchdog ───────────────────────────────────────────────────────────────

describe("the watchdog", () => {
  it("gives up after 30s and disposes the subscription", async () => {
    const convex = new FakeConvex();
    const { task, updateLocal } = start(convex, "silent");
    await flush();

    await jest.advanceTimersByTimeAsync(29_000);
    expect(convex.live).toHaveLength(1);

    await jest.advanceTimersByTimeAsync(1_100);
    await task;

    expect(convex.live).toHaveLength(0);
    expect(updateLocal).not.toHaveBeenCalled();
  });

  it("grants the extras phase a fresh budget once the base line lands", async () => {
    const convex = new FakeConvex();
    const { task, updateLocal } = start(convex, "slow-extras");
    await flush();

    convex.push({ audioUrl: "https://a.m4a", audioExtrasStatus: "pending" });
    await flush();

    // Past the base budget, still watching on the extras budget.
    await jest.advanceTimersByTimeAsync(31_000);
    expect(convex.live).toHaveLength(1);
    expect(updateLocal).toHaveBeenCalledTimes(1);

    await jest.advanceTimersByTimeAsync(10_000);
    await task;

    expect(convex.live).toHaveLength(0);
    // The base line stays; the extras patch simply never came.
    expect(updateLocal).toHaveBeenCalledTimes(1);
  });
});

// ─── dedupe ─────────────────────────────────────────────────────────────────

describe("dedupe", () => {
  it("keys on (convexId, localId): one watch per pair, freed once it settles", async () => {
    const convex = new FakeConvex();
    const updateLocal = jest.fn(async (_patch: Patch) => {});
    const params = {
      convexClient: convex as any,
      convexId: "dupe",
      localReminderId: "local-dupe",
      updateLocal,
    };

    const first = hydrateReminderAudio(params);
    const second = hydrateReminderAudio(params);
    await flush();
    expect(convex.watchQuery).toHaveBeenCalledTimes(1);

    // Same Convex row, different local reminder: its own hydration.
    const other = hydrateReminderAudio({ ...params, localReminderId: "local-other" });
    await flush();
    expect(convex.watchQuery).toHaveBeenCalledTimes(2);

    convex.push({ audioUrl: "https://a.m4a" });
    await Promise.all([first, second, other]);
    expect(updateLocal).toHaveBeenCalledTimes(2); // one per local reminder
    expect(convex.live).toHaveLength(0);

    // Settled, so the pair can hydrate again (the startup resume path).
    await hydrateReminderAudio(params);
    expect(convex.watchQuery).toHaveBeenCalledTimes(3);
    expect(updateLocal).toHaveBeenCalledTimes(3);
    expect(convex.live).toHaveLength(0);
  });
});
