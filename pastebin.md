Revised Agent Handoff Plan (Primary AlarmActivity + Fallback In‑App Overlay, no router navigation)

Target behavior (non-negotiables)
When alarm fires on lockscreen/background: only alarm UI is visible (no tabs/home beneath), audio plays, dismiss/snooze works, and the alarm task closes on resolve.
When alarm fires while app is already open (foreground): show an overlay in MainActivity (no navigation), dismiss/snooze hides overlay and returns user to where they were.
No alarm flow should ever navigate expo-router to /alarm automatically. /alarm may exist only as a manual/debug route.
1) Establish canonical architecture (write this at top of pastebin.md)
Primary UI path: Notifee fullScreenAction ➜ AlarmActivity ➜ React root "alarm" ➜ AlarmRoot ➜ AlarmOverlay.
Fallback UI path: Notifee events while app is foreground ➜ store pending alarm ➜ RootLayout renders AlarmOverlay over the app.
Forbidden: router.push("/alarm"), Linking.openURL(".../alarm"), or any background navigation attempts.
Acceptance

Grepping repo shows no automatic routing to /alarm from notification handlers.
2) Fix “android is ignored” problem (make native logging + modules survive prebuild)
Your repo ignores /android (.gitignore), so all native changes must be produced by config plugins.

2.1 Move current native logging into plugins
Update withAlarmAudioModule.js to generate:
ActivityTracker.kt (lifecycle callbacks + lastResumed state + logCurrentState(reason)).
ActivityControlModule.kt with:
existing methods (getCurrentActivityName, isAlarmActivity, isKeyguardLocked, finishIfAlarmActivity, finishCurrentTask)
new logAppTaskState(reason) that:
calls ActivityTracker.logCurrentState(reason)
logs reactContext.currentActivity + taskId
logs ActivityManager.appTasks topActivity/numActivities
Ensure AlarmAudioPackage.kt registers both modules.
2.2 Ensure MainApplication.kt registers the tracker (plugin-generated)
Extend withMainApplication patch logic to:
add registerActivityLifecycleCallbacks(ActivityTracker)
add any required imports
be idempotent (running prebuild twice must not duplicate)
Acceptance

After npx.cmd expo prebuild --platform android --clean, the generated Android project contains the tracker + updated module, and build succeeds without manually editing /android.
3) Make Activity logging deterministic and versioned (native, via plugins)
3.1 AlarmActivity generation
In withFullScreenAlarm.js:
Keep writing AlarmActivity.kt with:
ALARM_ACTIVITY_LOG_VERSION
lifecycle logs (onCreate, onNewIntent, onResume, onPause, onStop, onDestroy)
sanitized extras dump
getMainComponentName() = "alarm"
Ensure the manifest entry stays correct: taskAffinity, excludeFromRecents, showWhenLocked, turnScreenOn.
3.2 MainActivity patching
In withFullScreenAlarm.js:
Patch/write MainActivity.kt to include:
MAIN_ACTIVITY_LOG_VERSION
same lifecycle logs + sanitized extras
Make patching idempotent using the version marker (if marker exists, skip).
Acceptance

Logcat shows [VR][NATIVE][AlarmActivity] ... version=... and [VR][NATIVE][MainActivity] ... version=... in real runs, proving correct native build.
4) Implement the fallback overlay in expo-router RootLayout (without navigation)
4.1 Re-introduce overlay rendering in _layout.tsx
Add state for activeAlarmOverlayProps and mount AlarmOverlay at the top level (as before), but do not add a Stack route for alarm and do not call router navigation.
The overlay should show when:
app is in foreground AND
there is a pending alarm not resolved AND
we are not in AlarmActivity (use native isAlarmActivity() if available, otherwise treat as not-alarm).
4.2 Define overlay resolve behavior
On dismiss/snooze inside MainActivity:
mark pending resolved + clear pending
stop audio
cancel displayed alarm notifications
hide overlay (set state null)
do not call finishCurrentTask() / exitApp() (since user is using the app)
4.3 Primary path resolve behavior (AlarmRoot)
In AlarmRoot.tsx resolve callbacks:
mark pending resolved + clear pending
call finishIfAlarmActivity() (and only fallback to finishCurrentTask() if needed)
This ensures “only alarm UI” and closes it cleanly.
Acceptance

Foreground alarm: overlay appears over current screen, dismiss returns to same screen.
Lockscreen alarm: AlarmActivity closes on dismiss, does not reveal main app UI.
5) Remove automatic /alarm route usage (keep only manual/debug if desired)
Ensure notifications.ts + index.ts never attempt to open /alarm via linking or router.
If /alarm route exists, label it as debug/manual only.
Update alarm.tsx semantics:
It should not try to “exit app” in general; it’s a debug route in MainActivity context.
Consider adding a banner log: rootType=debug_route.
Acceptance

No production alarm flow depends on /alarm.
6) Logging cleanup (make it “cut and clear” with minimal duplication)
6.1 One canonical traceId
Pick one function for correlation:
either keep buildAlarmTrace() and remove buildTraceId(), or vice versa.
Ensure trace includes: notificationId, reminderId, scheduledFor, kind, repost.
6.2 Remove double-logging of pending state transitions
Choose one line per state write:
either logPendingAlarmState(...) only, or vrLog(...) only.
Ensure every state transition prints: state=... traceId=... notificationId=... incomingId=... action=...
6.3 Don’t block Notifee background handler
Calls to logAppTaskState() from handleNotificationEvent() should be non-blocking:
do void logAppTaskState(...) (or gate behind a debug flag).
Keep the structured vrLog for Notifee events (cheap).
Acceptance

Grepping logcat for traceId=... yields a clean single timeline without 2–3 duplicate lines per event.
7) Remove confusing duplicates / dead files
Delete AlarmScreen.tsx if it’s not used.
Ensure only one alarm UI implementation is “real”:
AlarmActivity path uses AlarmRoot + AlarmOverlay.
Fallback uses AlarmOverlay.
/alarm route is debug-only (optional).
Acceptance

Search results for “AlarmScreen” / “/alarm” don’t show duplicate unused implementations.
8) Verification script (agent must run)
Clean native regen:
npx.cmd expo prebuild --platform android --clean
npx.cmd expo run:android
Logging capture:
adb logcat -c
adb logcat -v time | rg "\[VR\]"
Scenarios:
App killed → alarm fires (lockscreen) → dismiss
App background → alarm fires → snooze
App foreground → alarm fires → overlay shows → dismiss (no navigation)
Verify repost path (alarm_display_*) still results in AlarmActivity UI and trace is consistent
Pass criteria:
Lockscreen: native logs show AlarmActivity resumed; JS logs show AlarmRoot mount; resolve logs show finishIfAlarmActivity called; no router UI visible.
Foreground: native logs show MainActivity resumed; JS logs show AlarmOverlay mount in router root; dismiss hides overlay; no task finish.
9) Final deliverables for the agent
Updated plugins:
withAlarmAudioModule.js (generates tracker + updated ActivityControlModule + registers tracker)
withFullScreenAlarm.js (AlarmActivity + MainActivity logging/idempotent)
JS:
_layout.tsx overlay fallback restored (no navigation)
notifications.ts no /alarm routing; non-blocking dumps; clean traceId + pending-state logs
AlarmRoot.tsx primary resolve closes AlarmActivity
vrLog.ts cleaned up (single traceId function, no duplicate state logs)
Cleanup:
remove AlarmScreen.tsx (if unused)
optional: clarify alarm.tsx is debug-only or remove from app routes