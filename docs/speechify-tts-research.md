# Speechify TTS Research — Beatrice voice + prosody control (2026-08-11)

Can Speechify replace ElevenLabs as the narration voice, in "Beatrice", with real control over
pauses/pacing/articulation, without breaking the AlarmKit WAV pipeline? Short answer: yes on all
three, with one hard catch (Arabic) and one billing wrinkle (two synth calls per line).

Everything below is from the official docs; URLs are cited inline. Nothing here has been run
against a live key — we have no Speechify account yet, and getting one is the user's call.

## API basics

- Base URL `https://api.speechify.ai`, auth is one bearer token on every endpoint:
  `Authorization: Bearer sk_...`. Keys are minted at `platform.speechify.ai/api-keys`.
  ([overview](https://docs.speechify.ai/build/api-reference/overview),
  [welcome](https://docs.speechify.ai/build/guides/welcome))
- `POST /v1/audio/speech` — one-shot synthesis, **2,000 char** ceiling, returns JSON:
  `audio_data` (base64), `audio_format`, `billable_characters_count`, `speech_marks`.
  ([reference](https://docs.speechify.ai/build/api-reference/v1/audio/speech))
- `POST /v1/audio/stream` — chunked audio, 20,000 char ceiling, format chosen by `Accept`
  (`audio/mpeg` | `audio/ogg` | `audio/aac` | `audio/pcm`). **No WAV on the streaming endpoint.**
  PCM streams come back as `audio/L16; rate=24000; channels=1` — "16-bit signed little-endian
  samples, no container or header".
  ([streaming](https://docs.speechify.ai/build/guides/text-to-speech/streaming))
- `GET /v1/voices` — catalog + workspace clones. Query params `cursor`, `limit` (≤200),
  `type` (`personal`|`shared`), `locale`, `gender`, `model`. Voice objects carry
  `id`, `display_name`, `locale`, `gender`, `type`, `models[]`, `preview_audio`, `tags`.
  ([list voices](https://docs.speechify.ai/build/api-reference/v1/voices/get.md))
- Models ([models](https://docs.speechify.ai/build/guides/concepts/models)):
  | model | languages | voices |
  |---|---|---|
  | `simba-3.2` | **English only** (non-English → 400) | 8 curated stock voices + limited-release clones |
  | `simba-3.0` | `en-*`, `de-DE`, `es-ES`, `es-MX`, `fr-FR`, `it-IT`, `pt-BR` | full catalog + clones. API default when `model` omitted |
  | `simba-multilingual` | 35 locales / 30 languages, auto-detect, mixed-language sentences | full catalog + clones |
  | `simba-english` | English | legacy 1.6 |
- Official SDKs: TypeScript `@speechify/api` (`npm install @speechify/api`, `new SpeechifyClient({ token })`,
  reads `SPEECHIFY_API_KEY` from env, `client.audio.speech({ input, voiceId, audioFormat })`) and
  Python `speechify-api`. ([SDKs](https://docs.speechify.ai/build/guides/get-started/official-sdks))
  We do not need the SDK — `convex/actions.ts` already talks to ElevenLabs and Resemble with bare
  `fetch`, and the request here is one POST with a JSON body.

### Audio formats

`audio_format` (coarse): `wav`, `mp3`, `ogg`, `aac`, `pcm` — default `wav`.

`output_format` (exact, overrides `audio_format`):
`pcm_8000`, `pcm_16000`, **`pcm_22050`**, `pcm_24000`, `pcm_44100`, `pcm_48000`,
`mp3_22050_32/64/96/128/192`, `mp3_24000_32/64/96/128/192`,
`wav_24000`, `wav_48000`, `ulaw_8000`, `ogg_24000`, `aac_24000`.
([reference](https://docs.speechify.ai/build/api-reference/v1/audio/speech))

`pcm_22050` exists, which is exactly `DEFAULT_ALARM_WAV_SAMPLE_RATE` in `convex/helpers.ts:212`.
That is the single most important fact in this document — see "Constraints" below.

Other options: `options.loudness_normalization` (bool, default false, normalizes to −14 LUFS,
adds latency) and `options.text_normalization` (bool, default **true**, spells out numbers/dates —
keep it on, it is what makes "07:30" read as "seven thirty").

## Beatrice

**Found.** `beatrice_32`, one of the eight curated stock voices on `simba-3.2`:
`beatrice_32`, `dominic_32`, `edmund_32`, `geffen_32`, `harper_32`, `hugh_32`, `imogen_32`, `wyatt_32`.
([models](https://docs.speechify.ai/build/guides/concepts/models),
[changelog 2026-07-08](https://docs.speechify.ai/build/changelog/2026/7/8))

The docs publish no per-voice description (gender/accent/style are not documented for the eight).
`GET /v1/voices?model=simba-3.2` returns `display_name`, `gender`, `locale` and a `preview_audio`
URL — that is the call to make once a key exists, both to hear Beatrice and to confirm the id is
still `beatrice_32`:

```bash
curl -s "https://api.speechify.ai/v1/voices?model=simba-3.2&limit=200" \
  -H "Authorization: Bearer $SPEECHIFY_API_KEY"
```

Minimal synthesis request:

```json
{
  "input": "Hello, world!",
  "voice_id": "beatrice_32",
  "model": "simba-3.2",
  "output_format": "pcm_22050"
}
```

**Beatrice is English-only.** She is a `simba-3.2` voice and `simba-3.2` returns 400 for
non-English input. This app parses Arabic (`buildSystemPrompt` in `convex/actions.ts:103` — "The
input may be in ENGLISH or ARABIC") and the PRD requires the address term to be woven in verbatim
"(it may be Arabic)" (`docs/cadence-ladder-prd.md:85`). So Beatrice cannot narrate Arabic
reminders, and an English line carrying an Arabic address term is at best undefined behavior.
This is the main open question below.

## Prosody / naturalness controls

SSML, auto-detected on the `input` field — no flag to set, just send a `<speak>` document.
Everything must be inside `<speak>`, and `&`, `<`, `>`, `"`, `'` must be escaped.
([SSML](https://docs.speechify.ai/build/guides/text-to-speech/ssml),
[emotion control](https://docs.speechify.ai/build/guides/text-to-speech/emotion-control))

| Tag | Attributes | Values |
|---|---|---|
| `<prosody>` | `pitch` | `x-low`/`low`/`medium`/`high`/`x-high`, or `-83%`…`+100%` |
| | `rate` | `x-slow`/`slow`/`medium`/`fast`/`x-fast`, or `-50%`…`+9900%` |
| | `volume` | `silent`/`x-soft`/`medium`/`loud`/`x-loud`, dB (`-6dB`), or % |
| `<break>` | `strength` | `none`, `x-weak`, `weak`, `medium`, `strong`, `x-strong` (0ms → 1250ms) |
| | `time` | `100ms` / `1s`, **max 10s** |
| `<emphasis>` | `level` | `reduced`, `moderate`, `strong` |
| `<sub>` | `alias` (required) | pronunciation override — useful for names/abbreviations |
| `<speechify:style>` | `emotion` | `angry`, `cheerful`, `sad`, `terrified`, `relaxed`, `fearful`, `surprised`, `calm`, `assertive`, `energetic`, `warm`, `direct`, `bright` (13) |

**Model caveat, and it matters for us.** Speechify's launch note for Simba 3 says "`<break>` and
`<prosody rate>` SSML tags are **now honored** on the Simba 3 models (`simba-3.0` and `simba-3.2`),
so pauses and speaking-rate control behave the same as on the Simba 1.6 models"
([blog](https://speechify.ai/blog/simba-3-2-streaming-model)). The SSML page itself lists all tags
without a per-model matrix, so `pitch` / `volume` / `emphasis` on `simba-3.2` are **unconfirmed** —
they may be silently ignored. Pauses and pacing (the two things the user actually asked for) are
explicitly confirmed. Emotion examples in the docs are written against `simba-3.2`, so
`speechify:style` is safe there.

Concrete markup for our reminder lines:

```xml
<speak>
  <speechify:style emotion="calm">
    <prosody rate="-8%">Time for your medication.</prosody>
  </speechify:style>
  <break time="600ms"/>
  <prosody rate="-15%">The blue one, with water.</prosody>
</speak>
```

And the escalating-in-one-file shape that `docs/cl4-escalation-research.md:83-86` asks for
(creative angle 1 — bake the escalation into the looped WAV):

```xml
<speak>
  <speechify:style emotion="calm">Time for your medication.</speechify:style>
  <break time="4s"/>
  <speechify:style emotion="assertive">
    <prosody rate="-10%"><emphasis level="strong">Your medication.</emphasis> Now, please.</prosody>
  </speechify:style>
</speak>
```

That is a single synthesis call producing `calm line · real pause · firmer line` inside one file —
which is the loop AlarmKit rings. `<break>` maxes at 10s per tag, so long silence tails are still
cheaper to build with the existing zero-fill padding in `buildAlarmWav` (`convex/helpers.ts:341`)
than with stacked breaks. Use `<break>` for the *intra-utterance* rhythm, keep `buildAlarmWav` for
the 28s tail.

Also available but not prosody: `speech_marks` in the response (word-level start/end timings) —
we do not use them today, but they would let the app highlight or time-align narration later.

## Constraints vs our WAV/alarm pipeline

Current pipeline, for reference:

- `convex/actions.ts:288` `synthesizeWithElevenLabs({ text, outputFormat })` — one POST, raw binary body.
- `convex/actions.ts:328` `synthesizeReminderTts` → mp3 for playback (all platforms).
- `convex/actions.ts:343` `synthesizeAlarmWav(text, dense)` → second call with
  `ALARM_PCM_OUTPUT_FORMAT = "pcm_22050"` (`convex/helpers.ts:215`), then `buildAlarmWav` shapes it
  and `pcmToWav` prepends a 44-byte RIFF header.
- `convex/actions.ts:352` `synthesizeAndStoreLineTts` runs both in `Promise.all`, stores mp3 as
  `audio/mpeg` and wav as `audio/wav` in Convex storage.
- `convex/helpers.ts:207-212` assumes **mono, signed 16-bit LE, 22050 Hz**; `pcmToWav` throws over
  `MAX_ALARM_SOUND_SECONDS = 30`; `buildAlarmWav` pads to `ALARM_WAV_TARGET_SECONDS = 28` (normal)
  or repeats `[line][2s gap]` (dense).
- `lib/alarmSounds.ts` downloads the wav, stages it in Documents, and the native bridge copies it
  into `Library/Sounds` as `reminder_<id>.wav` / `reminder_<id>_v<k>.wav`.

What lines up and what does not:

1. **PCM shape matches exactly.** Speechify's PCM is documented as 16-bit signed little-endian,
   mono, headerless (stated on the streaming page for `audio/L16 … channels=1`), and `pcm_22050` is
   an allowed `output_format`. `pcmToWav`, `buildAlarmWav`, `parsePcmSampleRate` and the 44-byte
   header builder need **zero changes**. `ALARM_PCM_OUTPUT_FORMAT` already spells `pcm_22050`, the
   same token Speechify uses.
2. **Base64, not binary.** `/v1/audio/speech` returns JSON with `audio_data` base64. The new
   synth function must `Buffer.from(json.audio_data, "base64")` — same as the Resemble path already
   does (`convex/actions.ts:285`), not the ElevenLabs `arrayBuffer()` path. ~33% more bytes over
   the wire; irrelevant at our sizes.
3. **mp3 tops out at 24 kHz.** Best available is `mp3_24000_192` vs today's `mp3_44100_128`. For a
   single narrated sentence this is not audible; Android's Notifee replay path is unaffected
   otherwise.
4. **Two calls per line, as today.** `/v1/audio/speech` returns one format per call, so mp3 +
   pcm_22050 is still two calls = **double billable characters**. Optimization available: drop the
   mp3 entirely and serve the *unpadded* WAV for playback too (expo-av plays WAV fine). That halves
   character spend but changes the stored blob's mime to `audio/wav` and inflates playback assets
   (~44 KB/s vs ~16 KB/s). Decide separately — it is not required for the swap.
5. **30s cap is ours, not theirs.** Speechify has no duration limit; the `pcmToWav` >30s throw and
   the 2,000-char request ceiling both stay comfortably clear of our 5–14 word lines
   (`docs/cadence-ladder-prd.md:87`).
6. **SSML counts toward billing and toward the 2,000-char limit**
   ([limits](https://docs.speechify.ai/build/guides/concepts/api-limits)). Wrapping every line in
   `<speak><speechify:style>` adds ~60–100 chars per call. Negligible per line, but it is real.
7. **Language is the blocker.** `simba-3.2` (and therefore `beatrice_32`) is English-only. Arabic
   reminders must route to `simba-multilingual` with a different voice, or stay on ElevenLabs
   (`eleven_multilingual_v2` today). The provider switch in `getTtsProvider` (`convex/actions.ts:32`)
   is global, so a per-language fallback is new logic, not a config flip.

## Integration plan (stops before any code)

Shape it exactly like the existing ElevenLabs path — this is deliberately a small, reversible diff.

1. **Key + plan** — user obtains a Speechify API key. Starter ($10/mo) is the realistic floor; see
   pricing. *This is the decision point; nothing below starts until it exists.*
2. **Env** — `npx convex env set SPEECHIFY_API_KEY …`, plus
   `SPEECHIFY_VOICE_ID=beatrice_32`, `SPEECHIFY_MODEL=simba-3.2`,
   `SPEECHIFY_OUTPUT_FORMAT=mp3_24000_128` (playback default). Document all of them in
   `.env.example` under a new "Speechify" block matching the existing ElevenLabs block's comment
   style.
3. **Voice confirmation** — one-off `GET /v1/voices?model=simba-3.2`; listen to Beatrice's
   `preview_audio`, confirm `id`/`locale`/`gender`. If Beatrice is wrong for the product, the
   env var is the only thing that changes.
4. **`synthesizeWithSpeechify(args: { text: string; outputFormat?: string })`** in
   `convex/actions.ts`, next to `synthesizeWithElevenLabs` (~line 288), same signature and same
   `requireEnv` idiom: POST `https://api.speechify.ai/v1/audio/speech`, body
   `{ input, voice_id, model, output_format, options: { text_normalization: true } }`, decode
   `audio_data` from base64, throw on `!response.ok` with the same
   `` `Speechify TTS failed (${status}): ${body.slice(0, 500)}` `` message shape.
5. **Wire the provider** — add `"speechify"` to the `TtsProvider` union (`convex/actions.ts:22`),
   a branch in `getTtsProvider` (`:32`) that prefers it when `SPEECHIFY_API_KEY` is set, a branch
   in `synthesizeReminderTts` (`:328`), and swap the `getTtsProvider() !== "elevenlabs"` guard in
   `synthesizeAlarmWav` (`:344`) for a check that the provider can emit PCM (Speechify and
   ElevenLabs both can; Resemble cannot). Everything downstream — `buildAlarmWav`, `pcmToWav`,
   variant lockstep, `alignVariantWavIds`, storage, `lib/alarmSounds.ts` — is untouched.
6. **SSML wrapper** — a small `wrapSsml(text, { emotion?, rate? })` helper in `convex/helpers.ts`
   (that file already owns all phrasing/shaping helpers) that escapes the five XML entities and
   emits `<speak>…</speak>`. Only Speechify calls it; ElevenLabs keeps plain text. Start
   conservative: `emotion="calm"` for routine/notice, `assertive` for urgent/persistent variants,
   `rate="-8%"` throughout. Tune by ear on device.
7. **Regenerate existing reminders' audio** — `regenerateReminderAudio` (`convex/actions.ts:886`)
   already does the full mp3+wav+storage-swap for one reminder from a `soundText`. A one-shot
   internal action that pages `reminders`, calls `generateReminderTtsForReminder`
   (`convex/actions.ts:1211`) per reminder with its stored `ttsText`/`preTtsText`/`variants`, and
   sleeps between batches to respect the RPS cap, is the whole migration. Old storage ids are
   deleted by `reminders.updateAudio`, which the existing path already handles. On iOS, cached
   alarm sounds are keyed by filename in `placedThisSession` (`lib/alarmSounds.ts:64`) and copied
   into `Library/Sounds` under a stable name — regenerating server-side means the next
   `ensureAlarmSound` download must be forced, so the migration needs a client-side cache-bust
   (bump the staged filename or clear `placedThisSession` on `audioUpdatedAt` change). **This is
   the one non-obvious piece of the migration.**
8. **Verify** — `npx tsc --noEmit`, then the device procedure in
   `docs/cl4-escalation-research.md:54-65` (new reminder, foreground 60s so variant WAVs hydrate,
   lock, listen at T / T+3 / T+7).

Rollback is a single env var: unset `SPEECHIFY_API_KEY` (or `TTS_PROVIDER=elevenlabs`) and the old
path resumes. Audio already generated stays valid — the stored WAVs are format-identical.

## Pricing and limits

([pricing](https://speechify.ai/api/pricing), [limits](https://docs.speechify.ai/build/guides/concepts/api-limits))

| Plan | $/mo | TTS chars included | Overage | Build-audio RPS (sustained/burst) | Concurrency |
|---|---|---|---|---|---|
| Free | 0 | 50K hard cap | none (pauses) | 1 / 10 | 1 |
| Starter | 10 | 1M | $10 / 1M | 20 / 60 | 15 |
| Pro | 99 | 3M | $8 / 1M | 40 / 120 | 30 |
| Scale | 499 | 10M | $6 / 1M | 80 / 240 | 60 |
| Enterprise | custom | volume discounts | — | 150 / 450 | 100 |

Commercial use is allowed on every tier including Free. Exceeding limits returns 429 with
`Retry-After`.

What that means for us: one reminder generates the base line + optional pre-alert line + up to 2
variant lines, each synthesized twice (mp3 + PCM). At ~70 chars/line plus ~80 chars of SSML
wrapper, that is roughly **1,200 billable chars per reminder** — call it ~800 reminders/month on
Starter's 1M, or ~40K reminders on Free's 50K cap. Cheap either way.

**Free tier is not viable for the ladder**: concurrency 1 and 1 RPS sustained, while
`synthesizeAndStoreLineTts` (`convex/actions.ts:356`) fires mp3 and PCM in parallel and
`synthesizeVariantTts` loops variants immediately after. Expect 429s. Starter's 15 concurrent /
20 RPS is comfortable. If we ever stay on Free for testing, the two `Promise.all` calls have to
become sequential.

## Open questions

1. **Arabic.** Beatrice cannot speak it (`simba-3.2` is English-only). Options: keep ElevenLabs for
   non-English and route per reminder language; use `simba-multilingual` with a non-Beatrice voice
   for Arabic; or accept English-only narration. Needs a product decision, and it is the one thing
   that could make this swap larger than "medium".
2. **Arabic address terms inside English lines.** `buildDescriptionInstruction` weaves the address
   term in verbatim. Undocumented behavior on `simba-3.2` — could 400, could mispronounce. Test
   with a real key before shipping.
3. **Does `beatrice_32` actually sound right?** No per-voice descriptions are published. Fetch
   `preview_audio` from `GET /v1/voices` and listen before committing.
4. **Which SSML tags `simba-3.2` truly honors.** `<break>` and `<prosody rate>` are confirmed by
   the Simba 3 launch note; `pitch`, `volume`, `emphasis` are listed globally but not confirmed
   per-model. Empirical check: synthesize the same line with and without each tag and diff the
   durations/waveforms.
5. **PCM bit depth on `/v1/audio/speech`.** 16-bit signed LE mono is documented for the *streaming*
   endpoint's `audio/L16`; the non-streaming `output_format=pcm_22050` page does not restate it.
   Almost certainly the same, but `pcmToWav` will produce noise (not silence) if it is not — verify
   with one call and a duration check against `pcmDurationSeconds` before trusting any WAV.
6. **Does `text_normalization` handle the time strings we feed it** the way ElevenLabs does?
   Different normalizers read "7:30" and "3 PM" differently.
7. **One-call-per-line optimization** (drop mp3, serve unpadded WAV for playback) — worth it, or
   does the file-size hit on Android playback matter?
8. **Latency.** Speechify advertises <300ms TTFB on `simba-3.2` streaming; the non-streaming
   `/v1/audio/speech` figure is unpublished. Matters for `processVoiceReminderFast`'s background
   TTS job, not for correctness.
