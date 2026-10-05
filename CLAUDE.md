# Claude Development Guide - VoiceReminder

## 🚀 Startup Routine

**ALWAYS RUN THESE CHECKS BEFORE DEVELOPMENT:**

0. **Pull Latest First (recommended)** - Run `git pull --ff-only` before creating today's devlog (devlogs are in git now)
1. **Check Current Date/Time** - Run `Get-Date -Format "yyyy-MM-dd HH:mm"` (PowerShell)
2. **Check Today's Devlog** - Look for `updates/YYYY-MM-DD_devlog.md`
3. **Create Devlog if Missing** - If no devlog exists for today, create `updates/YYYY-MM-DD_devlog.md`
4. **Read plan.md** - Review project plan, tech stack, and current phase status
5. **Check Phase Progress** - Identify which phases are ✅ completed vs pending

---

## 📁 Key Locations

| Item | Location |
|------|----------|
| **Project Root** | `C:\Dev\VR` |
| **Project Plan** | `plan.md` (architecture, phases, tech stack) |
| **Devlogs** | `updates/YYYY-MM-DD_devlog.md` |
| **ASO transcripts** | `docs/aso/transcripts/` — user-shared ASO/Apple Search Ads reference (distilled playbook + cleaned transcript per file, indexed in its `README.md`). When the user shares a new ASO transcript, save it there in the same structure. |
| **ASC screenshot renders** | GPT renders and phone captures arrive in `C:\Users\AtheA\Downloads\LANDrop`. Approved store screenshots get copied to `marketing/renders/` named by slot (`01-lockscreen.png`, `02-recording.png`, …). When the set is complete, `python marketing/upscale_to_asc.py` emits exact 6.7" (1290x2796) + 6.5" (1242x2688) PNGs to `marketing/out/asc/` for App Store Connect upload. |
| **Convex — LIVE deployment** | `dev:proper-stoat-767` — https://dashboard.convex.dev/d/proper-stoat-767. **This is what every shipped build reads** (TestFlight and App Store included: the EAS env `EXPO_PUBLIC_CONVEX_URL` carries the dev URL for all three build environments). The prod deployment exists but nothing reads it until OLD-126. See "Convex deployments" under Development Commands before any deploy. |
| **GitHub Repo** | https://github.com/WahabBasa/Voice-reminder |
| **App Store Connect API** | Team key `UK56CMV8QG` (App Manager), issuer `d9e92b80-7749-4e52-9301-4ce71066f26c`, app `6801797784`. The `.p8` lives at `C:\Users\AtheA\.appstoreconnect\private_keys\`, never in the repo. Claude handles ASC admin through the API; Resolution Center replies and the final submit stay with the user. |

---

## 🎯 Standing Rules: iOS only, cloud builds, test before Apple

User rules, set 2026-09-26. These override anything older in this file.

1. **iOS only.** Android is on hold: don't plan, test, build, or write test cases for Android unless the user asks. Android notes live in the "Android (parked)" section at the bottom, for reference only.
2. **Every build and update runs on Expo's servers, never on this machine.** Builds use `eas build` (cloud). JS updates go through the EAS Workflow `update` job (`.eas/workflows/`), never a local `eas update`, `expo export`, or Gradle/Xcode build.
3. **Nothing goes to Apple before the user has tested it on their phone.** The order is:
   1. Cloud dev build or update.
   2. The user tests on the iPhone.
   3. The user decides: make changes, or build production and submit.

   No `eas submit`, no `--auto-submit`, and no TestFlight upload without the user's explicit go after their own device test.

---

## 🖥️ Current Machine Setup

**Project Location:** `C:\Dev\VR`

**Tooling:**
- Node: `22.5.1` (via NVM for Windows, see `.nvmrc`)
- EAS CLI: iOS builds run in the cloud (team ZQCWAL4768)
- go-ios: `C:/Users/AtheA/AppData/Local/SideTap/bin/ios.exe` (USB install to the iPhone)
- Syslog: `python scripts/wifi-syslog.py -m Remi` (Wi-Fi), USB fallback `pymobiledevice3 syslog live`
- Local env file: `.env.local` (Convex URL + deployment)
- Android tooling (Java 17, SDK, NDK, Gradle, ADB) is installed but parked; see the bottom section

**RAM:** 12 GB installed, about 9.9 GB usable (the integrated graphics takes 2 GB). Fixed 2026-09-27 by swapping the sticks: Hynix 8 GB in slot 1, Samsung 4 GB in slot 2. With the Hynix in slot 2 the BIOS disabled it and only about 3.4 GB was usable. If sudden freezes come back, suspect slot 2. **2026-09-28: it came back** — Windows sees only 5.92 GB (both sticks detected, no bcdedit memory limit), plus bugchecks 0x139 and 0x3D and repeated Automatic Repair boots. Heavy local jobs can crash with Windows exit code `3221226505` (`0xC0000409`) when memory runs out.

**Known gotchas:**
- PowerShell blocks `npm` / `npx` `.ps1` shims. Use `npm.cmd` / `npx.cmd`
- Windows file locking can cause `kill EPERM` errors during builds - just retry
- **`eas build` runs on Expo's servers, but `eas update` bundles the JS on this machine** (Metro export) and only uploads the result. That makes it memory-bound on this laptop: on 2026-09-26 it crashed with `0xC0000409` at 99.9% with 363 MB free. Close Brave and other heavy apps first. If memory is still the blocker, publish from the cloud (EAS Workflows `type: update` job, or GitHub Actions).
- `eas update` needs `--platform ios` (no react-native-web installed) and often `--clear-cache` — Metro dies with "Failed to get the SHA-1 for ... require.js" on a warm cache. Run from `C:\Dev\VR` (uppercase drive letter)
- The uppercase drive letter can't be reached by a plain `cd /d C:\Dev\VR` when the shell already inherits the lowercase path — it's a no-op that keeps `c:\Dev\VR` and Metro throws the SHA-1 error anyway. Bounce first: `cd /d C:\Windows` then `cd /d C:\Dev\VR` (verified 2026-08-31)
- `npm.cmd run test:coverage` **always exits 1 on Windows** even when every suite and threshold passes — the per-file `coverageThreshold` keys resolve to backslash paths that never match the coverage map. Judge the run by the printed suite/test results, not the exit code; Linux CI is the authoritative threshold gate (verified 2026-08-31, pre-existing)

## 🤖 Delegation Policy

**Claude orchestrates; subagents do the grunt work.** Standing instruction from the user:

- Implementation, research, test runs, builds, publishes, installs — anything mechanical — goes to subagents: **Opus 5.5 at medium reasoning effort** (user default since 2026-10-05; research agents also get the Parallel Search MCP), one per well-scoped task, dispatched in parallel when tasks are disjoint.
- The orchestrator's job is to frame each task with full context (files, gotchas, quality gates), dispatch, then **review the agent's report or diff** and relay the outcome. Inspect the diff directly when a change is risky or touches shipped behavior.
- The orchestrator works directly only on: small reads/greps needed to frame a task, quick verifications of agent output, CLAUDE.md/devlog/memory edits, and conversation with the user (decisions, grilling).

## 📝 Devlog Writing Guidelines

> ⚠️ **IMPORTANT:** Only update devlogs when explicitly asked by the user. Do not auto-update devlogs after completing work.

**Writing Style: Conversational Technical Notes**
- Write like you're telling a coworker what you did
- Keep it casual but include the technical details that matter
- Explain what happened, but no exposition or lecturing
- Get to the point, don't pad it out

**Tone - explain what happened, don't lecture:**
- ✅ "Windows path was too long so the build kept failing. Moved to `C:\Dev\VR` and it worked."
- ❌ "The build failed due to Windows' 260 character path limit. This is a common Windows issue when projects are in deep directories. The solution was to move the project to a shorter path."

**Entry Structure:**
1. **Header**: `## What you did - (HH:MM)`
2. **Status**: `**Status**: ✅/⚠️/❌ Quick result`
3. **The meat**: What changed, what broke, what fixed it
4. **Files touched** (with line numbers when relevant)

**Length:**
- Quick fixes: 5-15 lines
- Feature work: 20-35 lines  
- Big sessions: 40 lines MAX - split if longer

**Be Specific:**
- ✅ File paths: `app/(tabs)/record.tsx:25-41`
- ✅ Actual values: "Added `--legacy-peer-deps` flag"
- ❌ Vague: "fixed the bug", "updated some code"

**Example - Quick Fix:**
```markdown
## Fixed record button toggle - (19:30)

**Status**: ✅ Working

Button wasn't showing the stop state. Added a "Tap to Record/Stop" label below the mic button so it's obvious what state you're in.

- `app/(tabs)/record.tsx:25-41` - added label
- `app/(tabs)/record.tsx:106-111` - buttonLabel style
```

**Example - Feature Work:**
```markdown
## Got Phase 1 working - (19:00)

**Status**: ✅ App running on phone

Set up the Expo project with Convex backend. Had a few hiccups:

- Windows path too long - moved to `C:\Dev\VR`
- React 19 peer dep drama - used `--legacy-peer-deps`  
- Phone couldn't connect to Metro - `adb reverse tcp:8081 tcp:8081` fixed it

Files:
- `app/_layout.tsx` - ConvexProvider wrapper
- `app/(tabs)/index.tsx` - home screen, empty state
- `app/(tabs)/record.tsx` - mic button UI
- `android/build.gradle:20` - notifee maven repo

Running on Samsung SM_G955F. Two tabs, both working.
```

---

## 🔧 Development Commands

```bash
# Start Convex dev server (run in separate terminal) — pushes convex/ to dev:proper-stoat-767, which is LIVE (see below)
npx convex dev

# TypeScript check
npx tsc --noEmit

# Full test suite — what CI runs (per-file coverage thresholds in jest.config.js)
npm.cmd run test:coverage
```

### 📱 Which EAS build profile — standing rule

**Any build that is NOT going to Apple (TestFlight / App Store) is a `development` build.** `eas build --platform ios --profile development` — it is a dev client (shake → dev menu, update launcher) and carries `EXPO_PUBLIC_VR_PERF_LOGS=1` so `[VR PERF]` lines reach the syslog. `preview` is not to be used for device testing (no dev menu; the user rejected it 2026-09-11). `production` only when a build is being submitted to Apple. Install dev builds over USB with go-ios: `C:/Users/AtheA/AppData/Local/SideTap/bin/ios.exe install --path=<ipa>`.

### ☁️ Convex deployments — read before any deploy

| Deployment | Who reads it | How code gets there |
|---|---|---|
| **`dev:proper-stoat-767` — LIVE** | Every shipped build (TestFlight build 2, and the App Store build until OLD-126) **and** Metro dev clients. `.env.local` and the EAS env `EXPO_PUBLIC_CONVEX_URL` (all three build environments) both point here. | `npx convex dev` (continuous sync) or `npx.cmd convex dev --once` (single push) |
| prod: `content-quail-685` (https://content-quail-685.convex.cloud) | **Nothing.** It exists and is empty of traffic. | `npx convex deploy` — answer **No** to its prompt unless OLD-126 is being executed; never reaches a phone today |

Consequence: any `npx convex dev` session — human or agent — pushes straight into what users hit. Push `convex/` only when it is tested and meant to go live.

**Publish routine for JS-only changes (the coupled pair):**
1. `npx.cmd convex dev --once` — backend first.
2. Publish the update **in the cloud** through the EAS Workflow `update` job (see Standing Rules), after the change has been tested on a dev build. Production builds are on channel `production`, runtime policy `appVersion`. (A local `eas update` is off-limits: it bundles on this machine.)
3. Force-quit the app twice: first launch downloads, second applies.

Native changes (`app.json`, `plugins/`, native deps, Swift under `plugins/ios-src/`) need a new EAS build, not an OTA.

**The Convex URL rides in the JS bundle, not the native shell.** `EXPO_PUBLIC_CONVEX_URL` is inlined by Metro at export time: an EAS build takes it from the EAS env, an `eas update` takes it from this machine's `.env.local`. Today both say `proper-stoat-767`. Never run `eas update` from an environment whose `.env.local` points elsewhere — it would silently repoint every installed app. Switching to prod (OLD-126) therefore means flipping the EAS env, `.env.local`, and shipping a build + OTA together.

**Before any push:** run `npm.cmd run test:coverage`, not plain `npm test`. CI enforces per-file coverage thresholds that plain `npm test` skips — every historical CI failure was this step going red after a locally-green push.

### 📱 iPhone Device Workflow

1. **Build:** `eas build --platform ios --profile development` runs in the cloud (about 5 min) and produces a dev-client `.ipa`.
2. **Install over USB:** `C:/Users/AtheA/AppData/Local/SideTap/bin/ios.exe install --path=<ipa>`. Installing over an existing copy keeps its data and permission answers; delete the app first to test first-run permission prompts.
3. **Load the JS:** the dev client doesn't bundle JS, so it needs one of these:
   - **Metro on LAN:** `npx.cmd expo start --dev-client`, with the phone on the same Wi-Fi. Pick the server in the launcher.
   - **EAS update on the `development` branch** (the dev build's channel), loaded from the dev menu. Publish it with the cloud EAS Workflow, never a local `eas update`: edit `message:` in `.eas/workflows/update-development.yml` to name the commit, then run `eas workflow:run .eas/workflows/update-development.yml --non-interactive` (about 2 min, uploads a 3.9 MB archive governed by `.easignore`). The EAS `development` environment doesn't carry `EXPO_PUBLIC_VR_PERF_LOGS`, so cloud updates don't emit `[VR PERF]` lines.
4. **Logs:** start the syslog before the first take (`python scripts/wifi-syslog.py -m Remi`).

---

---

## 🏗️ Project Architecture

See `plan.md` for full details. Summary:

```
User Voice → Expo App → Convex Backend → OpenAI (Whisper/GPT/TTS) → Notification with Custom Sound
```

**Tech Stack:**
- Frontend: Expo (React Native)
- Backend: Convex
- Notifications: Notifee
- AI: OpenAI (Whisper STT, GPT-4o-mini parsing, TTS)

---

## 🤖 Android (parked, reference only)

iOS is the focus. Nothing in this section runs unless the user asks for Android work.

**Tooling (installed):** Java OpenJDK `17.0.15` (Microsoft build), Android SDK `C:\Users\AtheA\AppData\Local\Android\Sdk`, NDK `27.1.12297006`, CMake `3.22.1`, Gradle `8.14.3`, ADB.

### 📱 USB Development Workflow (Recommended)

Use this workflow to avoid "invalid host url" errors when connecting via USB:

```powershell
# Terminal 1: Start Metro with localhost (avoids IP issues)
npx.cmd expo start --dev-client --host localhost

# Terminal 2: Set up USB tunnel (required for localhost to work on phone)
C:\Users\AtheA\AppData\Local\Android\Sdk\platform-tools\adb.exe reverse tcp:8081 tcp:8081
```

**On your phone:** Open the dev app and connect to `http://localhost:8081`

**Why this works:**
- `--host localhost` → Metro uses 127.0.0.1 instead of your PC's network IP
- `adb reverse` → Creates a tunnel from phone's localhost:8081 → PC's localhost:8081

**If connection fails:**
1. Re-run the `adb reverse` command (tunnel may have been cleared)
2. Check `adb devices` shows your phone connected

### 🔄 Quick Reconnect (If Metro Crashes)

```powershell
# 1. Start Metro on an available port
npx.cmd expo start --dev-client --port 8085

# 2. Set up ADB tunnel for that port
C:\Users\AtheA\AppData\Local\Android\Sdk\platform-tools\adb.exe reverse tcp:8085 tcp:8085

# 3. Press 'a' in the Metro terminal to open on Android
```

### 🔨 Full Android Build (Dev)

```bash
# Builds APK and installs to connected device
npx expo run:android
```

### 📦 Release Builds

#### When to use `--clean` prebuild

- **`npx.cmd expo prebuild --platform android --clean`** — Wipes the entire `android/` folder and regenerates it. Use ONLY when native config changed (plugins, `app.json`, native deps). Full rebuild takes ~20-25 min.
- **`npx.cmd expo prebuild --platform android`** (no `--clean`) — Incremental. Use when only JS/TS code changed. Keeps cached native artifacts.
- **Skip prebuild entirely** — If nothing in `app.json` or `plugins/` changed, just run `gradlew.bat assembleRelease` directly. Fastest option for JS-only changes.

#### Build commands

```powershell
# Release APK (for device testing) — faster, installs via adb
cd android
CI=true .\gradlew.bat assembleRelease --no-daemon
# Output: android\app\build\outputs\apk\release\app-release.apk

# Release AAB (for Play Store upload)
cd android
.\gradlew.bat bundleRelease
# Output: android\app\build\outputs\bundle\release\app-release.aab
```

**CI=true and --no-daemon** are required on Windows to avoid `kill EPERM` errors from Metro's jest-worker cleanup.

**Signing credentials** (keep safe, not in git):
- Keystore: `voicereminder.keystore`
- Alias: `voicereminder`
- Password: `voicereminder123`

**Patches applied for Expo SDK 54:**
- `plugins/withNotifeeAndroidMaven.js` - Fixes Notifee + Expo 54 (GitHub #1262)
- `plugins/withAndroidSigning.js` - Injects release signing config

#### ⚡ Build Optimization: ARM Only

To speed up release builds (~50% faster), only build for ARM architectures (mobile devices) and skip x86 (emulators):

Add to `android/gradle.properties`:
```properties
# Only build for ARM architectures (mobile devices)
# Skips x86/x86_64 which are only needed for emulators
reactNativeArchitectures=armeabi-v7a,arm64-v8a
```

**Without this:** Builds for 4 architectures (~20-30 min)
**With this:** Builds for 2 architectures (~10-15 min)

---

*Last Updated: 2026-09-26*
