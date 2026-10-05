/**
 * OLD-131: the line's language picks its voice.
 *
 * English (or no language) stays on Speechify's Beatrice / simba-3.2 with the
 * exact request bodies it sent before; Arabic keeps its script-picked route;
 * any other eleven_v3 language goes to the ElevenLabs voice pinned in the env,
 * asking for the same PCM format the alarm WAV builder expects. The provider
 * calls are driven through a mocked `fetch`.
 */

jest.mock("openai", () => ({
    __esModule: true,
    default: class MockOpenAI {
        constructor(_options: unknown) {}
    },
}));

import {
    pickVoiceRoute,
    regenerateReminderAudio,
    generateReminderTtsForReminder,
    buildReminderPlan,
    buildSystemPrompt,
} from "../../convex/actions";
import { ALARM_PCM_OUTPUT_FORMAT, OTHER_LANGUAGE_RULE } from "../../convex/helpers";

type Handler = (ctx: any, args: any) => Promise<any>;
const handlerOf = (fn: unknown): Handler => (fn as { _handler: Handler })._handler;

const DEVICE = "device_a";
const OLD_ENV = { ...process.env };

type Call = { url: string; body: string };

/** fetch that answers both providers and records every call. */
function installFetch(opts: { failElevenLabs?: boolean } = {}): Call[] {
    const calls: Call[] = [];
    (global as any).fetch = jest.fn(async (url: string, init: any): Promise<any> => {
        calls.push({ url: String(url), body: String(init?.body ?? "") });
        if (String(url).includes("api.speechify.ai")) {
            return {
                ok: true,
                status: 200,
                headers: { get: () => null },
                json: async () => ({ audio_data: Buffer.from([1, 2, 3, 4]).toString("base64") }),
                text: async () => "",
            };
        }
        if (opts.failElevenLabs) {
            return {
                ok: false,
                status: 500,
                headers: { get: () => null },
                text: async () => "boom",
            };
        }
        return {
            ok: true,
            status: 200,
            headers: { get: () => null },
            arrayBuffer: async () => new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]).buffer,
            text: async () => "",
        };
    });
    return calls;
}

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

const speechifyCalls = (calls: Call[]) => calls.filter((c) => c.url.includes("api.speechify.ai"));
const elevenCalls = (calls: Call[]) => calls.filter((c) => c.url.includes("api.elevenlabs.io"));

beforeEach(() => {
    // The live configuration: the legacy provider switch on, Speechify keyed,
    // ElevenLabs keyed with a pinned voice and the v3 model.
    process.env.TTS_PROVIDER = "elevenlabs";
    process.env.SPEECHIFY_API_KEY = "sp-key";
    process.env.ELEVENLABS_API_KEY = "el-key";
    process.env.ELEVENLABS_VOICE_ID = "pinned_voice";
    process.env.ELEVENLABS_MODEL_ID = "eleven_v3";
    delete process.env.SPEECHIFY_MODEL;
    delete process.env.SPEECHIFY_MULTILINGUAL_MODEL;
    delete process.env.SPEECHIFY_VOICE_ID;
    delete process.env.ELEVENLABS_OUTPUT_FORMAT;
});

afterEach(() => {
    process.env = { ...OLD_ENV };
    (global as any).fetch = undefined;
});

describe("pickVoiceRoute", () => {
    it("English and a missing lang stay on Beatrice / simba-3.2", () => {
        expect(pickVoiceRoute({ text: "Drink your water.", lang: "en" })).toEqual({
            provider: "speechify",
            model: "simba-3.2",
        });
        expect(pickVoiceRoute({ text: "Drink your water." })).toEqual({
            provider: "speechify",
            model: "simba-3.2",
        });
        expect(pickVoiceRoute({ text: "Drink your water.", lang: null })).toEqual({
            provider: "speechify",
            model: "simba-3.2",
        });
    });

    it("Arabic keeps the script-picked multilingual route, with or without lang", () => {
        expect(pickVoiceRoute({ text: "اشرب ماءك.", lang: "ar" })).toEqual({
            provider: "speechify",
            model: "simba-multilingual",
        });
        expect(pickVoiceRoute({ text: "اشرب ماءك." })).toEqual({
            provider: "speechify",
            model: "simba-multilingual",
        });
    });

    it.each(["sv", "ja", "de", "SV-se", "fa"])("%s goes to ElevenLabs on the env model", (lang) => {
        expect(pickVoiceRoute({ text: "Drick ditt vatten.", lang })).toEqual({
            provider: "elevenlabs",
            model: "eleven_v3",
        });
    });

    it.each(["zu", "xx", "english", "", "e"])("unknown / unsupported %p falls back to Speechify", (lang) => {
        expect(pickVoiceRoute({ text: "Drink your water.", lang })).toEqual({
            provider: "speechify",
            model: "simba-3.2",
        });
    });

    it("without a Speechify key everything takes the ElevenLabs fallback, as before", () => {
        delete process.env.SPEECHIFY_API_KEY;
        expect(pickVoiceRoute({ text: "Drink your water.", lang: "en" }).provider).toBe("elevenlabs");
        expect(pickVoiceRoute({ text: "Drick ditt vatten.", lang: "sv" }).provider).toBe("elevenlabs");
    });

    it("the legacy Resemble switch ignores lang", () => {
        process.env.TTS_PROVIDER = "resemble";
        expect(pickVoiceRoute({ text: "Drick ditt vatten.", lang: "sv" })).toEqual({ provider: "resemble" });
    });
});

describe("synthesis requests per route", () => {
    it("English: Speechify request bodies are byte-identical to the pre-OLD-131 ones", async () => {
        const calls = installFetch();
        const ctx = makeCtx({ _id: "r1", deviceId: DEVICE, title: "Water", lang: "en" });
        await handlerOf(regenerateReminderAudio)(ctx, {
            reminderId: "r1",
            deviceId: DEVICE,
            soundText: "Drink your water.",
        });

        expect(elevenCalls(calls)).toHaveLength(0);
        const bodies = speechifyCalls(calls).map((c) => c.body).sort();
        expect(bodies).toEqual(
            [
                JSON.stringify({
                    input: "Drink your water.",
                    voice_id: "beatrice_32",
                    model: "simba-3.2",
                    audio_format: "mp3",
                }),
                JSON.stringify({
                    input: "Drink your water.",
                    voice_id: "beatrice_32",
                    model: "simba-3.2",
                    output_format: ALARM_PCM_OUTPUT_FORMAT,
                }),
            ].sort()
        );
    });

    it("a row with no lang is voiced exactly like English", async () => {
        const calls = installFetch();
        const ctx = makeCtx({ _id: "r1", deviceId: DEVICE, title: "Water" });
        await handlerOf(regenerateReminderAudio)(ctx, {
            reminderId: "r1",
            deviceId: DEVICE,
            soundText: "Drink your water.",
        });
        expect(elevenCalls(calls)).toHaveLength(0);
        expect(speechifyCalls(calls)).toHaveLength(2);
    });

    it("Swedish: ElevenLabs with the pinned voice + env model, PCM for the alarm wav", async () => {
        const calls = installFetch();
        const ctx = makeCtx({
            _id: "r1",
            deviceId: DEVICE,
            title: "Vatten",
            lang: "sv",
            audioStorageId: "old_mp3",
            wavStorageId: "old_wav",
        });
        const result = await handlerOf(regenerateReminderAudio)(ctx, {
            reminderId: "r1",
            deviceId: DEVICE,
            soundText: "Drick ditt vatten.",
        });

        expect(speechifyCalls(calls)).toHaveLength(0);
        const el = elevenCalls(calls);
        expect(el).toHaveLength(2);
        for (const call of el) {
            const url = new URL(call.url);
            expect(url.pathname).toBe("/v1/text-to-speech/pinned_voice");
            const body = JSON.parse(call.body);
            expect(body.text).toBe("Drick ditt vatten.");
            expect(body.model_id).toBe("eleven_v3");
        }
        const formats = el.map((c) => new URL(c.url).searchParams.get("output_format")).sort();
        // The wav call asks for exactly the format buildAlarmWav is told the rate of.
        expect(formats).toEqual([ALARM_PCM_OUTPUT_FORMAT, "mp3_44100_128"].sort());
        expect(ALARM_PCM_OUTPUT_FORMAT).toBe("pcm_22050");
        // Both blobs came back: a playable mp3 and an alarm wav.
        expect(result.audioUrl).toMatch(/^https:\/\/cdn\/stored_/);
        expect(result.wavUrl).toMatch(/^https:\/\/cdn\/stored_/);
    });

    it("Swedish regen with ElevenLabs down throws — never re-voiced by Beatrice", async () => {
        const calls = installFetch({ failElevenLabs: true });
        const ctx = makeCtx({ _id: "r1", deviceId: DEVICE, title: "Vatten", lang: "sv" });
        await expect(
            handlerOf(regenerateReminderAudio)(ctx, {
                reminderId: "r1",
                deviceId: DEVICE,
                soundText: "Drick ditt vatten.",
            })
        ).rejects.toThrow(/ElevenLabs TTS failed \(500\)/);
        expect(speechifyCalls(calls)).toHaveLength(0);
    });

    it("Swedish with no ElevenLabs voice configured fails the same way", async () => {
        delete process.env.ELEVENLABS_VOICE_ID;
        const calls = installFetch();
        const ctx = makeCtx({ _id: "r1", deviceId: DEVICE, title: "Vatten", lang: "sv" });
        await expect(
            handlerOf(regenerateReminderAudio)(ctx, {
                reminderId: "r1",
                deviceId: DEVICE,
                soundText: "Drick ditt vatten.",
            })
        ).rejects.toThrow(/ELEVENLABS_VOICE_ID/);
        expect(speechifyCalls(calls)).toHaveLength(0);
    });
});

describe("generateReminderTtsForReminder", () => {
    it("routes the base line and the heads-up by the job's lang", async () => {
        const calls = installFetch();
        const ctx = makeCtx(null);
        await handlerOf(generateReminderTtsForReminder)(ctx, {
            reminderId: "r1",
            title: "Treffen",
            ttsText: "Dein Treffen ist jetzt.",
            preTtsText: "Dein Treffen beginnt in zehn Minuten.",
            lang: "de",
        });
        expect(speechifyCalls(calls)).toHaveLength(0);
        // base mp3 + base wav + heads-up mp3
        expect(elevenCalls(calls)).toHaveLength(3);
        const statuses = ctx._mutations.map((m) => m.args.audioStatus).filter(Boolean);
        expect(statuses).toEqual(["ready"]);
    });

    it("a job without lang (older deploy) keeps today's voice", async () => {
        const calls = installFetch();
        const ctx = makeCtx(null);
        await handlerOf(generateReminderTtsForReminder)(ctx, {
            reminderId: "r1",
            title: "Water",
            ttsText: "Drink your water.",
        });
        expect(elevenCalls(calls)).toHaveLength(0);
        expect(speechifyCalls(calls)).toHaveLength(2);
    });

    it("an ElevenLabs failure marks the audio failed, like any synthesis failure", async () => {
        const calls = installFetch({ failElevenLabs: true });
        const ctx = makeCtx(null);
        await handlerOf(generateReminderTtsForReminder)(ctx, {
            reminderId: "r1",
            title: "Vatten",
            ttsText: "Drick ditt vatten.",
            lang: "sv",
        });
        expect(speechifyCalls(calls)).toHaveLength(0);
        expect(ctx._mutations).toHaveLength(1);
        expect(ctx._mutations[0].args.audioStatus).toBe("failed");
    });
});

describe("heads-up line for a non-English reminder", () => {
    const context = {
        transcript: "möte klockan 15",
        currentTime: "09:00",
        currentDate: "2026-10-05",
        timezone: "Europe/Stockholm",
    };
    const parsed = (over: Record<string, unknown>) => ({
        title: "Möte med Anna",
        description: "Ditt möte med Anna är nu.",
        time: "15:00",
        frequency: "once",
        preReminderMinutes: 10,
        ...over,
    });

    it("never builds the English '<title> in N minutes' stand-in", () => {
        const plan = buildReminderPlan(parsed({ lang: "sv" }), context);
        expect(plan.lang).toBe("sv");
        expect(plan.preTtsText).toBe("");
    });

    it("keeps the model's own line, in its language", () => {
        const plan = buildReminderPlan(
            parsed({ lang: "sv", preDescription: "Ditt möte börjar om tio minuter." }),
            context
        );
        expect(plan.preTtsText).toBe("Ditt möte börjar om tio minuter.");
    });

    it("English keeps the stand-in exactly as before", () => {
        const plan = buildReminderPlan(parsed({ lang: "en", title: "Meeting with Anna" }), context);
        expect(plan.preTtsText).toBe("Meeting with Anna in 10 minutes");
        const noLang = buildReminderPlan(parsed({ title: "Meeting with Anna" }), context);
        expect(noLang.preTtsText).toBe("Meeting with Anna in 10 minutes");
    });
});

describe("parse prompt language rule", () => {
    it("tells the model to keep any other language untranslated, for every client", () => {
        const ctx = {
            currentDate: "2026-10-05",
            currentDayOfWeek: "Monday",
            currentTime: "09:00",
            timezone: "Europe/Stockholm",
        };
        for (const prompt of [buildSystemPrompt(ctx), buildSystemPrompt(ctx, { guard: true })]) {
            expect(prompt).toContain(OTHER_LANGUAGE_RULE);
            expect(prompt).toContain('- If the input is in English, return "title" and "description" in English');
        }
    });
});
