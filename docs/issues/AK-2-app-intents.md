# AK-2: Done/Later App Intents with race-condition guards

**Read first:** `docs/alarmkit-port-prd.md` — especially the five race guards. They are the entire reason this issue exists as careful work rather than boilerplate.

## Goal

`VRAlarmIntents.swift`: the Stop ("Done") and Snooze ("Later") LiveActivityIntent implementations that make button taps trustworthy despite iOS firing StopIntent even on Snooze taps.

## Owns (do not touch other files)

- `VRAlarmIntents.swift` — authored as a standalone Swift source with an integration note; AK-1's plugin has a documented hook slot for it. Deliver the file content plus a ≤10-line patch description for slotting it into `plugins/withAlarmKit.js`. Do NOT edit the plugin yourself (AK-1 owns it).

## Behavior spec

**VRSnoozeIntent** (`openAppWhenRun = false`):
1. FIRST: write `snooze_until_{appKey}` = now + snoozeMinutes to UserDefaults (guard 1).
2. Append `{type:"snoozed", id, at, snoozeUntil}` to `vr_alarm_events`.
3. Schedule the follow-up alarm directly via the scheduler (static/shared path — no MainActor dependency), new UUID, rotating the old one (guard 5). Reuse the same soundName and title from the alarm's metadata.
4. END with `try? await Task.sleep(nanoseconds: 1_000_000_000)` (guard 4).

**VRStopIntent** (`openAppWhenRun = true`):
1. Check `snooze_until_{appKey}`: if in the future, a snooze is active — append nothing, cancel nothing, return (guard 2). iOS fired this spuriously.
2. Otherwise append `{type:"stopped", id, at}` to the event log and clear the app key's UUID registry entry.
3. No completion recording here — the app opens (openAppWhenRun) and JS reconciliation handles Convex/store writes.

Both intents must be resilient to missing metadata (log to event log with what exists; never throw).

## Tasks

- [ ] Implement both intents per spec, `@available(iOS 26.0, *)`.
- [ ] Alarm button config constants (labels "Done"/"Later") exposed for AK-1's presentation setup; secondary behavior `.custom`, never `.snooze`.
- [ ] Unit-test the guard logic in Swift where feasible without a Mac (pure functions for guard decisions extracted so logic is reviewable; compilation is verified by the EAS build in integration).
- [ ] Integration note for AK-1's hook slot.

## Acceptance

- Post-integration EAS build compiles.
- Device script (manual): fire alarm → tap Later → follow-up rings after snooze window (guard 4 proof) → tap Done on follow-up → no further alarms (guard 2 proof: the spurious Stop during the earlier Later did not cancel the chain).

## Out of scope

Scheduling entry points (AK-1), JS reconciliation consuming the event log (AK-4).

## Integration

Source delivered at `plugins/ios-src/VRAlarmIntents.swift` (487 lines, standalone). AK-1 owns the plugin edit.

### Patch for `plugins/withAlarmKit.js` (≤10 lines)

1. `const VR_ALARM_INTENTS_SWIFT = fs.readFileSync(path.join(__dirname, "ios-src/VRAlarmIntents.swift"), "utf8");` — or inline the string like `withAlarmAudioModule.js` does for Kotlin.
2. In the existing `withDangerousMod(["ios", ...])` writer, add one more `fs.writeFileSync(path.join(iosSrcDir, "VRAlarmIntents.swift"), VR_ALARM_INTENTS_SWIFT)` next to the Bridge/Scheduler writes.
3. In the `withXcodeProject` mod, add `VRAlarmIntents.swift` to the same source-build phase as the other two — same target membership, so `VRAlarmScheduler` resolves.
4. Delete AK-1's compile-safe `VRStopIntent`/`VRSnoozeIntent` placeholders; this file defines them for real.

### Required from AK-1 (contract this file compiles against)

- **Scheduler surface** — the file's only AK-1 reference, isolated in the `INTEGRATION SEAM` section at the bottom. `VRAlarmScheduler` must expose, callable off the main actor:
  ```swift
  static func scheduleAlarm(appKey: String, fireDate: Date, title: String, soundName: String?,
                            snoozeMinutes: Int, metadata: [String: String]) throws -> UUID
  ```
  Different shape is fine — adapt the `typealias VRFollowUpScheduler` + empty conformance extension at the bottom of the file and nothing else moves. It must perform guard 5 internally (cancel the app key's prior UUID, persist the new one to `vr_alarm_uuids`).
- **Presentation wiring** — use `VRAlarmButtons.done`, `VRAlarmButtons.later`, `VRAlarmButtons.secondaryButtonBehavior` (`.custom`). Construct the intents with `VRStopIntent(alarmID:appKey:)` and `VRSnoozeIntent(alarmID:appKey:alarmTitle:soundName:snoozeMinutes:)` — passing title/sound/minutes at schedule time is the primary path; the `vr_alarm_meta` fallback below is belt-and-braces.
- **`vr_alarm_meta`** (new UserDefaults key, appKey → `{title, soundName, snoozeMinutes, metadata}`) — write it in `scheduleAlarm`. The PRD registry only stores appKey → UUID, which is not enough for the snooze follow-up to reuse the original title/sound. If AK-1 would rather not add it, the intent parameters already cover the normal case and the fallback degrades to title "Reminder" + default sound.
- **Event log encoding** — this file writes `vr_alarm_events` as a native plist array of dicts (`[[String: Any]]`) and reads either that or a JSON string. AK-1's `fired` appender and `getAndClearEventLog()` should use the same array shape.
- **Optional** — Info.plist `VRAlarmAppGroup` (e.g. `group.com.wahabbasa.VoiceReminder`); see open question 1.

### Open questions / contract ambiguities

1. **UserDefaults container.** The PRD says `UserDefaults` without qualifying it. If the intents execute in the alarm widget-extension process rather than the app process, `.standard` is a *different* container and every guard silently no-ops across the process boundary. The file routes all access through `VRAlarmIntentDefaults.store`, which prefers an App Group suite named by Info.plist `VRAlarmAppGroup` and falls back to `.standard`. AK-1 should confirm the intents' host process; if it is the extension, add the App Group entitlement to both targets and set that Info.plist key. **AK-4 must read from the same suite.**
2. **`AlarmPresentation.Alert.SecondaryButtonBehavior` spelling.** Written per the iOS 26 API as nested under `AlarmPresentation.Alert` with case `.custom`. AK-1 owns the "verify against Apple docs, not blog posts" task — confirm the nesting when wiring presentation; it is a one-line fix in `VRAlarmButtons`.
3. **Snooze follow-up reuses the original app key** (`reminder_{id}_{scheduledFor}`), not a new one, so guard 3 (`snooze_until_{appKey}`) and guard 5 (UUID rotation on that key) both stay coherent. AK-4 must therefore expect a second `fired`/`stopped` event under an app key whose `scheduledFor` is now in the past.
4. **New event type `snooze_failed`** is appended if the follow-up schedule throws, so a dropped chain is visible to reconciliation instead of silent. Not in the PRD's union type — AK-4 should either handle it as "missed" or ignore it safely.
5. **`AppIntent.description` omitted** on both intents to dodge the optional-vs-non-optional witness ambiguity in the AppIntents protocol; `isDiscoverable = false` keeps them out of Shortcuts/Spotlight.

### Verification without a Mac

`VRAlarmIntentGuards` holds every guard decision as a pure function (no UserDefaults, no clock, no AlarmKit). `VRAlarmIntentGuards.selfTestFailures()` (`#if DEBUG`) runs 22 assertions over the guard-2 decision table, snooze-window normalisation, degraded-metadata fallbacks, and an end-to-end Later → spurious-Stop → follow-up → Done walkthrough; empty return == pass. Wire it into AK-1's diagnostics screen. Compilation itself is only provable by the integration EAS build.
