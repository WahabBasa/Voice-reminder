/**
 * OLD-131: the line's language picks its voice.
 *
 * English (or no language) stays on Speechify's Beatrice / simba-3.2 with the
 * exact request bodies it sent before; Arabic keeps its script-picked route;
 * every other language Speechify voices goes to Beatrice on simba-3.0 or
 * simba-multilingual with its locale as `language`, asking for the same PCM
 * format the alarm WAV builder expects. ElevenLabs is never selected
 * (2026-10-06), whatever TTS_PROVIDER says. The provider calls are driven
 * through a mocked `fetch`.
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

/** fetch that answers every provider and records every call. */
function installFetch(opts: { failSpeechify?: boolean } = {}): Call[] {
    const calls: Call[] = [];
    (global as any).fetch = jest.fn(async (url: string, init: any): Promise<any> => {
        calls.push({ url: String(url), body: String(init?.body ?? "") });
        if (String(url).includes("api.speechify.ai")) {
            if (opts.failSpeechify) {
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
                json: async () => ({ audio_data: Buffer.from([1, 2, 3, 4]).toString("base64") }),
                text: async () => "",
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
    // The live configuration: the legacy provider switch still says
    // "elevenlabs", Speechify keyed, ElevenLabs keys still in the env. None of
    // that may route a line to ElevenLabs.
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

    it.each([
        ["sv", "sv-SE"],
        ["SV-se", "sv-SE"],
        ["he", "he-IL"],
        ["ja", "ja-JP"],
        ["hi", "hi-IN"],
        ["no", "nb-NO"],
        ["ur", "ur-IN"],
    ])("%s goes to Beatrice on simba-multilingual with language %s", (lang, locale) => {
        expect(pickVoiceRoute({ text: "Drick ditt vatten.", lang })).toEqual({
            provider: "speechify",
            model: "simba-multilingual",
            language: locale,
        });
    });

    it.each([
        ["de", "de-DE"],
        ["es", "es-MX"],
        ["fr", "fr-FR"],
        ["it", "it-IT"],
        ["pt", "pt-BR"],
    ])("%s goes to Beatrice on simba-3.0 with language %s", (lang, locale) => {
        expect(pickVoiceRoute({ text: "Trink dein Wasser.", lang })).toEqual({
            provider: "speechify",
            model: "simba-3.0",
            language: locale,
        });
    });

    it("SPEECHIFY_MULTILINGUAL_MODEL overrides the multilingual tier only", () => {
        process.env.SPEECHIFY_MULTILINGUAL_MODEL = "simba-next";
        expect(pickVoiceRoute({ text: "Drick ditt vatten.", lang: "sv" })).toEqual({
            provider: "speechify",
            model: "simba-next",
            language: "sv-SE",
        });
        expect(pickVoiceRoute({ text: "Trink dein Wasser.", lang: "de" })).toMatchObject({ model: "simba-3.0" });
    });

    it.each(["zu", "xx", "sw", "fa", "zh", "english", "", "e"])(
        "unknown / unsupported %p falls back to Beatrice / simba-3.2",
        (lang) => {
            expect(pickVoiceRoute({ text: "Drink your water.", lang })).toEqual({
                provider: "speechify",
                model: "simba-3.2",
            });
        }
    );

    it("never returns ElevenLabs, for any language or TTS_PROVIDER value", () => {
        const langs = [undefined, null, "en", "ar", "sv", "de", "ja", "fa", "sw", "xx"];
        for (const provider of ["elevenlabs", "ElevenLabs", undefined, "speechify", "bogus"]) {
            if (provider === undefined) delete process.env.TTS_PROVIDER;
            else process.env.TTS_PROVIDER = provider;
            for (const lang of langs) {
                expect(pickVoiceRoute({ text: "Drink your water.", lang }).provider).toBe("speechify");
                expect(pickVoiceRoute({ text: "اشرب ماءك.", lang }).provider).toBe("speechify");
            }
        }
    });

    it("TTS_PROVIDER=elevenlabs routes exactly like an unset switch", () => {
        const samples = [
            { text: "Drink your water.", lang: "en" },
            { text: "Drink your water." },
            { text: "اشرب ماءك.", lang: "ar" },
            { text: "Drick ditt vatten.", lang: "sv" },
            { text: "Trink dein Wasser.", lang: "de" },
        ];
        const withSwitch = samples.map((s) => pickVoiceRoute(s));
        delete process.env.TTS_PROVIDER;
        delete process.env.ELEVENLABS_API_KEY;
        delete process.env.ELEVENLABS_VOICE_ID;
        expect(samples.map((s) => pickVoiceRoute(s))).toEqual(withSwitch);
    });

    it("without a Speechify key the route is still Speechify (the call then fails), never ElevenLabs", () => {
        delete process.env.SPEECHIFY_API_KEY;
        expect(pickVoiceRoute({ text: "Drink your water.", lang: "en" }).provider).toBe("speechify");
        expect(pickVoiceRoute({ text: "Drick ditt vatten.", lang: "sv" }).provider).toBe("speechify");
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

    it("Arabic: request bodies are unchanged (no language param)", async () => {
        const calls = installFetch();
        const ctx = makeCtx({ _id: "r1", deviceId: DEVICE, title: "ماء", lang: "ar" });
        await handlerOf(regenerateReminderAudio)(ctx, {
            reminderId: "r1",
            deviceId: DEVICE,
            soundText: "اشرب ماءك.",
        });
        expect(elevenCalls(calls)).toHaveLength(0);
        const bodies = speechifyCalls(calls).map((c) => c.body).sort();
        expect(bodies).toEqual(
            [
                JSON.stringify({
                    input: "اشرب ماءك.",
                    voice_id: "beatrice_32",
                    model: "simba-multilingual",
                    audio_format: "mp3",
                }),
                JSON.stringify({
                    input: "اشرب ماءك.",
                    voice_id: "beatrice_32",
                    model: "simba-multilingual",
                    output_format: ALARM_PCM_OUTPUT_FORMAT,
                }),
            ].sort()
        );
    });

    it.each([
        ["sv", "Drick ditt vatten.", "simba-multilingual", "sv-SE"],
        ["he", "שתה מים.", "simba-multilingual", "he-IL"],
        ["ja", "水を飲んでください。", "simba-multilingual", "ja-JP"],
        ["de", "Trink dein Wasser.", "simba-3.0", "de-DE"],
    ])(
        "%s: Beatrice with the locale, mp3 + PCM for the alarm wav, no ElevenLabs",
        async (lang, text, model, locale) => {
            const calls = installFetch();
            const ctx = makeCtx({
                _id: "r1",
                deviceId: DEVICE,
                title: "Vatten",
                lang,
                audioStorageId: "old_mp3",
                wavStorageId: "old_wav",
            });
            const result = await handlerOf(regenerateReminderAudio)(ctx, {
                reminderId: "r1",
                deviceId: DEVICE,
                soundText: text,
            });

            expect(elevenCalls(calls)).toHaveLength(0);
            const bodies = speechifyCalls(calls).map((c) => c.body).sort();
            // The wav call asks for exactly the format buildAlarmWav is told the rate of.
            expect(bodies).toEqual(
                [
                    JSON.stringify({ input: text, voice_id: "beatrice_32", model, language: locale, audio_format: "mp3" }),
                    JSON.stringify({
                        input: text,
                        voice_id: "beatrice_32",
                        model,
                        language: locale,
                        output_format: ALARM_PCM_OUTPUT_FORMAT,
                    }),
                ].sort()
            );
            expect(ALARM_PCM_OUTPUT_FORMAT).toBe("pcm_22050");
            // Both blobs came back: a playable mp3 and an alarm wav.
            expect(result.audioUrl).toMatch(/^https:\/\/cdn\/stored_/);
            expect(result.wavUrl).toMatch(/^https:\/\/cdn\/stored_/);
        }
    );

    it("Swedish regen with Speechify down throws — no other voice is tried", async () => {
        const calls = installFetch({ failSpeechify: true });
        const ctx = makeCtx({ _id: "r1", deviceId: DEVICE, title: "Vatten", lang: "sv" });
        await expect(
            handlerOf(regenerateReminderAudio)(ctx, {
                reminderId: "r1",
                deviceId: DEVICE,
                soundText: "Drick ditt vatten.",
            })
        ).rejects.toThrow(/Speechify TTS failed \(500\)/);
        expect(elevenCalls(calls)).toHaveLength(0);
    });

    it("Swedish with no Speechify key fails, never falling back to ElevenLabs", async () => {
        delete process.env.SPEECHIFY_API_KEY;
        const calls = installFetch();
        const ctx = makeCtx({ _id: "r1", deviceId: DEVICE, title: "Vatten", lang: "sv" });
        await expect(
            handlerOf(regenerateReminderAudio)(ctx, {
                reminderId: "r1",
                deviceId: DEVICE,
                soundText: "Drick ditt vatten.",
            })
        ).rejects.toThrow(/SPEECHIFY_API_KEY/);
        expect(calls).toHaveLength(0);
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
        expect(elevenCalls(calls)).toHaveLength(0);
        // base mp3 + base wav + heads-up mp3, all German on simba-3.0
        const sp = speechifyCalls(calls);
        expect(sp).toHaveLength(3);
        for (const call of sp) {
            expect(JSON.parse(call.body)).toMatchObject({ model: "simba-3.0", language: "de-DE" });
        }
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

    it("a Speechify failure on a Swedish line marks the audio failed, like any synthesis failure", async () => {
        const calls = installFetch({ failSpeechify: true });
        const ctx = makeCtx(null);
        await handlerOf(generateReminderTtsForReminder)(ctx, {
            reminderId: "r1",
            title: "Vatten",
            ttsText: "Drick ditt vatten.",
            lang: "sv",
        });
        expect(elevenCalls(calls)).toHaveLength(0);
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
