You are grilling a plan from Claude (the architect on this repo) for a small feature. Keep it short: this is a quick sanity round, not a deep review. Read-only — do not modify files, do not run convex or eas. Respond in under 60 lines: (1) anything factually wrong about the codebase or iOS behavior in the plan, with file:line evidence; (2) the 2-4 edge cases that WILL actually happen for a solo-dev reminder app (skip exotic ones); (3) a verdict: agree / agree with these changes. No essays.

## Context (verified by Claude)

- The line the alarm speaks is the reminder's `description` field. `convex/actions.ts:1062-1066` and `:1270-1274` — `ttsText = plan.description` / `normalizedDescription`, "what was stored is what is spoken".
- `components/EditReminderSheet.tsx` (opened by tapping a card, `app/index.tsx:1461-1478`) already has a `description` text input. On save (`:286-420`) it updates the local store, then `cancelReminder` + `scheduleReminder` reusing the OLD `reminder.audioUrl` / `preAudioUrl`, then `updateConvexReminder` with text + schedule fields. So editing the description changes the card text but the alarm keeps speaking the old line.
- Backend action `regenerateReminderAudio` exists at `convex/actions.ts:1308-1362`: takes `{reminderId, deviceId, soundText}`, synthesizes mp3 + AlarmKit wav via `synthesizeAndStoreLineTts`, swaps storage ids via `internal.reminders.updateAudio` / `setAudio`, returns `{audioUrl, soundText}` — but NOT the new `wavUrl`. Nothing in the app calls it.
- Local audio cache: `lib/notifications.ts:1140-1170` — mp3 downloaded to a path keyed by reminderId, and `downloadAudio` short-circuits with "Audio already exists locally" if the file exists. `:1190-1201` has deleteAsync helpers for the local mp3. AlarmKit sound: `ensureAlarmSound(reminderId, wavUrl)` at `:99` / `:1458` — check how it caches the wav (Library/Sounds? keyed by reminderId?) and whether a stale wav would survive a regeneration.
- Reactive hydration: `lib/audioHydration.ts:57 hydrateReminderAudio` watches the Convex row and downloads when `audioStatus` flips to "ready"; it is what creation uses. Store row fields: `audioUrl`, `wavUrl`, `audioStatus`, `preAudioUrl` (`lib/store.ts:40-100`).
- Pre-alert heads-up line (`preDescription` / `preAudioUrl`) is a separate line; out of scope, leave it.

## Plan

1. **Backend**: `regenerateReminderAudio` also returns `wavUrl` (`ctx.storage.getUrl(newWavStorageId)` when present). No schema change.
2. **Edit sheet save**: if `description.trim() !== reminder.description` and the reminder has a `convexId`:
   a. Set a `regenerating` UI state (Save button reads "Updating voice…", disabled).
   b. `await regenerateReminderAudio({ reminderId: convexId, deviceId, soundText: description })`.
   c. Delete the local cached mp3 (and wav) for this reminderId so the next download is not short-circuited; then `cancelReminder` + `scheduleReminder` with the NEW `audioUrl` / `wavUrl`. Update the store row with the new URLs.
   d. On failure (offline, TTS error): still save the text + schedule edit and reschedule with the OLD audio; toast "Couldn't update the voice — it will still say the old line". No retry queue.
3. Unchanged description → existing path, untouched.
4. Tests: jest unit for the save branch (regenerate called only when description changed; failure path keeps old audio), and a convex test asserting `wavUrl` in the return.

## Specific questions

- Q1: Is awaiting the action inline (TTS ~2-5 s) the right call vs. flipping `audioStatus: "pending"` and letting `hydrateReminderAudio` pick it up reactively like creation does? Claude leans inline because the sheet is modal and the user just typed the new line; the reactive path would need the sheet to survive closing.
- Q2: Any AlarmKit / iOS gotcha with replacing the wav for an already-scheduled alarm (cached sound file by name, alarm needing re-creation, background download)?
- Q3: Anything in `scheduleReminder`'s ring planning that keys off `audioUrl` identity (e.g. skipping a download when the URL is unchanged) that would break with the new URL?
