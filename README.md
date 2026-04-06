# VoiceReminder

VoiceReminder is an Expo/React Native app for creating spoken reminders and scheduling them as Android alarm notifications with custom audio.

This README describes the architecture that is actually implemented in this repo today.

## Overview

- Frontend: Expo SDK 54 + React Native + `expo-router`
- Local app state: Zustand + AsyncStorage
- Alarm scheduling and delivery: Notifee
- Backend processing: Convex
- AI pipeline: OpenAI Whisper + GPT parsing, then TTS via Resemble or ElevenLabs
- Monetization gate: RevenueCat

## Architecture At A Glance

The app is local-first.

- The primary source of truth for reminders and reminder history is the local Zustand store persisted to AsyncStorage in [`lib/store.ts`](./lib/store.ts).
- Scheduled notifications are created locally on-device in [`lib/notifications.ts`](./lib/notifications.ts).
- Reminder audio is cached locally under Expo FileSystem once downloaded.
- Convex is used for AI processing, TTS generation, and audio blob storage, but it is not the complete source of truth for the reminder schedule model.

That distinction matters:

- Local reminder records contain the full scheduling model: `scheduleType`, `onceAt`, `intervalMs`, `anchorAt`, `rrule`, `dtstart`, `tzid`, `until`, `scheduledFor`, and local alarm settings.
- The Convex `reminders` table currently stores a simpler record: title, description, time/date/frequency/days, audio storage state, and timestamps.
- Reminder history is local only.

## Runtime Roots

There are two React roots:

1. Main app root
- Entry: [`index.ts`](./index.ts) -> `expo-router/entry`
- Layout: [`app/_layout.tsx`](./app/_layout.tsx)
- Responsibilities:
  - app shell and route stack
  - startup sync and cleanup
  - RevenueCat initialization
  - Convex provider wiring
  - fallback foreground alarm overlay

2. Alarm root
- Registered in [`index.ts`](./index.ts) as `AppRegistry.registerComponent("alarm", ...)`
- Rendered by [`alarm/AlarmRoot.tsx`](./alarm/AlarmRoot.tsx)
- Used by the dedicated Android `AlarmActivity` for lock-screen/full-screen alarm handling

The `/alarm` route in [`app/alarm.tsx`](./app/alarm.tsx) still exists, but the file is explicitly treated as a debug-only route. The production alarm path is `AlarmActivity` -> `AlarmRoot` -> `AlarmOverlay`.

## Main Screens

- [`app/index.tsx`](./app/index.tsx): home screen, reminder list, completed tab, voice capture entry point, multi-select actions, inline edit sheet
- [`app/reminder/new.tsx`](./app/reminder/new.tsx): manual text reminder creation flow
- [`app/settings.tsx`](./app/settings.tsx): settings, history/paywall/diagnostics entry points
- [`app/history.tsx`](./app/history.tsx): local completion and missed history
- [`app/diagnostics.tsx`](./app/diagnostics.tsx): notification/alarm permission diagnostics and scheduled trigger inspection
- [`app/paywall.tsx`](./app/paywall.tsx): RevenueCat offerings and purchase flow

## Reminder Creation Flows

### Voice flow

Implemented in [`app/index.tsx`](./app/index.tsx) with [`components/RecordingOverlay.tsx`](./components/RecordingOverlay.tsx).

1. User records audio locally with `expo-av`
2. The app checks the free-tier gate before recording can start
3. Fast path:
   - upload recording binary to Convex storage via [`lib/convexUpload.ts`](./lib/convexUpload.ts)
   - call `api.actions.processVoiceReminderFast`
4. Convex action:
   - runs Whisper transcription
   - runs GPT parsing
   - creates a Convex reminder record with `audioStatus: "pending"`
   - schedules background TTS generation
5. App immediately writes a local reminder to Zustand/AsyncStorage
6. App schedules the reminder locally with Notifee
7. [`lib/audioHydration.ts`](./lib/audioHydration.ts) polls Convex until audio is ready, downloads it locally, and refreshes future notifications with the final `audioUrl`

There is also a fallback synchronous path, `processVoiceReminder`, which sends base64 audio and returns with TTS already generated if the fast upload path fails.

### Text flow

Implemented in [`app/reminder/new.tsx`](./app/reminder/new.tsx).

1. User enters title/notes/time/frequency
2. App checks the active-reminder gate
3. Convex action `processTextReminder` generates TTS immediately
4. App writes the reminder locally
5. App schedules the reminder locally with Notifee

## Scheduling Model

The app is in the middle of a unified scheduling model, and the local store already uses it.

Canonical schedule types:

- `once`
- `interval`
- `rrule`

Key files:

- [`lib/schedule.ts`](./lib/schedule.ts): canonical schedule definitions, RRULE support, legacy migration helpers
- [`lib/time.ts`](./lib/time.ts): due-time and next-trigger calculations
- [`lib/reminderActive.ts`](./lib/reminderActive.ts): active/visible reminder logic
- [`lib/store.ts`](./lib/store.ts): schema migration to local `schemaVersion: 4`

Important behavior:

- One-time reminders remain visible locally until completed, even if overdue
- Interval reminders use stable cadence via `anchorAt + k * intervalMs`
- Daily/custom reminders can be normalized into RRULE data locally
- Startup sync in [`lib/notifications.ts`](./lib/notifications.ts) ensures active reminders have scheduled triggers after cold start

## Alarm / Notification Pipeline

The alarm pipeline is Android-first and heavily relies on Notifee plus custom native Android integration.

### Scheduling

[`lib/notifications.ts`](./lib/notifications.ts) is the core notification service.

It is responsible for:

- creating Notifee trigger notifications
- creating per-reminder channels
- downloading and deleting local audio files
- syncing reminders on startup
- handling Notifee foreground/background events
- rescheduling recurring reminders after delivery
- managing pending alarm state and queued alarms in AsyncStorage

### Delivery and UI

When an alarm notification fires:

1. Notifee delivered event is received in [`index.ts`](./index.ts)
2. `handleNotificationEvent` may repost the delivered trigger as a fresh full-screen/displayed notification
3. Pending alarm state is written to AsyncStorage
4. Alarm audio can start immediately from the notification event path
5. On Android, the full-screen notification launches `AlarmActivity`
6. `AlarmActivity` mounts the separate React root `alarm`
7. [`alarm/AlarmRoot.tsx`](./alarm/AlarmRoot.tsx) polls pending alarm state and renders [`components/AlarmOverlay.tsx`](./components/AlarmOverlay.tsx)

If the app is already open and unlocked, [`app/_layout.tsx`](./app/_layout.tsx) also runs a foreground fallback overlay path so the alarm can still render in the main task when `AlarmActivity` is not the active surface.

### Resolve behavior

Dismiss and snooze actions:

- stop alarm audio
- clear displayed notification state
- record completion locally when appropriate
- remove one-time reminders when they are completed
- schedule snooze occurrences when enabled
- finish the dedicated Android alarm task when possible

## Local Data Ownership

### AsyncStorage

Managed through [`lib/store.ts`](./lib/store.ts).

Keys:

- `@reminders`
- `@reminder_history`
- pending-alarm keys in [`lib/notifications.ts`](./lib/notifications.ts)

Stored locally:

- reminder list
- history list
- pending alarm queue/state

### FileSystem

Managed in [`lib/notifications.ts`](./lib/notifications.ts) and [`components/AlarmOverlay.tsx`](./components/AlarmOverlay.tsx).

Stored locally:

- cached reminder audio files like `reminder_<localReminderId>.mp3`

### Convex

Key files:

- [`convex/schema.ts`](./convex/schema.ts)
- [`convex/reminders.ts`](./convex/reminders.ts)
- [`convex/actions.ts`](./convex/actions.ts)

Convex is responsible for:

- storing uploaded/generated audio blobs
- storing a simplified reminder record
- running AI parsing and TTS generation
- returning signed audio URLs

Convex is not currently responsible for:

- local reminder history
- exact alarm scheduling
- the full unified schedule state used by the app

## Purchases And Limits

The free tier limit is enforced locally:

- limit: 5 active reminders
- gate logic: [`lib/usageGate.ts`](./lib/usageGate.ts)
- RevenueCat integration: [`lib/purchases.ts`](./lib/purchases.ts)

The app only calls RevenueCat when the local active reminder count is at or above the free limit. Under the limit, the gate stays entirely local.

## Android Native Layer

This repo relies on custom Expo config plugins to patch/generated Android code during prebuild:

- [`plugins/withFullScreenAlarm.js`](./plugins/withFullScreenAlarm.js)
  - adds `USE_FULL_SCREEN_INTENT`
  - adds `WAKE_LOCK`
  - creates `AlarmActivity`
  - patches native activity logging
- [`plugins/withAlarmAudioModule.js`](./plugins/withAlarmAudioModule.js)
  - creates native `AlarmAudioModule`
  - creates `ActivityControlModule`
  - creates `ActivityTracker`
  - registers the native package in `MainApplication`
- [`plugins/withNotifeeAndroidMaven.js`](./plugins/withNotifeeAndroidMaven.js)
  - adds the Notifee Maven repo required for Android builds on Expo SDK 54

The native alarm audio path is wrapped in [`lib/AudioService.ts`](./lib/AudioService.ts) and uses the Android alarm stream to bypass silent mode where possible.

## Startup Behavior

On app startup, [`app/_layout.tsx`](./app/_layout.tsx) does the following:

- loads reminders and history from AsyncStorage
- removes completed one-time reminders that should no longer remain in the local list
- syncs missing notifications back into Notifee
- hydrates reminders whose audio generation is still pending
- initializes RevenueCat after initial interactions

## Setup

### Requirements

- Node `22.5.1`
- npm `10.x`
- Android Studio / Android SDK for Android builds
- Convex access for backend actions

### Install

```bash
npm ci
```

Create `.env.local` from `.env.example`.

Minimum local env:

```bash
EXPO_PUBLIC_CONVEX_URL=...
CONVEX_DEPLOYMENT=...
```

Server-side secrets used by Convex actions are expected in Convex env, not in the app bundle:

- `OPENAI_API_KEY`
- `TTS_PROVIDER`
- `ELEVENLABS_API_KEY` / `ELEVENLABS_VOICE_ID`
- or Resemble credentials (`RESEMBLE_API_KEY`, `RESEMBLE_VOICE_UUID`, optional `RESEMBLE_PROJECT_UUID`)

## Run

Start Convex:

```bash
npx convex dev
```

Start Metro:

```bash
npm run start
```

Install/run the Android dev client:

```bash
npm run android
```

If you are using USB debugging and Metro is on localhost:

```bash
adb reverse tcp:8081 tcp:8081
```

## Useful File Map

- [`app/_layout.tsx`](./app/_layout.tsx): app boot, providers, startup sync, fallback alarm overlay
- [`app/index.tsx`](./app/index.tsx): main reminder UX and voice creation
- [`components/EditReminderSheet.tsx`](./components/EditReminderSheet.tsx): edit/update/delete flow, audio preview, repeat settings
- [`components/AlarmOverlay.tsx`](./components/AlarmOverlay.tsx): alarm UI and resolve actions
- [`lib/store.ts`](./lib/store.ts): local reminder model and persistence
- [`lib/notifications.ts`](./lib/notifications.ts): scheduling, delivery, pending-alarm state, rescheduling
- [`lib/schedule.ts`](./lib/schedule.ts): canonical schedule model
- [`convex/actions.ts`](./convex/actions.ts): STT, GPT parsing, TTS

## Current Caveats

- The implemented alarm experience is Android-focused. The custom full-screen alarm activity and native alarm audio module are Android-specific.
- The unified schedule model is richer locally than it is in Convex. If you are changing reminder persistence, update both models intentionally.
- The app is not using Convex as a real-time synchronized reminder database today; reminders are written and read primarily from local storage.
