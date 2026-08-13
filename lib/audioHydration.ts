import { api } from "../convex/_generated/api";
import { ConvexReactClient } from "convex/react";
import { downloadPreReminderAudio, downloadReminderAudio, downloadVariantAudios, refreshNotificationWithAudio } from "./notifications";
import { getDeviceId } from "./deviceId";

const MAX_ATTEMPTS = 30;
const POLL_INTERVAL_MS = 1000;
const inFlight = new Map<string, Promise<void>>();

/**
 * Poll Convex for audio readiness and download when ready.
 */
export async function hydrateReminderAudio(params: {
  convexClient: ConvexReactClient;
  convexId: string;
  localReminderId: string;
  updateLocal: (patch: { audioUrl?: string; wavUrl?: string; preAudioUrl?: string; variants?: string[]; variantAudioUrls?: string[]; variantWavUrls?: (string | null)[]; audioStatus: 'ready' | 'failed'; audioError?: string }) => Promise<void>;
  onSuccess?: (audioUrl: string) => Promise<void>;
}): Promise<void> {
  const { convexClient, convexId, localReminderId, updateLocal, onSuccess } = params;
  const key = `${convexId}:${localReminderId}`;
  const existing = inFlight.get(key);
  if (existing) return existing;

  const task = (async () => {
    try {
      // Reminders are device-scoped (OLD-74): the backend only hands back rows
      // belonging to this install.
      const deviceId = await getDeviceId();
      for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
        try {
          // Query for reminder via raw fetch since we don't have hook access here
          const result = await convexClient.query(api.reminders.get, { id: convexId as any, deviceId });
          
          if (!result) {
            console.log(`[VR] Hydration: reminder ${convexId} not found, stopping`);
            return;
          }

          // Check if audio is ready
          if (result.audioUrl) {
            console.log(`[VR] Hydration: audio ready for ${convexId}, downloading...`);
            try {
              // Download to local storage
              await downloadReminderAudio(localReminderId, result.audioUrl);

              // Pre-alert line is optional: hydrate it when present, but never
              // let it block the main audio (notification-only pre-alert is fine).
              const preAudioUrl = (result as any).preAudioUrl as string | undefined;
              if (preAudioUrl) {
                try {
                  await downloadPreReminderAudio(localReminderId, preAudioUrl);
                } catch (preErr) {
                  console.log(`[VR] Hydration: pre-alert download failed for ${convexId}:`, preErr);
                }
              }

              // Replay variant lines/audios (optional, lockstep arrays from
              // the backend). Downloads are best-effort — ringing falls back
              // to the base line for any missing file.
              const variants = (result as any).variants as string[] | undefined;
              const variantAudioUrls = (result as any).variantAudioUrls as string[] | undefined;
              if (variantAudioUrls?.length) {
                await downloadVariantAudios(localReminderId, variantAudioUrls);
              }

              // Alarm-ready wavs for the ladder rungs (iOS only, index-aligned
              // with variants). Entries may be null when a variant's wav is
              // missing — the rung then falls back to the base wav.
              const variantWavUrls = (result as any).variantWavUrls as (string | null)[] | undefined;

              // Update local reminder
              await updateLocal({
                audioUrl: result.audioUrl,
                ...((result as any).wavUrl ? { wavUrl: (result as any).wavUrl as string } : {}),
                ...(preAudioUrl ? { preAudioUrl } : {}),
                ...(variants ? { variants } : {}),
                ...(variantAudioUrls ? { variantAudioUrls } : {}),
                ...(variantWavUrls ? { variantWavUrls } : {}),
                audioStatus: 'ready',
              });
              console.log(`[VR] Hydration: complete for ${convexId}`);

              // Refresh scheduled notifications with the new audio URLs
              await refreshNotificationWithAudio(localReminderId, result.audioUrl, preAudioUrl || undefined, {
                variants,
                variantAudioUrls,
                variantWavUrls,
              });

              // Call optional success callback
              if (onSuccess) {
                await onSuccess(result.audioUrl);
              }
              return;
            } catch (e) {
              console.error(`[VR] Hydration: download failed for ${convexId}:`, e);
              // Continue polling - maybe transient error
            }
          }

          // Check if TTS failed - propagate failure locally
          if ((result as any).audioStatus === 'failed') {
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

      console.log(`[VR] Hydration: timeout for ${convexId} after ${MAX_ATTEMPTS} attempts`);
    } finally {
      inFlight.delete(key);
    }
  })();

  inFlight.set(key, task);
  return task;
}
