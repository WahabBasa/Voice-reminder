# CL-3: JS — ladder scheduling, reconcile, variant-wav staging, dedup fix

**Read first:** `docs/cadence-ladder-prd.md` (frozen contract). Current single-alarm flow:
`lib/notifications.ts` (scheduling + reconcile + gap_resync), `lib/alarmKit.ts` (bridge
API + appKey helpers), `lib/alarmSounds.ts` (wav staging), `lib/audioHydration.ts`,
`lib/notificationDecisions.ts` (tier/replay policy mirror).

## Problem

iOS schedules one AlarmKit alarm per occurrence. The cadence ladder needs 1–3 staggered
sibling alarms per occurrence (tier-dependent), each with its own variant wav — plus the
in-flight double-schedule race fixed first, since 3× alarms triples that bug.

## Owns (do not touch other files)

- `lib/notifications.ts`, `lib/alarmKit.ts`, `lib/alarmSounds.ts`,
  `lib/audioHydration.ts`, `lib/notificationDecisions.ts`
- Test files under `__tests__/` covering these modules

## Tasks

- [ ] **Dedup first** (separate commit-sized change): in-flight de-dup keyed by appKey in
      the AlarmKit schedule path — gap_resync racing create must never register the same
      appKey twice (2026-08-07 devlog). Regression test with two concurrent calls.
- [ ] Ladder policy in `lib/notificationDecisions.ts`: rung count from the tier (mirror
      `variantCountForTier` exactly), plus exported `LADDER_OFFSETS_MS = [0, 3, 7]min` and
      `LADDER_OFFSETS_PERSISTENT_MS = [0, 2, 5]min` per PRD. One place, no magic numbers.
- [ ] Scheduling: per occurrence, schedule rung k at its offset with its own appKey
      (`alarmAppKey(reminderId, rungFireTime)` — scheme unchanged), metadata `rung`,
      `rungCount`, `siblings` (other rungs' appKeys, never follow-up keys), and the rung's
      sound per PRD (rung 0 base wav, rung k variant k−1 wav, fallback base wav).
- [ ] Staging: hydrate + place variant wavs as `reminder_<id>_v<k>.wav` via the existing
      `lib/alarmSounds.ts` machinery (`variantWavUrls` from CL-1's queries); remove them
      in every path that removes the base wav today (delete, audio refresh).
- [ ] Cancel/acknowledge: every path that cancels an occurrence's alarm (in-app Done,
      delete reminder, reschedule, audio refresh) cancels ALL rungs. Reconcile/gap_resync
      expects the full expected-set of rungs for the next occurrence — missing rungs get
      scheduled, stray rungs cancelled, snooze-guard behavior (guard 3) preserved.
- [ ] Event-log drain: handle the sibling-cancel events CL-2 emits (at minimum, don't
      treat them as unknown/error; update local state so reconcile doesn't resurrect
      cancelled rungs).
- [ ] Android untouched: every new branch iOS-gated exactly like the existing AlarmKit
      branches; Notifee replay-ladder behavior byte-identical.
- [ ] Tests: ladder expansion math (tier → rung times/keys/sounds), dedup race, cancel
      fan-out, reconcile with partial ladders, Android no-op gating.

## Acceptance

- `npx.cmd tsc --noEmit` clean; full jest suite passes (508 baseline + new).
- Scheduling an urgent reminder yields 3 registered appKeys at T/T+3/T+7 with correct
  sounds and sibling metadata; Done via the in-app path cancels all three.
- Two concurrent schedule calls for one appKey register exactly one alarm.

## Out of scope

Server wav generation (CL-1). Native intent changes (CL-2 — you produce the metadata it
consumes). Gap tuning. Convex deploy, EAS builds.
