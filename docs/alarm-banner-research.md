# Alarm banner research — what AlarmKit lets us customize (iOS 26.x)

Question: when an AlarmKit alarm fires on a **locked** iPhone, what exactly can we customize about the
presentation — and is a fully custom banner possible at all? Plus: what do we control when the app is
**open**? Researched 2026-08-12 against Apple docs (iOS 26.0–26.4 symbol pages), WWDC25 session 230,
and shipped-app reports. Companion to `docs/cl4-escalation-research.md` (that one covers escalation/sound;
this one covers pixels).

---

## Verdict in one paragraph

**A fully custom alarm banner is impossible on a locked phone.** The alerting UI is drawn by the system,
out of process, from a fixed template. Our entire design surface at fire time is: **one title string, one
tint color, and one optional secondary button (text + SF Symbol + text color)** — and as of **iOS 26.1 even
the stop button is no longer ours** (`stopButton` is deprecated and ignored; the system renders its own
slide‑to‑stop control). There is no layout, no image, no body text, no background, no font, no custom view.
The only surface where we can draw real SwiftUI is the **Live Activity** (Lock Screen banner + Dynamic
Island + StandBy) — and by Apple's own sample docs the widget extension customizes **non‑alerting**
presentations only, i.e. countdown and paused, which our app does not currently use at all. When the app is
**open**, we still do not own the screen: the system alert presents over the foreground app; the only way to
own the pixels is to observe `AlarmManager.alarmUpdates`, call `stop(id:)` the moment a rung goes
`.alerting`, and immediately drive our own React Native screen + audio. That native path is not built yet.

---

## Capability matrix

Legend: **Custom** = we set it · **Fixed** = system renders, we cannot influence · **Impossible** = no API exists.

### A. Locked phone, alarm firing (the full‑screen alert)

| Element | Status | Detail / citation |
|---|---|---|
| Title text | **Custom** | `AlarmPresentation.Alert.title: LocalizedStringResource` — "The title of the alert." ([docs](https://developer.apple.com/documentation/alarmkit/alarmpresentation/alert-swift.struct)) |
| Title styling (font, size, weight, alignment) | **Fixed** | No API. Only the tint color touches it. |
| App name shown under/next to title | **Fixed** | WWDC25 230: "people are presented with the custom alarm title, as well as the name of your app" ([session](https://developer.apple.com/videos/play/wwdc2025/230/)) |
| Subtitle / body / second line | **Impossible** | `Alert` has exactly 4 members: `title`, `stopButton`, `secondaryButton`, `secondaryButtonBehavior`. |
| Image / artwork / avatar / album art | **Impossible** | No image member anywhere in `AlarmPresentation` or `AlarmAttributes`. |
| Background color / material / blur | **Impossible** | Not exposed. |
| Tint color | **Custom (narrow)** | `AlarmAttributes.tintColor: Color` — "The tint color applied to the templated UI." WWDC25: "On the lock screen, it is used to tint the symbol in the secondary button as well as the alarm title and the countdown." So: secondary‑button glyph + title text, nothing else. |
| **Stop button** label / icon / color | **Fixed on iOS 26.1+** | `stopButton` is **deprecated**: "This property is not used anymore and will be removed." The replacement init is `init(title:secondaryButton:secondaryButtonBehavior:)`, availability **iOS 26.1**, abstract: "Creates an alert for an alarm, **with a system-provided stop control**". iOS 26.1 shipped slide‑to‑stop system‑wide (users can revert to a tap button via Accessibility → Prefer Single‑Touch Actions). ([stopButton](https://developer.apple.com/documentation/alarmkit/alarmpresentation/alert-swift.struct/stopbutton), [9to5Mac](https://9to5mac.com/2025/12/11/ios-26-1-makes-alarms-use-a-slider-heres-how-to-get-stop-button-back/)) |
| Stop **action** | **Custom** | `stopIntent:` on `AlarmConfiguration` still runs our App Intent. The label is theirs; the behavior is ours. |
| Secondary button — presence | **Custom** | `secondaryButton: AlarmButton?` — optional. |
| Secondary button — text | **Custom** | `AlarmButton.text` |
| Secondary button — icon | **Custom, SF Symbols only** | `AlarmButton.systemImageName` — "The name of the icon you use on the button." No custom/bundled assets. |
| Secondary button — text color | **Custom** | `AlarmButton.textColor` |
| Secondary button — shape/position/size | **Fixed** | Template. |
| Third button | **Impossible** | Max two: "each alert displaying up to two buttons". |
| Secondary behavior | **Custom (2 options)** | `.countdown` or `.custom`. No `.snooze` case exists. |
| Number of buttons/layout/orientation | **Fixed** | Template. |
| Whether it breaks Silent/Focus | **Fixed (always yes)** | WWDC25: "the alert breaks through the silent mode and the current focus." |
| Sound | **Custom (constrained)** | `.default` or `.named(String)` from bundle / `Library/Sounds`; loops until stopped; baked at schedule time. See `cl4-escalation-research.md`. |
| Haptics | **Fixed** | No API. |
| Ring duration / auto‑stop | **Impossible** | No API stops an unattended alert (already established in CL‑4 research). |
| **A custom SwiftUI view instead of the alert** | **Impossible** | Sample doc: "The widget extension customizes **non-alerting** presentations in the Dynamic Island, Lock Screen, and StandBy." ([Scheduling an alarm with AlarmKit](https://developer.apple.com/documentation/alarmkit/scheduling-an-alarm-with-alarmkit)) |

### B. Lock Screen Live Activity + Dynamic Island + StandBy (non‑alerting states)

This is the only layer with real design freedom — and it only exists for **countdown / paused**, which we
do not ship.

| Element | Status | Detail |
|---|---|---|
| Full custom SwiftUI Lock Screen banner | **Custom** | Standard ActivityKit widget. `AlarmAttributes` conforms to `ActivityAttributes`; the widget extension receives the same attributes incl. our metadata. |
| Dynamic Island compact / minimal / expanded | **Custom** | Normal Live Activity regions. Expanded region ≈160pt tall. |
| StandBy presentation | **Custom** | Same widget. |
| Custom metadata driving the view | **Custom** | `metadata: Metadata?` where `Metadata: AlarmMetadata` — arbitrary Codable payload (WWDC25 shows switching icons off it). |
| Which state renders | **System‑driven** | `AlarmPresentationState.mode` = `.countdown(fireDate:)` / `.alerting` / `.paused`; the system updates it, the widget reads it. |
| Rendering a custom view for `.alerting` | **Effectively unavailable** | The mode case exists, but the alert surface is system‑owned; Apple's sample scopes the widget to non‑alerting states. Treat any alerting‑state widget view as unspecified behavior, not a design surface. |
| Fallback when the Live Activity can't run | **System, partly configurable** | WWDC25: after a restart before first unlock "your Live Activity cannot be shown… you can still customize the system's presentation of your countdown" via `AlarmPresentation.Countdown` (title + pause button) and `.Paused` (title + resume button). |
| Cost of adopting countdown without a widget | **Hard requirement** | Sample doc: "AlarmKit expects a widget extension if an app supports a countdown presentation. Otherwise, the system may unexpectedly dismiss alarms and fail to alert." |

### C. App open / foreground

| Question | Answer | Detail |
|---|---|---|
| Does the system alert still present over our app? | **Yes** | It is the same alert; the landscape bug thread describes "the alert presentation is not shown" as the *bug*, i.e. showing over the foreground app is the expected behavior. ([forum 806681](https://developer.apple.com/forums/thread/806681)) |
| Is there a "will fire" callback to suppress it? | **No suppression API** | No `willPresent`‑style hook. `AlarmManager.alarmUpdates` is "An asynchronous sequence that emits events when the set of alarms changes" — it tells us a rung entered `Alarm.State.alerting`, after the fact. |
| Can we take over the screen anyway? | **Yes, by stop‑and‑replace** | Observe `alarmUpdates` → on `.alerting` call `AlarmManager.shared.stop(id:)` ("Stops the alarm with the specified ID") → the system alert goes away → we present our own RN screen and play audio ourselves. Same mechanism already recommended as CL‑4 option 1. |
| Once we've stopped it, how much UI freedom? | **Total** | It's just our app: any layout, animation, artwork, fonts, our own audio pipeline, our own escalation timing. |
| Reliability caveats when foregrounded | **Known bugs** | (a) Alarm does not present while a foregrounded app is in **landscape**; workaround is a **1‑second `preAlert`** — Apple's own Reminders app adopted a preAlert in 26.2 ([forum 806681](https://developer.apple.com/forums/thread/806681)). (b) Long‑standing reports that with the device **unlocked** only sound/haptics arrive and no visual alert appears, with the community pointing at a missing Live Activity/widget extension ([forum 792814](https://developer.apple.com/forums/thread/792814)); a migration write‑up reports the same ("I couldn't trigger the alarm from the unlocked screen… Only haptic feedback occurred once"). **We ship no widget extension, so we are in exactly that configuration.** |

---

## Current code — what we actually pass today

`plugins/withAlarmKit.js:401-439` (`VRAlarmScheduler.makeConfiguration`) and the mirrored buttons in
`plugins/ios-src/VRAlarmIntents.swift:348-364`:

```swift
let alert = AlarmPresentation.Alert(
  title: LocalizedStringResource(stringLiteral: title),
  stopButton: AlarmButton(text: "Done",  textColor: .white, systemImageName: "checkmark.circle.fill"),
  secondaryButton: AlarmButton(text: "Later", textColor: .white, systemImageName: "clock.badge"),
  secondaryButtonBehavior: .custom
)
let attributes = AlarmAttributes<VRAlarmMetadata>(
  presentation: AlarmPresentation(alert: alert),      // alert only — no countdown, no paused
  metadata: VRAlarmMetadata(appKey: appKey, values: metadata),
  tintColor: Color.accentColor
)
```

Notes, in priority order:

1. **We use the deprecated 4‑arg init.** On iOS 26.1+ the "Done" text and `checkmark.circle.fill` are dead
   config — the user sees the system slide‑to‑stop control. Nothing breaks, but any design that assumes a
   "Done" button on the alert is wrong. Migrating to `init(title:secondaryButton:secondaryButtonBehavior:)`
   would raise the deployment floor to 26.1, so keep the old init behind availability if we care about 26.0.
2. **Title is our only real content channel.** It's `title` from `AlarmKitScheduleOptions`
   (`lib/alarmKit.ts:18-27`), i.e. the reminder title. No subtitle exists, so anything the user must read on
   the lock screen has to be folded into that one string.
3. **`tintColor: Color.accentColor`** — the attributes are encoded and rendered out of process, so a
   semantic color is a risk: it may resolve to system blue rather than our brand accent. Swap for a literal
   `Color(red:green:blue:)` and verify on device. This is our single strongest branding lever on the locked
   screen and it currently isn't pinned.
4. **`secondaryButtonBehavior: .custom`** is correct for us (only `.custom` runs `VRSnoozeIntent`); the
   trade‑off is that we forgo the system countdown state entirely — consistent with shipping no widget.
5. **No widget extension exists** (`grep -i widget plugins/withAlarmKit.js` → nothing; no `ios/` target).
   So: no Lock Screen Live Activity, no Dynamic Island presence, no StandBy — and we may be sitting in the
   forum‑792814 failure mode where an unlocked device gets sound with no visual.
6. **No foreground handling on the iOS path.** `lib/alarmKit.ts` exposes only
   `isSupported / requestAuthorization / scheduleAlarm / cancelAlarm / getScheduledAlarms /
   getAndClearEventLog`; there is no `alarmUpdates` observer and no `stop()` bridge method. Our rich
   full‑screen alarm screen `app/alarm.tsx` (553 lines) is the **notifee/Android** path — `AlarmActivity` +
   the foreground overlay in `app/_layout.tsx:162+`. Nothing navigates to `/alarm` on iOS. Reconciliation
   happens only on next foreground via `reconcileAlarmEvents` (`lib/alarmKit.ts:361`).

---

## Field gotchas worth designing around

- **Localized strings can rot after a device restart.** Alarm UI text has been reported to fall back to raw
  keys ("alarm_ui_stop_button") after reboot, fixed only by re‑registering the alarm; FB20472264, unfixed as
  of 26.1 beta 2 ([forum 802740](https://developer.apple.com/forums/thread/802740)). We pass literal strings,
  not keys, which sidesteps the worst of it — but it argues for re‑registering alarms after a reboot.
- **Stacked alerts can be inert.** An alarm scheduled at 00:00 reproducibly presents the full‑screen alert
  **twice**, and the second view's Stop/Snooze are unresponsive (physical buttons still stop it), no Apple
  reply ([forum 803735](https://developer.apple.com/forums/thread/803735)). Relevant to our 3‑rung ladder:
  overlapping alerts are not a supported, well‑behaved presentation.
- **Live Activities can get stuck empty** if dismissed by swipe rather than the X, leaving a blank Dynamic
  Island artifact; FB22295664 ([forum 812006](https://developer.apple.com/forums/thread/812006)). Applies if
  we adopt a widget.
- **Alarm count is capped per app** by the system — relevant since each occurrence expands into up to 3 rungs.
- **The alert is mirrored to a paired Apple Watch** ("The alert presentation is forwarded to a paired watch"),
  so title copy has to survive a tiny screen too.

---

## Recommendation for the banner‑design ticket

**What a designer can actually work with, per state:**

**1. Locked / alarm ringing — treat as copywriting, not visual design.** Deliverables are:
   - the **title string** (the whole message; assume it may truncate to ~1–2 lines and is mirrored to Watch);
   - the **secondary button** label + one **SF Symbol** + its text color (currently "Later" / `clock.badge`);
   - one **tint color** that will paint the title text and the secondary glyph — and nothing else.
   Do **not** brief a background, illustration, layout, or a styled Stop control: on 26.1+ the stop affordance
   is a system slide‑to‑stop the user can even change in Accessibility. Mock it as an iOS system alarm alert
   with our words in it.

**2. Lock Screen / Dynamic Island (Live Activity) — the real canvas, but it costs a widget extension and a
   countdown state.** If we want any pre‑fire brand presence (a "reminder in 2 min" banner, an icon in the
   Dynamic Island, a StandBy card) that is a full SwiftUI design and it's ours end to end. Two conditions:
   we must add a widget extension target to the prebuild plugin, and we must adopt a countdown presentation
   (`preAlert`) to have something to show. Bonus: a 1s `preAlert` is also the documented workaround for the
   landscape no‑show bug, and Apple's Reminders adopted one — so this pays for itself twice.

**3. App open — design freely, but only after we build stop‑and‑replace.** Once the native bridge observes
   `alarmUpdates` and calls `stop(id:)` on `.alerting`, the foreground experience is a normal React Native
   screen: we can reuse/port `app/alarm.tsx`'s full‑screen treatment to iOS, run our own audio (fixing the
   attended custom‑sound bug), and animate our own escalation with real silence between voices. Until that
   lands, the honest answer for foreground is "the system alert appears over our app, and on an unlocked
   device it may not appear at all — just sound."

**Design principle to hand over:** brand identity on the lock screen is carried by *title voice + tint +
one glyph*. Everything richer has to live either before the alarm (Live Activity) or after the user engages
(app open). Do not design a locked‑screen banner that cannot be expressed as those three things.

---

## Open questions / device tests to run

1. Does `Color.accentColor` render as our brand accent or as system blue on a real locked alert? (Swap to a
   literal color and A/B it.)
2. With no widget extension, does an **unlocked** device show the full‑screen alert at all on 26.1+, or only
   sound/haptics (forum 792814)? This decides whether the Live Activity work is cosmetic or load‑bearing.
3. Does adding `preAlert: 1s` change our fire timing/reliability, and does it force a countdown presentation
   (and therefore a widget) for us?
4. On 26.1+, is the "Done" stop label truly ignored (expected), and does `VRStopIntent` still fire from the
   slide control?
5. Ladder overlap: how do two simultaneous alerts stack visually, and is the second one responsive
   (cf. forum 803735)? Same test already queued in `cl4-escalation-research.md`.

---

## Sources

- [AlarmPresentation](https://developer.apple.com/documentation/alarmkit/alarmpresentation) — `alert` / `countdown` / `paused`
- [AlarmPresentation.Alert](https://developer.apple.com/documentation/alarmkit/alarmpresentation/alert-swift.struct) — the 4 members
- [AlarmPresentation.Alert.stopButton](https://developer.apple.com/documentation/alarmkit/alarmpresentation/alert-swift.struct/stopbutton) — deprecation notice
- [init(title:secondaryButton:secondaryButtonBehavior:)](https://developer.apple.com/documentation/alarmkit/alarmpresentation/alert-swift.struct/init(title:secondarybutton:secondarybuttonbehavior:)) — iOS 26.1, "system-provided stop control"
- [AlarmPresentation.Alert.SecondaryButtonBehavior](https://developer.apple.com/documentation/alarmkit/alarmpresentation/alert-swift.struct/secondarybuttonbehavior-swift.enum) — `.countdown` / `.custom` only
- [AlarmButton](https://developer.apple.com/documentation/alarmkit/alarmbutton) — text / textColor / systemImageName
- [AlarmAttributes](https://developer.apple.com/documentation/alarmkit/alarmattributes) — presentation / metadata / tintColor, ActivityAttributes conformance
- [AlarmPresentationState](https://developer.apple.com/documentation/alarmkit/alarmpresentationstate) — `.alerting` / `.countdown` / `.paused`
- [AlarmManager](https://developer.apple.com/documentation/alarmkit/alarmmanager) — `alarmUpdates`, `stop(id:)`, `countdown(id:)`, `cancel(id:)`
- [Scheduling an alarm with AlarmKit](https://developer.apple.com/documentation/alarmkit/scheduling-an-alarm-with-alarmkit) — widget extension expectation, "non-alerting presentations", Watch forwarding
- [WWDC25 session 230 — Wake up to the AlarmKit API](https://developer.apple.com/videos/play/wwdc2025/230/) + [WWDCNotes](https://wwdcnotes.com/documentation/wwdc25-230-wake-up-to-the-alarmkit-api/)
- Apple forums: [806681](https://developer.apple.com/forums/thread/806681) landscape/foreground + preAlert · [792814](https://developer.apple.com/forums/thread/792814) no visual when unlocked · [803735](https://developer.apple.com/forums/thread/803735) double alert at 00:00 · [802740](https://developer.apple.com/forums/thread/802740) localized strings lost after restart · [812006](https://developer.apple.com/forums/thread/812006) empty Live Activity
- [9to5Mac — iOS 26.1 slide-to-stop alarms](https://9to5mac.com/2025/12/11/ios-26-1-makes-alarms-use-a-slider-heres-how-to-get-stop-button-back/)
- [Designing custom AlarmKit interfaces in SwiftUI](https://www.createwithswift.com/designing-custom-alarmkit-interfaces-in-swiftui/) · [Migrating from UserNotifications to AlarmKit](https://toyboy2.medium.com/migrating-from-usernotifications-to-alarmkit-in-ios-26-3ed81a53a7b7)
