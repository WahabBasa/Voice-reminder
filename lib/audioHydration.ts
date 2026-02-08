import { api } from "../convex/_generated/api";
import { ConvexReactClient } from "convex/react";
import { downloadReminderAudio, refreshNotificationWithAudio } from "./notifications";

const MAX_ATTEMPTS = 30;
const POLL_INTERVAL_MS = 1000;

/**
 * Poll Convex for audio readiness and download when ready.
 */
export async function hydrateReminderAudio(params: {
  convexClient: ConvexReactClient;
  convexId: string;
  localReminderId: string;
  updateLocal: (patch: { audioUrl?: string; audioStatus: 'ready' | 'failed'; audioError?: string }) => Promise<void>;
  onSuccess?: (audioUrl: string) => Promise<void>;
}): Promise<void> {
  const { convexClient, convexId, localReminderId, updateLocal, onSuccess } = params;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    try {
      // Query for reminder via raw fetch since we don't have hook access here
      const result = await convexClient.query(api.reminders.get, { id: convexId as any });
      
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
          // Update local reminder
          await updateLocal({ audioUrl: result.audioUrl, audioStatus: 'ready' });
          console.log(`[VR] Hydration: complete for ${convexId}`);
          
          // Refresh scheduled notifications with the new audioUrl
          await refreshNotificationWithAudio(localReminderId, result.audioUrl);
          
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
}
