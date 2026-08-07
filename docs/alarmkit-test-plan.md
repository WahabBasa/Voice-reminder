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

On the alarm from step 3, tap **Done**. The app foregrounds (`openAppWhenRun=true`).

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
