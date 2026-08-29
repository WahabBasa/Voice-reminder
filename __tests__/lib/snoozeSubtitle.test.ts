/**
 * OLD-119: after "Later", the card names the comeback time.
 *
 * The snooze window is written to the AlarmKit guard state by
 * lib/notifications.ts and mirrored in memory by lib/alarmKit so a card can
 * read it while it renders. Both halves are exercised here against the real
 * modules: the mirror is loaded from storage exactly as the app loads it, and
 * subtitleFor is asked what the card says.
 *
 * lib/alarmKit captures the native bridge at module load, so every suite runs
 * inside an isolated module registry with the platform and bridge patched on
 * that registry's react-native copy — the same shape as alarmKitIntegration.
 */
// subtitleFor is exported from the Days page, whose children reach for native
// modules Jest has no answer for (fonts, icons, gesture/animation views). None
// of them takes part in the subtitle, so the import graph is cut here.
jest.mock("../../lib/fonts", () => ({
  FONT_DISPLAY: "Fraunces_600SemiBold",
  FONT_DISPLAY_REGULAR: "Fraunces_400Regular",
  FONT_DISPLAY_MEDIUM: "Fraunces_500Medium",
  useAppFonts: () => true,
}));
jest.mock("../../components/AppIcon", () => ({ __esModule: true, default: () => null }));
jest.mock("../../components/CompletedSection", () => ({ __esModule: true, default: () => null }));
jest.mock("../../components/ReminderListItem", () => ({
  __esModule: true,
  default: () => null,
  chipColorForId: () => "#ffffff",
}));
jest.mock("../../components/days/DayPager", () => ({ __esModule: true, default: () => null }));
jest.mock("../../components/days/MonthSheet", () => ({ __esModule: true, default: () => null }));
jest.mock("../../components/days/WeekStrip", () => ({
  __esModule: true,
  default: () => null,
  weekDatesFor: () => [],
}));

import { NativeModules } from "react-native";
import type { Reminder } from "../../lib/store";

const ALARMKIT_STATE_KEY = "@alarmkit_state";

/** 2026-08-29 15:42 UTC. Tests run with TZ=UTC, so wall clock == UTC here. */
const NOW = Date.UTC(2026, 7, 29, 15, 42);
const MIN = 60_000;
const ID = "abc123";

type Loaded = {
  alarmKit: any;
  subtitleFor: (reminder: Reminder, isToday: boolean, nowMs: number) => string;
  storage: { setItem: (k: string, v: string) => Promise<void> };
};

/**
 * Load lib/alarmKit + the card subtitle with `stored` already in AsyncStorage,
 * shaped the way patchAlarmKitState writes it.
 */
async function withSnoozeState(
  opts: { os?: "ios" | "android"; linked?: boolean; stored?: unknown; raw?: string },
  run: (loaded: Loaded) => Promise<void> | void
): Promise<void> {
  try {
    await jest.isolateModulesAsync(async () => {
      const RN = require("react-native");
      Object.defineProperty(RN.Platform, "OS", {
        value: opts.os ?? "ios",
        configurable: true,
        writable: true,
      });
      if (opts.linked === false) {
        delete RN.NativeModules.AlarmKitBridge;
      } else {
        RN.NativeModules.AlarmKitBridge = { isSupported: jest.fn(async () => true) };
      }

      // The isolated registry hands out its own AsyncStorage mock instance, so
      // the state has to be seeded through that copy.
      const storage = require("@react-native-async-storage/async-storage").default;
      const raw =
        opts.raw ?? (opts.stored === undefined ? undefined : JSON.stringify(opts.stored));
      if (raw !== undefined) await storage.setItem(ALARMKIT_STATE_KEY, raw);

      const alarmKit = require("../../lib/alarmKit");
      const { subtitleFor } = require("../../components/days/DaysPage");
      await run({ alarmKit, subtitleFor, storage });
    });
  } finally {
    delete (NativeModules as any).AlarmKitBridge;
  }
}

function makeReminder(overrides: Partial<Reminder> = {}): Reminder {
  return {
    id: ID,
    title: "Take pills",
    description: "",
    time: "15:42",
    frequency: "daily",
    days: [],
    createdAt: "2026-08-01T00:00:00.000Z",
    ...overrides,
  } as Reminder;
}

/** The card text for a reminder that is not snoozed — either device dial. */
const SCHEDULE_TEXT = ["3:42 pm · Daily", "15:42 · Daily"];

// ─── The mirror ─────────────────────────────────────────────────────────────

describe("snooze window mirror", () => {
  it("answers nothing before the mirror has been loaded", async () => {
    await withSnoozeState({ stored: { [ID]: { snoozeUntil: NOW + 10 * MIN } } }, ({ alarmKit }) => {
      expect(alarmKit.getSnoozeUntil(ID, NOW)).toBeUndefined();
    });
  });

  it("reflects a written window as soon as it is refreshed", async () => {
    await withSnoozeState({}, async ({ alarmKit, storage }) => {
      await alarmKit.refreshSnoozeWindows();
      expect(alarmKit.getSnoozeUntil(ID, NOW)).toBeUndefined();

      // What patchAlarmKitState(reminderId, { snoozeUntil }) leaves behind.
      await storage.setItem(
        ALARMKIT_STATE_KEY,
        JSON.stringify({ [ID]: { snoozeUntil: NOW + 10 * MIN, nagCount: 1 } })
      );
      await alarmKit.refreshSnoozeWindows();

      expect(alarmKit.getSnoozeUntil(ID, NOW)).toBe(NOW + 10 * MIN);
    });
  });

  it("forgets a window the reconciler cleared", async () => {
    await withSnoozeState(
      { stored: { [ID]: { snoozeUntil: NOW + 10 * MIN } } },
      async ({ alarmKit, storage }) => {
        await alarmKit.refreshSnoozeWindows();
        expect(alarmKit.getSnoozeUntil(ID, NOW)).toBe(NOW + 10 * MIN);

        // Completed / rescheduled: the window is zeroed, not deleted.
        await storage.setItem(ALARMKIT_STATE_KEY, JSON.stringify({ [ID]: { snoozeUntil: 0 } }));
        await alarmKit.refreshSnoozeWindows();

        expect(alarmKit.getSnoozeUntil(ID, NOW)).toBeUndefined();
      }
    );
  });

  it("treats a comeback that already rang as no window", async () => {
    await withSnoozeState(
      { stored: { [ID]: { snoozeUntil: NOW - MIN } } },
      async ({ alarmKit }) => {
        await alarmKit.refreshSnoozeWindows();
        expect(alarmKit.getSnoozeUntil(ID, NOW)).toBeUndefined();
        // Still the future a minute earlier.
        expect(alarmKit.getSnoozeUntil(ID, NOW - 2 * MIN)).toBe(NOW - MIN);
      }
    );
  });

  it("says nothing for a reminder with no state, and for unreadable state", async () => {
    await withSnoozeState({ raw: "{not json" }, async ({ alarmKit }) => {
      await alarmKit.refreshSnoozeWindows();
      expect(alarmKit.getSnoozeUntil(ID, NOW)).toBeUndefined();
      expect(alarmKit.getSnoozeUntil("someone-else", NOW)).toBeUndefined();
    });

    await withSnoozeState({ raw: JSON.stringify([1, 2]) }, async ({ alarmKit }) => {
      await alarmKit.refreshSnoozeWindows();
      expect(alarmKit.getSnoozeUntil(ID, NOW)).toBeUndefined();
    });
  });

  it("skips the read entirely where AlarmKit is not linked", async () => {
    await withSnoozeState(
      { os: "android", linked: false, stored: { [ID]: { snoozeUntil: NOW + 10 * MIN } } },
      async ({ alarmKit, storage }) => {
        await alarmKit.refreshSnoozeWindows();
        expect(alarmKit.getSnoozeUntil(ID, NOW)).toBeUndefined();
        expect((storage as any).getItem).not.toHaveBeenCalled();
      }
    );
  });

  it("shares one read between concurrent refreshes", async () => {
    await withSnoozeState(
      { stored: { [ID]: { snoozeUntil: NOW + 10 * MIN } } },
      async ({ alarmKit, storage }) => {
        await Promise.all([alarmKit.refreshSnoozeWindows(), alarmKit.refreshSnoozeWindows()]);
        expect((storage as any).getItem).toHaveBeenCalledTimes(1);
        expect(alarmKit.getSnoozeUntil(ID, NOW)).toBe(NOW + 10 * MIN);
      }
    );
  });

  it("empties on the test seam", async () => {
    await withSnoozeState(
      { stored: { [ID]: { snoozeUntil: NOW + 10 * MIN } } },
      async ({ alarmKit }) => {
        await alarmKit.refreshSnoozeWindows();
        alarmKit.resetSnoozeWindows();
        expect(alarmKit.getSnoozeUntil(ID, NOW)).toBeUndefined();
      }
    );
  });
});

// ─── The card ───────────────────────────────────────────────────────────────

describe("subtitleFor while snoozed", () => {
  it("names the comeback time on today's card", async () => {
    await withSnoozeState(
      { stored: { [ID]: { snoozeUntil: NOW + 10 * MIN } } },
      async ({ alarmKit, subtitleFor }) => {
        await alarmKit.refreshSnoozeWindows();
        expect(["Rings again 3:52 pm", "Rings again 15:52"]).toContain(
          subtitleFor(makeReminder(), true, NOW)
        );
      }
    );
  });

  it("outranks the grid subtitle too", async () => {
    await withSnoozeState(
      { stored: { [ID]: { snoozeUntil: NOW + 10 * MIN } } },
      async ({ alarmKit, subtitleFor }) => {
        await alarmKit.refreshSnoozeWindows();
        const gridded = makeReminder({
          schedule: {
            type: "grid",
            days: { kind: "everyday" },
            times: { kind: "clock", times: ["15:42"] },
          },
        });
        expect(subtitleFor(gridded, true, NOW)).toMatch(/^Rings again /);
      }
    );
  });

  it("goes back to the schedule once the comeback has rung", async () => {
    await withSnoozeState(
      { stored: { [ID]: { snoozeUntil: NOW - MIN } } },
      async ({ alarmKit, subtitleFor }) => {
        await alarmKit.refreshSnoozeWindows();
        expect(SCHEDULE_TEXT).toContain(subtitleFor(makeReminder(), true, NOW));
      }
    );
  });

  it("goes back to the schedule once the window is cleared", async () => {
    await withSnoozeState(
      { stored: { [ID]: { snoozeUntil: 0 } } },
      async ({ alarmKit, subtitleFor }) => {
        await alarmKit.refreshSnoozeWindows();
        expect(SCHEDULE_TEXT).toContain(subtitleFor(makeReminder(), true, NOW));
      }
    );
  });

  it("leaves another day's card alone — the snooze is a thing about today", async () => {
    await withSnoozeState(
      { stored: { [ID]: { snoozeUntil: NOW + 10 * MIN } } },
      async ({ alarmKit, subtitleFor }) => {
        await alarmKit.refreshSnoozeWindows();
        expect(SCHEDULE_TEXT).toContain(subtitleFor(makeReminder(), false, NOW));
      }
    );
  });
});
