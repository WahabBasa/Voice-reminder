import {
    regenerateVoiceOnSave,
    shouldRegenerateVoice,
    type VoiceRegenDeps,
} from "../../lib/voiceRegen";

function makeDeps(over: Partial<VoiceRegenDeps> = {}) {
    const deps: jest.Mocked<VoiceRegenDeps> = {
        regenerate: jest.fn(async () => ({
            audioUrl: "https://cdn/new.mp3",
            wavUrl: "https://cdn/new.wav",
            soundText: "New line",
        })),
        getDeviceId: jest.fn(async () => "device_a"),
        deleteLocalAudio: jest.fn(async () => {}),
        removeAlarmSound: jest.fn(async () => {}),
        reschedule: jest.fn(async () => 1_700_000_000_000),
        toast: jest.fn(),
        perf: jest.fn(),
        ...(over as any),
    };
    return deps;
}

const PARAMS = {
    reminderId: "local_1",
    convexId: "convex_1",
    soundText: "New line",
    currentAudioUrl: "https://cdn/old.mp3",
    currentWavUrl: "https://cdn/old.wav",
};

describe("shouldRegenerateVoice", () => {
    it("regenerates when the spoken line changed", () => {
        expect(
            shouldRegenerateVoice({
                convexId: "c1",
                newDescription: "Take pills",
                storedDescription: "Drink water",
            })
        ).toBe(true);
    });

    it("does not regenerate an unchanged, non-stale line", () => {
        expect(
            shouldRegenerateVoice({
                convexId: "c1",
                newDescription: "  Drink water  ",
                storedDescription: "Drink water",
            })
        ).toBe(false);
    });

    it("regenerates an unchanged line that is stale (a retry)", () => {
        expect(
            shouldRegenerateVoice({
                convexId: "c1",
                newDescription: "Drink water",
                storedDescription: "Drink water",
                audioStale: true,
            })
        ).toBe(true);
    });

    it("never regenerates a reminder that never reached Convex", () => {
        expect(
            shouldRegenerateVoice({
                convexId: undefined,
                newDescription: "Changed",
                storedDescription: "Original",
                audioStale: true,
            })
        ).toBe(false);
    });
});

describe("regenerateVoiceOnSave — success", () => {
    it("calls the action with the trimmed text + device id, clears cache, removes the alarm sound, reschedules with the new URLs", async () => {
        const deps = makeDeps();
        const { patch, rescheduleError } = await regenerateVoiceOnSave(deps, PARAMS);

        expect(deps.regenerate).toHaveBeenCalledWith({
            reminderId: "convex_1",
            deviceId: "device_a",
            soundText: "New line",
        });
        expect(deps.deleteLocalAudio).toHaveBeenCalledWith("local_1");
        expect(deps.removeAlarmSound).toHaveBeenCalledWith("local_1");
        expect(deps.reschedule).toHaveBeenCalledWith({
            audioUrl: "https://cdn/new.mp3",
            wavUrl: "https://cdn/new.wav",
        });
        expect(patch).toEqual({
            audioUrl: "https://cdn/new.mp3",
            wavUrl: "https://cdn/new.wav",
            audioStale: false,
            scheduledFor: 1_700_000_000_000,
        });
        expect(rescheduleError).toBeUndefined();
        expect(deps.toast).not.toHaveBeenCalled();
        expect(deps.perf).toHaveBeenCalledWith("voice_regen_start", expect.any(Object));
        expect(deps.perf).toHaveBeenCalledWith(
            "voice_regen_done",
            expect.objectContaining({ hasWav: true })
        );
    });

    it("clears the wavUrl when the action returns no wav, and still reschedules", async () => {
        const deps = makeDeps({
            regenerate: jest.fn(async () => ({
                audioUrl: "https://cdn/new.mp3",
                wavUrl: null,
                soundText: "New line",
            })),
        });
        const { patch } = await regenerateVoiceOnSave(deps, PARAMS);

        expect(patch.audioUrl).toBe("https://cdn/new.mp3");
        expect(patch.wavUrl).toBeUndefined();
        expect(patch.audioStale).toBe(false);
        expect(deps.reschedule).toHaveBeenCalledWith({
            audioUrl: "https://cdn/new.mp3",
            wavUrl: undefined,
        });
        expect(deps.perf).toHaveBeenCalledWith(
            "voice_regen_done",
            expect.objectContaining({ hasWav: false })
        );
    });
});

describe("regenerateVoiceOnSave — action failure", () => {
    it("keeps the old audio, marks the row stale, toasts, and reschedules with the old URLs", async () => {
        const deps = makeDeps({
            regenerate: jest.fn(async () => {
                throw new Error("offline");
            }),
        });
        const { patch } = await regenerateVoiceOnSave(deps, PARAMS);

        expect(patch.audioStale).toBe(true);
        expect(patch.audioUrl).toBeUndefined();
        expect(deps.deleteLocalAudio).not.toHaveBeenCalled();
        expect(deps.removeAlarmSound).not.toHaveBeenCalled();
        expect(deps.reschedule).toHaveBeenCalledWith({
            audioUrl: "https://cdn/old.mp3",
            wavUrl: "https://cdn/old.wav",
        });
        expect(patch.scheduledFor).toBe(1_700_000_000_000);
        expect(deps.toast).toHaveBeenCalledWith(
            expect.objectContaining({ type: "error" })
        );
        expect(deps.perf).toHaveBeenCalledWith(
            "voice_regen_failed",
            expect.objectContaining({ message: expect.stringContaining("offline") })
        );
    });

    it("does not reschedule when there was no old audio to fall back to", async () => {
        const deps = makeDeps({
            regenerate: jest.fn(async () => {
                throw new Error("offline");
            }),
        });
        const { patch } = await regenerateVoiceOnSave(deps, {
            ...PARAMS,
            currentAudioUrl: undefined,
            currentWavUrl: undefined,
        });

        expect(patch).toEqual({ audioStale: true });
        expect(deps.reschedule).not.toHaveBeenCalled();
    });
});

describe("regenerateVoiceOnSave — reschedule failure after a good regen", () => {
    it("keeps the new audio in the patch, keeps it stale for a retry, and surfaces the error", async () => {
        const rescheduleError = Object.assign(new Error("no future"), {
            name: "NoFutureOccurrenceError",
        });
        const deps = makeDeps({
            reschedule: jest.fn(async () => {
                throw rescheduleError;
            }),
        });
        const outcome = await regenerateVoiceOnSave(deps, PARAMS);

        expect(deps.deleteLocalAudio).toHaveBeenCalled();
        expect(deps.removeAlarmSound).toHaveBeenCalled();
        expect(outcome.patch.audioUrl).toBe("https://cdn/new.mp3");
        expect(outcome.patch.wavUrl).toBe("https://cdn/new.wav");
        expect(outcome.patch.audioStale).toBe(true);
        expect(outcome.rescheduleError).toBe(rescheduleError);
        expect(deps.toast).toHaveBeenCalledWith(
            expect.objectContaining({ type: "error" })
        );
    });
});
