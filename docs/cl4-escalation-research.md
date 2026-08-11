# CL-4 Research — AlarmKit escalation on iOS 26 (2026-08-11)

What the native bridge actually does, what Apple's API allows, and the recommended
stop-and-replace design. Produced after the device report "alarm repeats the same line,
no escalation." Tracking: OLD-53.

## How our alarms behave unattended (evidence)

- Bridge config is `VRAlarmScheduler.makeConfiguration` (`plugins/withAlarmKit.js:401-439`):
  alert-only presentation, no countdown/postAlert anywhere, sound baked at schedule time via
  `AlertConfiguration.AlertSound.named(...)`. Buttons: Done (stop intent) / Later (snooze intent).
- **Nothing bounds a ring.** iOS 26.1+ loops the sound file until slide-to-stop. Our WAVs are
  `[spoken line][silence]` padded to 28s (`convex/helpers.ts` ALARM_WAV_TARGET_SECONDS) — so an
  unattended rung sounds like: line, ~20s silence, same line, forever. That is ONE rung looping,
  not a failed ladder. Rung 0 owns the first 3 minutes by design (LADDER_OFFSETS_MS = 0/3min/7min,
  `lib/notificationDecisions.ts:394`).
- `ALARM_RING_TIMEOUT_MS = 180_000` (`lib/alarmKit.ts:65`) enforces nothing on-device — it only
  classifies drained events on next foreground.
- **Bug found:** native never appends a "fired" event (Swift emits only stopped/snoozed/
  sibling_cancelled/snooze_failed), so the missed-classification and missed→follow-up path
  (`lib/notifications.ts:1800-1842`) are unreachable for AlarmKit alarms. An urgent alarm that
  rings out leaves no history entry.

## What iOS 26 AlarmKit allows

- `AlarmManager.stop(id:)` and `countdown(id:)` exist and are callable from app code / App Intents.
- `postAlert` is NOT a ring timeout — it's the repeat interval entered only via user tap
  (Repeat button) or app code. **No API auto-stops an unattended alert** (forums 787924).
- Sound: `.default` / `.named(String)` only; <30s files or the system default plays; no loop
  control; no post-schedule mutation (re-register to change).
- Overlap behavior (second alarm firing while one alerts) is **undocumented** — best evidence
  says the newer alarm presents over the older (forums 803735); whether audio replaces or mixes
  must be measured on-device. This is the decisive unknown.
- Countdown UI requires a widget extension (we ship none — alarms may be dismissed unexpectedly
  if we lean on `.countdown` presentations without one).

## Verdict

"Ring voice 1 → stop itself → quiet pause → ring voice 2" on a locked, untouched phone is
**not implementable** on iOS 26. Approximations, ranked:

1. **RECOMMENDED (native rebuild): foreground stop-and-replace.** Bridge `alarmUpdates` observer +
   `stop(id:)`; when the app is alive and a rung hits `.alerting`, stop it and drive the session
   in JS (play variant once, real silence, own UI, next variant on our timer). Exact UX when
   foreground; also fixes the attended default-tone bug (FB19779004). While in the bridge, log a
   native fired-event so the dead missed-path comes alive.
2. **KEEP (OTA): sibling ladder as the unattended mechanism.** After the overlap device test:
   tune offsets/rung count/WAV shape (all OTA/server knobs). If overlap = takeover → real
   escalation every 3 min. If overlap = cacophony → widen offsets / 2 rungs, lean on option 1.
3. Rejected: postAlert-bounded rings (needs user tap), notification-only ladder (no alarm-grade
   wake; mute switch applies) — though a final "you missed this" time-sensitive notification is a
   good supplement.

## Device test procedure (valid only on a reminder created AFTER the current OTA)

1. Launch app, wait ~30s, force-quit, relaunch (update applies on next launch).
2. Create a NEW urgent reminder 4-5 min out; keep app foreground ~60s (variant WAVs must hydrate
   before they can bake into the rungs).
3. Diagnostics must list 3 scheduled entries for the reminder (T, T+3min, T+7min).
4. Lock the phone, touch nothing. Expect: same line looping for the FULL first 3 minutes (by
   design), then at T+3 the second voice — record whether it replaces rung 0's loop, mixes, or
   stays silent. T+7: third voice, note how many full-screen alerts stack.
5. After T+8 slide Stop once — the whole stack should clear; app-open reconciles one completion.
6. Judge escalation only at T+3, never earlier. Test locked-only (attended path has the known
   custom-sound bug).

Sources: AlarmManager docs, "Scheduling an alarm with AlarmKit", WWDC25 session 230, Apple
forums 806697 / 807752 / 787924 / 803735 / 809398, UNNotificationSound (30s cap).

## Open problem — creative solution wanted (next session's brief)

The user's desired UX, in their words: the alarm fires, plays the recording, **stops**, waits a
cooldown, then fires again **with a different voice** — "we have to be creative here in our
solutions." Status as of 2026-08-11 evening: per-rung sounds are fixed and tested (165 green),
the locked-phone overlap test has NOT been run yet, and no native work has started.

Constraints to design within (all verified above): one baked ≤30s sound per alarm, looped
indefinitely; no unattended auto-stop; no code runs at fire time; sound can only change by
cancel+re-register; overlap audio behavior undocumented.

Creative angles not yet explored, seeded for the brainstorm:

1. **Bake the escalation INTO the loop.** iOS loops one file — so a single 29s WAV can carry
   `line A · pause · line A-sharper` (two escalating deliveries of the line, different tone or
   voice). Every loop then *sounds* like stop → cooldown → escalate, even though it's one alarm.
   Pure server-side WAV shaping (convex/helpers.ts), ships OTA, works fully unattended. Cap: 30s.
2. **Shaped silence as fake cooldown.** Place the utterance so the loop boundary lands mid-silence
   — the gap between repeats reads as a deliberate pause, not a broken loop.
3. **Ladder as the coarse escalation** (already built): different file per rung at +3/+7. The
   overlap test decides if rung N+1 cleanly replaces rung N's audio; offsets/rung count tune OTA.
4. **Foreground stop-and-replace** (native `alarmUpdates` + `stop(id:)`): the exact UX whenever
   the app is alive; also unlocks arbitrary per-repeat voices with real silence between.
5. **Time-sensitive notification tail**: after the ladder exhausts, a "you missed this"
   notification with a 29s one-shot sound — plays once and goes quiet, no loop.

Recommended combination to evaluate first: (1)+(3) OTA — escalating delivery inside each rung's
WAV, different variant per rung — then (4) in the next native rebuild.
