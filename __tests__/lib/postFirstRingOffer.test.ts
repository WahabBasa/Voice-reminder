/**
 * The one-time trial offer after the first ring (lib/postFirstRingOffer.ts).
 *
 * The purchases, notifications and AlarmKit bridges are faked. Covers: shown
 * exactly once (and still once after a restart), only to a confirmed free user,
 * never while something is on screen or an alarm is ringing, and both ring
 * paths (overlay close, AlarmKit reconcile → foreground check).
 */
const mockReadProStatus = jest.fn(async (): Promise<string> => "free");
const mockGetPendingAlarm = jest.fn(async (): Promise<any> => null);
const mockGetAlarmStates = jest.fn(async (): Promise<any[]> => []);

jest.mock("../../lib/purchases", () => ({
  readProStatus: () => mockReadProStatus(),
}));
jest.mock("../../lib/notifications", () => ({
  getPendingAlarm: () => mockGetPendingAlarm(),
}));
jest.mock("../../lib/alarmKit", () => ({
  getAlarmStates: () => mockGetAlarmStates(),
}));
jest.mock("../../lib/vrLog", () => ({ vrLog: jest.fn() }));

type Offer = typeof import("../../lib/postFirstRingOffer");

// A "fresh launch": the in-memory caches go, the AsyncStorage mock stays.
function loadOffer(): Offer {
  const mod: Offer = require("../../lib/postFirstRingOffer");
  mod.__resetPostFirstRingOfferForTests();
  return mod;
}

function storage() {
  return require("@react-native-async-storage/async-storage").default;
}

const calm = () => null;

beforeEach(() => {
  storage()._reset();
  mockReadProStatus.mockReset().mockResolvedValue("free");
  mockGetPendingAlarm.mockReset().mockResolvedValue(null);
  mockGetAlarmStates.mockReset().mockResolvedValue([]);
});

describe("show-once", () => {
  it("does nothing before any reminder has rung", async () => {
    const offer = loadOffer();
    const open = jest.fn();
    expect(await offer.maybeShowPostFirstRingOffer({ reason: "home_focus", blocker: calm, open })).toBe("no_ring");
    expect(open).not.toHaveBeenCalled();
  });

  it("opens once after the first ring, then never again", async () => {
    const offer = loadOffer();
    const open = jest.fn();
    await offer.noteRing("overlay");
    expect(await offer.maybeShowPostFirstRingOffer({ reason: "a", blocker: calm, open })).toBe("shown");
    expect(await offer.maybeShowPostFirstRingOffer({ reason: "b", blocker: calm, open })).toBe("already_shown");
    expect(open).toHaveBeenCalledTimes(1);
  });

  it("stays shown across an app restart (persisted flag)", async () => {
    const first = loadOffer();
    await first.noteRing("alarmkit");
    await first.maybeShowPostFirstRingOffer({ reason: "a", blocker: calm, open: jest.fn() });

    const second = loadOffer();
    const open = jest.fn();
    await second.noteRing("alarmkit");
    expect(await second.maybeShowPostFirstRingOffer({ reason: "b", blocker: calm, open })).toBe("already_shown");
    expect(open).not.toHaveBeenCalled();
  });

  it("remembers the ring across a restart, so the offer can land later", async () => {
    await loadOffer().noteRing("alarmkit");
    const open = jest.fn();
    expect(await loadOffer().maybeShowPostFirstRingOffer({ reason: "launch", blocker: calm, open })).toBe("shown");
    expect(open).toHaveBeenCalledTimes(1);
  });

  it("does not open when the shown flag cannot be written", async () => {
    const offer = loadOffer();
    await offer.noteRing("overlay");
    storage().setItem.mockImplementationOnce(async () => {
      throw new Error("disk full");
    });
    const open = jest.fn();
    expect(await offer.maybeShowPostFirstRingOffer({ reason: "a", blocker: calm, open })).toBe("storage_failed");
    expect(open).not.toHaveBeenCalled();
  });

  it("ignores a second check while the first is still in flight", async () => {
    const offer = loadOffer();
    await offer.noteRing("overlay");
    const open = jest.fn();
    const [a, b] = await Promise.all([
      offer.maybeShowPostFirstRingOffer({ reason: "a", blocker: calm, open }),
      offer.maybeShowPostFirstRingOffer({ reason: "b", blocker: calm, open }),
    ]);
    expect([a, b].sort()).toEqual(["busy", "shown"]);
    expect(open).toHaveBeenCalledTimes(1);
  });
});

describe("non-Pro gate", () => {
  it("never shows to a Pro user, and does not burn the one shot", async () => {
    const offer = loadOffer();
    await offer.noteRing("overlay");
    mockReadProStatus.mockResolvedValueOnce("pro");
    const open = jest.fn();
    expect(await offer.maybeShowPostFirstRingOffer({ reason: "a", blocker: calm, open })).toBe("pro");
    expect(open).not.toHaveBeenCalled();
  });

  it("skips silently when the status is unknown, then shows once it is free", async () => {
    const offer = loadOffer();
    await offer.noteRing("overlay");
    mockReadProStatus.mockResolvedValueOnce("unknown");
    const open = jest.fn();
    expect(await offer.maybeShowPostFirstRingOffer({ reason: "a", blocker: calm, open })).toBe("status_unknown");
    expect(open).not.toHaveBeenCalled();
    expect(await offer.maybeShowPostFirstRingOffer({ reason: "b", blocker: calm, open })).toBe("shown");
    expect(open).toHaveBeenCalledTimes(1);
  });
});

describe("never at a busy moment", () => {
  it.each(["recording", "consent_card", "composer", "permission_prompt"])(
    "is blocked while %s is on screen, and retries later",
    async (what) => {
      const offer = loadOffer();
      await offer.noteRing("overlay");
      const open = jest.fn();
      expect(await offer.maybeShowPostFirstRingOffer({ reason: "a", blocker: () => what, open })).toBe("blocked");
      expect(open).not.toHaveBeenCalled();
      expect(await offer.maybeShowPostFirstRingOffer({ reason: "b", blocker: calm, open })).toBe("shown");
    }
  );

  it("is blocked if the recorder opened while the entitlement was being read", async () => {
    const offer = loadOffer();
    await offer.noteRing("overlay");
    let blocker: string | null = null;
    mockReadProStatus.mockImplementationOnce(async () => {
      blocker = "recording";
      return "free";
    });
    const open = jest.fn();
    expect(await offer.maybeShowPostFirstRingOffer({ reason: "a", blocker: () => blocker, open })).toBe("blocked");
    expect(open).not.toHaveBeenCalled();
  });

  it("waits while the overlay alarm is still unresolved", async () => {
    const offer = loadOffer();
    await offer.noteRing("overlay");
    mockGetPendingAlarm.mockResolvedValueOnce({ notification: { id: "n1" }, storedAt: 1 });
    const open = jest.fn();
    expect(await offer.maybeShowPostFirstRingOffer({ reason: "a", blocker: calm, open })).toBe("ringing");
    expect(open).not.toHaveBeenCalled();
  });

  it("waits while an AlarmKit alarm is alerting", async () => {
    const offer = loadOffer();
    await offer.noteRing("alarmkit");
    mockGetAlarmStates.mockResolvedValueOnce([{ state: "alerting", reminderId: "r1" }]);
    const open = jest.fn();
    expect(await offer.maybeShowPostFirstRingOffer({ reason: "a", blocker: calm, open })).toBe("ringing");
    expect(open).not.toHaveBeenCalled();
  });

  it("treats a bridge that throws as ringing (try again later)", async () => {
    const offer = loadOffer();
    await offer.noteRing("alarmkit");
    mockGetAlarmStates.mockRejectedValueOnce(new Error("bridge down"));
    expect(await offer.maybeShowPostFirstRingOffer({ reason: "a", blocker: calm, open: jest.fn() })).toBe("ringing");
  });
});

describe("ring paths", () => {
  // Home's listener, as app/index.tsx wires it (minus the settle delay).
  function homeListener(offer: Offer, open: jest.Mock, blocker: () => string | null = calm) {
    const results: Promise<string>[] = [];
    const unsubscribe = offer.subscribeOfferCheck((reason) => {
      results.push(offer.maybeShowPostFirstRingOffer({ reason, blocker, open }));
    });
    return { results, unsubscribe };
  }

  it("overlay: the overlay shows (ring noted), the user taps Done, the overlay asks Home to check", async () => {
    const offer = loadOffer();
    const open = jest.fn();
    const home = homeListener(offer, open);

    // While it rings: the pending alarm is unresolved.
    mockGetPendingAlarm.mockResolvedValue({ notification: { id: "n1" }, storedAt: 1 });
    await offer.noteRing("overlay");
    offer.requestOfferCheck("tick");
    expect(await home.results[0]).toBe("ringing");

    // Done tapped: resolved, overlay closed.
    mockGetPendingAlarm.mockResolvedValue({ notification: { id: "n1" }, storedAt: 1, resolvedAt: 2 });
    offer.requestOfferCheck("overlay_closed");
    expect(await home.results[1]).toBe("shown");
    expect(open).toHaveBeenCalledTimes(1);
    home.unsubscribe();
  });

  it("AlarmKit: a ring answered in the system UI shows the offer on the next foreground check", async () => {
    // reconcileRings notes the ring while the app is in the background.
    await loadOffer().noteRing("alarmkit");

    // Next launch/foreground on Home.
    const offer = loadOffer();
    const open = jest.fn();
    const home = homeListener(offer, open);
    offer.requestOfferCheck("foreground");
    expect(await home.results[0]).toBe("shown");
    expect(open).toHaveBeenCalledTimes(1);

    offer.requestOfferCheck("foreground");
    expect(await home.results[1]).toBe("already_shown");
    home.unsubscribe();
  });

  it("an unsubscribed (blurred) Home is not asked", async () => {
    const offer = loadOffer();
    const open = jest.fn();
    const home = homeListener(offer, open);
    home.unsubscribe();
    await offer.noteRing("overlay");
    offer.requestOfferCheck("overlay_closed");
    expect(home.results).toHaveLength(0);
  });

  it("noteRing is idempotent and survives a storage failure", async () => {
    const offer = loadOffer();
    storage().setItem.mockImplementationOnce(async () => {
      throw new Error("disk full");
    });
    await expect(offer.noteRing("overlay")).resolves.toBeUndefined();
    await offer.noteRing("overlay");
    await offer.noteRing("overlay");
    const ringWrites = storage().setItem.mock.calls.filter((c: string[]) => c[0].includes("rang"));
    expect(ringWrites).toHaveLength(2); // the failed one, then one success
  });
});
