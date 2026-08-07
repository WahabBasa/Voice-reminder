# AK-4: iOS scheduling branch + foreground reconciliation

**Read first:** `docs/alarmkit-port-prd.md` (contract + guard 3). Key existing flows: `scheduleReminder` in `lib/notifications.ts` (~line 1233), startup sync in `app/_layout.tsx` → `syncRemindersOnStartup`, event handling `handleNotifeeEvent` (DELIVERED/PRESS paths).

## Goal

When on iOS 26+ with authorization granted, reminders schedule as AlarmKit alarms instead of notifee triggers; taps on native alarm buttons reconcile into app state on next foreground. Everything else (Android, iOS < 26, denied auth) behaves exactly as today.

## Owns (do not touch other files)

- `lib/alarmKit.ts` (new) — typed wrapper over `NativeModules.AlarmKitBridge` per the PRD contract, safe no-op stubs when the native module is absent (so Jest and Android never break)
- `lib/notifications.ts` — iOS-gated branches only; zero behavioral change to Android paths
- `app/_layout.tsx` — one reconciliation call site on foreground

## Tasks

- [ ] `lib/alarmKit.ts`: contract wrapper + `useAlarmKit(): Promise<boolean>` decision helper (`Platform.OS === "ios"` && `isSupported()` && authorized). Cache the decision per session.
- [ ] Authorization ask: piggyback the existing `PermissionPrompt` flow's notification step — request AlarmKit authorization right after notification permission on iOS 26 (read `components/PermissionPrompt.tsx` for the pattern; if editing it is unavoidable, keep the diff to the iOS permission row only).
- [ ] `scheduleReminder`: when `useAlarmKit()`, call `ensureAlarmSound(reminderId, wavUrl)` (from `lib/alarmSounds.ts`, AK-3) then `scheduleAlarm({...})` with the app key `reminder_${reminderId}_${scheduledFor}`; skip the notifee trigger entirely for this occurrence. Else: existing path untouched.
- [ ] Cancellation flows (`removeReminderFully`, occurrence cancels, refresh paths): mirror into `cancelAlarm(appKey)` under the same gate.
- [ ] Reconciliation on foreground (AppState listener in `_layout` + on cold start): drain `getAndClearEventLog()`:
  - `stopped` → record completion "done" (mirror the existing dismiss_action bookkeeping), schedule next occurrence for recurring reminders.
  - `snoozed` → record snooze bookkeeping only; the NATIVE side already scheduled the follow-up — do not reschedule (PRD guard 3: skip recalculation while `snoozeUntil` is in the future).
  - `fired` + no stop/snooze + past ring-timeout → missed, drive the follow-up ladder via existing JS engine.
- [ ] `getScheduledAlarms()` used in startup sync to detect gaps (reminder active but no alarm scheduled → reschedule), replacing the notifee-ID check under the gate.
- [ ] vrLog every branch decision (`alarmkit` scope): scheduled, cancelled, reconciled_stopped, reconciled_snoozed, gap_resync.

## Acceptance

- All existing tests pass untouched; new Jest tests cover the gate decision, app-key format, and reconciliation branching with a mocked bridge (target ≥ 15 new assertions).
- With the mocked bridge in "unsupported" mode, behavior is byte-identical to today (regression suite proves Android/old-iOS safety).

## Out of scope

Native code (AK-1/2), wav generation (AK-3), variant ladder parity (v2).
