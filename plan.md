# Voice Reminder App - Implementation Plan

A voice-based reminder app where users speak what they want to be reminded of, and the app plays a custom TTS audio when the reminder fires.

> **Project Location:** `C:\Dev\VR` (moved from original location due to Windows path length limits)

---

## Tech Stack

| Component | Technology | Why |
|-----------|------------|-----|
| Frontend | Expo (React Native) | Cross-platform, fast development |
| Backend | Convex | AI processing (Whisper/GPT/TTS), file storage |
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
| 6 | UI Polish & Refinement | ✅ Completed |
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

## Phase 6: UI Polish & Refinement ✅ COMPLETED

**Goal:** Professional-looking UI with proper typography, icons, and polish

**Status:** Completed on 2025-12-21

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

### Task 4: UI Consistency Pass - SKIPPED
Deferred for now - can revisit after release if needed.

### Task 5: Little Details ✅ COMPLETED
**Status:** Completed on 2025-12-20

**Done:**
- Success feedback: toast system ("Reminder created", "Marked as done")
- Empty states: All + Completed tabs with clear CTAs
- Loading state: basic list loading indicator
- Small list animations: layout animation on create + mark done
- Smooth delete animations: fade out + checkmark fill on mark-done

### Task 6: Voice Delay Investigation - SKIPPED
Optional task - only do if users complain.

### Task 7: Swipe to Delete ✅ COMPLETED
**Status:** Completed on 2025-12-20

- SwipeableCard component with pan gesture
- Swipe left reveals red delete button
- Deletes from local storage, cancels notification, removes from Convex

### Task 8: Multi-Select Mode ✅ COMPLETED
**Status:** Completed on 2025-12-21

- Three-dot menu moved to header (⋮) with Select, Select All, Settings options
- Tapping cards toggles selection (darkened background indicator)
- Bulk action bar: Delete All, Done All
- Checkmark hidden in select mode

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
// Reminders are stored locally - re-sync notifications on app launch
async function syncReminders() {
  const localReminders = await getLocalReminders(); // From AsyncStorage/SQLite
  const scheduledIds = await notifee.getTriggerNotificationIds();
  
  for (const reminder of localReminders) {
    if (!scheduledIds.includes(`reminder_${reminder.id}`)) {
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

**Goal:** Payments, paywall, onboarding, and app store release

### Architecture Decision: Local-First

**Reminders are stored locally on device, not in Convex.**

- Convex is ONLY used for processing (Whisper → GPT → TTS)
- After processing, reminder data is stored locally (AsyncStorage/SQLite)
- This enables full offline functionality
- No user accounts required for core app functionality

### Dependency Chain (Simplified)

```
┌─────────────────────────────────────────────────────────────┐
│  1. REVENUECAT (Anonymous Mode)                             │
│     - Uses device-generated ID + App Store/Play Store       │
│     - No Clerk required                                     │
│     - Purchases restored via store account (Google/Apple)   │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  2. PAYWALL (Gate Features)                                 │
│     - Check local reminder count (AsyncStorage)             │
│     - Check RevenueCat subscription status                  │
│     - Show paywall when limit reached                       │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  3. ONBOARDING (Permissions + Value)                        │
│     - Show app value proposition                            │
│     - Request mic + notification permissions                │
│     - No sign-in required                                   │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  4. RELEASE (Store Submission)                              │
│     - Build production app                                  │
│     - Submit to Play Store / App Store                      │
└─────────────────────────────────────────────────────────────┘
```

---

### Task 1: RevenueCat Integration (The First Domino) 🎯

**Goal:** Purchases work reliably and are restorable

**Why first:** Everything else (paywall, gating) needs to know subscription status.

**Key insight:** RevenueCat works in **anonymous mode**. The App Store/Play Store tracks who bought what—not your backend. Users restore purchases via their store account.

**Clarifying Questions:**
- [ ] Which platforms first? Android only, or iOS too?
- [ ] Product IDs and plan names (monthly/yearly)?
- [ ] Free tier limit? (e.g., 5 reminders free, unlimited with Pro)

#### Step 1.1: Create RevenueCat Account (10 min)
1. Go to [revenuecat.com](https://www.revenuecat.com/)
2. Create a project "VoiceReminder"
3. Add Android app (package name from `app.json`)
4. Add iOS app if needed
5. Copy API keys (one per platform)

#### Step 1.2: Set Up Products in Play Console (30-60 min)
1. Go to Google Play Console → Your App → Monetize → Products → Subscriptions
2. Create subscription products:
   - `voicereminder_pro_monthly` - Monthly subscription
   - `voicereminder_pro_yearly` - Yearly subscription (with savings)
3. Link products in RevenueCat dashboard under "Products"

#### Step 1.3: Install RevenueCat SDK (5 min)
```bash
npm install react-native-purchases --legacy-peer-deps
```

#### Step 1.4: Initialize RevenueCat (15 min)
**File:** `lib/purchases.ts`

```typescript
import Purchases, { LOG_LEVEL } from 'react-native-purchases';
import { Platform } from 'react-native';

const REVENUECAT_ANDROID_KEY = 'your_android_api_key';
const REVENUECAT_IOS_KEY = 'your_ios_api_key';

export async function initializePurchases() {
  Purchases.setLogLevel(LOG_LEVEL.DEBUG); // Remove in production
  
  await Purchases.configure({
    apiKey: Platform.OS === 'ios' ? REVENUECAT_IOS_KEY : REVENUECAT_ANDROID_KEY,
    // No appUserID = anonymous mode (uses device ID)
  });
}

export async function checkProStatus(): Promise<boolean> {
  try {
    const customerInfo = await Purchases.getCustomerInfo();
    return customerInfo.entitlements.active['pro'] !== undefined;
  } catch (error) {
    console.error('Error checking pro status:', error);
    return false;
  }
}

export async function restorePurchases(): Promise<boolean> {
  try {
    const customerInfo = await Purchases.restorePurchases();
    return customerInfo.entitlements.active['pro'] !== undefined;
  } catch (error) {
    console.error('Error restoring purchases:', error);
    return false;
  }
}
```

#### Step 1.5: Initialize on App Start (10 min)
**File:** `app/_layout.tsx`

```typescript
import { initializePurchases } from '@/lib/purchases';

useEffect(() => {
  initializePurchases();
}, []);
```

**Time estimate:** ~2-3 hours (mostly waiting for Play Console setup)

**Definition of Done:**
- [ ] RevenueCat SDK initialized on app start
- [ ] Can check subscription status with `checkProStatus()`
- [ ] Products visible in RevenueCat dashboard

---

### Task 2: Local Usage Tracking

**Goal:** Track reminder count locally to enforce free tier limits

#### Step 2.1: Create Usage Storage (15 min)
**File:** `lib/usage.ts`

```typescript
import AsyncStorage from '@react-native-async-storage/async-storage';

const REMINDER_COUNT_KEY = 'reminder_count';
const FREE_LIMIT = 5; // Adjust as needed

export async function getReminderCount(): Promise<number> {
  const count = await AsyncStorage.getItem(REMINDER_COUNT_KEY);
  return count ? parseInt(count, 10) : 0;
}

export async function incrementReminderCount(): Promise<number> {
  const current = await getReminderCount();
  const newCount = current + 1;
  await AsyncStorage.setItem(REMINDER_COUNT_KEY, newCount.toString());
  return newCount;
}

export async function canCreateReminder(isPro: boolean): Promise<boolean> {
  if (isPro) return true;
  const count = await getReminderCount();
  return count < FREE_LIMIT;
}
```

#### Step 2.2: Check Before Creating Reminder (10 min)
Update reminder creation flow to check `canCreateReminder()` before proceeding.

**Time estimate:** ~30 min

---

### Task 3: Paywall

**Goal:** A good-looking paywall that converts

**Blocked by:** Task 1 (need RevenueCat for products/prices)

**Clarifying Questions:**
- [ ] What are the Pro features (exact list)?
- [ ] Plans: monthly + yearly, or just one?
- [ ] Trial: yes/no? How long?

#### Step 3.1: Create Paywall Screen (1-2 hours)
**File:** `app/paywall.tsx`

Components:
- Header with app icon/branding
- Feature list with icons (what Pro unlocks)
- Plan cards (monthly/yearly with savings badge)
- Purchase button (calls RevenueCat)
- "Restore Purchases" link
- Terms of Service / Privacy Policy links
- Close/dismiss button

#### Step 3.2: Get Products from RevenueCat (30 min)
```typescript
import Purchases from 'react-native-purchases';

const offerings = await Purchases.getOfferings();
const packages = offerings.current?.availablePackages || [];
// Display packages with their prices
```

#### Step 3.3: Handle Purchase (30 min)
```typescript
async function handlePurchase(package: PurchasesPackage) {
  try {
    const { customerInfo } = await Purchases.purchasePackage(package);
    if (customerInfo.entitlements.active['pro']) {
      // Success! Navigate back or update UI
    }
  } catch (error) {
    // Handle error (user cancelled, payment failed, etc.)
  }
}
```

#### Step 3.4: Trigger Paywall at Right Moments (30 min)
- When user tries to create reminder past free limit
- From Settings → "Upgrade to Pro"
- Optional: Soft prompt after N uses

**Time estimate:** ~2-3 hours

---

### Task 4: Onboarding Flow

**Goal:** New users understand the app in under 30 seconds

**No blockers** - can be done in parallel with other tasks

**Clarifying Questions:**
- [ ] Onboarding format: 1 screen or 2-3 swipe screens?
- [ ] Can users skip onboarding?

#### Step 4.1: Create Onboarding Screens (1-1.5 hours)
**File:** `app/onboarding.tsx`

Screens:
1. **Value prop:** "Speak your reminders, hear them when they're due"
2. **How it works:** Quick visual of speak → schedule → notify
3. **Permissions:** Request mic + notification permissions
4. **Get started:** Button to enter app (no sign-in needed)

#### Step 4.2: Track Onboarding Completion (15 min)
```typescript
import AsyncStorage from '@react-native-async-storage/async-storage';

await AsyncStorage.setItem('hasSeenOnboarding', 'true');
```

#### Step 4.3: Route Logic in Layout (15 min)
```typescript
// In _layout.tsx
const [isReady, setIsReady] = useState(false);
const [showOnboarding, setShowOnboarding] = useState(false);

useEffect(() => {
  async function checkOnboarding() {
    const seen = await AsyncStorage.getItem('hasSeenOnboarding');
    setShowOnboarding(!seen);
    setIsReady(true);
  }
  checkOnboarding();
}, []);

if (!isReady) return <SplashScreen />;
if (showOnboarding) return <Redirect href="/onboarding" />;
```

**Time estimate:** ~1.5-2 hours

---

### Task 5: Release + Submission Prep

**Goal:** Build a real installable app and prepare for store submission

**Blocked by:** Tasks 1-4 (core flows must work)

**Clarifying Questions:**
- [ ] Android first, or both platforms?
- [ ] Custom domain/email for developer account?

#### Step 5.1: Developer Accounts
- Google Play Console ($25 one-time)
- Apple Developer Program ($99/year) if doing iOS

#### Step 5.2: App Store Assets
- App icon (1024x1024)
- Screenshots for each screen size
- Feature graphic (Play Store)
- App description, keywords
- Privacy policy URL

#### Step 5.3: Build Production APK/AAB
```bash
eas build --platform android --profile production
```

#### Step 5.4: Submit to Stores
- Upload to Play Console / App Store Connect
- Fill metadata, set pricing
- Submit for review

**Time estimate:** ~4-6 hours (mostly waiting for builds/reviews)

---

### Future: User Accounts (Optional)

Clerk authentication is **not required** for core functionality but could be added later for:

- Cross-device reminder sync (premium feature)
- Displaying "Welcome, [Name]" in app
- User support tickets
- Advanced analytics

If added, it would become Task 6 after release.

---

### UI Parking Lot

These UI tasks are captured but **parked**:

| Task | Status | Notes |
|------|--------|-------|
| Paywall UI | Blocked | Waiting for Task 1 (RevenueCat) |
| Onboarding UI | Ready | No blockers, can do anytime |
| Delete animations | Anytime | No dependencies, pure polish |
| UI consistency pass | Anytime | No dependencies, low priority |

**The rule:** When the engine exists, the UI becomes obvious.

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

- No user authentication (by design for local-first)
- Editing reminders supported (no TTS regeneration yet)
- No snooze functionality
- Single device only (local-first architecture, no cross-device sync)
- No timezone handling (uses device timezone)
