# PRD: iOS AlarmKit Port — Mute-Proof Alarms

**Status:** Approved for build · **Date:** 2026-08-07 · **Owner:** Abdul Wahab

## Problem

VoiceReminder's iOS build delivers reminders as regular notifications (notifee / UNUserNotificationCenter). iOS treats those as *suggestions*: the mute switch silences them, Focus modes suppress or delay them, and delivery while locked was observed silent even with the ringer on (2026-08-07 device testing, iPhone 12 / iOS 26). The app's entire value is "the reminder is heard." On iOS today, it often isn't.

Critical Alerts entitlement was considered and **dropped**: reminder apps get rejected (confirmed by FamWake's experience), and it still wouldn't give us the full-screen alarm surface.

## Solution

Adopt **AlarmKit** (iOS 26+): the native alarm framework that rings like the built-in Clock app — full volume through the mute switch, Focus, and lock screen, with system-provided full-screen presentation and buttons.

## Acceptance test (definition of done)

> iPhone locked, mute switch ON, a Focus mode active: a reminder created by voice fires at its scheduled time as a full-screen system alarm, plays the reminder's own spoken TTS line at alarm volume, and shows Done + Later buttons. Done records completion in the app on next open. Later reschedules per the reminder's snooze settings without opening the app — and the follow-up actually fires.

## Non-goals (v1)

- No change to any Android code path. Every new branch is `Platform.OS === "ios"` + iOS 26 gated.
- iOS < 26 keeps today's notification behavior (graceful degradation, not parity).
- Escalation-ladder variant *cadence* (alternating spoken lines, speak-twice) stays app-side for v1; the native alarm plays the occurrence's single line. Ladder parity natively is v2.
- No Live Activity countdown UI customization beyond what the alarm requires.

## Architecture

```
JS (lib/alarmKit.ts)                     Swift (native, iOS 26+)
────────────────────                     ───────────────────────
scheduleReminder() ──iOS26?──► AlarmKitBridge.scheduleAlarm()
                                  │  AlarmManager + UUID registry
                                  │  sound: reminder_{id}.wav (Library/Sounds)
                                  ▼
                               System alarm fires (mute-proof)
                                  │
                    ┌─────────────┴─────────────┐
              StopIntent (Done)          SnoozeIntent (Later)
              openAppWhenRun=true        openAppWhenRun=false
              guard: skip cancel if      1. write snooze_until guard
              active snooze guard        2. schedule follow-up natively
                    │                    3. Task.sleep(1s) before return
                    ▼                          │
              App foregrounds            Event appended to native event log
                    │                          │
                    └────────► JS reconciliation on next foreground:
                               getAndClearEventLog() → record completion /
                               missed / snooze bookkeeping in Convex + store
```

## Frozen native contract (all issues code against this)

```ts
// NativeModules.AlarmKitBridge — implemented by AK-1, consumed by AK-4
interface AlarmKitBridge {
  isSupported(): Promise<boolean>;              // iOS 26+ and framework available
  requestAuthorization(): Promise<"authorized" | "denied" | "notDetermined">;
  scheduleAlarm(opts: {
    id: string;               // app key: `reminder_${reminderId}_${scheduledFor}`
    fireDate: number;         // epoch ms
    title: string;            // reminder title, shown on alarm surface
    soundName: string | null; // bare filename in Library/Sounds (e.g. "reminder_abc.wav"); null = system default
    snoozeMinutes: number;    // Later button window (reminder.snoozeDuration, default 5)
    metadata: { [k: string]: string }; // reminderId, scheduledFor, tier, variantIndex
  }): Promise<string>;        // native alarm UUID
  cancelAlarm(id: string): Promise<void>;       // by app key; resolves silently if absent
  getScheduledAlarms(): Promise<Array<{ id: string; uuid: string; fireDate: number }>>;
  getAndClearEventLog(): Promise<Array<{
    type: "stopped" | "snoozed" | "fired";
    id: string;               // app key
    at: number;               // epoch ms
    snoozeUntil?: number;     // present on "snoozed"
  }>>;
}
```

Event log storage: `UserDefaults` under key `vr_alarm_events` (JSON array). Intents append; JS drains on foreground. UUID registry: `UserDefaults` key `vr_alarm_uuids` (appKey → UUID string).

## Race-condition guards (mandatory, from FamWake production findings)

1. **Snooze guard first:** SnoozeIntent writes `snooze_until_{appKey}` to UserDefaults *before* any other work.
2. **Stop-intent protection:** iOS fires StopIntent even when the user taps Snooze. StopIntent must check the snooze guard and skip cancellation/completion logic if a snooze is active.
3. **Reconciliation guard:** JS reconciliation ignores schedule recalculation for a reminder whose snooze guard timestamp is in the future.
4. **Suspension sleep:** SnoozeIntent ends with `try? await Task.sleep(nanoseconds: 1_000_000_000)` so AlarmKit registers the follow-up before iOS suspends the process.
5. **UUID rotation:** No `cancelAll()` exists. Always cancel the previous UUID for an app key before scheduling a new one; persist the mapping.

Additional pitfalls: use `.custom` (not `.snooze`) for the secondary button so our intent runs; `.caf`/extension handling differs simulator vs device (we build device-only — include the extension); `UIBackgroundModes: alarm` is NOT needed.

## Sound pipeline

AlarmKit alarm sounds must be a named audio resource (Library/Sounds), formats per UNNotificationSound rules: wav/aiff/caf, ≤ 30s. Our TTS lines are 3–8s but currently **mp3**. Pipeline change: ElevenLabs emits PCM → Convex action wraps a 44-byte WAV header → client hydration writes `reminder_{id}.wav` into Library/Sounds (iOS only) alongside the existing documentDirectory copy used for in-app playback.

## Risks

- **Config-plugin Xcode injection** is the hardest infra piece (Swift sources + App Intents must join the Xcode project via `withXcodeProject` mods). Prior art exists in the repo for Android (`plugins/withAlarmAudioModule.js`); iOS equivalent is AK-1's core deliverable.
- **AlarmKit API drift** — iOS 26 is new; pin exact API usage during AK-1 research against Apple docs, not blog posts.
- **No Mac:** all iteration via EAS cloud builds (~15 min/cycle) + Sentry live logs. Budget for 3–5 build cycles.

## Rollout

1. **Proof of life:** AK-1 alone → build → a hardcoded test alarm rings through locked+muted phone (triggered from diagnostics screen).
2. **Integration:** AK-2/3/4 merge → reminders schedule natively end-to-end.
3. **Ladder v2:** native follow-up chain with variant lines (separate PRD addendum).

## Work breakdown

| Issue | Title | Parallel-safe with | Owns files |
|-------|-------|--------------------|-----------|
| AK-1 | Native AlarmKit module + config plugin | all | `plugins/withAlarmKit.js` (+ embedded Swift: Bridge, Scheduler) |
| AK-2 | Stop/Snooze App Intents with race guards | all | embedded Swift: `VRAlarmIntents.swift` template (integrated via AK-1's plugin hook) |
| AK-3 | WAV TTS pipeline + Library/Sounds hydration | all | `convex/helpers.ts` (TTS fn only), `lib/alarmSounds.ts` (new) |
| AK-4 | iOS scheduling branch + foreground reconciliation | AK-1..3 via contract | `lib/alarmKit.ts` (new), `lib/notifications.ts` (iOS branches only) |
| AK-5 | Tests, vrLog instrumentation, device test plan | all | `__tests__/lib/alarmKit*`, `docs/alarmkit-test-plan.md` |

Integration order after parallel work: AK-1 → +AK-2 (same plugin, intents file slot) → +AK-3 → +AK-4 → AK-5 checklist on device.
