# Claude Development Guide - VoiceReminder

## 🚀 Startup Routine

**ALWAYS RUN THESE CHECKS BEFORE DEVELOPMENT:**

1. **Check Current Date** - Run `date` command to verify today's date
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

## 📝 Devlog Writing Guidelines

**Writing Style: Semi-Formal Technical Documentation**
- Write as a senior engineer documenting their work session
- Use conversational but professional tone
- Balance readability with technical depth

**Entry Structure (Required Elements):**
1. **Header**: `## Session Title - (HH:MM)` with clear description
2. **Status Line**: `**Status**: ✅/⚠️/❌ One-line summary of outcome`
3. **Context** (optional for small changes): Brief problem statement or goal
4. **Changes Made**: Bullet points with file paths and line numbers
5. **Result**: What works now that didn't before

**Length Guidelines - Scale with Work Done:**
- **Quick fixes** (5-15 lines): Single issue, file change, result
- **Feature work** (20-35 lines): Multiple files, architectural decisions, testing notes
- **Major sessions** (35-40 lines MAX): Complex integrations, migrations, full context
- **Never exceed 40 lines** - split into separate entries if needed

**Technical Specificity Requirements:**
- ✅ Always include file paths: `convex/auth.ts:24-30`
- ✅ Reference actual code patterns: "Added `EXPO_PUBLIC_CONVEX_URL` env var"
- ✅ Explain architectural decisions: Why this approach vs alternatives
- ✅ Document debugging process: What failed, what worked, lesson learned
- ❌ Avoid vague descriptions: "fixed bug", "updated code", "made changes"

**Example - Quick Fix (5-15 lines):**
```markdown
## Record button toggle fix - (19:30)

**Status**: ✅ Button now shows correct state when recording

Added visual feedback for recording state:
- `app/(tabs)/record.tsx:25-41` - Added "Tap to Record/Stop" label
- `app/(tabs)/record.tsx:106-111` - Added buttonLabel style

Button now clearly shows blue mic → red stop with text label.
```

**Example - Feature Work (20-35 lines):**
```markdown
## Phase 1: Project Setup Complete - (19:00)

**Status**: ✅ Expo + Convex app running on Android device

### Setup
- Initialized Expo project with expo-dev-client
- Connected Convex backend (dashboard: proper-stoat-767)
- Installed dependencies: notifee, expo-av, expo-file-system, openai

### Implementation
- `app/_layout.tsx` - Root layout with ConvexProvider
- `app/(tabs)/index.tsx` - Home screen with empty reminder list
- `app/(tabs)/record.tsx` - Record screen with mic button UI
- `android/build.gradle` - Added Notifee maven repository

### Issues Resolved
- Windows path length limit → Moved project to `C:\Dev\VR`
- React 19 peer deps → Used `--legacy-peer-deps` flag
- Firewall blocking Metro → Used ADB reverse for USB connection

App builds and runs on Samsung SM_G955F via USB.
```

---

## 🔧 Development Commands

```bash
# Start development (Metro + Android)
npx expo start --dev-client --android

# Start Convex dev server
npx convex dev

# Full Android build
npx expo run:android

# TypeScript check
npx tsc --noEmit

# Git workflow
git add .
git commit -m "message"
git push
```

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

*Last Updated: 2025-12-03*
