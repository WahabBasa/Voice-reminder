# AlarmKit device test plan (AK-5)

**Target:** ~10 minutes, one iPhone (iOS 26+) and one Samsung S21. **Read first:** `docs/alarmkit-port-prd.md`.

There is no Mac and no cable debugging. Sentry Logs is the only tape, so every step below is
"do this, then find this exact log line." A step without its log line is a **fail**, even if the
phone appeared to do the right thing — an unobservable pass is not a pass on a build we can only
iterate on every ~15 minutes.

## Reading the tape

`lib/sentry.ts` streams every `console.log` / `warn` / `error` to Sentry Logs
(`consoleLoggingIntegration`). iOS and Android report into **separate Sentry projects** under org
`oldowan`, so pick the right one before searching.

All lines come from `vrLog()` and share one shape:

```
[VR][JS][<scope>] ts=<epoch_ms> event=<event> <key>=<value> ...
```

Search filters used below:

| Filter | Shows |
|--------|-------|
| `[VR][JS][alarmkit]` | every AlarmKit decision on iOS |
| `[VR][JS][notifee]` | the legacy/Android notification path |
| `event=reconciled_` | what the app did with Done / Later taps |
| `_failed` | every AlarmKit error branch (all of them end in `_failed`) |

Any `_failed` line during a run is a fail for that step regardless of what else happened.

## Prerequisites

1. iOS build from the `preview` EAS profile with `plugins/withAlarmKit.js` active (AK-1 + AK-2
   integrated), installed on an **iPhone running iOS 26 or later**. AlarmKit does not exist below
   26 and `isSupported()` returns false there by design.
2. Device build, not simulator — the sound-file extension handling differs and we ship device-only.
3. Fresh install (or Settings → VoiceReminder → reset permissions) so step 1 can observe a
   first-run prompt.
4. **Set the test reminder's snooze duration to 1 minute.** Steps 5 and 6 wait out a real snooze
   window; the 5-minute default turns a 10-minute script into a 20-minute one.
5. Android: Samsung S21 with the same JS bundle, for step 8.
6. Have the Sentry Logs view open and filtered to `[VR][JS]` before you start.

## The script

### 1. Authorization prompt appears once (iOS 26)

Launch the fresh install and walk the permission prompt to the Notifications row. Accept.

- The AlarmKit ask rides the notification step (`requestNotificationPermission`), so you should see
  **two** system dialogs in a row, not one.
- Relaunch the app. No second AlarmKit dialog.

Proof:

```
[VR][JS][alarmkit] ts=… event=authorization status=authorized
[VR][JS][alarmkit] ts=… event=gate_decision enabled=true status=authorized
```

Fail modes: `status=denied` (user tapped Deny, or the `NSAlarmKitUsageDescription` string is
missing from Info.plist); `event=authorization_failed`; no `gate_decision` line at all (the native
bridge is not linked — `isSupported()` returned false, the whole port is inert and every step below
will silently fall back to notifee).

### 2. Proof of life — test alarm through a locked, muted phone

From the diagnostics screen call `scheduleTestAlarm(60)`. Then, within the minute:
lock the phone, flip the **mute switch on**, and put it face down.

Expect: at T+60s a full-screen system alarm at full volume, with Done and Later buttons.

Proof: the alarm itself is the proof — `scheduleTestAlarm` is a native dev method and logs nothing
on the JS side. After tapping Done and letting the app foreground:

```
[VR][JS][alarmkit] ts=… event=reconciled_stopped appKey=… reminderId=… scheduledFor=…
```

(or `event=reconcile_orphan` if the test alarm's key does not map to a real reminder — that is the
expected line for a synthetic test alarm and still proves the event log drained.)

Fail mode: silent or vibrate-only ring means this is still a notification, not an alarm.

### 3. Voice line as the alarm sound (wav pipeline end to end)

Create a **new** reminder by voice, scheduled 2 minutes out. Wait for the TTS to hydrate, then lock
and mute the phone again.

Expect: the alarm rings with the reminder's own spoken line, not the system alarm tone.

Proof — `soundName` must be a `reminder_*.wav`, never `system_default`:

```
[VR][JS][alarmkit] ts=… event=scheduled appKey=reminder_<id>_<ms> reminderId=<id> fireDate=<ms> soundName=reminder_<id>.wav uuid=<uuid>
```

If the wav lands after the alarm was first scheduled, the alarm is rewritten and you get this
instead (also a pass):

```
[VR][JS][alarmkit] ts=… event=sound_refreshed appKey=… reminderId=… soundName=reminder_<id>.wav
```

Fail modes: `soundName=system_default` (no `wavUrl` on the reminder — AK-3's Convex side did not
attach one); `event=sound_hydration_failed` (the download or the `Library/Sounds` write failed);
`uuid=none` (`scheduleAlarm` returned nothing — the native scheduler rejected the config, commonly
a sound file the OS will not accept).

### 4. Done records completion on next open

On the alarm from step 3, answer **Done** (slide-to-stop on iOS 26.1+). The phone must stay on
the lock screen — no unlock prompt, no app launch (`openAppWhenRun=false` on both intents). Then
open the app by hand.

Expect: the reminder shows as completed in history.

Proof:

```
[VR][JS][alarmkit] ts=… event=reconciled_stopped appKey=… reminderId=… scheduledFor=…
```

For a recurring reminder, a fresh `event=scheduled` line for the next occurrence must follow it.
For a one-time reminder, no new `scheduled` line — the reminder is removed instead.

Fail mode: `event=reconcile_orphan` for a real reminder means the app key did not parse back to a
known reminder id.

### 5. Later fires the follow-up without opening the app (guard 4)

Create another reminder 2 minutes out (snooze duration 1 minute). When it rings, tap **Later** and
**do not open the app**. Keep the phone locked.

Expect: a second alarm ~1 minute later, still without the app ever foregrounding.

Proof — after the follow-up rings, open the app and read the drained log:

```
[VR][JS][alarmkit] ts=… event=reconciled_snoozed appKey=… reminderId=… snoozeUntil=<ms>
```

This line proves two things at once: the SnoozeIntent ran and wrote its guard (guard 1), and JS
recorded the snooze **without** rescheduling anything (guard 3 — the native side owns the
follow-up). There must be **no** `event=scheduled` line for this reminder between the Later tap and
the follow-up ring.

Fail modes: no follow-up ring at all is guard 4 failing — iOS suspended the intent process before
AlarmKit registered the alarm (the `Task.sleep(1s)` at the end of `VRSnoozeIntent`). A `scheduled`
line appearing right after `reconciled_snoozed` means JS double-booked the follow-up and the user
will get two alarms.

### 6. Later then Done on the follow-up ends the chain (guard 2)

Continue from step 5: on the follow-up alarm, tap **Done**.

Expect: no further alarms for this reminder. Ever. Wait 2 minutes to be sure.

Proof — the drained batch should collapse to a completion, not a snooze:

```
[VR][JS][alarmkit] ts=… event=reconciled_stopped appKey=… reminderId=… scheduledFor=…
```

This is the guard 2 proof. iOS fires StopIntent even when the user taps Later, so the batch drained
here may contain a spurious `stopped` from step 5's Later tap alongside the real one from this Done
tap. `reconcileAlarmEvents` discards any stop landing inside the snooze window; if the guard were
broken you would instead see `event=reconciled_stopped` arrive early (at step 5, before the
follow-up ever rang) and the follow-up chain would have been cancelled.

Fail mode: a third alarm rings, or `event=reconciled_follow_up followUpCount=1` appears — the app
treated the answered alarm as missed.

### 7. Focus mode ON — repeat step 3

Turn on a Focus mode (Do Not Disturb is fine). Repeat step 3 exactly: new voice reminder, 2 minutes
out, locked, muted, **plus** Focus active.

Expect: identical behavior to step 3 — full-volume spoken alarm. Focus is the case regular
notifications lose, and it is the reason this port exists.

Proof: same `event=scheduled … soundName=reminder_<id>.wav` line, and the alarm audibly rings.

### 8. Regression — Android untouched

On the Samsung S21, run the same flow as the 2026-08-06 device verification: create a voice
reminder, let it fire, tap through the alarm screen, snooze once, dismiss.

Expect: byte-identical behavior to 2026-08-06. Nothing about this port may reach Android.

Proof, in the **Android** Sentry project:

```
[VR][JS][notifee] ts=… event=DELIVERED traceId=…
[VR][JS][pending_alarm] ts=… event=state_transition …
```

And the negative proof, which matters more:

- Filter the Android project for `[VR][JS][alarmkit]`. **Zero results is the pass condition.**
  Any hit means a branch escaped its `Platform.OS === "ios"` gate.

## Scoreboard

| # | Step | Guard proved | Pass |
|---|------|--------------|------|
| 1 | Authorization prompt once | — | ☐ |
| 2 | Locked + muted test alarm rings | — | ☐ |
| 3 | Voice line as alarm sound | wav pipeline | ☐ |
| 4 | Done records completion | — | ☐ |
| 5 | Later fires follow-up, app closed | 1, 3, 4 | ☐ |
| 6 | Later then Done ends the chain | 2 | ☐ |
| 7 | Focus mode ON | — | ☐ |
| 8 | Android unchanged | Platform gating | ☐ |

Steps 3 and 5 are the ones worth re-running if anything is ambiguous: they are where the two
hardest pieces (sound pipeline, intent suspension) fail quietly.

## Failure triage

| Symptom | First log to check | Likely cause |
|---------|--------------------|--------------|
| Nothing AlarmKit-shaped in the log | absence of `event=gate_decision` | native bridge not linked; AK-1 plugin did not inject the Swift sources |
| `gate_decision enabled=false status=notDetermined` | `event=authorization` | prompt never shown, or Info.plist usage string missing |
| Alarm rings with the system tone | `event=scheduled soundName=` | `system_default` → no wavUrl (AK-3 Convex); a filename but still wrong tone → file not in `Library/Sounds` or rejected format |
| `uuid=none` on every schedule | `event=schedule_failed` | native scheduler threw; check the AlarmConfiguration |
| No follow-up after Later | absence of a second ring | guard 4 — the 1s suspension sleep |
| Follow-up chain dies on the first Later | early `event=reconciled_stopped` | guard 2 — the spurious StopIntent was not filtered |
| Two alarms after one Later | `event=scheduled` right after `reconciled_snoozed` | guard 3 — JS rescheduled on top of the native follow-up |
| Reminder never rolls forward | `event=reschedule_failed` | recurrence recalculation threw |
| Anything AlarmKit on Android | any `[VR][JS][alarmkit]` hit | a missing `Platform.OS === "ios"` gate |

## Automated coverage backing this plan

`__tests__/lib/alarmKitContract.test.ts` is the merge-time tripwire and runs on every `npm test`:

- The six frozen `AlarmKitBridge` contract methods exist on `lib/alarmKit.ts`, under those exact
  names, with safe no-op fallbacks when `NativeModules.AlarmKitBridge` is undefined (Android, iOS
  < 26, Jest).
- The event-log reconciliation table encodes the FamWake race scenarios as executable spec:
  spurious stop inside a snooze window (guard 2, both append orders), no reschedule while the
  snooze window is open (guard 3), Later-then-Done chain termination (steps 5 + 6 above),
  fired-then-nothing → pending inside the ring window and missed past it, per-reminder isolation
  within one drained batch, and malformed entries ignored without throwing.

Device steps 5 and 6 exist because the tests cannot reach the parts that only fail on real
hardware: the App Intent process being suspended before AlarmKit registers the follow-up, and
whether iOS actually emits the spurious StopIntent on this OS build.

## Post-merge steps (not done in AK-5)

These were deferred because AK-1..4 were being written in parallel with this plan; do them once all
four are merged, before running the device script.

1. **vrLog coverage audit of AK-1..4.** Walk every decision point named in this plan and confirm a
   log line exists for both branches, then file gaps as a `## Review findings` section appended to
   the relevant issue doc under `docs/issues/` — review comments, not code edits.
2. Re-run `npx jest __tests__/lib/alarmKitContract.test.ts` after the final merge. It skips itself
   with a loud warning while `lib/alarmKit.ts` is absent, so a green run proves nothing unless the
   file exists.

### Review findings — observed while writing this plan

Recorded here rather than in the AK-issue docs because AK-5 does not own those files. Each needs
confirming against the merged tree before it is filed.

- **`reconcileAlarmKitEvents` has no caller.** `lib/notifications.ts` exports it, but there is no
  AppState foreground listener or cold-start invocation in `app/_layout.tsx` (only
  `syncRemindersOnStartup`). As it stands the native event log never drains, and steps 4, 5 and 6
  of this script cannot pass. This is the highest-priority item.
- **No `gap_resync` log.** AK-4's spec lists `gap_resync` among the required `alarmkit` events and
  it is not emitted anywhere; `getScheduledAlarms()` is used for cancel/refresh sweeps but the
  startup gap check (reminder active, no alarm scheduled) has no observable line. Without it,
  "the alarm silently never got scheduled" is invisible on the tape.
- **`lib/alarmSounds.ts` emits no vrLog at all.** The failure lines the wav steps rely on
  (`sound_hydration_failed`) come from the `lib/notifications.ts` call-site wrapper, so a partial
  success inside `ensureAlarmSound` — wrong path, zero-byte file, directory not created — is
  unobservable. Step 3's triage row is weaker than it should be because of this.

---

# Cadence ladder device plan (CL-1..3)

**Read first:** `docs/cadence-ladder-prd.md`. Everything above still applies — the ladder rides on
the same alarms, the same wav pipeline and the same event log, so a failure in steps 1-8
invalidates everything here. Run this section only after step 3 passes.

The ladder changes two things you can hear: **what one ringing alarm sounds like** (the line, a 2s
breath, the line again, for as long as it rings — the same shape on every tier since OLD-103) and
**how many times the phone comes back** (1-3 alarms staggered minutes apart). Both need ears on a
real device — no test in the repo can hear a wav.

## Extra prerequisites

9. **A stopwatch.** Steps 12 and 15 are timing measurements, not pass/fail observations.
10. **Four reminders, created by voice, so the model assigns the tier itself.** Do not hand-edit
    urgency — the point is to prove `variantCountForTier` and the model agree. Verify the tier the
    model picked from the `tier=` field on the `event=scheduled` line before trusting the step.

    | Label | Say something like | Expected tier | Expected rungs |
    |-------|--------------------|---------------|----------------|
    | R-routine | "remind me to water the plants at 4" | `routine` | 1 |
    | R-notice | "let me know my dentist appointment is coming up at 4" | `notice` | 2 |
    | R-urgent | "remind me I have to leave for the airport at 4" | `urgent` | 3 |
    | R-persistent | "remind me to take my heart medicine at 4, don't let me miss it" | `persistent=true` | 3 |

11. Schedule each 3 minutes out, one at a time. Two ladders running at once makes the tape
    unreadable and the ears unreliable.
12. **Reset between steps.** Delete the reminder after each step and confirm one `event=cancelled`
    line per rung — a leftover rung ringing during the next step is the most common way this
    script goes wrong.

## The script

### 9. Rung count and stagger per tier (the ladder exists at all)

For each of the four reminders in turn: create it, then read the tape **before** it fires.

Expect exactly N `event=scheduled` lines for one occurrence, all sharing the reminder id, with
fire dates at the PRD offsets:

```
[VR][JS][alarmkit] ts=… event=scheduled appKey=reminder_<id>_<T>        … rung=0 rungCount=3 soundName=reminder_<id>.wav
[VR][JS][alarmkit] ts=… event=scheduled appKey=reminder_<id>_<T+180000> … rung=1 rungCount=3 soundName=reminder_<id>_v1.wav
[VR][JS][alarmkit] ts=… event=scheduled appKey=reminder_<id>_<T+420000> … rung=2 rungCount=3 soundName=reminder_<id>_v2.wav
```

| Reminder | Lines expected | `rungCount` | Fire-date deltas from T |
|----------|----------------|-------------|-------------------------|
| R-routine | 1 | `1` | — |
| R-notice | 2 | `2` | +3min |
| R-urgent | 3 | `3` | +3min, +7min |
| R-persistent | 3 | `3` | +2min, +5min |

Fail modes: one line where the table says three (the tier fell through to routine — check `tier=`
on the line); `rungCount` disagreeing with the number of lines (the ladder was truncated after
metadata was built); deltas that are not the PRD offsets (someone hard-coded a gap instead of
importing `LADDER_OFFSETS_MS`); the same appKey scheduled twice ~20ms apart (the dedup fix
regressed — that is the 2026-08-07 race).

### 10. Repeating audio shape (routine / notice / urgent)

Lock and mute the phone. Let **R-urgent** rung 0 ring and do nothing — hands off, phone face down.

Listen to a single ring, start to finish:

- **Pass:** the line is spoken, then roughly **2 seconds of quiet**, then spoken again, repeating
  for the whole ring. Insistent, but with breath — not a wall of speech.
- **Fail (too dense):** back-to-back with no gap. That is the old unshaped wav — the alarm is
  playing a short file on loop, which means `buildAlarmWav` never ran on that path.
- **Fail (too sparse):** spoken once, then silence for the rest of the ring. That is a wav stored
  before OLD-103 — stored wavs are never rewritten, so re-create the reminder and listen again.

There is no log line for this. The only tape-side hint is `soundName=reminder_<id>.wav` on the
`scheduled` line, which proves *a* wav was used, not that it was shaped. Trust your ears.

Repeat for **R-routine** and **R-notice** rung 0 — every tier must sound the same way. If routine
sounds right and urgent loops, the variant wav path is unshaped while the base one is fine (or the
reverse) — note which.

### 11. Same shape on persistent

Same setup with **R-persistent** rung 0.

- **Pass:** identical to step 10 — line, ~2s quiet, line again. The tier changes how many times the
  phone comes back (step 9), never what one ring sounds like.
- **Fail:** it sounds different from step 10 at all — the two paths have drifted, since one
  `buildAlarmWav` shape now serves every tier.

### 12. Unattended ring duration — the measurement that tunes the offsets

**This is the point of the whole section.** `LADDER_OFFSETS_MS` was picked blind; it gets re-tuned
from this number.

With **R-urgent**, phone locked and muted, start the stopwatch the instant rung 0 starts ringing
and stop it when the phone goes quiet on its own. Do not touch the phone. Record:

| Measure | Value |
|---------|-------|
| Ring duration, rung 0, screen locked | ____ s |
| Ring duration, rung 1 (same run) | ____ s |
| Silence between end of rung 0 and start of rung 1 | ____ s |

Then repeat the rung-0 measurement once with the phone **unlocked and idle** — iOS treats an
attended device differently and the number may differ.

What the number means:

- If the ring runs **longer than the 3-minute gap**, rungs overlap and the ladder sounds like one
  continuous alarm — the offsets must grow.
- If the silence between rungs is **over ~2 minutes**, the user reads it as "it gave up" rather
  than "it is coming back" — the offsets should shrink.
- Target: the gap feels like an assistant pausing, not leaving. Land the numbers in
  `LADDER_OFFSETS_MS` / `LADDER_OFFSETS_PERSISTENT_MS` in `lib/notificationDecisions.ts` — the only
  place they exist — and nowhere else.

### 13. Variant wording escalates and stays true late

During step 12, write down what each rung actually said.

- **Pass:** three different sentences, each one a natural thing to say out loud, escalating in
  firmness. No "It's time —", no "Heads up —", no "Quick reminder —" on any rung. If an address
  term is set in Settings it appears verbatim (including Arabic); if unset, no name or title is
  used anywhere.
- **Pass:** rung 2's wording is still **true seven minutes late**. "Your flight check-in opens
  soon" passes; "leaving in ten minutes" is a fail even though it was true at T.
- **Fail:** two rungs say the same sentence → the variant wavs did not stage and every rung fell
  back to the base wav. Cross-check the tape for `event=variant_sound_hydration_failed`, and for
  `soundName=reminder_<id>.wav` on a `rung=1` or `rung=2` line — that is the fallback firing.

The fallback itself is correct behavior (PRD: a missing variant wav falls back to the base wav,
never to `.default`). What is a fail is `soundName=system_default` on any rung.

### 14. Done on a rung cancels its siblings — locked phone, app killed

The one thing only a device can prove: the sibling cancel happens in the App Intent process, with
no JS running.

Setup, in this exact order:

1. Create **R-urgent** 3 minutes out. Confirm three `event=scheduled` lines.
2. **Force-quit the app** (swipe up from the app switcher).
3. Lock the phone. Do not unlock it.

Let rung 0 ring, then tap **Done** on the alarm.

Expect: **silence for the next ten minutes.** Rungs 1 and 2 never ring. This is the pass — an
absence, so give it the full T+7 window before calling it.

Then unlock and open the app. The tape must show one stop and two cancels:

```
[VR][JS][alarmkit] ts=… event=reconciled_stopped           appKey=reminder_<id>_<T>        reminderId=<id> scheduledFor=<T>
[VR][JS][alarmkit] ts=… event=reconciled_sibling_cancelled appKey=reminder_<id>_<T+180000> reminderId=<id> scheduledFor=<T+180000>
[VR][JS][alarmkit] ts=… event=reconciled_sibling_cancelled appKey=reminder_<id>_<T+420000> reminderId=<id> scheduledFor=<T+420000>
```

History shows **one** completion, not three. Nothing is recorded as missed.

Fail modes:

- **Rung 1 rings anyway** → the native cancel did not happen. Either `siblings` never reached the
  metadata dict (check for `siblings=` on the original `scheduled` lines) or
  `VRAlarmScheduler.cancel(appKey:)` no-op'd because the rung's UUID had rotated.
- **No `reconciled_sibling_cancelled` lines at all, but the rungs stayed silent** → the cancel
  worked and the event never reached JS. That is the event-encoding seam (`vr_alarm_events` written
  as a plist array instead of a JSON string). Rungs are dead but reconcile does not know it —
  survivable, still a fail.
- **`reconciled_missed` for rung 1 or 2** → the cancel events were dropped as unknown and the
  reconciler read the rung as an ignored ring. Check the exact type token the Swift side emits
  against `CANCELLED_EVENT_TYPES` in `lib/alarmKit.ts`.
- **Three completions in history** → sibling cancels are being recorded as acknowledgments.

Repeat the whole step tapping Done on **rung 1** instead of rung 0 (let rung 0 ring out first).
Rungs 0 and 2 must both end up cancelled — the middle rung has to kill in both directions.

### 15. Later on a rung cancels siblings and supersedes the ladder

Same setup as step 14 — R-urgent, app force-quit, phone locked, snooze duration 1 minute.

Let rung 0 ring, tap **Later**.

Expect:

- Rungs 1 and 2 **never ring**.
- **One** follow-up alarm rings about a minute later, and it is a single alarm, not a new ladder.

Tape after opening the app:

```
[VR][JS][alarmkit] ts=… event=reconciled_snoozed           appKey=reminder_<id>_<T> reminderId=<id> snoozeUntil=<ms>
[VR][JS][alarmkit] ts=… event=reconciled_sibling_cancelled appKey=reminder_<id>_<T+180000> …
[VR][JS][alarmkit] ts=… event=reconciled_sibling_cancelled appKey=reminder_<id>_<T+420000> …
```

Then tap **Done** on the follow-up. The chain must end: no further ring, and no `event=scheduled`
growing the follow-up into a ladder.

Fail modes: three follow-ups instead of one (the ladder metadata rode forward onto the follow-up
alarm — `rung` / `rungCount` / `siblings` must be stripped when the snooze schedules it); rung 1
ringing during the snooze window (siblings were not cancelled on Later); a second Later on the
follow-up re-cancelling rungs that are already dead (harmless, but it means the strip did not
happen).

**Guard-2 interaction, worth a separate pass:** the spurious StopIntent iOS fires alongside a Later
tap must cancel **nothing**. If rungs 1 and 2 die but the snooze chain also dies (an early
`event=reconciled_stopped`), the sibling cancel ran before guard 2 rejected the stop.

### 16. Ignored ladder runs to the end and rolls forward

**R-urgent**, recurring daily, 3 minutes out. Lock the phone and ignore every ring.

Expect: three rings at T, T+3, T+7, then nothing. Open the app afterwards.

Expect on the tape: the next occurrence's full ladder is scheduled — **N `event=scheduled` lines,
not one**:

```
[VR][JS][alarmkit] ts=… event=scheduled appKey=reminder_<id>_<T2>        … rung=0 rungCount=3
[VR][JS][alarmkit] ts=… event=scheduled appKey=reminder_<id>_<T2+180000> … rung=1 rungCount=3
[VR][JS][alarmkit] ts=… event=scheduled appKey=reminder_<id>_<T2+420000> … rung=2 rungCount=3
```

Fail modes:

- **One `scheduled` line for the next occurrence** → the reschedule path bypasses the ladder.
- **`event=ladder_repair` on a past-dated occurrence** → the repair guard let a dead ladder be
  resurrected; it must only fire when the occurrence start is still in the future.
- **Three `missed` history entries for one occurrence** → each ignored rung was reconciled as its
  own miss. One occurrence, one history row.
- **Three follow-up alarms scheduled at once** → each ignored rung independently advanced the
  follow-up escalation counter. Watch for consecutive `event=reconciled_follow_up` lines with
  `followUpCount=1,2,3` in the same drain.

### 17. Partial ladder is repaired, not rebased

Create **R-urgent** 30 minutes out, then background the app for a few minutes and reopen it.

Expect: either nothing (ladder intact — the common case), or an `event=ladder_repair` line followed
by a full set of `scheduled` lines whose fire dates are still T, T+3, T+7 relative to the
**original** T:

```
[VR][JS][alarmkit] ts=… event=ladder_repair reminderId=<id> occurrenceStart=<T> missing=1 stray=0
```

Fail mode: `occurrenceStart` equal to T+3 rather than T, with the rungs re-laid at T+3 / T+6 /
T+10. That is the ladder walking forward every time the app is foregrounded.

### 18. Android regression — the ladder must not exist there

Repeat step 9 on the Samsung S21 with all four reminders.

Expect: exactly **one** notifee trigger per occurrence per reminder, the existing mp3 replay
behavior byte-identical to before this build, and **zero** `[VR][JS][alarmkit]` lines.

Any `alarmkit` line on Android is a missing `Platform.OS === "ios"` gate and a hard fail.

## Cadence-ladder scoreboard

| # | Step | What it proves | Pass |
|---|------|----------------|------|
| 9 | Rung count and stagger per tier | `variantCountForTier` ↔ `LADDER_OFFSETS_MS` | ☐ |
| 10 | Line repeats with a 2s breath | `buildAlarmWav` pass shaping | ☐ |
| 11 | Persistent sounds the same as the rest | one wav shape for every tier | ☐ |
| 12 | Unattended ring duration measured | the numbers that re-tune the offsets | ☐ |
| 13 | Variants escalate, no canned openers, late-true | phrasing contract + variant wav staging | ☐ |
| 14 | Done on a rung kills siblings (locked, killed) | native sibling cancel + event seam | ☐ |
| 15 | Later kills siblings, follow-up stays single | snooze supersedes the ladder | ☐ |
| 16 | Ignored ladder ends and rolls forward | one occurrence = one outcome | ☐ |
| 17 | Partial ladder repaired at T, not rebased | repair does not walk the cadence forward | ☐ |
| 18 | Android untouched | Platform gating | ☐ |

Steps 12 and 14 are the two worth re-running if anything is ambiguous: 12 because every offset in
the product depends on that stopwatch, and 14 because it is the only proof the native half of the
ladder works at all.

## Cadence-ladder failure triage

| Symptom | First log to check | Likely cause |
|---------|--------------------|--------------|
| One alarm where three were expected | `event=scheduled` count, `tier=` field | model assigned a lower tier, or ladder expansion was skipped |
| Rungs at the wrong minutes | fire-date deltas on `scheduled` | offsets not read from `lib/notificationDecisions.ts` |
| Same appKey scheduled twice ~20ms apart | two `event=scheduled` with one appKey | in-flight dedup regressed |
| Line loops back-to-back inside one ring | none (ears only) | wav shipped unshaped — `buildAlarmWav` not applied on that path |
| Line spoken once, then a long silence | `audioUpdatedAt` on the reminder | wav stored before OLD-103; stored wavs are never rewritten — re-create the reminder |
| Every rung says the same sentence | `event=variant_sound_hydration_failed`, `soundName=` per rung | variant wavs never staged; base-wav fallback (correct, but wording is wrong) |
| `soundName=system_default` on any rung | `event=scheduled` | fallback chain broke — never acceptable |
| Siblings ring after Done | `siblings=` on the original `scheduled` lines | metadata never reached the native store, or the UUID rotated before cancel |
| Rungs silent but no `reconciled_sibling_cancelled` | its absence | event-log encoding seam (`vr_alarm_events` shape) |
| `reconciled_missed` for a cancelled rung | absence of `event=reconciled_sibling_cancelled` | event type token mismatch between the Swift emitter and `lib/alarmKit.ts` |
| Three history rows for one occurrence | `event=reconciled_*` count | per-rung outcomes not collapsed to one occurrence |
| Follow-up turns into a ladder | `rung=` / `rungCount=` on `scheduled_follow_up` | ladder metadata not stripped on snooze |
| `ladder_repair` with a shifting `occurrenceStart` | `event=ladder_repair` | repair rebased on the earliest surviving rung |
