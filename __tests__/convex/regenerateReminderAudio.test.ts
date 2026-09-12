/**
 * `regenerateReminderAudio` (convex/actions.ts) must return the fresh wav URL
 * alongside the mp3 URL so the device can re-place the AlarmKit sound — or
 * clear a stale one when alarm-wav synthesis was skipped/failed.
 *
 * The action's TTS provider calls are driven through a mocked `fetch`; the
 * ElevenLabs provider is selected (it is the only one that also produces a wav)
 * and Speechify is left unconfigured so both synthesis calls hit ElevenLabs.
 */

jest.mock("openai", () => ({
    __esModule: true,
    default: class MockOpenAI {
        constructor(_options: unknown) {}
    },
}));

import { regenerateReminderAudio } from "../../convex/actions";

type Handler = (ctx: any, args: any) => Promise<any>;
const handlerOf = (fn: unknown): Handler => (fn as { _handler: Handler })._handler;

const DEVICE = "device_a";

function audioResponse() {
    return {
        ok: true,
        status: 200,
        headers: { get: () => null },
        arrayBuffer: async () => new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]).buffer,
        text: async () => "",
    };
}

/** ctx that records mutations and derives storage URLs from ids. */
function makeCtx(reminder: Record<string, any> | null) {
    let counter = 0;
    const mutations: Array<{ ref: unknown; args: any }> = [];
    return {
        runQuery: jest.fn(async () => reminder),
        runMutation: jest.fn(async (ref: unknown, args: any) => {
            mutations.push({ ref, args });
            return null;
        }),
        storage: {
            store: jest.fn(async () => `stored_${++counter}`),
            getUrl: jest.fn(async (id: string) => `https://cdn/${id}`),
        },
        _mutations: mutations,
    };
}

const OLD_ENV = { ...process.env };

beforeEach(() => {
    process.env.TTS_PROVIDER = "elevenlabs";
    process.env.ELEVENLABS_API_KEY = "test-key";
    process.env.ELEVENLABS_VOICE_ID = "voice_1";
    delete process.env.SPEECHIFY_API_KEY;
});

afterEach(() => {
    process.env = { ...OLD_ENV };
    (global as any).fetch = undefined;
});

describe("regenerateReminderAudio return shape", () => {
    it("returns a fresh wavUrl (non-null) beside the audioUrl when the wav synthesizes", async () => {
        (global as any).fetch = jest.fn(async () => audioResponse());
        const ctx = makeCtx({
            _id: "reminder_1",
            deviceId: DEVICE,
            title: "Water",
            audioStorageId: "old_mp3",
            wavStorageId: "old_wav",
        });

        const result = await handlerOf(regenerateReminderAudio)(ctx, {
            reminderId: "reminder_1",
            deviceId: DEVICE,
            soundText: "Drink your water",
        });

        expect(result.soundText).toBe("Drink your water");
        expect(typeof result.audioUrl).toBe("string");
        expect(result.audioUrl).toMatch(/^https:\/\/cdn\/stored_/);
        // The new wav url is present and distinct from the mp3 url.
        expect(typeof result.wavUrl).toBe("string");
        expect(result.wavUrl).toMatch(/^https:\/\/cdn\/stored_/);
        expect(result.wavUrl).not.toBe(result.audioUrl);
    });

    it("returns wavUrl: null when alarm-wav synthesis fails", async () => {
        // The mp3 call succeeds; the pcm (alarm wav) call rejects. The action
        // swallows the wav failure, so wavStorageId is undefined → wavUrl null.
        (global as any).fetch = jest.fn(async (url: string) => {
            if (String(url).includes("pcm_")) throw new Error("pcm down");
            return audioResponse();
        });
        const ctx = makeCtx({
            _id: "reminder_1",
            deviceId: DEVICE,
            title: "Water",
            audioStorageId: "old_mp3",
            wavStorageId: "old_wav",
        });

        const result = await handlerOf(regenerateReminderAudio)(ctx, {
            reminderId: "reminder_1",
            deviceId: DEVICE,
            soundText: "Drink your water",
        });

        expect(typeof result.audioUrl).toBe("string");
        expect(result.wavUrl).toBeNull();
    });

    it("rejects a reminder owned by another device", async () => {
        (global as any).fetch = jest.fn(async () => audioResponse());
        const ctx = makeCtx({ _id: "reminder_1", deviceId: "other_device", title: "Water" });

        await expect(
            handlerOf(regenerateReminderAudio)(ctx, {
                reminderId: "reminder_1",
                deviceId: DEVICE,
                soundText: "Drink your water",
            })
        ).rejects.toThrow("Reminder not found");
    });
});
