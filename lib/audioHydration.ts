import { api } from "../convex/_generated/api";
import type { ConvexReactClient } from "convex/react";
import { downloadPreReminderAudio, downloadReminderAudio, refreshNotificationWithAudio } from "./notifications";
import { getDeviceId } from "./deviceId";

// Watchdog budgets. They were poll-attempt counts (30 and 40 attempts at one
// second each) before this went reactive; the wall-clock they bought is kept
// exactly, now as timeouts rather than loop counters.
const BASE_TIMEOUT_MS = 30_000;
// Fresh budget granted the moment the base line lands with the pre-alert still
// coming (OLD-107), so a slow base cannot starve the second phase of its
// window. It used to have to cover a heads-up line plus three replay variants
// synthesized back to back against a two-request account ceiling (11s
// measured); OLD-108 cut that to the heads-up alone, so the budget is now
// generous rather than tight — which is the right side to be wrong on.
const EXTRAS_TIMEOUT_MS = 40_000;
// Only ever used to retry a failed *download*. The row itself arrives by push
// now, so nothing here polls the server.
const DOWNLOAD_RETRY_MS = 1000;
const inFlight = new Map<string, Promise<void>>();

export type AudioExtrasStatus = 'pending' | 'ready' | 'failed';

/**
 * Watch a reminder's Convex row for audio readiness and download when ready.
 *
 * Reactive since the creation-pipeline wave (spec §3.2): a `watchQuery`
 * subscription replaces the one-second poll, so the download starts on the push
 * that carries the URL instead of up to a second later, and an idle wait costs
 * no queries at all.
 *
 * The subscription's one sharp edge is `localQueryResult()`, which answers with
 * three things, not two:
 *   - `undefined` — not loaded yet. Take NO action; a row that does not exist
 *     and a row that has not arrived look identical here.
 *   - `null` — loaded, and the server says there is no such row. Terminal.
 *   - a row — act on it.
 * It also throws if the query errored server-side, which buys one fresh watch
 * and then a stop.
 *
 * Two phases since OLD-107, because the server stopped writing a reminder's
 * audio in one patch. The base spoken line lands first and flips
 * `audioStatus: "ready"` — that is the reminder playable, and it is what this
 * function used to be the whole of. The pre-alert line follows in a second
 * patch a few seconds later, announced ahead of time by
 * `audioExtrasStatus: "pending"`, and phase two waits for it.
 *
 * The second phase covered the replay variant lines too until OLD-108 removed
 * them; a reminder with no lead time now settles both statuses in one update.
 *
 * Every update handler runs on a single promise chain, so the base line is
 * always applied before the extras patch is looked at and two patches can never
 * be half-written over each other. The returned promise resolves when the row
 * reaches a terminal state or the watchdog gives up; either way the
 * subscription is disposed first.
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

      await new Promise<void>((resolve) => {
        let baseApplied = false;
        let settled = false;
        // A thrown query buys exactly one fresh subscription.
        let rewatched = false;
        let watch: { onUpdate(cb: () => void): () => void; localQueryResult(): any } | null = null;
        let unsubscribe: (() => void) | null = null;
        let deadline = Date.now() + BASE_TIMEOUT_MS;
        let watchdog: ReturnType<typeof setTimeout> | null = null;
        let retryTimer: ReturnType<typeof setTimeout> | null = null;
        // Every handler queues here, so they run one at a time and in order.
        let chain: Promise<void> = Promise.resolve();

        const disposeWatch = (): void => {
          const off = unsubscribe;
          unsubscribe = null;
          watch = null;
          if (!off) return;
          try {
            off();
          } catch (e) {
            console.log(`[VR] Hydration: unsubscribe failed for ${convexId}:`, e);
          }
        };

        /** Terminal for this hydration: drop the subscription and the timers. */
        const stop = (): void => {
          if (settled) return;
          settled = true;
          if (watchdog) {
            clearTimeout(watchdog);
            watchdog = null;
          }
          if (retryTimer) {
            clearTimeout(retryTimer);
            retryTimer = null;
          }
          disposeWatch();
          resolve();
        };

        const armWatchdog = (): void => {
          if (watchdog) clearTimeout(watchdog);
          watchdog = setTimeout(() => {
            watchdog = null;
            console.log(
              `[VR] Hydration: timeout for ${convexId} (base ${baseApplied ? 'in' : 'missing'})`
            );
            stop();
          }, Math.max(0, deadline - Date.now()));
        };

        /**
         * Re-read the same local result a second later. The row is unchanged —
         * this exists so a transient download failure gets the retries the old
         * poll loop gave it, inside the same watchdog budget.
         */
        const retryDownloadLater = (): void => {
          if (settled || retryTimer) return;
          retryTimer = setTimeout(() => {
            retryTimer = null;
            scheduleRead();
          }, DOWNLOAD_RETRY_MS);
        };

        const read = async (): Promise<void> => {
          if (settled) return;
          const current = watch;
          if (!current) return;

          let result: any;
          try {
            result = current.localQueryResult();
          } catch (e) {
            console.error(`[VR] Hydration: query failed for ${convexId}:`, e);
            if (rewatched) {
              stop();
              return;
            }
            rewatched = true;
            disposeWatch();
            subscribe();
            return;
          }

          // Not loaded yet — indistinguishable from a missing row here, so the
          // only safe move is to wait for the update that resolves it.
          if (result === undefined) return;

          if (result === null) {
            console.log(`[VR] Hydration: reminder ${convexId} not found, stopping`);
            stop();
            return;
          }

          const extrasStatus = result.audioExtrasStatus as AudioExtrasStatus | undefined;
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
                stop();
                return;
              }
              console.log(`[VR] Hydration: base line in for ${convexId}, waiting on extras...`);
              deadline = Math.max(deadline, Date.now() + EXTRAS_TIMEOUT_MS);
              armWatchdog();
            } catch (e) {
              console.error(`[VR] Hydration: download failed for ${convexId}:`, e);
              // Keep the subscription - maybe transient error
              retryDownloadLater();
            }
          } else if (baseApplied && !extrasPending) {
            // Second patch landed (or gave up): collect whatever it produced.
            // "failed" is applied too — the row still holds the base line, and
            // recording the status stops the next launch from re-watching.
            try {
              await apply(result, extrasStatus ?? 'ready');
              console.log(`[VR] Hydration: extras ${extrasStatus} for ${convexId}, complete`);
              stop();
              return;
            } catch (e) {
              console.error(`[VR] Hydration: extras download failed for ${convexId}:`, e);
              retryDownloadLater();
            }
          } else if (!baseApplied && result.audioStatus === 'failed') {
            // Check if TTS failed - propagate failure locally
            console.log(`[VR] Hydration: audio generation failed for ${convexId}, stopping`);
            await updateLocal({
              audioStatus: 'failed',
              audioError: result.audioError ?? 'TTS failed'
            });
            stop();
            return;
          }
        };

        /** Queue one read behind whatever is already running. */
        const scheduleRead = (): void => {
          chain = chain.then(read).catch((e) => {
            console.error(`[VR] Hydration: update handler failed for ${convexId}:`, e);
          });
        };

        const subscribe = (): void => {
          if (settled) return;
          const next = convexClient.watchQuery(api.reminders.get, {
            id: convexId as any,
            deviceId,
          });
          watch = next;
          unsubscribe = next.onUpdate(() => {
            scheduleRead();
          });
          // The subscription may already hold a result (another watcher on the
          // same query), and onUpdate would not fire for it.
          scheduleRead();
        };

        armWatchdog();
        subscribe();
      });
    } finally {
      inFlight.delete(key);
    }
  })();

  inFlight.set(key, task);
  return task;
}
