import { api } from "../convex/_generated/api";
import { ConvexReactClient } from "convex/react";
import { downloadPreReminderAudio, downloadReminderAudio, refreshNotificationWithAudio } from "./notifications";
import { getDeviceId } from "./deviceId";

const MAX_ATTEMPTS = 30;
// Fresh budget granted the moment the base line lands with the pre-alert still
// coming (OLD-107), so a slow base cannot starve the second phase of its poll
// window. It used to have to cover a heads-up line plus three replay variants
// synthesized back to back against a two-request account ceiling (11s
// measured); OLD-108 cut that to the heads-up alone, so the budget is now
// generous rather than tight — which is the right side to be wrong on.
const EXTRAS_ATTEMPTS = 40;
const POLL_INTERVAL_MS = 1000;
const inFlight = new Map<string, Promise<void>>();

export type AudioExtrasStatus = 'pending' | 'ready' | 'failed';

/**
 * Poll Convex for audio readiness and download when ready.
 *
 * Two phases since OLD-107, because the server stopped writing a reminder's
 * audio in one patch. The base spoken line lands first and flips
 * `audioStatus: "ready"` — that is the reminder playable, and it is what this
 * function used to be the whole of. The pre-alert line follows in a second
 * patch a few seconds later, announced ahead of time by
 * `audioExtrasStatus: "pending"`, and phase two waits for it.
 *
 * The second phase covered the replay variant lines too until OLD-108 removed
 * them; a reminder with no lead time now settles both statuses in one poll.
 */
export async function hydrateReminderAudio(params: {
  convexClient: ConvexReactClient;
  convexId: string;
  localReminderId: string;
  updateLocal: (patch: { audioUrl?: string; wavUrl?: string; preAudioUrl?: string; audioStatus: 'ready' | 'failed'; audioExtrasStatus?: AudioExtrasStatus; audioError?: string }) => Promise<void>;
  onSuccess?: (audioUrl: string) => Promise<void>;
}): Promise<void> {
  const { convexClient, convexId, localReminderId, updateLocal, onSuccess } = params;
  const key = `${convexId}:${localReminderId}`;
  const existing = inFlight.get(key);
  if (existing) return existing;

  /**
   * Write one Convex row onto the device: download whatever audio it carries,
   * fold it into the local reminder, and re-stamp the scheduled notifications.
   *
   * Runs once per phase, and is safe to run twice — every download skips a file
   * it already has, and refreshNotificationWithAudio no-ops when the trigger
   * data already matches.
   */
  const apply = async (result: any, extrasStatus: AudioExtrasStatus): Promise<void> => {
    // Download to local storage
    await downloadReminderAudio(localReminderId, result.audioUrl);

    // Pre-alert line is optional: hydrate it when present, but never
    // let it block the main audio (notification-only pre-alert is fine).
    const preAudioUrl = result.preAudioUrl as string | undefined;
    if (preAudioUrl) {
      try {
        await downloadPreReminderAudio(localReminderId, preAudioUrl);
      } catch (preErr) {
        console.log(`[VR] Hydration: pre-alert download failed for ${convexId}:`, preErr);
      }
    }

    // Update local reminder
    await updateLocal({
      audioUrl: result.audioUrl,
      ...(result.wavUrl ? { wavUrl: result.wavUrl as string } : {}),
      ...(preAudioUrl ? { preAudioUrl } : {}),
      audioStatus: 'ready',
      // Recorded locally so a launch that interrupted the pre-alert phase can
      // be seen and resumed (app/_layout.tsx re-hydrates on "pending").
      audioExtrasStatus: extrasStatus,
    });

    // Refresh scheduled notifications with the new audio URLs
    await refreshNotificationWithAudio(localReminderId, result.audioUrl, preAudioUrl || undefined);
  };

  const task = (async () => {
    try {
      // Reminders are device-scoped (OLD-74): the backend only hands back rows
      // belonging to this install.
      const deviceId = await getDeviceId();
      let baseApplied = false;
      let attemptsLeft = MAX_ATTEMPTS;

      while (attemptsLeft-- > 0) {
        try {
          // Query for reminder via raw fetch since we don't have hook access here
          const result = await convexClient.query(api.reminders.get, { id: convexId as any, deviceId });

          if (!result) {
            console.log(`[VR] Hydration: reminder ${convexId} not found, stopping`);
            return;
          }

          const extrasStatus = (result as any).audioExtrasStatus as AudioExtrasStatus | undefined;
          // An absent status is a reminder with no pre-alert (and every row
          // written before OLD-107) — nothing to wait for.
          const extrasPending = extrasStatus === 'pending';

          // Check if audio is ready
          if (result.audioUrl && !baseApplied) {
            console.log(`[VR] Hydration: audio ready for ${convexId}, downloading...`);
            try {
              await apply(result, extrasPending ? 'pending' : (extrasStatus ?? 'ready'));
              baseApplied = true;

              // Call optional success callback
              if (onSuccess) {
                await onSuccess(result.audioUrl);
              }

              if (!extrasPending) {
                console.log(`[VR] Hydration: complete for ${convexId}`);
                return;
              }
              console.log(`[VR] Hydration: base line in for ${convexId}, waiting on extras...`);
              attemptsLeft = Math.max(attemptsLeft, EXTRAS_ATTEMPTS);
            } catch (e) {
              console.error(`[VR] Hydration: download failed for ${convexId}:`, e);
              // Continue polling - maybe transient error
            }
          } else if (baseApplied && !extrasPending) {
            // Second patch landed (or gave up): collect whatever it produced.
            // "failed" is applied too — the row still holds the base line, and
            // recording the status stops the next launch from re-polling.
            try {
              await apply(result, extrasStatus ?? 'ready');
              console.log(`[VR] Hydration: extras ${extrasStatus} for ${convexId}, complete`);
              return;
            } catch (e) {
              console.error(`[VR] Hydration: extras download failed for ${convexId}:`, e);
            }
          } else if (!baseApplied && (result as any).audioStatus === 'failed') {
            // Check if TTS failed - propagate failure locally
            console.log(`[VR] Hydration: audio generation failed for ${convexId}, stopping`);
            await updateLocal({
              audioStatus: 'failed',
              audioError: (result as any).audioError ?? 'TTS failed'
            });
            return;
          }

          // Still pending, wait and retry
          await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL_MS));
        } catch (e) {
          console.error(`[VR] Hydration: error polling ${convexId}:`, e);
          await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL_MS));
        }
      }

      console.log(
        `[VR] Hydration: timeout for ${convexId} (base ${baseApplied ? 'in' : 'missing'})`
      );
    } finally {
      inFlight.delete(key);
    }
  })();

  inFlight.set(key, task);
  return task;
}
