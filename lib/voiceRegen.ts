/**
 * Regenerating a reminder's spoken line when it is edited in the sheet.
 *
 * The line the alarm speaks is the reminder's `description`. Editing it in the
 * sheet used to change only the card text — the alarm kept speaking the old
 * line because the OLD audio URLs were reused. This module owns the decision
 * (does the voice need regenerating?) and the orchestration (call the backend
 * action, drop the now-dead local mp3 + native alarm sound, reschedule with the
 * fresh URLs), with every side effect injected so it is testable without the
 * component, Convex, or the native bridge.
 *
 * The backend action deletes the OLD storage blobs the instant it swaps in the
 * new ones (convex/reminders.ts updateAudio), so on success the new URLs are
 * the ONLY valid ones — the local cache and the placed wav must be cleared or
 * the device would keep serving a file whose blob is already gone.
 */

/** Result of the backend `regenerateReminderAudio` action. */
export interface VoiceRegenActionResult {
    audioUrl: string | null;
    wavUrl: string | null;
    soundText: string;
}

/** Injected side effects — real ones in the sheet, fakes in tests. */
export interface VoiceRegenDeps {
    regenerate: (args: {
        reminderId: string;
        deviceId: string;
        soundText: string;
    }) => Promise<VoiceRegenActionResult>;
    getDeviceId: () => Promise<string>;
    deleteLocalAudio: (reminderId: string) => Promise<void>;
    removeAlarmSound: (reminderId: string) => Promise<void>;
    /** Cancel + reschedule with the given audio; returns the next trigger, throws on failure. */
    reschedule: (audio: { audioUrl?: string; wavUrl?: string }) => Promise<number>;
    toast: (opts: { title: string; message?: string; type?: string }) => void;
    perf: (event: string, data?: Record<string, unknown>) => void;
}

export interface VoiceRegenParams {
    /** Local store row id (keys the mp3 cache + native alarm sound). */
    reminderId: string;
    /** Convex document id the action operates on. */
    convexId: string;
    /** The new spoken line, already trimmed. */
    soundText: string;
    /** Old audio, replayed as the fallback when regeneration fails. */
    currentAudioUrl?: string;
    currentWavUrl?: string;
}

/** The store-row patch to merge, plus a reschedule error the caller may need to surface. */
export interface VoiceRegenOutcome {
    patch: {
        audioUrl?: string;
        wavUrl?: string;
        audioStale?: boolean;
        scheduledFor?: number;
    };
    /** Set when the reschedule threw — the caller inspects it (e.g. exact-alarm permission). */
    rescheduleError?: unknown;
}

const REGEN_FAILED_MESSAGE =
    "Couldn't update the voice — it will still say the old line. Save again to retry.";
const RESCHEDULE_FAILED_MESSAGE =
    "Voice updated but the alarm couldn't be rescheduled — check your connection and save again";

/**
 * Should saving this edit regenerate the voice? Yes when the spoken line
 * actually changed, or when a previous save left the voice stale (a retry).
 * A reminder that never reached Convex has no server audio to regenerate.
 */
export function shouldRegenerateVoice(p: {
    convexId?: string;
    newDescription: string;
    storedDescription: string;
    audioStale?: boolean;
}): boolean {
    if (!p.convexId) return false;
    return p.newDescription.trim() !== p.storedDescription.trim() || !!p.audioStale;
}

/**
 * Regenerate the spoken line and reschedule the alarm with the fresh audio.
 * Never throws: a failed action falls back to the old audio and marks the row
 * stale; a failed reschedule keeps the row stale so the next save retries.
 */
export async function regenerateVoiceOnSave(
    deps: VoiceRegenDeps,
    params: VoiceRegenParams
): Promise<VoiceRegenOutcome> {
    const { reminderId, convexId, soundText, currentAudioUrl, currentWavUrl } = params;
    const started = Date.now();
    deps.perf("voice_regen_start", { reminderId });

    let result: VoiceRegenActionResult;
    try {
        const deviceId = await deps.getDeviceId();
        result = await deps.regenerate({ reminderId: convexId, deviceId, soundText });
    } catch (e) {
        // Offline / TTS error: keep the old line, mark stale, reschedule as today.
        deps.perf("voice_regen_failed", { message: String((e as any)?.message ?? e) });
        deps.toast({ title: "Voice not updated", message: REGEN_FAILED_MESSAGE, type: "error" });

        const patch: VoiceRegenOutcome["patch"] = { audioStale: true };
        if (currentAudioUrl) {
            try {
                patch.scheduledFor = await deps.reschedule({
                    audioUrl: currentAudioUrl,
                    wavUrl: currentWavUrl,
                });
            } catch (rescheduleError) {
                return { patch, rescheduleError };
            }
        }
        return { patch };
    }

    const newAudioUrl = result.audioUrl ?? undefined;
    const newWavUrl = result.wavUrl ?? undefined;
    deps.perf("voice_regen_done", { ms: Date.now() - started, hasWav: !!newWavUrl });

    // The old blobs are gone server-side — the only valid audio is the new URL,
    // so the stale local mp3 and the placed native wav must go before we
    // reschedule (the scheduler re-downloads the mp3 and re-places the wav).
    await deps.deleteLocalAudio(reminderId);
    await deps.removeAlarmSound(reminderId);

    const patch: VoiceRegenOutcome["patch"] = {
        audioUrl: newAudioUrl,
        // undefined clears a stale wavUrl the row may still be pointing at.
        wavUrl: newWavUrl,
        audioStale: false,
    };

    if (newAudioUrl) {
        try {
            patch.scheduledFor = await deps.reschedule({
                audioUrl: newAudioUrl,
                wavUrl: newWavUrl,
            });
        } catch (rescheduleError) {
            deps.toast({
                title: "Alarm not rescheduled",
                message: RESCHEDULE_FAILED_MESSAGE,
                type: "error",
            });
            // Keep it stale so the next save retries the reschedule.
            patch.audioStale = true;
            return { patch, rescheduleError };
        }
    }

    return { patch };
}
