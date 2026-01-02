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
| **Convex Dashboard** | https://dashboard.convex.dev/d/proper-stoat-767 |
| **GitHub Repo** | https://github.com/WahabBasa/Voice-reminder |

---

## 🖥️ Current Machine Setup

**Project Location:** `C:\Dev\VR`

**Tooling Versions:**
- Node: `22.5.1` (via NVM for Windows, see `.nvmrc`)
- Java: OpenJDK `17.0.15` (Microsoft build)
- Android SDK: `C:\Users\AtheA\AppData\Local\Android\Sdk`
- NDK: `27.1.12297006`
- CMake: `3.22.1`
- Gradle: `8.14.3`

**What is set up:**
- Git, Node (NVM), Java 17, Android SDK, NDK, CMake
- ADB available for device communication
- Local env file: `.env.local` (Convex URL + deployment)

**Known gotchas:**
- PowerShell blocks `npm` / `npx` `.ps1` shims. Use `npm.cmd` / `npx.cmd`
- Windows file locking can cause `kill EPERM` errors during builds - just retry

## 📝 Devlog Writing Guidelines

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
# Start Convex dev server (run in separate terminal)
npx convex dev

# TypeScript check
npx tsc --noEmit
```

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

### 🔨 Full Android Build (Dev)

```bash
# Builds APK and installs to connected device
npx expo run:android
```

## 📦 Play Store Build

```powershell
# 1. Prebuild (regenerates android folder with signing config)
npx.cmd expo prebuild --platform android --clean

# 2. Build release AAB
cd android
.\gradlew.bat bundleRelease

# Output: android\app\build\outputs\bundle\release\app-release.aab
```

**Signing credentials** (keep safe, not in git):
- Keystore: `voicereminder.keystore`
- Alias: `voicereminder`
- Password: `voicereminder123`

**Patches applied for Expo SDK 54:**
- `plugins/withNotifeeAndroidMaven.js` - Fixes Notifee + Expo 54 (GitHub #1262)
- `plugins/withAndroidSigning.js` - Injects release signing config

### ⚡ Build Optimization: ARM Only

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

*Last Updated: 2025-12-28*
