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
│     - Receives audio -> Whisper STT -> text                   │
│     - GPT parses: title, time, frequency                    │
│     - ElevenLabs TTS generates audio file                    │
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

## Phase 1: Project Setup & Basic UI ✅ COMPLETED

**Goal:** Working Expo app with Convex connected and basic navigation

**Status:** Completed on 2025-12-03

### Tasks

1. **Initialize Expo Project** ✅
   ```bash
   npx create-expo-app@latest VoiceReminder
   cd VoiceReminder
   npx expo install expo-dev-client
   ```

2. **Setup Convex** ✅
   ```bash
   npm install convex
   npx convex dev --once --configure=new --project voice-reminder
   ```
   - Dashboard: https://dashboard.convex.dev/d/proper-stoat-767

3. **Install Dependencies** ✅
   ```bash
   npm install @notifee/react-native openai --legacy-peer-deps
   npx expo install expo-av expo-file-system
   ```

4. **Create Basic Screens** ✅
   - Home Screen: Empty list + "Add Reminder" button
   - Record Screen: Mic button with tap to record/stop UI

5. **Connect Convex Provider** ✅
   - Wrapped app in `ConvexProvider` in `app/_layout.tsx`
   - EXPO_PUBLIC_CONVEX_URL set in `.env.local`

### Test Checklist
- [x] App builds and runs
- [x] Navigation between screens works (tabs)
- [x] Convex connection verified

### Notes
- Project moved to `C:\Dev\VR` due to Windows path length limits
- Using `--legacy-peer-deps` for npm installs due to React 19 peer dep conflicts
- Added Notifee maven repo to `android/build.gradle`

---

## Phase 2: Audio Recording ✅ COMPLETED

**Goal:** Record user's voice and get audio file ready to send

**Status:** Completed on 2025-12-03

### Tasks

1. **Configure Permissions (app.json)**
   ```json
   {
     "expo": {
       "plugins": [
         ["expo-av", {
           "microphonePermission": "Allow $(PRODUCT_NAME) to access your microphone."
         }]
       ]
     }
   }
   ```

2. **Create Recording Component**
   - Request microphone permission
   - Hold-to-record or tap-to-start/stop
   - Show recording indicator (duration, waveform)
   - Get audio file URI after recording

3. **Recording Code Pattern**
   ```typescript
   import { Audio } from 'expo-av';
   
   // Start recording
   const { recording } = await Audio.Recording.createAsync(
     Audio.RecordingOptionsPresets.HIGH_QUALITY
   );
   
   // Stop recording
   await recording.stopAndUnloadAsync();
   const uri = recording.getURI(); // file://path/to/audio.m4a
   ```

### Test Checklist
- [x] Permission prompt appears
- [x] Recording starts/stops correctly
- [x] Audio file URI logged to console
- [x] Recording indicator displays

### Notes
- expo-av is deprecated (removed in SDK 54), replacement is `expo-audio`. Works fine for now.
- Created `lib/audio.ts` with helper functions for cleaner code

---

## Phase 3: Convex Backend + OpenAI Integration ✅ COMPLETED

**Goal:** Process audio -> get transcription, parsed reminder, and TTS audio

**Status:** Completed on 2025-12-16

### Tasks

1. **Convex Schema**
   ```typescript
   // convex/schema.ts
   reminders: defineTable({
     title: v.string(),
     description: v.string(),
     time: v.string(),              // "08:00"
     frequency: v.string(),         // "once" | "daily" | "custom"
     days: v.optional(v.array(v.string())), // ["mon", "wed", "fri"]
     audioStorageId: v.id("_storage"),
     createdAt: v.number(),
   })
   ```

2. **HTTP Endpoint for Audio Upload**
   - Accept audio file via POST
   - Store temporarily for processing

3. **Main Processing Action**
   ```typescript
   // convex/actions.ts
   export const processVoiceReminder = action({
     args: { audioBase64: v.string() },
     handler: async (ctx, args) => {
       // 1. Whisper STT
       const transcript = await transcribeAudio(args.audioBase64);
       
       // 2. GPT Parse
       const parsed = await parseReminder(transcript);
       
       // 3. Generate TTS
       const ttsBuffer = await generateTTS(parsed.description);
       
       // 4. Store TTS in Convex
       const storageId = await ctx.storage.store(new Blob([ttsBuffer]));
       
       // 5. Save to database
       await ctx.runMutation(internal.reminders.create, {
         ...parsed,
         audioStorageId: storageId,
       });
       
       return { ...parsed, audioUrl: await ctx.storage.getUrl(storageId) };
     },
   });
   ```

4. **OpenAI Integration Functions**
   
   **Whisper STT:**
   ```typescript
   const transcript = await openai.audio.transcriptions.create({
     file: audioFile,
     model: "whisper-1",
   });
   ```
   
   **GPT Parse:**
   ```typescript
   const completion = await openai.chat.completions.create({
     model: "gpt-4o-mini",
     response_format: { type: "json_object" },
     messages: [{
       role: "system",
       content: `Parse this reminder request into JSON:
         { title, description, time (HH:MM), frequency (once|daily|custom), days (array if custom) }`
     }, {
       role: "user",
       content: transcript
     }]
   });
   ```
   
   **TTS Generation:**
   ```typescript
   const audio = await openai.audio.speech.create({
     model: "tts-1",
     voice: "nova",
     input: reminderDescription,
     response_format: "wav",  // Important for notifications
   });
   ```

5. **Queries & Mutations**
   - `getReminders`: List all reminders
   - `getReminder`: Get single reminder by ID
   - `deleteReminder`: Remove reminder + audio file

### Test Checklist
- [x] Audio uploads to Convex successfully (implemented in `convex/actions.ts`)
- [x] Whisper returns accurate transcription (wired in `convex/actions.ts`)
- [x] GPT returns valid structured JSON (wired in `convex/actions.ts`)
- [x] TTS audio file stored in Convex (`ctx.storage.store` in `convex/actions.ts`)
- [ ] Can play returned `audioUrl` end-to-end (needs runtime check)
- [x] Reminders saved to database (insert via `internal.reminders.create`)

---

## Phase 4: Notifications with Custom Sound ✅ COMPLETED

**Goal:** Schedule notifications that play TTS audio even when app is killed

**Status:** Completed on 2025-12-16

### Critical Concept
```
Notification Channel (Android 8+) = ONE fixed sound
Solution: Create a NEW channel for each reminder's TTS file
```

### Tasks

1. **Notifee Setup**
   ```typescript
   import notifee, { 
     TriggerType, 
     TimestampTrigger,
     AndroidImportance 
   } from '@notifee/react-native';
   ```

2. **Download TTS to Device**
   ```typescript
   import * as FileSystem from 'expo-file-system';
   
   const localPath = `${FileSystem.documentDirectory}reminder_${id}.wav`;
   await FileSystem.downloadAsync(audioUrl, localPath);
   ```

3. **Create Notification Channel (Android)**
   ```typescript
   await notifee.createChannel({
     id: `reminder_${id}`,
     name: `Reminder: ${title}`,
     sound: `reminder_${id}`,  // without extension
     importance: AndroidImportance.HIGH,
   });
   ```

4. **Schedule Notification**
   ```typescript
   const trigger: TimestampTrigger = {
     type: TriggerType.TIMESTAMP,
     timestamp: getNextTriggerTime(reminder),
   };
   
   await notifee.createTriggerNotification(
     {
       id: `reminder_${id}`,
       title: reminder.title,
       body: reminder.description,
       android: {
         channelId: `reminder_${id}`,
         sound: `reminder_${id}`,
         importance: AndroidImportance.HIGH,
       },
       ios: {
         sound: `reminder_${id}.wav`,
       },
     },
     trigger,
   );
   ```

5. **Calculate Next Trigger Time**
   ```typescript
   function getNextTriggerTime(reminder: Reminder): number {
     // Parse reminder.time ("08:00")
     // Apply frequency logic (once, daily, custom)
     // Return timestamp in milliseconds
   }
   ```

6. **Handle Repeating Reminders**
   - After notification fires, reschedule for next occurrence
   - Use `notifee.onForegroundEvent` and `onBackgroundEvent`

### Android Sound File Note
For custom sounds to work, audio files must be in:
```
android/app/src/main/res/raw/
```
This requires `expo prebuild` or a config plugin.

### Test Checklist
- [x] Notification channel created successfully (`lib/notifications.ts#createReminderChannel`)
- [x] Notification appears at scheduled time (`lib/notifications.ts#scheduleReminder`)
- [ ] TTS audio plays when app is in background (handlers implemented; needs device verification)
- [ ] TTS audio plays when app is killed (handlers implemented; needs device verification)
- [x] Repeating reminders reschedule correctly (`lib/notifications.ts#handleNotificationEvent`)

---

## Phase 5: Complete UI & Polish ✅ COMPLETED

**Goal:** Full reminder list, details, and delete functionality

**Status:** Completed on 2025-12-16

### Tasks

1. **Home Screen - Reminder List**
   ```
   ┌─────────────────────────────────────┐
   │  My Reminders                       │
   ├─────────────────────────────────────┤
   │  💊 Take medicine                   │
   │  Daily at 8:00 AM                   │
   │  Next: Tomorrow 8:00 AM         🗑️ │
   ├─────────────────────────────────────┤
   │  🏋️ Go to gym                       │
   │  Mon, Wed, Fri at 6:00 PM           │
   │  Next: Wednesday 6:00 PM        🗑️ │
   └─────────────────────────────────────┘
           [ + New Reminder ]
   ```

2. **Reminder Card Component**
   - Title with emoji (auto-select based on content)
   - Frequency display (Once / Daily / Weekly on X, Y, Z)
   - Next trigger time (human-readable)
   - Delete button

3. **Record Screen Polish**
   ```
   ┌─────────────────────────────────────┐
   │  New Reminder                       │
   ├─────────────────────────────────────┤
   │                                     │
   │           🎤                        │
   │      [ Hold to Record ]             │
   │                                     │
   │   ─────────────────────────         │
   │   "Remind me to call mom            │
   │    tomorrow at 3pm"                 │
   │   ─────────────────────────         │
   │                                     │
   │      [ Save Reminder ]              │
   └─────────────────────────────────────┘
   ```

4. **Delete Functionality**
   ```typescript
   async function deleteReminder(id: string) {
     // 1. Cancel scheduled notification
     await notifee.cancelNotification(`reminder_${id}`);
     
     // 2. Delete notification channel
     await notifee.deleteChannel(`reminder_${id}`);
     
     // 3. Delete from Convex (also deletes audio file)
     await deleteReminderMutation({ id });
     
     // 4. Delete local audio file
     await FileSystem.deleteAsync(
       `${FileSystem.documentDirectory}reminder_${id}.wav`,
       { idempotent: true }
     );
   }
   ```

5. **Empty State**
   - Show friendly message when no reminders
   - Prominent "Create First Reminder" button

6. **Loading States**
   - Recording processing spinner
   - Skeleton loaders for list

### Test Checklist
- [x] Reminders display correctly in list (`app/index.tsx`, `components/ReminderCard.tsx`)
- [x] Next trigger time is accurate (`lib/time.ts`, used by `components/ReminderCard.tsx`)
- [x] Delete removes notification + local data + Convex record (`app/index.tsx`, `app/reminder/edit.tsx`, `lib/notifications.ts`, `convex/reminders.ts`)
- [x] Empty state displays properly (`app/index.tsx`)
- [x] Loading states work (recording overlay processing state in `components/RecordingOverlay.tsx`)

---

## Phase 6: Edge Cases & Reliability

**Goal:** Handle errors gracefully, ensure reliability

### Tasks

1. **Permission Handling**
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

2. **Error Handling**
   - Network error during upload -> retry button
   - OpenAI API error -> user-friendly message
   - Invalid reminder format -> "try again" prompt
   - Storage full -> warning message

3. **App Restart Recovery**
   ```typescript
   // On app launch
   async function syncReminders() {
     const dbReminders = await getRemindersQuery();
     const scheduledIds = await notifee.getTriggerNotificationIds();
     
     // Reschedule any missing notifications
     for (const reminder of dbReminders) {
       if (!scheduledIds.includes(`reminder_${reminder._id}`)) {
         await scheduleReminder(reminder);
       }
     }
   }
   ```

4. **Background Event Handler**
   ```typescript
   // Register in index.js (before AppRegistry)
   notifee.onBackgroundEvent(async ({ type, detail }) => {
     // Handle notification events when app is killed
     // Reschedule repeating reminders
   });
   ```

5. **Offline Support**
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
    ScrollSelector/
      HighlightView.tsx
      Placeholder.tsx
      SelectedItem.tsx
      index.tsx
  lib/
    audio.ts
    convex.ts
    notifications.ts
    storage.ts
    theme.ts
    time.ts
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
TTS_PROVIDER=elevenlabs  # optional: auto-selects based on env vars if omitted
ELEVENLABS_MODEL_ID=eleven_multilingual_v2
ELEVENLABS_OUTPUT_FORMAT=mp3_44100_128
ELEVENLABS_STABILITY=0.5
ELEVENLABS_SIMILARITY_BOOST=0.75
ELEVENLABS_STYLE=0
ELEVENLABS_USE_SPEAKER_BOOST=true

# ResembleAI (legacy fallback TTS)
# RESEMBLE_API_KEY=xxx
# RESEMBLE_PROJECT_UUID=xxx  # optional: if omitted, first project is auto-selected
# RESEMBLE_VOICE_UUID=xxx  # ember voice UUID
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

## Known Issues (To Address)

- [ ] **TTS volume too low** - reminder audio may be quiet; consider normalization or adjusting voice settings
- [ ] **Processing is slow** - Whisper -> GPT -> TTS chain takes several seconds; consider streaming or showing progress steps

---

## Limitations (POC Scope)

- No user authentication
- Editing reminders supported (no TTS regeneration yet)
- No snooze functionality  
- Single device only (no cross-device sync)
- No timezone handling (uses device timezone)

---

## Future Enhancements (Post-POC)

- [ ] User authentication
- [ ] Edit existing reminders
- [ ] Snooze/dismiss actions on notification
- [ ] Multiple voices selection
- [ ] Reminder categories/tags
- [ ] Widget for home screen
- [ ] Watch app companion

---

# Detailed Plan: UI Polish & Product Improvements

## How to Use This Plan (read this first)

For each task below:
1. Start by answering the **Clarifying Questions** for that task (write the answers in today's devlog).
2. If anything is unclear, stop and ask before implementing (don't guess).
3. When done, update the devlog with: what changed, what broke, what fixed it, and files touched.

---

## Phase 1: Quick Wins (Today - 1-2 hours)

### Task 1: Icon Library Swap (30-45 mins)
**What you're doing:** Replace those AI-looking light blue icons with professional ones

**Clarifying Questions (ask first):**
- Which icon set do we want to standardize on (Lucide / Phosphor / Heroicons)?
- Outline-only, filled-only, or mixed?
- Where should icon color come from (theme file vs inline)?

**Steps:**
1. Choose an icon library:
   - **Lucide** (recommendation - clean, modern, huge selection)
   - Heroicons (great set, but React Native usage varies)
   - Phosphor Icons (more playful)

2. Install it (React Native / Expo):
   ```
   npm install lucide-react-native
   ```

3. Find and replace each icon in your app:
   - Open each component with icons
   - Replace the current icon with the Lucide equivalent
   - Remove the light blue color, use neutral colors (e.g. gray-600, gray-700 equivalents in `lib/theme.ts`)

4. Test each screen to make sure nothing broke

**Outcome:** App immediately looks more professional

---

### Task 2: Typography Cleanup (30-45 mins)
**What you're doing:** Fix text hierarchy and colors

**Clarifying Questions (ask first):**
- Is there a single "theme source of truth" for colors/typography (e.g. `lib/theme.ts`), or are styles mostly inline?
- Are we supporting dark mode right now, or only light mode?
- What is the intended accent color (so we don't accidentally use light blue everywhere)?

**Steps:**
1. Define your text color palette:
   - Headings: gray-900 or black
   - Body text: gray-700 or gray-800
   - Secondary text: gray-500 or gray-600
   - Remove all light blue text unless it's specifically for links/actions

2. Go through each screen and update:
   - Reminder titles -> darker, bolder
   - Timestamps/metadata -> gray-500
   - Button text -> high contrast

3. Check font weights:
   - Titles: font-semibold or font-bold
   - Body: font-normal or font-medium
   - Labels: font-medium

**Outcome:** Text is readable and has proper hierarchy

---

## Phase 2: Functional Improvements (Tomorrow - 3-4 hours)

### Task 3: Reminder Status Indicators (2-3 hours)
**What you're doing:** Show when reminders are due or overdue

**Clarifying Questions (ask first):**
- What field is the due time in the reminder model (name + type)? (e.g. `dueDate` as ISO string / ms timestamp)
- Should overdue reminders always sort to the top?
- Do we want relative time ("in 45 minutes") or absolute time ("Today at 2:30 PM"), or both?
- For now, is device timezone good enough (POC), or do we need timezone-aware behavior?

**Steps:**

**Part A: Create the date formatting logic (45 mins)**
1. Create a utility function `formatReminderTime(dueDate)`:
   - If due in < 1 hour: "in 45 minutes"
   - If due today: "in 3 hours" or "Today at 2:30 PM"
   - If due tomorrow: "Tomorrow at 10:00 AM"
   - If due this week: "Wednesday at 3:00 PM"
   - If overdue: "2 days ago" (in red)

2. Create a function `isOverdue(dueDate)`:
   - Returns true if dueDate < current time

**Part B: Update reminder list UI (1 hour)**
1. Find your reminder list item component
2. Add the time indicator below or next to the reminder title (React Native `Text`):
   ```
   <Text style={styles.metaText}>
     {formatReminderTime(reminder.dueDate)}
   </Text>
   ```

3. Add conditional styling for overdue:
   ```
   <Text style={[styles.metaText, isOverdue(reminder.dueDate) && styles.overdueMetaText]}>
     {formatReminderTime(reminder.dueDate)}
   </Text>
   ```

**Part C: Add visual indicators (30 mins)**
1. For overdue reminders, add a red dot or warning icon
2. For upcoming reminders (< 1 hour), maybe add a yellow/orange dot
3. Consider sorting: overdue -> upcoming -> future

**Part D: Test thoroughly (30 mins)**
1. Create test reminders at different times:
   - One 5 minutes from now
   - One tomorrow
   - One in the past (overdue)
   - One next week

2. Verify formatting looks good for all cases
3. Check that colors are accessible and readable

**Outcome:** Users can see at a glance which reminders need attention

---

## Phase 3: Polish & Refinement (Day 3 - 2-3 hours)

### Task 4: Overall UI Consistency Pass (1.5 hours)
**What you're doing:** Make sure everything feels cohesive

**Clarifying Questions (ask first):**
- What's the target "look" for the app (minimal, playful, iOS-like, etc.)?
- Any screens that should intentionally look different, or should everything match?

**Steps:**
1. **Color audit:**
   - Go through every screen
   - Document what colors you're using where
   - Make sure you're consistent (same accent color for all buttons, same gray for all secondary text, etc.)

2. **Spacing audit:**
   - Check padding/margins are consistent
   - Reminder items should have same spacing
   - Buttons should have same padding

3. **Component states:**
   - Active/pressed states
   - Disabled states (if applicable)

### Task 5: Little Details (1 hour)
**What you're doing:** Add micro-improvements

**Clarifying Questions (ask first):**
- What are the top 1-2 micro-improvements to prioritize (empty state vs loading vs success feedback)?
- Do we want animations everywhere, or only on key actions (create/delete)?

**Ideas to consider:**
- Empty states: What shows when there are no reminders?
- Loading states: What shows while voice is processing?
- Success feedback: Quick confirmation when reminder is created
- Smooth animations: Fade in new reminders, slide out deleted ones

---

## Phase 4: Voice Delay Investigation (Optional - Day 4)

**Only do this if users actually complain about the delay**

### Task 6: Optimize Voice Processing (2-3 hours)
**What you're doing:** Reduce the perceived 1-2 second delay

**Clarifying Questions (ask first):**
- Are users actually complaining about speed, or is this just a nice-to-have?
- Is the goal "actually faster" or "feels faster" (better progress + optimistic UI)?
- Are we okay adding extra logs during dev (and removing/guarding later)?

**Steps to investigate:**
1. Add logs to measure where time is spent:
   - Time from voice input stop -> transcription start
   - Time for transcription
   - Time from transcription -> reminder creation

2. Possible optimizations:
   - Show "Processing..." immediately when user stops talking
   - Stream transcription results (if your API supports it)
   - Show partial results while processing
   - Pre-process or cache common reminder patterns

3. Set realistic expectations:
   - If transcription takes ~800ms and there's nothing you can do about it, that's fine
   - Focus on *perceived* speed with good loading indicators

**Outcome:** Either you shave off time, or you confirm the delay is acceptable with better UI feedback

---

## Timeline Summary

**Day 1 (Today):**
- Icon library swap ✅
- Typography cleanup ✅
- **Time: 1-2 hours**

**Day 2:**
- Reminder status indicators (all parts)
- **Time: 3-4 hours**

**Day 3:**
- UI consistency pass
- Polish & details
- **Time: 2-3 hours**

**Day 4 (Optional):**
- Voice delay optimization (only if needed)
- **Time: 2-3 hours**

**Total: ~8-10 hours of focused work**

---

---

# Product-Only Development Plan (Extended Roadmap)

Keep this section focused on product features (what the user sees/feels). When a task needs clarification, ask the questions first.

---

## PHASE 1: Performance & Speed - Week 1 (6-8 hours)

### Day 1: Faster Reminder Creation (2-3 hours)

**Goal:** Reduce delay when creating voice reminders

**Clarifying Questions (ask first):**
- Where does the delay feel worst (after stopping recording, after tapping create, or before it appears in the list)?
- Is the goal "actually faster" or "feels faster" (better progress + optimistic UI)?
- Should the reminder appear immediately (optimistic UI) or only after the save completes?

**Steps:**
1. **Identify the bottleneck (30 mins)**
   - Add timing logs to measure:
     - Voice recording stop -> transcription start
     - Transcription duration
     - Transcription -> reminder save
   - Find where the 1-2 second delay happens
2. **Optimize transcription flow (1 hour)**
   - Start processing immediately when user stops speaking
   - Show immediate feedback ("Processing...")
   - Consider pre-loading/warming up the transcription service
3. **Optimize reminder creation (30 mins)**
   - Ensure database write is fast
   - Don't block the UI on non-critical work
   - Optimistically show the reminder in UI before save completes (if we choose this)
4. **Add better loading states (30 mins)**
   - Show visual feedback immediately
   - Animate the processing state
   - Makes perceived speed feel faster even if actual speed is same

**Expected outcome:** Reminder creation feels instant or near-instant

---

### Day 2: Fast Navigation & Transitions (2-3 hours)

**Goal:** Smooth, fast screen transitions

**Clarifying Questions (ask first):**
- Which transitions feel slow/janky right now (name the exact screens)?
- Are we testing on an actual device (preferred) or only emulator?
- Do we want faster "no animations" or smooth animations that still feel fast?

**Steps:**
1. **Audit current navigation (30 mins)**
   - Test every screen transition
   - Note which ones feel slow or janky
   - Measure frame rates if possible
2. **Optimize React Native navigation (1 hour)**
   - Optimize heavy components with `React.memo`
   - Remove unnecessary re-renders
3. **Add smooth transitions (1 hour)**
   - Use native-feeling animations (avoid janky JavaScript-based work)
   - Set appropriate transition timing
   - Ensure animations are 60fps
   - Test on actual device (not just simulator)
4. **Optimize list rendering (30 mins)**
   - If reminder list is slow: use `FlatList` with proper optimization
   - Add `keyExtractor`, `getItemLayout` if possible
   - Implement `removeClippedSubviews` if needed

**Expected outcome:** All navigation feels instant and smooth

---

## PHASE 2: Bottom Sheet & Animations - Week 1 (3-4 hours)

### Day 3: Bottom Sheet Behavior (1-1.5 hours)

**Goal:** Bottom sheet opens to 60-70% height, not full screen

**Clarifying Questions (ask first):**
- Where is the bottom sheet/modal defined (file/component)?
- Which bottom sheet library/component are we using (if any)?
- Should the user be able to drag it to full screen, or should 70% be the max?

**Steps:**
1. **Locate bottom sheet component (15 mins)**
   - Find where your bottom sheet/modal is defined
   - Identify which library you're using (if any)
2. **Set snap point to 60-70% (30 mins)**
   - Update `snapPoints` or height configuration
   - Test on different screen sizes
   - Ensure it looks good on small and large phones
3. **Adjust styling (15 mins)**
   - Add rounded corners at top if needed
   - Ensure background dimming works properly
   - Add drag indicator at top
4. **Test interaction (15 mins)**
   - Can still drag to full screen if user wants
   - Swipe down to dismiss works properly
   - Content doesn't get cut off at 70%

**Expected outcome:** Bottom sheet feels less intrusive, better UX

---

### Day 3-4: Delete Animations + Fast Cancel (1.5-2 hours)

**Goal:** Smooth delete animations and instant voice cancel

**Clarifying Questions (ask first):**
- On delete: do we want an "Undo" option or instant delete?
- On cancel: should it be instant every time, or ask "Are you sure?" sometimes?
- Where should cancel appear (during recording only, also during processing)?

**Steps:**
1. **Add delete animation (1 hour)**
   - When reminder is deleted: fade out + slide out
   - Use React Native Animated or Reanimated
   - Animation should be quick (200-300ms)
   - Remove from list after animation completes
2. **Fast cancel for voice reminder (30 mins)**
   - Add cancel button during voice recording
   - Immediately stop recording when pressed
   - Discard audio instantly
   - Return to previous screen with no delay
3. **Polish transitions (30 mins)**
   - Ensure cancel feels instant (no "are you sure?" unless appropriate)
   - Add subtle feedback when cancelled
   - Test repeatedly to ensure it never feels laggy

**Expected outcome:** Deleting and cancelling feel responsive and polished

---

## PHASE 3: Edit Page Improvements - Week 2 (3-4 hours)

### Day 5-6: Voice Reminder Regeneration in Edit Page (3-4 hours)

**Goal:** User can regenerate voice reminder from edit page

**Clarifying Questions (ask first):**
- Should regeneration support: (A) re-record voice, (B) generate voice from edited text, or both?
- If a reminder already has audio, do we overwrite it or keep the old one somewhere?
- If generation fails, what should the UI do (retry, keep old audio, show error)?

**Steps:**
1. **Design the UI flow (30 mins)**
   - Add "Regenerate voice reminder" button on edit page
   - Show current voice reminder (if exists)
   - Allow user to re-record or generate from text
2. **Implement regeneration logic (1.5 hours)**
   - When user clicks regenerate:
     - Option 1: Record new voice note
     - Option 2: Generate voice from edited text (if using TTS)
   - Save new voice reminder
   - Replace old one
   - Update reminder in database
3. **Handle edge cases (30 mins)**
   - What if no voice reminder exists originally?
   - What if user cancels mid-regeneration?
   - What if generation fails?
4. **Copy edit page UI from todo app (1 hour)**
   - Reference your todo app
   - Copy the layout/styling
   - Adapt to reminder context
   - Ensure consistency with rest of app

**Expected outcome:** Users can update voice reminders after creation

---

## PHASE 4: UI Polish - Week 2-3 (4-5 hours)

### Day 7: Copy Bottom Sheet UI from Todo App (1.5-2 hours)

**Goal:** Better looking bottom sheet

**Clarifying Questions (ask first):**
- Where is the todo app reference (repo/path) so we can copy the exact UI?
- Do we want an exact clone, or just the same "style" adapted to this app?

**Steps:**
1. **Study todo app bottom sheet (15 mins)**
   - Note layout, spacing, colors
   - Screenshot for reference
2. **Replicate styling (1 hour)**
   - Copy header design
   - Copy button styles
   - Copy spacing and padding
   - Adapt colors to your app's theme
3. **Test and refine (30 mins)**
   - Ensure it works on all screen sizes
   - Looks good in light/dark mode (if applicable)

**Expected outcome:** Professional-looking bottom sheet

---

### Day 8: Copy Calendar UI from Todo App (2-3 hours)

**Goal:** Better date picker for reminders

**Clarifying Questions (ask first):**
- Does the todo app use a calendar library or a custom calendar?
- Do we need time picking in the same UI, or separate?
- Is this only for one-time reminders, or also recurring reminders?

**Steps:**
1. **Study todo app calendar (30 mins)**
   - Note layout, interaction patterns
   - How dates are displayed
   - How selection works
2. **Implement calendar UI (1.5-2 hours)**
   - If todo app uses a library: use same library
   - If custom: replicate the design
   - Integrate with reminder date selection
   - Add time picker if needed
3. **Test interaction (30 mins)**
   - Easy to select dates
   - Clear which date is selected
   - Works smoothly with keyboard

**Expected outcome:** Intuitive date selection for reminders

---

## TOTAL TIMELINE: 2-3 weeks (16-24 hours of work)

### Week 1
- Fast reminder creation
- Fast navigation
- Bottom sheet at 60-70%
- Delete animations + fast cancel

### Week 2
- Voice reminder regeneration
- Bottom sheet UI polish
- Calendar UI polish

### Week 3 (Buffer)
- Bug fixes
- Final testing
- Polish anything that feels off

---

## After This Is Done (Later Stages)

**Then and only then**, circle back to:

### Task 1: Onboarding flow (simple)

**Goal:** New users understand the app in under 30 seconds.

**Clarifying Questions (ask first):**
- Onboarding format: 1 screen or 2-3 swipe screens?
- Can users skip onboarding?
- When do we mark onboarding complete (local flag vs user account)?

**Steps:**
1. Add onboarding screen(s) explaining: what the app does + the next action.
2. Ask for key permissions at the right time (mic + notifications).
3. Store a "seen onboarding" flag and route accordingly.

---

### Task 2: User accounts + Settings changes

**Goal:** Settings has an Account area and a clear path to Plan/Payments.

**Clarifying Questions (ask first):**
- Which auth solution are we using (Clerk + Convex, or something else)?
- What account actions are needed first (sign in/out only, or profile too)?

**Steps:**
1. Add an "Account" section in Settings (sign in/out, user info).
2. Add a "Plan/Payments" row that routes to the Payments/Pro page.

---

### Task 3: Paywall (simple, best-practice)

**Goal:** A good-looking paywall that converts.

**Clarifying Questions (ask first):**
- What are the Pro features (exact list)?
- Plans: monthly + yearly, or just one?
- Trial: yes/no?

**Steps:**
1. Build a paywall UI (benefits list + strong CTA + restore + terms/privacy).
2. Gate Pro-only features so paywall appears at the right moment.

---

### Task 4: Payments / Pro page (plan selection)

**Goal:** A page users can reach anytime to see plans and upgrade.

**Clarifying Questions (ask first):**
- Is this the same screen as the paywall, or separate?
- Where do we redirect after purchase (back to Settings, or back to previous screen)?

**Steps:**
1. Create a Payments/Pro page with plan cards and current subscription status.
2. Link to it from Settings and from paywall CTAs.

---

### Task 5: RevenueCat integration

**Goal:** Purchases work reliably and are restorable.

**Clarifying Questions (ask first):**
- Which platforms are in scope first (Android only, or iOS too)?
- Product IDs and plan names?

**Steps:**
1. Integrate RevenueCat and wire it to Paywall + Pro page.
2. Implement "restore purchases".

---

### Task 6: Release + submission prep

**Goal:** Build a real installable app and prepare for store submission.

**Clarifying Questions (ask first):**
- Are we shipping Android first, or both Android + iOS?
- Do we need a custom domain/email now, or later?

**Steps:**
1. Developer accounts.
2. App store submission prep.
3. Domain email setup (optional).
