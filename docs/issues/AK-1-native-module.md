# AK-1: Native AlarmKit module + Expo config plugin

**Read first:** `docs/alarmkit-port-prd.md` (frozen contract, race guards, risks). Prior art for the plugin pattern: `plugins/withAlarmAudioModule.js` (Android equivalent — embeds native source as strings, injects via config plugin).

## Goal

An Expo config plugin that injects a Swift React Native module implementing the `AlarmKitBridge` contract from the PRD, compiling clean on EAS iOS builds, with everything iOS-26-gated at runtime.

## Owns (do not touch other files)

- `plugins/withAlarmKit.js` (new) — including embedded Swift source strings
- `app.json` — add the plugin to the plugins array ONLY

## Tasks

- [ ] Research exact AlarmKit API surface against Apple documentation (AlarmManager, AlarmConfiguration/AlarmPresentation, authorization, custom sound). Do not trust blog snippets for signatures.
- [ ] `AlarmKitBridge.swift`: RCT module exporting the PRD contract methods. All AlarmKit references behind `@available(iOS 26.0, *)`; `isSupported()` returns false below 26 so the app never crashes on older iOS.
- [ ] `VRAlarmScheduler.swift`: AlarmManager wrapper. UUID registry in UserDefaults (`vr_alarm_uuids`, appKey → UUID). Implements UUID rotation: cancel existing UUID for the app key before scheduling (PRD guard 5). Event log append helper (`vr_alarm_events`).
- [ ] Alarm configuration: title from opts, custom sound by `soundName` (bare filename, file expected in Library/Sounds — include the extension; device builds only), Stop button ("Done") + `.custom` secondary button ("Later") wired to intent identifiers defined in the PRD (`VRStopIntent`, `VRSnoozeIntent` — AK-2 implements them; reference by name, and include a compile-safe placeholder so AK-1 builds standalone).
- [ ] Config plugin: `withXcodeProject` mod adds the Swift files to the app target; `withInfoPlist` adds `NSAlarmKitUsageDescription` ("VoiceReminder uses alarms so spoken reminders ring even when your phone is silenced."). Follow the string-embed + `withDangerousMod(["ios", ...])` write pattern from `withAlarmAudioModule.js`.
- [ ] Plugin exposes a hook point (documented comment + directory convention) where AK-2's `VRAlarmIntents.swift` will be added as a third source file.
- [ ] Proof of life: add nothing to app screens — export a `scheduleTestAlarm(secondsFromNow)` extra method on the bridge (dev use only, callable from the existing diagnostics screen later).

## Acceptance

- `npx expo config --type prebuild` evaluates without error.
- EAS iOS build (`preview` profile) compiles green with the plugin active.
- On device (manual step, not yours): `isSupported()` → true; `scheduleTestAlarm(60)` rings through a locked, muted phone.

## Out of scope

Intent business logic (AK-2), JS wrapper (AK-4), sound generation (AK-3). Android anything.
