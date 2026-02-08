Handoff: Iron Out Fast-Path + Async TTS Issues

This is a surgical follow-up plan to fix the specific problems in the current implementation (fast path not scheduling, fragile background TTS scheduling, hydration not marking failures, and fast-path GPT parsing drift). References below point to the current code.

0) Current Issues (Observed in Repo)
Fast-path reminders aren’t scheduled immediately
In index.tsx (line 473), scheduling is skipped when newReminder.audioUrl is falsy:
if (!newReminder.audioUrl) return;
Fast path sets audioUrl: "" and audioStatus: "pending" (index.tsx (lines 415-427)), so this branch prevents scheduling.
Background TTS scheduling is fragile / likely wrong
actions.ts (lines 887-892) uses ctx.scheduler.runAfter(0, internal.actions.generateReminderTtsForReminder, ...) with // @ts-ignore.
But generateReminderTtsForReminder is exported as a public action (actions.ts (line 920)), not an internal action, and the internal reference may not exist at runtime.
Hydration does not propagate “failed” locally
audioHydration.ts (lines 46-48) stops when Convex audioStatus === "failed" but does not update the local reminder.
Result: reminder can remain stuck as audioStatus: "pending" forever, and startup hydration in _layout.tsx (lines 84-125) will keep attempting.
Fast-path GPT parsing logic drift
actions.ts:742+ fast path uses a minimal system prompt and simplified normalization.
It doesn’t reuse the more robust day/time normalization logic that exists in the original processVoiceReminder path (risk: worse accuracy, especially for days/time quirks).
Resilience gap: scheduled notification data has audioUrl: ""
notifications.ts now writes audioUrl: reminder.audioUrl ?? "" into notification data (good for schema stability).
But if audio isn’t downloaded before delivery and data.audioUrl is "", the delivery handler cannot download audio on-demand. Hydration usually handles this, but near-term reminders (“in 1 minute”) are the risky case.
1) Fix: Schedule Immediately Even When Audio Is Pending (Must-Do)
Goal: Fast-path reminder schedules right away using default sound while voice audio is generated.

1.1 Update the scheduling gate in index.tsx
File: index.tsx (lines 473-509)

Current behavior:

Scheduling is completely skipped when newReminder.audioUrl is falsy.
Required change:

Remove the if (!newReminder.audioUrl) return; early-return.
Always call scheduleReminder(...).
Pass audioUrl: newReminder.audioUrl || "" (or omit, since audioUrl?: string now).
Acceptance:

Create a voice reminder via fast path; it appears immediately and you can confirm a trigger exists via Notifee even if audio is still pending.
2) Fix: Make Background TTS Scheduling Correct + Type-Safe (Must-Do)
Goal: processVoiceReminderFast reliably schedules background TTS generation without ts-ignore, and it works at runtime.

Pick ONE of these approaches and implement exactly.

Option A (Recommended): Make TTS generator an internalAction
Files: actions.ts, convex/_generated/*

Convert generateReminderTtsForReminder from action to internalAction.

Import internalAction from ./_generated/server.
Export it as export const generateReminderTtsForReminder = internalAction({ ... }).
In processVoiceReminderFast, keep:

await ctx.scheduler.runAfter(0, internal.actions.generateReminderTtsForReminder, { ... })
Remove the // @ts-ignore.
Regenerate Convex types:

Run npx convex dev (or the project’s standard Convex codegen command) so that convex/_generated includes the new internal reference.
Acceptance:

No ts-ignore remains.
Convex deploy/dev run shows processVoiceReminderFast enqueues the internal action.
AudioStatus flips pending → ready in DB.
Option B: Keep it public, schedule via api reference (No internal)
File: actions.ts

Import api from ./_generated/api.
Schedule like:
await ctx.scheduler.runAfter(0, api.actions.generateReminderTtsForReminder, { ... })
Keep generateReminderTtsForReminder as a public action.
Acceptance:

No ts-ignore.
Scheduler runs the public action consistently.
3) Fix: Prevent Storage Leaks of Uploaded Recordings (Must-Do)
Goal: The temporary uploaded recording (args.audioStorageId) is deleted even if STT/GPT throws.

File: actions.ts inside processVoiceReminderFast (actions.ts:701+)

Implementation requirements:

Wrap the STT+GPT processing in try { ... } finally { await ctx.storage.delete(args.audioStorageId).catch(...) }
Only delete after you have read the blob into memory (you already do at actions.ts (lines 715-723)).
Ensure deletion failures do not crash the action (log and continue).
Acceptance:

No accumulation of orphaned uploaded recordings in Convex storage when STT/GPT errors occur.
4) Fix: Hydration Must Mark Local Failures + Stop Retrying (Must-Do)
Goal: When Convex marks audio generation failed, local reminder becomes audioStatus: "failed" (and optionally stores audioError), and startup hydration doesn’t keep retrying.

4.1 Expand hydrateReminderAudio update contract
File: audioHydration.ts

Current:

updateLocal only supports { audioUrl: string; audioStatus: 'ready' }.
Required:

Allow updating to failed:
updateLocal: (patch: { audioUrl?: string; audioStatus: 'ready' | 'failed'; audioError?: string }) => Promise<void>;
4.2 When audioStatus === "failed", update local
File: audioHydration.ts (lines 46-48)

Required change:

Call updateLocal({ audioStatus: 'failed', audioError: result.audioError ?? 'TTS failed' }) before returning.
4.3 Update startup hydration filter
File: _layout.tsx (lines 84-125)

Current filter:

r.audioStatus === "pending" && !r.audioUrl
This is fine once failures are propagated. Ensure no other code sets missing audio to pending incorrectly.

Acceptance:

A forced failure (e.g. invalid TTS key) results in local reminders showing audioStatus: failed and startup hydration does not keep polling them.
5) Fix: Fast-Path GPT Parsing Must Match Original (Strongly Recommended)
Goal: Fast path should behave like the legacy path, just faster transport and async TTS.

File: actions.ts (processVoiceReminderFast)

Required refactor:

Extract shared helpers used by both paths:

A single function that builds the system prompt (reuse the large, rule-heavy prompt from the original processVoiceReminder).
A single function that normalizes:
days (normalizeDay mapping)
time fallback (currentTimeHm logic)
frequency/weekdays logic
scheduleType/rrule/onceAt logic
parseWarnings behavior
Replace the simplified fast-path parsing:

days = frequency === "custom" ? (parsed.days as ...) : undefined;
time fallback = "09:00"
with the same logic as the original path.
Acceptance:

Given the same transcript and device time inputs, processVoiceReminder and processVoiceReminderFast return equivalent structured fields (except fast path returns audioStatus: pending and no audioUrl).
6) Fix: Ensure Voice Audio Is Available at Alarm Time (Recommended)
Goal: For near-term reminders, ensure either the local mp3 exists before trigger OR the trigger notification has an audioUrl available for download on delivery.

You can choose one:

Option A (Simpler): Hydration always downloads audio locally ASAP (keep as-is) + ensure scheduling happens immediately
After Section 1 fix, this becomes “good enough” for most reminders.
Remaining risk: if TTS isn’t ready before trigger, alarm plays default notification sound only.
Option B (More Robust): After hydration success, refresh scheduled trigger notification data
Files: notifications.ts, audioHydration.ts, index.tsx, _layout.tsx

Add a mechanism to “refresh” scheduled reminders once audio is ready:

In notifications.ts, add a helper:
Find scheduled trigger IDs with prefix reminder_${reminderId}_ using notifee.getTriggerNotificationIds()
Cancel via notifee.cancelTriggerNotification(id) (API exists in Notifee typings)
Recreate the trigger notification with identical triggerTimestamp but with data.audioUrl populated.
This likely requires extending scheduleReminder to accept a forceTimestamp so it doesn’t recompute a new timestamp.
Call this refresh step after hydration downloads audio and updates local state (both in the immediate create flow and at startup hydration).
Acceptance:

Even if local mp3 is missing at delivery time, the delivered handler can download using data.audioUrl and start alarm audio.
7) Cleanup Notes (Non-functional but important)
pastebin.md was overwritten with implementation plan text and is missing a trailing newline (shows \ No newline at end of file). If pastebin.md is supposed to remain the alarm architecture doc, revert it or move the plan elsewhere.
Verification Checklist (Runbook)
Create a voice reminder (fast path succeeds):
Reminder appears immediately in UI.
A Notifee trigger is created immediately (no restart needed).
Confirm Convex doc transitions:
audioStatus: pending → ready and audioStorageId set.
Confirm hydration:
Local reminder becomes audioStatus: ready and audioUrl set.
Local file reminder_<localId>.mp3 exists.
Failure mode:
Break TTS provider keys; reminder becomes audioStatus: failed locally and in Convex.
App does not endlessly retry hydration on startup.
