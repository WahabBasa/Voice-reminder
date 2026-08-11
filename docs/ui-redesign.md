# UI Redesign — Today / Days / Settings (Aug 2026)

Design contract for the home-experience redesign. Grilled and locked with the user on 2026-08-11.
References: Tiimo (day view header, week strip, edit sheet, card anatomy) and PlanJoy (COMPLETE
section, settings look, bottom bar, activity dots). This doc is the single source of truth —
implement what it says, not what the current code implies.

## Big picture

The app is **three pages navigated by a Tiimo-style floating dock** (revised 2026-08-11 after
first device test — supersedes the original swipe-chain navigation):

```
[ Today ]   [ Days ]   [ Settings ]
   dock + mic on ALL three pages
```

- **Today** — "what I want to remember today." Date-pure daily list.
- **Days** — "what I've set up." Browse any calendar day with a week strip. Horizontal swipe
  here flips **days** only. Leaving this page resets it: re-entering always lands on today.
- **Settings** — restyled current settings.

**Dock (all pages):** floating pill with the three tabs; active tab = dark rounded square with
light icon (Tiimo). The round **record button sits anchored bottom-right** beside it. Tapping
record raises the recording drawer as before and hides dock + mic until it closes (same while
the edit sheet is open). Page-switching is dock-only — the outer pager's swipe is disabled.

The old second page (Completed) and any separate history surface **die**. Completed items live
inside each day (collapsible section, see below).

## Gesture map (exact)

| Surface | Horizontal swipe | Dock + mic |
|---|---|---|
| Today | nothing | visible |
| Days | flips calendar day (strip follows) | visible |
| Settings | nothing | visible |

Dock and mic hide while the recording drawer or edit sheet is open.

## Today page

Header (no app name anywhere):

```
Today                        [Get Pro ✦]  ⋯
Tuesday, Aug 11
```

- "Today" in the serif display font (see Tokens); muted full date line under it.
- `Get Pro` pill: reuse existing upgrade-CTA logic; hidden for subscribers.
- No `⋯` menu — multi-select was removed entirely (revised 2026-08-11).
- Below: flat reminder list, then collapsed **COMPLETE** section. Recording flow itself
  unchanged (RecordingOverlay / VoiceMeter / drawer are OUT OF SCOPE — do not touch); its
  entry button lives bottom-right beside the dock.

**Membership rule (date-pure):**
- One-offs dated today: in.
- Daily / weekly / custom-days repeats that hit today: in.
- Interval reminders ("every 2h"): in, as ONE card, subtitle "Every 2h · Next in 25 min"
  (reuse existing `formatIntervalNextIn` / next-due helpers).
- One-offs on other dates: out (that's the Days page).
- Missed items from previous days: out. No guilt surface; the follow-up ladder chases those.

**Sorting:** by next fire time ascending; fired-but-unhandled (overdue today) pinned at top.

**No time-of-day buckets.** Flat list only (explicit user decision).

**Empty state:** silent — no icon, no message, no CTA (revised 2026-08-11). Loading spinner
only while the store loads.

## Days page

Header (Tiimo layout + PlanJoy dots):

```
Tuesday                        AUG 2026 ›
 M    T    W    T    F    S    S
 10  [11]  12   13   14   15   16
      ··         ·         ·
```

- Big serif weekday name top-left, updates as you flip.
- `AUG 2026 ›` top-right opens a compact **month-grid sheet** for long jumps (pick a date →
  pager jumps there).
- Week strip: letters M–S over date numbers; slides week-by-week in sync with day flips; tap a
  day to jump. **Selected day** = filled pill. **Today** = subtle permanent ring/marker even
  when another day is selected.
- **Activity dots** under days that have reminders (cap 3 dots), from the same occurrence logic
  as the list. Days with nothing stay clean.
- No promo cards, no "Anytime" placeholder — strip goes straight into the day's flat list.
- The day's list uses the SAME list component as Today: flat active list + collapsed COMPLETE
  section at bottom. For non-today days, interval reminders show subtitle "Every 2 hours"
  (no "Next in X" — that's today-only).
- Browsed day's COMPLETE section = history entries whose timestamp falls on that day
  (completed AND missed; missed keep the muted/red treatment the old Completed page used).
- Empty day: single muted line "Nothing on this day".

## Reminder card (both pages)

```
┌──────────────────────────────────────────┐
│  (💊)   Take blood pressure meds     ◯  │
│         09:00 · Daily                    │
└──────────────────────────────────────────┘
```

- White card, radius `borderRadius.card` (20), soft shadow.
- **Leading chip**: **rounded-square** pastel chip (radius 14) containing the reminder's emoji
  (`reminder.emoji`) — Tiimo's chip shape (revised 2026-08-11; was circular). Fallback when
  absent: neutral bell icon chip. Chip background color chosen deterministically:
  `chipColors[hash(reminder.id) % chipColors.length]` — stable per reminder forever.
- **Title**: serif (`FONT_DISPLAY`, 17) per the Tiimo reference (revised 2026-08-11; was sans).
  **Subtitle**: sans, time + repeat summary ("09:00 · Daily", "Every 2h · Next in 25 min").
- **Week strip** (Days page): serif numerals; selected day = whole letter+number column in a
  soft gray rounded rect with a short dark bar under the number (Tiimo); today's number in
  accent when not selected; activity dots kept.
- **Right: completion circle** — thin neutral gray ring; tap = complete (today's occurrence for
  repeaters, whole reminder for one-offs) → card drops to COMPLETE with strikethrough. This is
  the PRIMARY completion gesture.
- Swipe-left on card still reveals delete (keep behavior).
- No colored category dots.

**COMPLETE section:** PlanJoy style — collapsed pill header `COMPLETE (n) ⌄` at list bottom,
expands to strikethrough cards.

## Edit sheet (EditReminderSheet)

Tiimo "Edit task" structure, mapped to our fields:

```
[ Title ................. (💊) ]   ← emoji chip on the right, tap to override with emoji picker
  Time         🕘 09:00
  Date         📅 11 Aug 2026        ← ONE-OFFS ONLY (hide for repeats/intervals)
  Repeat       ↻ Daily / M,W,F / Every 2h
  Alarm        (toggle) sub: "Keeps ringing until you respond"   ← maps to `persistent`
  Heads-up     10 min before          ← preReminderMinutes
  Snooze       10 min                 ← snoozeEnabled + snoozeDuration
  ▶ Voice note ————— 0:07             ← plays the original recording (audioUrl); keep existing
                                        playback capability, restyle it as a row
[ 🗑 ]                        [ Done ✓ ]
```

Cut (do not add): Duration, Sub-tasks, Notes, "Start task", urgency control, volume control.
Rows as grouped white cards, PlanJoy/Tiimo spacing, pill-shaped value chips on the right.

## Settings page

- Becomes the third pager page: NO back button; header = big serif "Settings".
- PlanJoy look: grouped white cards, icon + label (+ subtitle) + chevron rows, uppercase
  section labels. Structure (revised 2026-08-11 — see plan.md "Settings Design"): Pro card,
  **General** (address term; "Notifications & alarms" as the ONE notifications entry →
  diagnostics), **About** (Terms of Use → Apple standard EULA), version footer. Pushed
  screens (diagnostics, paywall) keep pushing modally on top.
- Extract content so it can render embedded in the pager (e.g. `embedded` prop or a
  `SettingsContent` component); keep the `/settings` route working.

## Bottom bar

- Floating pill above the home indicator, Days + Settings only. White, radius
  `borderRadius.bar`, soft shadow.
- Three icon items, no labels: today-list glyph / calendar glyph / gear glyph. Active item gets
  a soft filled background. Tap Today-tab → pager snaps to page 0 (bar disappears there).

## Tokens (pin these exactly — parallel agents build against them)

Additions to `lib/theme.ts`:

```ts
// pastel chip palette (deterministic per reminder id)
export const chipColors = [
  "#DFE9DA", // sage
  "#E6E0F4", // lavender
  "#F9E4D9", // peach
  "#F7EED2", // butter
  "#DDEAF6", // sky
  "#F3DFE5", // rose
];

borderRadius: { sm: 8, md: 12, lg: 16, card: 20, sheet: 28, bar: 32, full: 9999 }
```

New `lib/fonts.ts`:

```ts
// Fraunces via @expo-google-fonts/fraunces (JS-bundled asset → OTA-safe; NO config plugin)
export const FONT_DISPLAY = "Fraunces_600SemiBold";
export function useAppFonts(): boolean { /* wraps useFonts */ }
```

Typography rules: serif (`FONT_DISPLAY`) ONLY for page titles ("Today", weekday name,
"Settings") and the edit-sheet title field. Everything else stays system sans. Accent color
stays the existing blue. Background/card colors unchanged (already match references).

## Emoji pipeline

- `Reminder.emoji?: string` (single emoji) added to `lib/store.ts` type + persistence.
- Convex parse actions (`processVoiceReminder`, `processVoiceReminderFast`) ask GPT for one
  fitting emoji as part of the existing parse and return it. Code changes only — do NOT run
  convex deploy; it ships with the next dev session.
- No backfill: existing reminders keep the neutral bell chip forever.

## Out of scope (do not touch)

Record flow (RecordingOverlay, VoiceMeter, drawer animation), alarm/notification scheduling,
AlarmKit bridge, cadence ladder, paywall logic, Convex schema beyond the emoji field,
app.json / plugins / android / ios directories (OTA-safety), devlogs.

---

## Work packages (file ownership is EXCLUSIVE — never edit another package's files)

### WP1 — Tokens + fonts
Owns: `lib/theme.ts`, `lib/fonts.ts` (new), `package.json` (install only).
Do: install `@expo-google-fonts/fraunces` (+ `expo-font` if missing) with `npm.cmd install`
(use `--legacy-peer-deps` if peer-dep errors); add tokens above verbatim; `useAppFonts()`
returning loaded flag.
Done when: tokens/fonts exported exactly as pinned; nothing else changed.

### WP2 — Emoji parse field
Owns: `convex/` (parse actions + any arg validators they need), `lib/store.ts` (type +
persistence of `emoji`).
Done when: parse result carries `emoji`, store round-trips it. No deploy.

### WP3 — Card + list components
Owns: new `components/ReminderListItem.tsx`, new `components/CompletedSection.tsx`.
Build to the card spec (chip, title/subtitle, completion circle, swipe delete) with props:
`{ id, title, emoji?, chipColor, subtitle, completed?, missed?, onPress, onToggleComplete,
onDelete }`. CompletedSection: `{ items, initiallyCollapsed?: true }`. Pure components — no
store wiring (integrator wires). Import tokens by the pinned names.

### WP4 — Days page
Owns: new `components/days/` (DaysPage, WeekStrip, MonthSheet), new `lib/dayOccurrences.ts`
(`occursOnDay(reminder, dateISO)`, `historyOnDay(history, dateISO)`, activity-dot counts —
reuse `lib/time.ts` helpers where possible).
DaysPage self-manages selected date + day-flip pager (may reuse `SwipePager` internally) and
renders via WP3 components. Props: `{ reminders, history, onOpenReminder }`.

### WP5 — Edit sheet + Settings + bottom bar
Owns: `components/EditReminderSheet.tsx`, `app/settings.tsx`, new `components/BottomBar.tsx`.
Edit sheet per spec rows; settings restyle + embeddable content; BottomBar
`{ activeTab: 'today' | 'days' | 'settings', onTab }`.

### WP6 — Integration (runs AFTER WP1–5)
Owns: `app/index.tsx`, `app/_layout.tsx`, route cleanup (`app/history.tsx` links).
Do: rewire home to the three-page pager per the gesture map (page-switch swipe disabled on
Days/Settings — DaysPage owns its own horizontal gesture there); new Today header; render
lists via WP3; mount DaysPage + settings content + BottomBar; load fonts via `useAppFonts` in
`_layout`; pass `emoji` through reminder creation; remove Completed-page pills/links and
history-page links; preserve multi-select, offline banner, upgrade CTA, recording flow, perf
tracing. Run `npx.cmd tsc --noEmit` and fix errors across the repo.

### Acceptance (whole redesign)
- Swipe chain + gesture map behave exactly as the table above.
- Today shows only today (rule above), flat, COMPLETE collapsed below, mic untouched.
- Days flips days with strip + dots + month jump; any day inspectable.
- Cards/edit sheet/settings/bar match specs; serif only at display sizes.
- `npx.cmd tsc --noEmit` clean; app runs OTA-safe (no native config diffs).
