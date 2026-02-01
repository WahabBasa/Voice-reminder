Confirm intended semantics

Treat “active reminder” as: “a reminder that can still fire in the future.”
For frequency="once": after the user dismisses/marks done, it should become inactive and free a slot.
For recurring reminders: dismissing an occurrence should NOT remove the reminder (it’s still active).
Stop hiding “active” state behind history

Extract a shared helper isReminderActive(reminder, history, now) (or similar) that returns whether a reminder should count as active.
Use that helper for both:
Home list rendering (what “All” shows)
Gating count (what blocks creation)
This removes the current mismatch: “All empty” vs “active count is 5”.
Make one-time reminders actually become inactive

When an alarm is dismissed for a one-time reminder:
Delete or archive the reminder record (recommended: delete from useReminderStore.reminders + storage, and remove Convex reminder/audio + local audio file + cancel triggers).
When a reminder is marked done from the list (not via alarm screen):
Apply the same rule: if it’s frequency="once", delete/archive it instead of only writing history.
Files to touch (agent handoff):

alarm.tsx: after recording completion, if reminder is once, call the unified “remove reminder fully” path.
index.tsx: handleMarkDone / bulk done path should also remove once reminders.
Centralize deletion into one function used by both (avoid duplicating “delete store + delete audio + remove Convex”).
Add a startup cleanup for existing “ghost actives”

On app start (after reminders + history loaded), scan for frequency="once" reminders that already have a “completed/dismissed” history entry for their occurrence and are past-due, then delete/archive them.
This fixes users who already accumulated hidden reminders.
Likely place:

_layout.tsx startup task or a store action like cleanupExpiredOnceReminders().
Update Completed tab behavior

After deleting once reminders, Completed entries won’t have a backing reminder to open/edit.
Decide behavior:
Press does nothing + toast (“This one-time reminder was completed and removed”), or
Open a read-only “history detail” view.
Validation checklist

Create 5 one-time reminders → 6th blocked.
Let them fire and dismiss → active list drops (slots free) → can create again.
Mark a one-time reminder done from list → it is removed and frees a slot.
Recurring reminder dismissed → stays active and still counts.
After restart, “All” and gating agree (no more “All empty but upgrade required”).
Handoff Plan (agent execution plan, with target files)

Goal

When an alarm fires on a locked device: only the alarm UI shows (full-screen), audio plays, and Dismiss/Snooze works reliably without reopening the main app UI or causing navigation errors.
Core issues to fix

Dual-launch: Notifee launches AlarmActivity, but JS also deep-links voicereminder:///alarm... which launches MainActivity too.
Multiple React roots: AlarmActivity + MainActivity both mounting expo-router triggers the “linking configured in multiple places” warning and unstable navigation.
Re-fire loop: one-time reminders without a persisted scheduledFor get re-scheduled by startup sync after delivery, hit “past => now+5s”, and keep firing.
Dismiss errors: dismiss tries router.replace while expo-router root isn’t ready due to churn/multiple roots.
Step 1 — Establish a clean, reproducible baseline
Run a clean native regen/build so you’re not debugging stale /android output (since /android is gitignored).
Repro checklist: create a single “once in 2–5 min” reminder → lock screen → let it fire → dismiss.
Capture logs confirming whether index.ts is still doing Linking.openURL during that flow.
Files (read-only for this step):

index.ts (line 61)
_layout.tsx (line 105)
Step 2 — Remove deep-link navigation as the alarm routing mechanism
Objective: Stop launching MainActivity via voicereminder:///alarm....

Actions:

Remove/disable all alarm UI routing via Linking.openURL(...) from index.ts.
Ensure index.ts never tries to navigate the UI; it should only record state (pending alarm) and let the mounted router decide.
Files to change:

index.ts (line 1) (remove expo-linking usage for alarm routing)
index.ts (line 34) (the navigateToAlarmScreen function)
index.ts (line 134) (AppState “active” pending-alarm navigation)
Expected outcome:

Alarm flow no longer triggers MainActivity by deep link, reducing the “app screen shows up” symptom and the expo-router linking warning.
Step 3 — Centralize alarm routing inside expo-router (RootLayout only)
Objective: Only navigate once the router is mounted/ready, and do it from a single place.

Actions:

In _layout.tsx, add a single “alarm bootstrap” routine that decides whether to show /alarm based on:
notifee.getInitialNotification() (covers cold-start/full-screen launches)
persisted pending alarm (getPendingAlarm() from notifications.ts)
Ensure this routing runs after the router is ready (avoid the “Attempted to navigate before mounting Root Layout” class of errors).
Files to change:

_layout.tsx (line 86) (the existing getInitialNotification() effect; extend it)
notifications.ts (line 863) (may need coordination with startup sync; see Step 6/7)
Potentially add a small helper module for “router-ready gating”:
new file (if needed): routerReady.ts (or similar)
Expected outcome:

Alarm UI routing becomes deterministic and happens only when the navigation tree exists.
Step 4 — Ensure only one activity is lock-screen-capable
Objective: Prevent the “normal app UI” from being allowed on the lock screen.

Actions:

Make MainActivity not set setShowWhenLocked(true) / setTurnScreenOn(true).
Keep lock-screen flags only in AlarmActivity.
Important note:

/android is gitignored (.gitignore has /android), so the durable fix must be via plugins + expo prebuild --clean, not manual edits to generated native files.
Files to change:

If MainActivity lockscreen flags are being injected by a plugin, fix the plugin. Candidates:
withFullScreenAlarm.js (extend it to ensure MainActivity is NOT modified)
If another plugin is responsible, update that plugin instead.
Verify generated output after prebuild (but don’t commit /android):
MainActivity.kt (verification only)
Expected outcome:

Even if MainActivity launches for any reason, it won’t present over the lock screen.
Step 5 — Make “pending alarm” the single source of truth for “alarm is active”
Objective: Avoid repeated opens and simplify “what should happen when an alarm delivered while backgrounded”.

Actions:

Ensure handleNotificationEvent(EventType.DELIVERED) always writes pending-alarm state for trigger notifications.
Ensure every successful “open alarm UI” path marks it handled exactly once.
Ensure Dismiss/Snooze clears pending alarm.
Files to change:

notifications.ts (line 484) (handleNotificationEvent)
notifications.ts pending-alarm helpers (setPendingAlarm, getPendingAlarm, markPendingAlarmHandled, clearPendingAlarm)
alarm.tsx (line 158) (handleDismiss) and alarm.tsx (line 203) (handleSnooze) already call clear helpers—keep behavior consistent.
Expected outcome:

No more “alarm delivered in background → app active → open alarm → reopen again” loops.
Step 6 — Persist scheduledFor for one-time reminders (fix the reschedule loop)
Objective: Prevent “once” reminders from being rescheduled after they already fired.

Root cause:

If a once reminder doesn’t store its scheduled occurrence timestamp, syncRemindersOnStartup can treat it as unscheduled and recreate it. Since the intended time is now in the past, scheduleReminder falls back to “now + 5s” and the alarm keeps firing.
Actions:

Whenever a reminder is scheduled, persist the returned triggerTimestamp into the reminder record as scheduledFor.
Ensure this is applied for:
voice-created reminders
manually-created reminders
edited reminders (reschedule path)
Files to change:

notifications.ts (line 298) (scheduleReminder returns triggerTimestamp; ensure call sites store it)
Call sites (search for scheduleReminder():
likely index.tsx (voice reminder flow)
new.tsx (manual create)
anywhere rescheduling happens after edits
Data model:
store.ts (Reminder type + update action)
storage.ts (serialization/migration if needed)
Expected outcome:

Once an alarm fires, a restart doesn’t recreate it as “now + 5s”.
Step 7 — Harden startup sync so it cannot resurrect fired one-time alarms
Objective: Even if old data exists (missing scheduledFor), prevent rapid reschedule loops.

Actions:

In syncRemindersOnStartup, add logic to skip scheduling once reminders that are “logically expired”:
If frequency === "once" and computed due time is in the past, do not schedule.
If there is a pending alarm for that reminder/occurrence, do not schedule a new trigger.
Optionally add a one-time migration: if a once reminder has no scheduledFor, compute and store it once.
Files to change:

notifications.ts (line 863) (syncRemindersOnStartup)
time.ts (line 240) (getNextTriggerTime, for consistent computation)
Expected outcome:

Startup sync can’t become an alarm generator.
Step 8 — Make dismiss/snooze navigation resilient
Objective: Dismiss never throws “navigate before mounting Root Layout”.

Actions:

Ensure AlarmScreen closing does not call router actions until the router is ready.
If needed, replace “close via router” with “close via activity finish” for AlarmActivity (native bridge), but only if router-ready gating is insufficient.
Files to change:

alarm.tsx (line 132) (closeAlarmScreen)
(Optional, if needed) add a small native module/plugin to finish AlarmActivity:
withFullScreenAlarm.js (generate Kotlin helper)
JS wrapper in AlarmActivityControl.ts
Expected outcome:

Pressing Dismiss/Snooze never cascades into repeated promise rejections.
Step 9 — Validation matrix (must-pass)
Locked screen fire: alarm UI only, no main UI underneath.
Dismiss:
stops audio immediately
closes alarm UI
no further deliveries for once reminders
Snooze:
schedules exactly one snooze
fires once at snooze time
Repeating reminders:
dismiss stops current ring
next occurrence remains scheduled
No logs:
no “configured linking in multiple places”
no “Attempted to navigate before mounting Root Layout”
no repeated “Trigger time is in the past, adjusting to now + 5s” loops