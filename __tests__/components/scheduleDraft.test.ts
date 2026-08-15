/**
 * The edit sheet's draft ↔ grid mapping (OLD-99).
 *
 * The sheet itself is untestable here (no renderer in this suite), so every
 * decision it makes about a schedule lives in components/schedule/scheduleDraft
 * and is checked from this side: what the sheet opens with, and what it saves.
 */

import {
  EVERY_N_DAYS_MAX,
  EVERY_N_DAYS_MIN,
  describeDraftDays,
  describeDraftTimes,
  describeGridSubtitle,
  draftFromGrid,
  draftFromReminder,
  formatClock12,
  formatEveryMinutes,
  fromDateString,
  gridFromDraft,
  saveShapeFromDraft,
  toDateString,
  type ScheduleDraft,
} from '../../components/schedule/scheduleDraft';
import { MAX_INTERVAL_MINUTES, MIN_INTERVAL_MINUTES, type GridSchedule } from '../../lib/schedule';

// 2026-08-20 is a Thursday. Tests run with TZ=UTC (jest.config.js).
const NOW = new Date(2026, 7, 20, 10, 0, 0, 0).getTime();

function baseDraft(overrides: Partial<ScheduleDraft> = {}): ScheduleDraft {
  return {
    daysMode: 'everyday',
    weekdays: [],
    everyNDays: EVERY_N_DAYS_MIN,
    date: '2026-08-20',
    timesMode: 'clock',
    times: ['09:00'],
    everyMinutes: 60,
    windowStart: '08:00',
    windowEnd: '22:00',
    ...overrides,
  };
}

describe('draftFromGrid', () => {
  it('reads every days axis back into its mode', () => {
    expect(draftFromGrid({ type: 'grid', days: { kind: 'everyday' }, times: { kind: 'clock', times: ['09:00'] } }, NOW).daysMode)
      .toBe('everyday');

    const weekly = draftFromGrid(
      { type: 'grid', days: { kind: 'weekdays', days: ['mon', 'thu'] }, times: { kind: 'clock', times: ['08:00'] } },
      NOW
    );
    expect(weekly.daysMode).toBe('weekdays');
    expect(weekly.weekdays).toEqual(['mon', 'thu']);

    const everyN = draftFromGrid(
      {
        type: 'grid',
        days: { kind: 'everyNDays', interval: 3, startDate: '2026-08-22' },
        times: { kind: 'clock', times: ['08:00'] },
      },
      NOW
    );
    expect(everyN.daysMode).toBe('everyNDays');
    expect(everyN.everyNDays).toBe(3);
    expect(everyN.date).toBe('2026-08-22');

    const dated = draftFromGrid(
      { type: 'grid', days: { kind: 'date', date: '2026-09-01' }, times: { kind: 'clock', times: ['08:00'] } },
      NOW
    );
    expect(dated.daysMode).toBe('date');
    expect(dated.date).toBe('2026-09-01');
  });

  it('keeps every ring of a multi-time grid', () => {
    const draft = draftFromGrid(
      { type: 'grid', days: { kind: 'weekdays', days: ['thu'] }, times: { kind: 'clock', times: ['08:00', '21:00'] } },
      NOW
    );
    expect(draft.times).toEqual(['08:00', '21:00']);
  });

  it('fills the unused axis with usable defaults', () => {
    // Straight off an interval grid, one tap on "Set times" must land on a real
    // time list, and one tap on "Weekly" must not crash on an empty day set.
    const draft = draftFromGrid(
      {
        type: 'grid',
        days: { kind: 'everyday' },
        times: { kind: 'interval', everyMinutes: 120, windowStart: '09:00', windowEnd: '17:00' },
      },
      NOW
    );
    expect(draft.timesMode).toBe('interval');
    expect(draft.everyMinutes).toBe(120);
    expect(draft.windowStart).toBe('09:00');
    expect(draft.windowEnd).toBe('17:00');
    expect(draft.times).toEqual(['09:00']);
    expect(draft.weekdays).toEqual([]);
    expect(draft.date).toBe('2026-08-20');
  });

  it('carries a bounded recurrence through untouched', () => {
    const until = new Date(2026, 8, 30).getTime();
    const draft = draftFromGrid(
      { type: 'grid', days: { kind: 'everyday' }, times: { kind: 'clock', times: ['09:00'] }, until },
      NOW
    );
    expect(draft.until).toBe(until);
    expect(gridFromDraft(draft, { now: NOW }).until).toBe(until);
  });
});

describe('draftFromReminder', () => {
  it('prefers the stored grid', () => {
    const schedule: GridSchedule = {
      type: 'grid',
      days: { kind: 'weekdays', days: ['mon', 'wed'] },
      times: { kind: 'clock', times: ['07:30', '19:30'] },
    };
    const draft = draftFromReminder({ schedule, frequency: 'once', time: '05:00' }, NOW);
    expect(draft.daysMode).toBe('weekdays');
    expect(draft.times).toEqual(['07:30', '19:30']);
  });

  it('derives one from the legacy fields when a reminder predates the grid', () => {
    const draft = draftFromReminder(
      { frequency: 'custom', time: '08:00', days: ['fri', 'mon'] },
      NOW
    );
    expect(draft.daysMode).toBe('weekdays');
    expect(draft.weekdays).toEqual(['mon', 'fri']); // calendar order, not spoken order
    expect(draft.times).toEqual(['08:00']);
  });
});

describe('gridFromDraft', () => {
  it('builds the days axis the mode asks for', () => {
    expect(gridFromDraft(baseDraft(), { now: NOW }).days).toEqual({ kind: 'everyday' });

    expect(
      gridFromDraft(baseDraft({ daysMode: 'weekdays', weekdays: ['thu', 'mon'] }), { now: NOW }).days
    ).toEqual({ kind: 'weekdays', days: ['mon', 'thu'] });

    expect(
      gridFromDraft(baseDraft({ daysMode: 'everyNDays', everyNDays: 3 }), { now: NOW }).days
    ).toEqual({ kind: 'everyNDays', interval: 3, startDate: '2026-08-20' });

    expect(
      gridFromDraft(baseDraft({ daysMode: 'date', date: '2026-09-01' }), { now: NOW }).days
    ).toEqual({ kind: 'date', date: '2026-09-01' });
  });

  it('treats an empty weekday set and every-1-days as every day', () => {
    expect(gridFromDraft(baseDraft({ daysMode: 'weekdays', weekdays: [] }), { now: NOW }).days)
      .toEqual({ kind: 'everyday' });
    expect(gridFromDraft(baseDraft({ daysMode: 'everyNDays', everyNDays: 1 }), { now: NOW }).days)
      .toEqual({ kind: 'everyday' });
  });

  it('sorts, dedupes and never empties the clock list', () => {
    expect(gridFromDraft(baseDraft({ times: ['21:00', '08:00', '08:00'] }), { now: NOW }).times)
      .toEqual({ kind: 'clock', times: ['08:00', '21:00'] });
    expect(gridFromDraft(baseDraft({ times: [] }), { now: NOW }).times)
      .toEqual({ kind: 'clock', times: ['09:00'] });
  });

  it('clamps the interval and repairs a backwards window', () => {
    const tight = gridFromDraft(
      baseDraft({ timesMode: 'interval', everyMinutes: 1 }),
      { now: NOW }
    ).times;
    expect(tight).toEqual({
      kind: 'interval',
      everyMinutes: MIN_INTERVAL_MINUTES,
      windowStart: '08:00',
      windowEnd: '22:00',
    });

    const huge = gridFromDraft(
      baseDraft({ timesMode: 'interval', everyMinutes: 99999 }),
      { now: NOW }
    ).times;
    expect(huge).toMatchObject({ everyMinutes: MAX_INTERVAL_MINUTES });

    const backwards = gridFromDraft(
      baseDraft({ timesMode: 'interval', windowStart: '22:00', windowEnd: '08:00' }),
      { now: NOW }
    ).times;
    expect(backwards).toMatchObject({ windowStart: '08:00', windowEnd: '22:00' });
  });

  it('keeps a dated interval dated', () => {
    // The generic field-guesser collapses "once + interval" to every day; the
    // sheet knows better because the user picked both axes explicitly.
    const grid = gridFromDraft(
      baseDraft({ daysMode: 'date', date: '2026-09-01', timesMode: 'interval', everyMinutes: 120 }),
      { now: NOW }
    );
    expect(grid.days).toEqual({ kind: 'date', date: '2026-09-01' });
    expect(grid.times).toMatchObject({ kind: 'interval', everyMinutes: 120 });
  });

  it('stamps the timezone it is given', () => {
    expect(gridFromDraft(baseDraft(), { now: NOW, tzid: 'Asia/Riyadh' }).tzid).toBe('Asia/Riyadh');
  });
});

describe('saveShapeFromDraft', () => {
  it('projects the legacy columns out of the grid', () => {
    const save = saveShapeFromDraft(
      baseDraft({ daysMode: 'weekdays', weekdays: ['thu'], times: ['08:00', '21:00'] }),
      { now: NOW, tzid: 'UTC' }
    );

    // "Thursday 8 and 9" is ONE reminder: `time` is only the first ring, the
    // second exists solely inside the grid.
    expect(save.time).toBe('08:00');
    expect(save.frequency).toBe('custom');
    expect(save.days).toEqual(['thu']);
    expect(save.schedule.times).toEqual({ kind: 'clock', times: ['08:00', '21:00'] });
    expect(save.date).toBeUndefined();
    expect(save.intervalMs).toBeUndefined();
    expect(save.intervalDays).toBeUndefined();
    expect(save.scheduleType).toBe('rrule');
    expect(save.tzid).toBe('UTC');
  });

  it('saves a dated one-off as once + date', () => {
    const save = saveShapeFromDraft(baseDraft({ daysMode: 'date', date: '2026-09-01' }), { now: NOW });
    expect(save.frequency).toBe('once');
    expect(save.date).toBe('2026-09-01');
    expect(save.days).toEqual([]);
    expect(save.scheduleType).toBe('once');
    expect(save.onceAt).toBe(new Date(2026, 8, 1, 9, 0, 0, 0).getTime());
  });

  it('saves every-N-days as daily + intervalDays', () => {
    const save = saveShapeFromDraft(
      baseDraft({ daysMode: 'everyNDays', everyNDays: 3 }),
      { now: NOW }
    );
    expect(save.frequency).toBe('daily');
    expect(save.intervalDays).toBe(3);
    expect(save.schedule.days).toEqual({ kind: 'everyNDays', interval: 3, startDate: '2026-08-20' });
  });

  it('anchors an interval to the opening of its window', () => {
    const save = saveShapeFromDraft(
      baseDraft({ timesMode: 'interval', everyMinutes: 120, windowStart: '09:00', windowEnd: '17:00' }),
      { now: NOW }
    );
    expect(save.frequency).toBe('interval');
    expect(save.intervalMs).toBe(120 * 60 * 1000);
    expect(save.anchorAt).toBe(new Date(2026, 7, 20, 9, 0, 0, 0).getTime());
    expect(save.scheduleType).toBe('interval');
    expect(save.time).toBe('09:00'); // legacy readers land on the window's start
    expect(save.days).toEqual([]);
  });

  it('round-trips a saved schedule back into the same draft', () => {
    const draft = baseDraft({ daysMode: 'weekdays', weekdays: ['mon', 'thu'], times: ['08:00', '21:00'] });
    const save = saveShapeFromDraft(draft, { now: NOW });
    const reopened = draftFromReminder({ schedule: save.schedule }, NOW);

    expect(reopened.daysMode).toBe('weekdays');
    expect(reopened.weekdays).toEqual(['mon', 'thu']);
    expect(reopened.times).toEqual(['08:00', '21:00']);
    expect(gridFromDraft(reopened, { now: NOW })).toEqual(gridFromDraft(draft, { now: NOW }));
  });

  it('clamps an every-N-days beyond the stepper range', () => {
    const save = saveShapeFromDraft(
      baseDraft({ daysMode: 'everyNDays', everyNDays: 999 }),
      { now: NOW }
    );
    expect(save.intervalDays).toBe(EVERY_N_DAYS_MAX);
  });
});

describe('labels', () => {
  it('formats a clock time in 12-hour', () => {
    expect(formatClock12('08:00')).toBe('8:00 am');
    expect(formatClock12('00:30')).toBe('12:30 am');
    expect(formatClock12('12:00')).toBe('12:00 pm');
    expect(formatClock12('21:05')).toBe('9:05 pm');
  });

  it('formats an interval', () => {
    expect(formatEveryMinutes(45)).toBe('45 min');
    expect(formatEveryMinutes(120)).toBe('2 hr');
    expect(formatEveryMinutes(90)).toBe('1 hr 30 min');
  });

  it('describes each days mode', () => {
    expect(describeDraftDays(baseDraft())).toBe('Every day');
    expect(describeDraftDays(baseDraft({ daysMode: 'weekdays', weekdays: ['thu', 'mon'] })))
      .toBe('Mon, Thu');
    expect(describeDraftDays(baseDraft({ daysMode: 'weekdays', weekdays: [] }))).toBe('Pick days');
    expect(describeDraftDays(baseDraft({ daysMode: 'everyNDays', everyNDays: 3 })))
      .toBe('Every 3 days');
    expect(describeDraftDays(baseDraft({ daysMode: 'date', date: null }))).toBe('Pick a date');
  });

  it('describes the times axis without running off the row', () => {
    expect(describeDraftTimes(baseDraft({ times: ['08:00'] }))).toBe('8:00 am');
    expect(describeDraftTimes(baseDraft({ times: ['08:00', '21:00'] }))).toBe('8:00 am, 9:00 pm');
    expect(describeDraftTimes(baseDraft({ times: ['08:00', '13:00', '21:00'] }))).toBe('8:00 am +2');
    expect(describeDraftTimes(baseDraft({ timesMode: 'interval', everyMinutes: 120 })))
      .toBe('Every 2 hr');
  });

  it('describes a grid for the card subtitle', () => {
    expect(
      describeGridSubtitle({
        type: 'grid',
        days: { kind: 'weekdays', days: ['mon', 'thu'] },
        times: { kind: 'clock', times: ['08:00', '21:00'] },
      })
    ).toBe('08:00, 21:00 · Mon, Thu');

    expect(
      describeGridSubtitle({
        type: 'grid',
        days: { kind: 'everyday' },
        times: { kind: 'clock', times: ['08:00', '12:00', '16:00', '20:00'] },
      })
    ).toBe('08:00, 12:00 +2 · Daily');

    expect(
      describeGridSubtitle({
        type: 'grid',
        days: { kind: 'everyNDays', interval: 3, startDate: '2026-08-20' },
        times: { kind: 'clock', times: ['09:00'] },
      })
    ).toBe('09:00 · Every 3 days');

    // A one-off says its time; the card is already filed under its day.
    expect(
      describeGridSubtitle({
        type: 'grid',
        days: { kind: 'date', date: '2026-09-01' },
        times: { kind: 'clock', times: ['09:00'] },
      })
    ).toBe('09:00');

    expect(
      describeGridSubtitle({
        type: 'grid',
        days: { kind: 'everyday' },
        times: { kind: 'interval', everyMinutes: 120, windowStart: '08:00', windowEnd: '22:00' },
      })
    ).toBe('Every 2 hr · 08:00–22:00');
  });
});

describe('date strings', () => {
  it('round-trips a local date', () => {
    const date = new Date(2026, 7, 20);
    expect(toDateString(date)).toBe('2026-08-20');
    expect(fromDateString('2026-08-20')?.getTime()).toBe(date.getTime());
  });

  it('rejects a date that is not on the calendar', () => {
    expect(fromDateString('2026-02-31')).toBeNull();
    expect(fromDateString('nope')).toBeNull();
    expect(fromDateString(null)).toBeNull();
  });
});
