# VoiceReminder

Voice reminder app (Expo + Convex).

You press record, you speak a reminder, and the app schedules a notification that plays a custom TTS sound.

## What is in git (so it is repeatable)

- `package.json` + `package-lock.json` (same npm packages on every machine)
- `app.json` (Expo config)
- `convex/` + `convex.json` (Convex backend code + config)
- `plugins/withNotifeeAndroidMaven.js` (auto-fixes Android config during prebuild)

## What you need (on a new machine)

1) **Node.js** (same version as this repo)
- This repo uses Node `22.5.1`
- Example check:
  - Run: `node -v`
  - You should see: `v22.5.1`

2) **npm**
- Example check:
  - Run: `npm -v`
  - You should see a version number (example: `10.x.x`)

3) **Android setup (for Android builds)**
- Android Studio + Android SDK
- A phone/emulator that runs apps

You do **not** need to install Expo globally.

## Install (after you clone)

1) Install packages (same versions)
```bash
npm ci
```

If you get dependency errors, try:
```bash
npm i --legacy-peer-deps
```

2) Create your local env file
- Copy `.env.example` → `.env.local`

Example `.env.local` (visible example):
```bash
EXPO_PUBLIC_CONVEX_URL=https://proper-stoat-767.convex.cloud
CONVEX_DEPLOYMENT=dev:proper-stoat-767
```

## Convex (backend)

1) Login:
```bash
npx convex login
```

2) Start Convex dev:
```bash
npx convex dev
```

## Run the app (Android)

1) Build / install the dev client:
```bash
npm run android
```

2) Start Metro:
```bash
npm run start
```

If your phone cannot connect to Metro, try:
```bash
adb reverse tcp:8081 tcp:8081
```

## Notes (common gotchas)

- `.env.local` is **not** committed to git (this is normal).
- Server secrets (like `OPENAI_API_KEY`, ElevenLabs keys) should be set in the Convex dashboard or with `npx convex env set`.
- Android folders `android/` and `ios/` are generated (they are not committed). Expo will generate them when needed, and the Notifee Maven repo is added by the plugin.
