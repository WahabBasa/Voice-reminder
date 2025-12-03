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
| TTS | OpenAI TTS | Natural-sounding reminder voice |
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
│     - Receives audio → Whisper STT → text                   │
│     - GPT parses: title, time, frequency                    │
│     - OpenAI TTS generates audio file                       │
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

## Phase 2: Audio Recording

**Goal:** Record user's voice and get audio file ready to send

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
- [ ] Permission prompt appears
- [ ] Recording starts/stops correctly
- [ ] Audio file URI logged to console
- [ ] Recording indicator displays

---

## Phase 3: Convex Backend + OpenAI Integration

**Goal:** Process audio → get transcription, parsed reminder, and TTS audio

### Tasks

1. **Convex Schema**
   ```typescript
   // convex/schema.ts
   reminders: defineTable({
     title: v.string(),
     description: v.string(),
     time: v.string(),              // "08:00"
     frequency: v.string(),         // "once" | "daily" | "weekly"
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
         { title, description, time (HH:MM), frequency (once|daily|weekly), days (array if weekly) }`
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
- [ ] Audio uploads to Convex successfully
- [ ] Whisper returns accurate transcription
- [ ] GPT returns valid structured JSON
- [ ] TTS audio file stored in Convex
- [ ] Can play TTS audio URL in browser
- [ ] Reminders saved to database

---

## Phase 4: Notifications with Custom Sound

**Goal:** Schedule notifications that play TTS audio even when app is killed

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
     // Apply frequency logic (once, daily, weekly)
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
- [ ] Notification channel created successfully
- [ ] Notification appears at scheduled time
- [ ] **TTS audio plays when app is in background**
- [ ] **TTS audio plays when app is killed** (critical!)
- [ ] Repeating reminders reschedule correctly

---

## Phase 5: Complete UI & Polish

**Goal:** Full reminder list, details, and delete functionality

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
- [ ] Reminders display correctly in list
- [ ] Next trigger time is accurate
- [ ] Delete removes notification + all data
- [ ] Empty state displays properly
- [ ] Loading states work

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
   - Network error during upload → retry button
   - OpenAI API error → user-friendly message
   - Invalid reminder format → "try again" prompt
   - Storage full → warning message

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
- [ ] Deny mic permission → graceful message
- [ ] Deny notification permission → graceful message
- [ ] Network offline during recording → error + retry
- [ ] Kill app, restart → reminders still scheduled
- [ ] Force close during recording → no crash/data loss

---

## File Structure

```
VoiceReminder/
├── app/
│   ├── (tabs)/
│   │   ├── index.tsx           # Home - reminder list
│   │   └── record.tsx          # Record new reminder
│   └── _layout.tsx             # Root layout + providers
├── components/
│   ├── ReminderCard.tsx        # Single reminder display
│   ├── RecordButton.tsx        # Hold-to-record button
│   ├── EmptyState.tsx          # No reminders view
│   └── LoadingSpinner.tsx      # Processing indicator
├── lib/
│   ├── notifications.ts        # Notifee helpers
│   ├── audio.ts                # Recording helpers
│   ├── time.ts                 # Schedule calculations
│   └── permissions.ts          # Permission helpers
├── convex/
│   ├── schema.ts               # Database schema
│   ├── reminders.ts            # Queries + mutations
│   ├── actions.ts              # OpenAI processing
│   └── http.ts                 # HTTP endpoints
├── app.json                    # Expo config
└── package.json
```

---

## Environment Variables

```bash
# Convex (auto-generated)
CONVEX_DEPLOYMENT=xxx

# OpenAI (set in Convex dashboard)
OPENAI_API_KEY=sk-xxx
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

## Limitations (POC Scope)

- No user authentication
- No editing reminders (delete + recreate)
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
