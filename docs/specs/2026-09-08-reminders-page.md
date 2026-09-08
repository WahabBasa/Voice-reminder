# Spec: Reminders page (flat active list, Android-alarms style) + Days red dots + today marker

Date: 2026-09-08. Status: AGREED (user go). Two Codex rounds (gpt-6-astra, medium) on the
membership/resolver; layout revised by the user afterwards to a flat list.
Origin: device tape 2026-09-08 07:04 showed three voice takes -> three reminders created and
scheduled correctly; they left the date-pure Today page immediately and read as "lost".

## User decisions

1. Page 1 is renamed **Reminders**. It is a **flat list of every active reminder**, sorted by
   whichever rings next. **No section headers** (no Overdue / Today / Upcoming).
   Active = `isReminderActive` (`statusOf !== "done"`, lib/reminderActive.ts:86) — the same rule
   the free cap counts (lib/store.ts:179, lib/usage.ts:24), so the page and the cap agree.
   - One-off: leaves the page when ticked done or deleted. Rang-and-unticked (overdue) **stays**,
     marked with a small red dot on the card and its original date/time.
   - Repeater: stays until deleted; ticking today's instance advances the card to its next instance.
2. Each card shows (a) **when it fires next**, relative: "Next in 4 hours", "Tomorrow · 7:00 am",
   "Next in 6 days"; overdue one-off: "Overdue · Sep 8 · 6:00 pm"; snoozed: "Rings again 3:52 pm";
   and (b) **its pattern**: "Every Mon, Wed, Fri · 9:00 am", "Daily · 9:00 pm", "Every 2 hr ·
   08:00–22:00", or for a one-off its date+time "Sep 21 · 9:00 am".
3. **Tick circle** only on cards whose next instance is today or overdue. Later cards have no
   circle; tap opens the detail sheet; delete unchanged.
4. Page 2 **Days**: per-day lists, opens on today, resets on leave — unchanged. **Remove the
   activity dots** under the week-strip days (and in MonthSheet). Add a **single red dot** on any
   day that has an overdue one-off dated that day (no count). Overdue reminders are listed on their
   day as now.
5. Days week strip: the blue **today** mark is independent of selection and always renders under
   today; the **selected** day gets a separate neutral treatment. Both render when they coincide.
   MonthSheet gets the same two marks. "Pinned" = independent marking; today is not forced visible
   when browsing another week.
6. Out of scope: repeat-until-date, i18n/Arabic relative words, renaming "Completed today",
   DST/timezone-travel history bounds, multi-ring completion semantics, memo caches.

## lib/remindersMembership.ts (new, pure)

```ts
export type SnoozeSnapshot = Readonly<Record<string, number>>;          // reminderId -> snoozeUntil ms
export type DisplayDue = { at: number | null; source: "snooze" | "grid" | "legacy" | "unknown" };
export type ActiveCard = {
  reminder: Reminder;
  due: DisplayDue;
  overdue: boolean;          // unsnoozed one-off with at <= nowMs
  dueToday: boolean;         // at falls on today's local date (and not overdue)
  showCompletion: boolean;   // overdue || dueToday
};

export function nextDisplayDue(reminder, history, nowMs, snoozes): DisplayDue;
export function activeCards(reminders, history, nowMs, snoozes): ActiveCard[];   // sorted
export function nextLine(card: ActiveCard, nowMs, options?: ClockFormatOptions): string;   // (a) above
export function patternLine(reminder: Reminder, options?: ClockFormatOptions): string;     // (b) above
export function overdueDays(reminders, history, nowMs): Set<string>;   // ISO dates with an overdue one-off
```

Resolver order, once per active reminder:

1. **Snooze wins**: `snoozes[id] > nowMs` -> `{at: snoozeUntil, source: "snooze"}`.
2. **Reference time**: completed today (`hasCompletedToday`) -> tomorrow's local midnight **minus 1 ms**
   (grid lookup is strictly-after; exact midnight would skip a 00:00 ring). Otherwise `nowMs`.
3. **Grid present** (`reminder.schedule`): `nextGridOccurrence(schedule, reference)`. Null on a one-off
   -> its original local due timestamp. Null on a repeater -> `{at: null, source: "unknown"}`;
   the card is **kept** with "No next ring scheduled", never dropped.
4. **No grid**: `getReminderNextDueTimestamp(reminder, history, reference)`; non-finite -> null.

Sort: overdue first (earliest ring first), then ascending `at`, nulls last, reminder id tie-break.
Invariant: every active reminder appears exactly once. Completed-today footer unchanged: a ticked
one-off appears only there; a ticked repeater appears in the list (advanced) **and** there.

`overdueDays`: for each reminder with `statusOf === "overdue"`, the local ISO date of
`overdueRingTime(reminder, history, nowMs)` (lib/todayMembership.ts).

Text: English, reuse existing helpers only — `formatNextIn` (lift from DaysPage into lib/time.ts
or the new module), `formatClockAt`, `describeGridSubtitle`, `formatEveryMinutes`,
`overdueSubtitle`. Relative rule for line (a): < 24 h -> "Next in X min/hours"; tomorrow ->
"Tomorrow · 7:00 am"; 2–6 days -> "Next in N days" (or weekday name — builder picks one and keeps
it consistent); beyond -> "Sep 21 · 9:00 am".

## Page 1 rendering (app/index.tsx)

- One FlatList of `ActiveCard`, keys `reminder:${id}`. PendingTakeCard(s) stay in the list header;
  `CompletedSection` stays in the footer, unchanged. `OverdueSection` no longer rendered on page 1
  (keep the component if Days or tests use it; otherwise delete it and its test).
- `ReminderListItem` gains: `showCompletion?: boolean` (default true), a second text line for the
  pattern (`detail?: string`) rendered under the existing subtitle, and `overdueDot?: boolean`
  rendering a small `colors.statusOverdue` dot near the title. Existing callers unaffected.
- Refresh routine (replaces the ad-hoc 30 s tick at ~295-301): recompute `nowMs` and the snooze
  snapshot on focus, every 30 s, and on AppState -> active. Snooze snapshot via the same source
  DaysPage uses (`getSnoozeUntil`/`refreshSnoozeWindows`, lib/alarmKit.ts).
- On pending-take reconcile (~1215-1217): after the store commit lands, `scrollToIndex` the new
  card once with `viewPosition` ~0.3, guarded by `onScrollToIndexFailed`.
- Header title "Reminders" (~1655); keep the date subheading. BottomBar: explicit accessibility
  labels incl. "Reminders". Date-denoting "Today" strings elsewhere stay.
- `lib/todayMembership.ts` stays as-is (Days and its tests still use it).

## Days

- WeekStrip.tsx: drop `dotCounts`/activity dots; new prop `overdueDates: ReadonlySet<string>`
  -> single red dot. Accent bar under `dateISO === todayDate` always; selected day uses the
  existing neutral selected background plus a heavier neutral underline.
- MonthSheet.tsx: same — remove activity dots, add red dot for overdue days, independent today
  mark outside the selection fill.
- DaysPage.tsx: pass `overdueDays(...)` instead of `activityDotCounts`. Day lists, DayPager,
  reset-on-leave: untouched. `activityDotCount(s)` in lib/dayOccurrences.ts: delete if now unused
  (and their tests), else leave.

## Tests

- `__tests__/lib/remindersMembership.test.ts`: tomorrow-first repeater created mid-day -> not
  dueToday, no completion; today passed unsnoozed one-off -> overdue, first in sort, red dot;
  same snoozed -> not overdue, dueToday, "Rings again"; completed-today repeater -> tomorrow;
  grid two-times one passed -> dueToday with the later time in nextLine; interval outside window
  -> next window date; midnight tick flips a tomorrow card to dueToday; partition fuzz (generated
  set: card ids == active ids, no duplicates, sorted); null-grid repeater kept with "No next ring
  scheduled"; `overdueDays` returns the ring's local date and nothing for ticked one-offs.
- `__tests__/components/weekStrip.test.tsx`: today mark renders while another date is selected;
  red dot renders only for dates in `overdueDates`.
- Existing `todayMembership` and `dayOccurrences` tests stay green (minus any deleted dot tests).
- jest.config.js per-file thresholds kept; add entries for new files per convention.

## Gates

`npx.cmd tsc --noEmit`; `npm.cmd run test:coverage` (exit 1 on Windows is expected; judge by the
printed summary). JS-only: ships as an OTA on the production branch, no Convex push.
