# Voice Reminder App - Implementation Plan

A voice-based reminder app where users speak what they want to be reminded of, and the app plays a custom TTS audio when the reminder fires.

> **Project Location:** `C:\Dev\VR` (moved from original location due to Windows path length limits)

---

## Tech Stack

| Component | Technology | Why |
|-----------|------------|-----|
| Frontend | Expo (React Native) | Cross-platform, fast development |
| Backend | Convex | Real-time sync, file storage, serverless functions |
| Notifications | Notifee | Custom sounds work in background (expo-notifications has bugs) |
| Audio Recording | expo-av | Native audio recording |
| STT | OpenAI Whisper | Accurate speech-to-text |
| Parsing | OpenAI GPT-4o-mini | Extract structured reminder data |
| TTS | ElevenLabs TTS | Natural-sounding reminder voice |
| AI SDK | OpenAI SDK directly | Simpler than Vercel AI SDK for our use case |

---

## App Flow

```
┌─────────────────────────────────────────────────────────────┐
│  1. USER SPEAKS                                             │
│     "Remind me to take my medicine at 8am every day"        │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  2. CONVEX BACKEND                                          │
│     - Receives audio -> Whisper STT -> text                 │
│     - GPT parses: title, time, frequency                    │
│     - ElevenLabs TTS generates audio file                   │
│     - Returns structured data + audio URL                   │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  3. EXPO APP                                                │
│     - Downloads TTS audio to device                         │
│     - Creates notification channel with that sound          │
│     - Schedules local notification                          │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  4. REMINDER FIRES (even if app killed)                     │
│     - OS triggers notification                              │
│     - TTS audio plays: "Time to take your medicine"         │
└─────────────────────────────────────────────────────────────┘
```

---

## Phase Overview

| Phase | Name | Status |
|-------|------|--------|
| 1 | Project Setup & Basic UI | ✅ Completed |
| 2 | Audio Recording | ✅ Completed |
| 3 | Convex Backend + OpenAI Integration | ✅ Completed |
| 4 | Notifications with Custom Sound | ✅ Completed |
| 5 | Complete UI & Polish | ✅ Completed |
| 6 | UI Polish & Refinement | 🟡 In Progress |
| 7 | Performance & Speed | Pending |
| 8 | Bottom Sheet & Animations | Pending |
| 9 | Edit Page & Calendar | Pending |
| 10 | Edge Cases & Reliability | Pending |
| 11 | Monetization & Release | Later |

---

## Phase 1: Project Setup & Basic UI ✅ COMPLETED

**Goal:** Working Expo app with Convex connected and basic navigation

**Status:** Completed on 2025-12-03

### Tasks

1. **Initialize Expo Project** ✅
2. **Setup Convex** ✅ - Dashboard: https://dashboard.convex.dev/d/proper-stoat-767
3. **Install Dependencies** ✅
4. **Create Basic Screens** ✅ - Home Screen + Record Screen
5. **Connect Convex Provider** ✅

### Notes
- Project moved to `C:\Dev\VR` due to Windows path length limits
- Using `--legacy-peer-deps` for npm installs due to React 19 peer dep conflicts
- Added Notifee maven repo to `android/build.gradle`

---

## Phase 2: Audio Recording ✅ COMPLETED

**Goal:** Record user's voice and get audio file ready to send

**Status:** Completed on 2025-12-03

### Tasks
1. **Configure Permissions** ✅
2. **Create Recording Component** ✅ - Hold-to-record with duration indicator
3. **Get audio file URI** ✅

### Notes
- expo-av is deprecated (removed in SDK 54), replacement is `expo-audio`. Works fine for now.
- Created `lib/audio.ts` with helper functions

---

## Phase 3: Convex Backend + OpenAI Integration ✅ COMPLETED

**Goal:** Process audio -> get transcription, parsed reminder, and TTS audio

**Status:** Completed on 2025-12-16

### Tasks
1. **Convex Schema** ✅
2. **HTTP Endpoint for Audio Upload** ✅
3. **Main Processing Action** ✅ - Whisper STT -> GPT Parse -> TTS -> Store
4. **Queries & Mutations** ✅

---

## Phase 4: Notifications with Custom Sound ✅ COMPLETED

**Goal:** Schedule notifications that play TTS audio even when app is killed

**Status:** Completed on 2025-12-16

### Tasks
1. **Notifee Setup** ✅
2. **Download TTS to Device** ✅
3. **Create Notification Channel** ✅
4. **Schedule Notification** ✅
5. **Handle Repeating Reminders** ✅

### Pending Verification
- [ ] TTS audio plays when app is in background
- [ ] TTS audio plays when app is killed

---

## Phase 5: Complete UI & Polish ✅ COMPLETED

**Goal:** Full reminder list, details, and delete functionality

**Status:** Completed on 2025-12-16

### Tasks
1. **Home Screen - Reminder List** ✅
2. **Reminder Card Component** ✅
3. **Record Screen Polish** ✅
4. **Delete Functionality** ✅
5. **Empty State** ✅
6. **Loading States** ✅

---

## Phase 6: UI Polish & Refinement 🟡 IN PROGRESS

**Goal:** Professional-looking UI with proper typography, icons, and polish

### Task 1: Icon Library Swap ✅ COMPLETED
**Status:** Completed on 2025-12-18

Replaced light blue AI-looking icons with Lucide icons. Neutral colors from theme.

### Task 2: Typography Cleanup ✅ COMPLETED
**Status:** Completed on 2025-12-18

Fixed text hierarchy:
- Headings: gray-900 / black
- Body: gray-700 / gray-800
- Secondary: gray-500 / gray-600

### Task 3: Reminder Status Indicators ✅ COMPLETED
**Status:** Completed on 2025-12-18

- Created `formatReminderTime()` utility
- Created `isOverdue()` function
- Added visual indicators (red for overdue, yellow for upcoming)

### Task 4: UI Consistency Pass (1.5 hours)
**What:** Make sure everything feels cohesive

**Steps:**
1. **Color audit** - Document colors, ensure consistency
2. **Spacing audit** - Check padding/margins are consistent
3. **Component states** - Active/pressed/disabled states

### Task 5: Little Details 🟡 IN PROGRESS
**Status:** Started on 2025-12-18

**Done:**
- Success feedback: toast system ("Reminder created", "Marked as done")
- Empty states: All + Completed tabs with clear CTAs
- Loading state: basic list loading indicator
- Small list animations: layout animation on create + mark done

**Remaining:**
- Smooth delete animations (fade out + slide)

### Task 6: Voice Delay Investigation (Optional)
**What:** Reduce perceived 1-2 second delay

**Only do if users complain.** Steps:
1. Add timing logs to measure bottleneck
2. Show "Processing..." immediately
3. Consider streaming/partial results
4. Focus on perceived speed if actual speed can't improve

---

## Phase 7: Performance & Speed

**Goal:** Fast reminder creation and smooth navigation

### Task 1: Faster Reminder Creation (2-3 hours)

**Steps:**
1. **Identify bottleneck** - Add timing logs for recording stop -> transcription -> save
2. **Optimize transcription flow** - Start processing immediately, show feedback
3. **Optimize reminder creation** - Fast DB write, don't block UI
4. **Better loading states** - Visual feedback immediately

### Task 2: Fast Navigation & Transitions (2-3 hours)

**Steps:**
1. **Audit current navigation** - Test every transition, note slow ones
2. **Optimize components** - `React.memo`, remove unnecessary re-renders
3. **Smooth transitions** - Native-feeling animations, 60fps
4. **Optimize list rendering** - `FlatList` optimization, `keyExtractor`, `getItemLayout`

---

## Phase 8: Bottom Sheet & Animations

**Goal:** Better bottom sheet behavior and smooth animations

### Task 1: Bottom Sheet Behavior (1-1.5 hours)

**Goal:** Bottom sheet opens to 60-70% height, not full screen

**Steps:**
1. Locate bottom sheet component
2. Set snap point to 60-70%
3. Add rounded corners, drag indicator
4. Test swipe to dismiss

### Task 2: Delete Animations + Fast Cancel (1.5-2 hours)

**Steps:**
1. **Delete animation** - Fade out + slide out (200-300ms)
2. **Fast cancel** - Immediately stop recording, discard audio, return to previous screen
3. **Polish transitions** - No "are you sure?" unless appropriate

---

## Phase 9: Edit Page & Calendar

**Goal:** Voice regeneration and polished calendar UI

### Task 1: Voice Reminder Regeneration (3-4 hours)

**Goal:** User can regenerate voice reminder from edit page

**Steps:**
1. Add "Regenerate voice reminder" button
2. Options: re-record voice OR generate from edited text
3. Handle edge cases (no original audio, cancel mid-regen, failure)
4. Match edit page UI to reference todo app

### Task 2: Calendar UI Polish (2-3 hours)

**Goal:** Better date picker for reminders

**Steps:**
1. Study todo app calendar reference
2. Implement/adapt calendar UI
3. Integrate time picker if needed
4. Test date selection flow

### Task 3: Bottom Sheet UI Polish (1.5-2 hours)

**Steps:**
1. Copy header/button styles from todo app
2. Match spacing and padding
3. Test on different screen sizes

---

## Phase 10: Edge Cases & Reliability

**Goal:** Handle errors gracefully, ensure reliability

### Task 1: Permission Handling

```typescript
// Microphone
const { status } = await Audio.requestPermissionsAsync();
if (status !== 'granted') {
  // Show explanation + settings link
}

// Notifications
const settings = await notifee.requestPermission();
if (settings.authorizationStatus < 1) {
  // Show explanation + settings link
}
```

### Task 2: Error Handling

- Network error during upload -> retry button
- OpenAI API error -> user-friendly message
- Invalid reminder format -> "try again" prompt
- Storage full -> warning message

### Task 3: App Restart Recovery

```typescript
async function syncReminders() {
  const dbReminders = await getRemindersQuery();
  const scheduledIds = await notifee.getTriggerNotificationIds();
  
  for (const reminder of dbReminders) {
    if (!scheduledIds.includes(`reminder_${reminder._id}`)) {
      await scheduleReminder(reminder);
    }
  }
}
```

### Task 4: Background Event Handler

```typescript
notifee.onBackgroundEvent(async ({ type, detail }) => {
  // Handle notification events when app is killed
  // Reschedule repeating reminders
});
```

### Task 5: Offline Support

- Cache reminders locally
- Queue recordings for upload when online
- Show offline indicator

### Test Checklist
- [ ] Deny mic permission -> graceful message
- [ ] Deny notification permission -> graceful message
- [ ] Network offline during recording -> error + retry
- [ ] Kill app, restart -> reminders still scheduled
- [ ] Force close during recording -> no crash/data loss

---

## Phase 11: Monetization & Release

**Goal:** User accounts, payments, and app store release

### Task 1: Onboarding Flow

**Goal:** New users understand the app in under 30 seconds

**Clarifying Questions:**
- Onboarding format: 1 screen or 2-3 swipe screens?
- Can users skip onboarding?
- When do we mark onboarding complete (local flag vs user account)?

**Steps:**
1. Add onboarding screen(s) explaining: what the app does + next action
2. Ask for key permissions at the right time (mic + notifications)
3. Store a "seen onboarding" flag and route accordingly

### Task 2: User Accounts + Settings

**Goal:** Settings has an Account area and a clear path to Plan/Payments

**Clarifying Questions:**
- Which auth solution are we using (Clerk + Convex, or something else)?
- What account actions are needed first (sign in/out only, or profile too)?

**Steps:**
1. Add an "Account" section in Settings (sign in/out, user info)
2. Add a "Plan/Payments" row that routes to the Payments/Pro page

### Task 3: Paywall

**Goal:** A good-looking paywall that converts

**Clarifying Questions:**
- What are the Pro features (exact list)?
- Plans: monthly + yearly, or just one?
- Trial: yes/no?

**Steps:**
1. Build a paywall UI (benefits list + strong CTA + restore + terms/privacy)
2. Gate Pro-only features so paywall appears at the right moment

### Task 4: Payments / Pro Page

**Goal:** A page users can reach anytime to see plans and upgrade

**Clarifying Questions:**
- Is this the same screen as the paywall, or separate?
- Where do we redirect after purchase (back to Settings, or back to previous screen)?

**Steps:**
1. Create a Payments/Pro page with plan cards and current subscription status
2. Link to it from Settings and from paywall CTAs

### Task 5: RevenueCat Integration

**Goal:** Purchases work reliably and are restorable

**Clarifying Questions:**
- Which platforms are in scope first (Android only, or iOS too)?
- Product IDs and plan names?

**Steps:**
1. Integrate RevenueCat and wire it to Paywall + Pro page
2. Implement "restore purchases"

### Task 6: Release + Submission Prep

**Goal:** Build a real installable app and prepare for store submission

**Clarifying Questions:**
- Are we shipping Android first, or both Android + iOS?
- Do we need a custom domain/email now, or later?

**Steps:**
1. Developer accounts
2. App store submission prep
3. Domain email setup (optional)

---

## File Structure

```
VR/
  app/
    _layout.tsx
    index.tsx
    calendar.tsx
    history.tsx
    reminder/
      new.tsx
      edit.tsx
  components/
    RecordingOverlay.tsx
    ReminderCard.tsx
    DaySelector.tsx
    TimePicker.tsx
    DetailSheet.tsx
    DatePickerModal.tsx
    AppIcon.tsx
    ScrollSelector/
  lib/
    audio.ts
    convex.ts
    notifications.ts
    storage.ts
    theme.ts
    time.ts
    perf.ts
  convex/
    actions.ts
    reminders.ts
    schema.ts
    _generated/
  app.json
  index.ts
  package.json
```

---

## Environment Variables

```bash
# Convex (auto-generated)
CONVEX_DEPLOYMENT=xxx

# OpenAI (set in Convex dashboard) - used for Whisper + parsing
OPENAI_API_KEY=sk-xxx

# ElevenLabs (set in Convex dashboard) - used for TTS
ELEVENLABS_API_KEY=xxx
ELEVENLABS_VOICE_ID=xxx
TTS_PROVIDER=elevenlabs
ELEVENLABS_MODEL_ID=eleven_multilingual_v2
ELEVENLABS_OUTPUT_FORMAT=mp3_44100_128
ELEVENLABS_STABILITY=0.5
ELEVENLABS_SIMILARITY_BOOST=0.75
ELEVENLABS_STYLE=0
ELEVENLABS_USE_SPEAKER_BOOST=true
```

---

## Commands Reference

```bash
# Development
npx expo start --dev-client

# Convex
npx convex dev

# Build (for testing notifications)
npx expo prebuild
npx expo run:android
npx expo run:ios

# Check scheduled notifications (debug)
adb shell dumpsys alarm | grep -A 5 "your.package.name"
```

---

## Known Issues

- [ ] **TTS volume too low** - reminder audio may be quiet; consider normalization
- [ ] **Processing is slow** - Whisper -> GPT -> TTS chain takes several seconds

---

## Limitations (POC Scope)

- No user authentication
- Editing reminders supported (no TTS regeneration yet)
- No snooze functionality
- Single device only (no cross-device sync)
- No timezone handling (uses device timezone)
