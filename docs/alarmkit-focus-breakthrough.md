# AlarmKit & Focus/Silent breakthrough — what Apple actually documents (2026-08-15)

Primary sources only: developer.apple.com documentation + WWDC session pages. Every claim
below is followed by the Apple page that owns it. Companion to `docs/cl4-escalation-research.md`
(the unattended-alarm wall) — read that one for the device-behaviour evidence.

## TL;DR

- Breakthrough is real and it is the framework's *stated* behaviour: an AlarmKit alarm
  "overrides both a device's focus and silent mode, **if necessary**" and "breaks through the
  silent mode and the current focus." That covers the ring/silent switch and Focus/DND.
- **Volume is nowhere in the AlarmKit docs.** No volume parameter exists on any AlarmKit type.
  Critical alerts (a different API) *do* document volume control — AlarmKit does not.
- Entry price is one Info.plist key (`NSAlarmKitUsageDescription`) plus a per-app user opt-in.
  No Apple-issued entitlement, no review request. That is the whole reason an app like Alarmpop
  can ring like the system Clock on iOS 26 — it is almost certainly AlarmKit.
- Only one real API change across iOS 26.1–26.4: **`stopButton` was deprecated in 26.1** in
  favour of a system-provided stop control. Nothing in the 26.1/26.2/26.3/26.4 release notes
  mentions AlarmKit at all. iOS 27 beta adds `appEntityIdentifier` (Siri "snooze it").
- **Nothing new changes CL-4.** There is still no API that stops an alerting alarm without a
  user tap, and no app code runs at fire time. Foreground stop-and-replace remains buildable;
  unattended stop-and-replace remains an Apple wall.
- Our bridge leaves a lot on the table: no `alarmUpdates`, no `alarms` diffing (Apple's own
  documented way to detect a fired alarm), no `countdownDuration`, no widget extension.

---

## 1. The breakthrough mechanics

### What Apple explicitly says

| Claim | Apple's words | Source |
|---|---|---|
| Overrides Focus **and** Silent | "An alarm is an alert that presents at a pre-determined time based on a schedule or after a countdown. It overrides both a device's focus and silent mode, if necessary." | [Scheduling an alarm with AlarmKit](https://developer.apple.com/documentation/AlarmKit/scheduling-an-alarm-with-alarmkit) |
| Same, from the session | "When it fires, the alert breaks through the silent mode and the current focus." | [WWDC25 230 — Wake up to the AlarmKit API](https://developer.apple.com/videos/play/wwdc2025/230/) |
| Framework purpose | "Schedule prominent alarms and countdowns to help people manage their time." | [AlarmKit](https://developer.apple.com/documentation/AlarmKit) |

Note the hedge — **"if necessary."** Apple does not promise unconditional override of every
system state, and it never quantifies it. There is no sentence anywhere in the AlarmKit docs
about ring volume, the Ringtone & Alerts slider, Attention Aware volume reduction, or what
happens under Sleep Focus specifically. Treat volume as **undocumented**, not guaranteed.

### Authorization

- `AlarmManager.requestAuthorization()` — "Requests permission to use the alarm system if it
  hasn't been requested before… If a person using your app denies authorization, all attempts to
  schedule alarms fail."
  ([requestAuthorization()](https://developer.apple.com/documentation/alarmkit/alarmmanager/requestauthorization()))
- Three states: `.authorized` / `.denied` / `.notDetermined`
  ([AuthorizationState](https://developer.apple.com/documentation/alarmkit/alarmmanager/authorizationstate-swift.enum)).
  Non-prompting reads: `authorizationState`, and `authorizationUpdates` as an async sequence.
- **`NSAlarmKitUsageDescription` is mandatory.** "If the `NSAlarmKitUsageDescription` key is
  missing or its value is an empty string, your app can't schedule alarms with AlarmKit."
  ([NSAlarmKitUsageDescription](https://developer.apple.com/documentation/bundleresources/information-property-list/nsalarmkitusagedescription))
- If you never call `requestAuthorization()`, "AlarmKit automatically requests this authorization
  on behalf of the app, before scheduling the alarm."
  ([Scheduling an alarm with AlarmKit](https://developer.apple.com/documentation/AlarmKit/scheduling-an-alarm-with-alarmkit))
- No Apple-issued entitlement is involved. Contrast with critical alerts (§4).

## 2. The presentation stack

- **Where it shows:** Lock Screen (full-screen alert), Dynamic Island (compact + expanded),
  StandBy, and a paired Apple Watch. "Alarms are also supported in other system experiences,
  such as in StandBy and right on Apple Watch, if it's paired to iPhone when the alarm fires"
  ([WWDC25 230](https://developer.apple.com/videos/play/wwdc2025/230/)); "The system forwards the
  alert presentation to a paired watch (if any)"
  ([Scheduling an alarm](https://developer.apple.com/documentation/AlarmKit/scheduling-an-alarm-with-alarmkit)).
- **Three presentation states:** `AlarmPresentation.Alert` (required), `.Countdown` and `.Paused`
  (both optional) ([AlarmPresentation](https://developer.apple.com/documentation/alarmkit/alarmpresentation)).
- **Countdown vs schedule.** `schedule` is `.fixed(Date)` for a one-shot or `.relative(Time +
  weekly recurrence)` for a repeating alarm
  ([Alarm.Schedule](https://developer.apple.com/documentation/alarmkit/alarm/schedule-swift.enum)).
  `countdownDuration` is separate: `preAlert` is "the duration applied before the alarm fires",
  `postAlert` is "the duration applied after the alarm has alerted at least once and moves back to
  the countdown state… this would be the snooze duration for an alarm. …If the value is `nil` we
  will use the `preAlert` duration"
  ([preAlert](https://developer.apple.com/documentation/alarmkit/alarm/countdownduration-swift.struct/prealert),
  [postAlert](https://developer.apple.com/documentation/alarmkit/alarm/countdownduration-swift.struct/postalert)).
  You may pass both — "the system shows a countdown UI before the alarm alerts, possibly on a
  repeating schedule"
  ([schedule(id:configuration:)](https://developer.apple.com/documentation/alarmkit/alarmmanager/schedule(id:configuration:))).
- **Countdown requires a Live Activity.** "If your alarm supports countdown functionality, your
  app is required to implement it using a Live Activity… You will need to add your countdown Live
  Activity to your app's widget extension"
  ([WWDC25 230](https://developer.apple.com/videos/play/wwdc2025/230/)). The widget receives the
  same `AlarmAttributes` you scheduled with; AlarmKit itself supplies the dynamic half
  (`AlarmPresentationState`, including `fireDate` and the current mode)
  ([AlarmPresentationState](https://developer.apple.com/documentation/alarmkit/alarmpresentationstate)).
- **Buttons.** Stop is now system-provided (§3). The secondary button has two behaviours:
  `.countdown` → a Repeat/Snooze action that "re-triggers the alarm after a certain `TimeInterval`,
  as specified in `Alarm.CountdownDuration.postAlert`"; `.custom` → runs your own
  `LiveActivityIntent` (e.g. an Open action)
  ([Scheduling an alarm](https://developer.apple.com/documentation/AlarmKit/scheduling-an-alarm-with-alarmkit)).
- **Intents are BFU-limited.** "You can pass in an optional secondary intent that the system
  executes when a person taps a secondary button. **This is only available after first unlock.**"
  ([AlarmManager.AlarmConfiguration](https://developer.apple.com/documentation/alarmkit/alarmmanager/alarmconfiguration))
- **Custom sounds** come from ActivityKit's `AlertConfiguration.AlertSound`: `.default` or
  `.named(_:)`, file in the main bundle or `Library/Sounds`
  ([AlertConfiguration.AlertSound](https://developer.apple.com/documentation/activitykit/alertconfiguration/alertsound),
  [WWDC25 230](https://developer.apple.com/videos/play/wwdc2025/230/)). No volume, no loop count,
  no duration parameter exists on this type.
- **Lifecycle:** `stop`, `countdown`, `pause`, `resume`, `cancel`, all on `AlarmManager`
  ([AlarmManager](https://developer.apple.com/documentation/alarmkit/alarmmanager)).
  `stop(id:)`: "If the alarm is a one-shot… the system deletes the alarm. If the alarm repeats
  then it's rescheduled"
  ([stop(id:)](https://developer.apple.com/documentation/alarmkit/alarmmanager/stop(id:))).
  `countdown(id:)`: works only "if it's currently alerting. The function throws otherwise. This is
  identical to the repeat function of a timer, or the snooze function of an alarm"
  ([countdown(id:)](https://developer.apple.com/documentation/alarmkit/alarmmanager/countdown(id:))).

## 3. What is new since the initial iOS 26.0 release

Checked API-by-API against the framework index, plus every 26.x release note.

1. **iOS 26.1 — stop button deprecated.**
   `AlarmPresentation.Alert.init(title:stopButton:secondaryButton:secondaryButtonBehavior:)` is
   marked *iOS 26.0, deprecated 26.1*
   ([deprecated init](https://developer.apple.com/documentation/alarmkit/alarmpresentation/alert-swift.struct/init(title:stopbutton:secondarybutton:secondarybuttonbehavior:))),
   replaced by
   [`init(title:secondaryButton:secondaryButtonBehavior:)`](https://developer.apple.com/documentation/alarmkit/alarmpresentation/alert-swift.struct/init(title:secondarybutton:secondarybuttonbehavior:))
   — *iOS 26.1* — "Creates an alert for an alarm, **with a system-provided stop control** and
   optionally a second button." The app no longer describes the stop affordance; iOS owns it.
   ✅ We already fork on `#available(iOS 26.1, *)` (`plugins/withAlarmKit.js:407-431`).
2. **iOS 27.0 (beta) — `appEntityIdentifier`.** Three new overloads on `AlarmConfiguration`
   (`init(countdownDuration:…)`, `.alarm(schedule:…)`, `.timer(duration:…)`) take
   `appEntityIdentifier: EntityIdentifier?` — "The entity associated with the alarm"
   ([beta init](https://developer.apple.com/documentation/alarmkit/alarmmanager/alarmconfiguration/init(countdownduration:schedule:attributes:appentityidentifier:stopintent:secondaryintent:sound:))).
   Purpose per WWDC26: "With AlarmKit, I add a single `EntityIdentifier` to the
   `appEntityIdentifier` parameter on `AlarmConfiguration` when creating an alarm or a timer. With
   this, people can act on firing alarms and timers"
   ([WWDC26 343 — Explore advanced App Intents features](https://developer.apple.com/videos/play/wwdc2026/343/))
   — i.e. Siri "snooze it" / "dismiss it" on a ringing alarm.
3. **Nothing else.** AlarmKit is not mentioned in the
   [26.1](https://developer.apple.com/documentation/ios-ipados-release-notes/ios-ipados-26_1-release-notes),
   [26.2](https://developer.apple.com/documentation/ios-ipados-release-notes/ios-ipados-26_2-release-notes),
   [26.3](https://developer.apple.com/documentation/ios-ipados-release-notes/ios-ipados-26_3-release-notes),
   or [26.4](https://developer.apple.com/documentation/ios-ipados-release-notes/ios-ipados-26_4-release-notes)
   release notes. No new breakthrough controls, no ring-duration API, no volume API.

Reliability caveat (community, not Apple): FB21273655 reports alarms scheduled on 26.1 silently
stopping after an upgrade to 26.2 beta 3
([forums 809398](https://developer.apple.com/forums/thread/809398)). Argues for re-registering
alarms on every launch rather than trusting long-lived registrations.

## 4. Alternatives Apple documents for breakthrough

| Mechanism | Breaks Silent? | Breaks Focus/DND? | Gate |
|---|---|---|---|
| **AlarmKit alarm** | Yes — "overrides… silent mode, if necessary" | Yes — "overrides… focus" | Info.plist key + user opt-in. No entitlement. |
| **`.critical` interruption level** | Yes — "bypasses the mute switch to play a sound" | Yes — "always presents this notification, even when Do Not Disturb is active" | **Apple-issued entitlement** ([Critical Alerts](https://developer.apple.com/documentation/bundleresources/entitlements/com.apple.developer.usernotifications.critical-alerts)) + `UNAuthorizationOptions.criticalAlert` |
| **`.timeSensitive`** | No | Partially — "can break through system controls such as Notification Summary and Focus. **The user can turn off** the ability for time sensitive notification interruptions" | None |
| **Background audio** (`AVAudioSession.Category.playback`) | Yes — "your app audio continues with the Silent switch set to silent or when the screen locks" | N/A (not a notification) | `UIBackgroundModes: audio`; app must already be running |

Sources: [UNNotificationInterruptionLevel.critical](https://developer.apple.com/documentation/usernotifications/unnotificationinterruptionlevel/critical),
[.timeSensitive](https://developer.apple.com/documentation/usernotifications/unnotificationinterruptionlevel/timesensitive),
[UNAuthorizationOptions.criticalAlert](https://developer.apple.com/documentation/usernotifications/unauthorizationoptions/criticalalert),
[AVAudioSession.Category.playback](https://developer.apple.com/documentation/avfaudio/avaudiosession/category-swift.struct/playback).

Only critical alerts expose a **volume** knob —
[`criticalSoundNamed(_:withAudioVolume:)`](https://developer.apple.com/documentation/usernotifications/unnotificationsound/criticalsoundnamed(_:withaudiovolume:)),
0.0–1.0. AlarmKit has no equivalent.

**What Alarmpop plausibly uses.** An alarm-clock app that rings through Silent + Focus on iOS 26
with no Apple entitlement has exactly one sanctioned path: AlarmKit. Critical alerts would require
Apple to approve an entitlement request for a consumer alarm-clock use case (unlikely), and
notification sounds are capped at 30s and do not break the mute switch
([UNNotificationSound](https://developer.apple.com/documentation/usernotifications/unnotificationsound)).
Apple's own DTS answer to "is there a recommended way to implement a persistent alarm… would
AlarmKit be appropriate": *"The behavior you're describing is not currently supported in the
UserNotifications framework. AlarmKit would be a better fit"*
([forums 833511](https://developer.apple.com/forums/thread/833511)). Same conclusion for us.

## 5. Guaranteed vs conditional vs impossible

| | Behaviour | Basis |
|---|---|---|
| **Guaranteed (documented)** | Rings through the ring/silent switch | "overrides… silent mode, if necessary" / "breaks through the silent mode" |
| | Rings through Focus/DND | same two sources |
| | Full-screen alert on Lock Screen; Dynamic Island; StandBy; paired Watch | WWDC25 230, Scheduling article |
| | Custom sound from bundle or `Library/Sounds` | AlertSound + WWDC25 230 |
| | System-provided stop control (26.1+) | 26.1 init |
| | App code runs on button tap, via `LiveActivityIntent` | AlarmConfiguration |
| | Alarm survives app termination (daemon-scheduled) | `alarms` = "fetches all alarms from the daemon" |
| **Conditional** | Any alarm at all — user must grant AlarmKit authorization per app; denial fails every schedule | requestAuthorization() |
| | `NSAlarmKitUsageDescription` present and non-empty, or scheduling is blocked outright | plist key doc |
| | Secondary intent only runs **after first unlock** | AlarmConfiguration |
| | Countdown/paused UI requires a widget extension Live Activity | WWDC25 230 |
| | Scheduling can fail with `maximumLimitReached` — limit value **undocumented** | [AlarmError](https://developer.apple.com/documentation/alarmkit/alarmmanager/alarmerror/maximumlimitreached) |
| | "if necessary" hedge — Apple never enumerates the states it will *not* override | Scheduling article |
| **Not documented at all** | Ring volume, volume override, Attention-Aware interaction | absent from every AlarmKit page |
| | How long an alarm rings before the system gives up | absent |
| | Behaviour when a second alarm fires while one is alerting | absent |
| **Impossible** | Stop or replace an alerting alarm with no user interaction | `stop(id:)`/`countdown(id:)` are app-called only; no fire-time callback exists |
| | Run any code at fire time | no such API; `alarmUpdates` needs a live process |
| | Mutate a scheduled alarm's sound, title, or time in place | no update API — cancel + re-`schedule` with a new id |
| | Control loop count, ring duration, or fade | no parameter on any type |

## 6. Our integration's unused capabilities

Read against `plugins/withAlarmKit.js` and `lib/alarmKit.ts`. We currently use:
`requestAuthorization()`, `schedule(id:configuration:)`, `cancel(id:)`, `.fixed(Date)` schedules,
`AlarmAttributes` (tint + custom `VRAlarmMetadata`), `AlarmPresentation.Alert` with the 26.1 fork,
`AlertSound.default/.named`, two `LiveActivityIntent`s with `secondaryButtonBehavior: .custom`,
and the Info.plist key. Everything below is documented and unused:

1. **`alarmUpdates`** — "Use this to receive a notification when an alarm alerts, snoozes, or
   dismisses" ([alarmUpdates](https://developer.apple.com/documentation/alarmkit/alarmmanager/alarmupdates-swift.property)).
   This is the observer CL-4 option 1 needs, and it is also the only in-process signal that a
   rung reached `.alerting`. Not wired at all today.
2. **`alarms`** — the fix for our dead "fired" event, straight from Apple: "As soon as an alarm
   fires and stops it's deleted from the daemon's store. If you want to determine if a one-shot
   alarm has fired, persist your alarms in your own store and compare that with the result of this
   function call. **If the array is missing scheduled alarms, then those alarms fired.**"
   ([alarms](https://developer.apple.com/documentation/alarmkit/alarmmanager/alarms)). We already
   persist a registry (`VRAlarmStore`) — the diff is a few lines and needs no fire-time code.
   Today `getScheduledAlarms()` reads our own UserDefaults registry, not the daemon.
3. **`authorizationState` / `authorizationUpdates`** — non-prompting reads. Our `useAlarmKit()`
   gate calls `requestAuthorization()` and caches the answer for the session, so a mid-session
   revoke in Settings is invisible until relaunch.
4. **`stop(id:)`, `countdown(id:)`, `pause(id:)`, `resume(id:)`** — never called. `stop(id:)` is
   the foreground stop-and-replace primitive.
5. **`countdownDuration` (`preAlert`/`postAlert`)** — never set, so the system snooze path
   (`secondaryButtonBehavior: .countdown` + `postAlert`) is unavailable and our "Later" is a hand-
   rolled intent + re-registration. Adopting it would require a widget extension.
6. **`.relative` weekly schedules** — we re-register a `.fixed` alarm per occurrence. Recurring
   reminders could be one daemon-side alarm instead of N registrations against the alarm cap.
7. **Widget extension / Live Activity** — we ship none, so no custom Lock Screen, Dynamic Island,
   or StandBy surface, and no countdown UI. Templated presentation only.
8. **`AlarmError.maximumLimitReached`** — unhandled. Our cadence ladder registers up to 3 alarms
   per occurrence, which multiplies our exposure to an undocumented cap.
9. **`appEntityIdentifier` (iOS 27 beta)** — would let Siri snooze/dismiss a ringing VoiceReminder
   alarm hands-free. Genuinely relevant for an accessibility-shaped app; worth an early adopt.

### Does anything change CL-4?

**No.** The CL-4 verdict stands. No 26.x or 27-beta API stops an alerting alarm on its own, gives
app code a fire-time hook, or bounds a ring. `stop(id:)` and `countdown(id:)` still require our
process to be alive and calling them, so:

- **Foreground stop-and-replace: still buildable** (option 1 in `cl4-escalation-research.md`) —
  `alarmUpdates` + `stop(id:)` are both documented and both unused by us.
- **Unattended stop-and-replace: still an Apple wall.**
- One thing *does* improve: the "unreachable missed-classification" bug no longer needs a native
  fired-event at fire time. Apple documents the `alarms`-diff as the supported way to detect that
  a one-shot fired — a pure next-foreground fix, no native fire-time code required.

## 7. Implications for the snooze-nag rework

Target UX: **dismiss → re-ring +5 min, ×3; an unattended timeout counts as a dismissal.**

- **Dismiss → re-ring: supported, with a caveat.** The stop button runs our `stopIntent`
  (`LiveActivityIntent`), and from `perform()` we can register a fresh `.fixed` alarm at +5 min —
  the same shape `VRSnoozeIntent` already uses. Necessary because `stop(id:)` on a one-shot
  *deletes* the alarm ([stop(id:)](https://developer.apple.com/documentation/alarmkit/alarmmanager/stop(id:))),
  so the comeback must be a new registration, not a revival. **Caveat:** intents run *only after
  first unlock* ([AlarmConfiguration](https://developer.apple.com/documentation/alarmkit/alarmmanager/alarmconfiguration))
  — a dismissal on a phone that has been rebooted and not yet unlocked schedules nothing.
- **Do not try to build this on `.countdown` + `postAlert`.** The system snooze is wired to the
  *secondary* button, not the stop button ([Scheduling an alarm](https://developer.apple.com/documentation/AlarmKit/scheduling-an-alarm-with-alarmkit)),
  so it cannot express "dismiss then come back". It would also cost us a widget extension
  ([WWDC25 230](https://developer.apple.com/videos/play/wwdc2025/230/)) and would displace our
  `.custom` secondary intent.
- **Unattended timeout → comeback: must be pre-scheduled, not reactive.** No code of ours runs
  when a ring times out, so the +5/+10/+15 comebacks have to be registered up front and
  *cancelled* when the user finally answers. That is structurally the cadence ladder we already
  have — so the rework is a re-tuning of `LADDER_OFFSETS_MS`, not a new mechanism. Cancellation
  rides the same intent that is BFU-gated, so accept that an unanswerable phone rings the full set.
- **Budget the alarm cap.** 3 comebacks × every pending reminder pushes toward
  `maximumLimitReached` ([AlarmError](https://developer.apple.com/documentation/alarmkit/alarmmanager/alarmerror/maximumlimitreached)),
  whose value Apple does not publish. Handle the throw, cap concurrent registrations, and prefer
  `.relative` recurrence for genuinely repeating reminders.
- **Reconcile with `alarms`, not with a fired-event.** On foreground, diff the daemon's `alarms`
  against `VRAlarmStore` — missing entries fired ([alarms](https://developer.apple.com/documentation/alarmkit/alarmmanager/alarms)).
  That distinguishes "rang and was ignored" (comeback already pre-scheduled; leave it) from
  "still pending", which is exactly the input the nag counter needs.
- **Re-register on launch.** Given FB21273655 ([forums 809398](https://developer.apple.com/forums/thread/809398)),
  don't assume a comeback registered days ago survives an OS point-upgrade.
- **Optional polish, foreground only:** with `alarmUpdates` + `stop(id:)` we can make the nag feel
  intentional whenever the app is alive — stop the ring, real silence, next voice on our timer.
  Locked and untouched, the pre-scheduled ladder is still the only thing that works.

---

### Sources

AlarmKit: [framework](https://developer.apple.com/documentation/AlarmKit) ·
[Scheduling an alarm with AlarmKit](https://developer.apple.com/documentation/AlarmKit/scheduling-an-alarm-with-alarmkit) ·
[AlarmManager](https://developer.apple.com/documentation/alarmkit/alarmmanager) ·
[Alarm](https://developer.apple.com/documentation/alarmkit/alarm) ·
[AlarmPresentation](https://developer.apple.com/documentation/alarmkit/alarmpresentation) ·
[AlarmPresentationState](https://developer.apple.com/documentation/alarmkit/alarmpresentationstate) ·
[AlarmAttributes](https://developer.apple.com/documentation/alarmkit/alarmattributes) ·
[AlarmConfiguration](https://developer.apple.com/documentation/alarmkit/alarmmanager/alarmconfiguration)
Sessions: [WWDC25 230](https://developer.apple.com/videos/play/wwdc2025/230/) ·
[WWDC26 343](https://developer.apple.com/videos/play/wwdc2026/343/)
Notifications/audio: [UNNotificationInterruptionLevel](https://developer.apple.com/documentation/usernotifications/unnotificationinterruptionlevel) ·
[Critical Alerts entitlement](https://developer.apple.com/documentation/bundleresources/entitlements/com.apple.developer.usernotifications.critical-alerts) ·
[UNNotificationSound](https://developer.apple.com/documentation/usernotifications/unnotificationsound) ·
[AVAudioSession.Category.playback](https://developer.apple.com/documentation/avfaudio/avaudiosession/category-swift.struct/playback)
Release notes: [26.1](https://developer.apple.com/documentation/ios-ipados-release-notes/ios-ipados-26_1-release-notes) ·
[26.2](https://developer.apple.com/documentation/ios-ipados-release-notes/ios-ipados-26_2-release-notes) ·
[26.3](https://developer.apple.com/documentation/ios-ipados-release-notes/ios-ipados-26_3-release-notes) ·
[26.4](https://developer.apple.com/documentation/ios-ipados-release-notes/ios-ipados-26_4-release-notes)
Apple-hosted forums (DTS reply / community report): [833511](https://developer.apple.com/forums/thread/833511) ·
[809398](https://developer.apple.com/forums/thread/809398)
