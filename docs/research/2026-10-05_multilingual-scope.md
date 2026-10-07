# Multi-language support: scope (2026-10-05)

Research and planning only. No app code changed, no Convex push, no EAS build.

## Why this exists

A user in Stockholm, very likely speaking Swedish, failed to create a reminder this morning:

1. **Take 1.** `resolveVoiceLocale("auto", …)` found no English or Arabic in their device languages and fell through to `en-US`, so on-device dictation came back empty or failed and the take went to the cloud. `gpt-4o-mini-transcribe` returned an empty or malformed transcript. The `whisper-1` fallback returned text. The parser (`gpt-5.6-luna`) answered with no reminder object, so the job failed `parse_failed`, which shows as "Couldn't turn that into a reminder".
2. **Take 2.** `en-US` dictation turned the Swedish audio into confident English nonsense: "Kilometer got lead". The parse prompt tells the model to *always* return a reminder and to "use a reasonable default" time. It did. The gate accepted it because the model-filled `time` and `date` count as "explicit". Remi created a reminder titled "Kilometer got lead" that fired at about now+1 minute.

So there are two separate bugs: there is no language path for Swedish at all, and nothing rejects a transcript that means nothing. The second one matters even for English users (mumbles, background TV, a pocket recording), so it ships first as the guard.

---

## 1. Language matrix

### 1.1 The finding that decides everything: the TTS model

**`simba-3.2` is English-only.** In Speechify's words: "`simba-3.2` and `simba-english` are English-only; a non-English voice on them returns `400`." Remi sends every non-Arabic line to `simba-3.2` with the English voice `beatrice_32` (`convex/actions.ts:755-770`). That isn't a 400 today because the voice is English, but simba-3.2 still mispronounces foreign text (the code comment at `:747-751` saw this with Arabic).

| Model | Languages (official) | Status |
|---|---|---|
| `simba-3.2` | English | Live for English lines today |
| `simba-3.0` (the API default) | English, German (de-DE), Spanish (es-ES / es-MX), French (fr-FR), Italian (it-IT), Brazilian Portuguese (pt-BR). "Languages outside this list often still produce usable audio on `simba-3.0`, but they are not validated or officially supported." | The only official non-English route |
| `simba-multilingual` (legacy, 30+ locales: full = en, fr-FR, de-DE, es-MX, pt-BR, pt-PT; **beta** = ar-AE, sv-SE, da-DK, nb-NO, fi-FI, nl-NL, pl-PL, ru-RU, tr-TR, ja-JP, ko-KR, hi-IN, he-IL, el-GR, uk-UA, vi-VN, it-IT and others; zh-CN "coming soon") | **Retired**: new workspaces get `400 model_retired`; it works only on a workspace pinned to an API version before 2026-09-21. The two Speechify doc pages disagree about 2026-11-21. One says "switched off", the other says "served by our current multilingual model". | **Remi's Arabic TTS runs on this today** (`SPEECHIFY_DEFAULT_MULTILINGUAL_MODEL`, `convex/actions.ts:756`) |

Other API facts:
- Language is chosen with the optional `language` request param on `/v1/audio/speech` (locale format, e.g. `fr-FR`). If it's left out, it is "chosen from the voice's own locale".
- Voices are per language, so Remi needs one stock voice per locale. Pick it from `GET /v1/voices`, filtered by `models` containing `simba-3.0`. One field report says no es-ES voice lists simba-3.0, so use es-MX voices with `language: es-ES`, which the docs say are interchangeable.
- Cloned voices speak only their model's languages.

### 1.2 Matrix

The app's on-device engine is **`DictationTranscriber`** (the default in `lib/deviceStt.ts:22-24`; `SpeechTranscriber` is a dev-only override). Apple (WWDC25 session 277) says DictationTranscriber "supports the same languages … as iOS 10's on-device SFSpeechRecognizer". There is no official list of those. The best empirical one, from 2022, has 22 locales. The native module resolves locales at runtime (`VRSpeech.swift:234-240`), so the phone gives the real answer whatever this table says.

| Language | TTS: simba-3.2 / simba-3.0 / legacy multilingual | Apple on-device (Dictation / SFSpeech on-device, 2022 list) | SpeechTranscriber (macOS 26 dump) | Cloud STT (4o-mini-transcribe / whisper-1) | Parser date/time (inferred tier) | Every stage solid? |
|---|---|---|---|---|---|---|
| English | full / full / full | yes | yes | high | high | **yes (live)** |
| German | none / **full** / full | yes | yes | high | high | **yes** |
| French | none / **full** / full | yes | yes | high | high | **yes** |
| Spanish | none / **full** (use es-MX voices) / full | yes | yes | high | high | **yes** |
| Italian | none / **full** / beta | yes | yes | high | high | **yes** |
| Portuguese (Brazil) | none / **full** / full | yes (pt-BR) | yes | high | high | **yes** |
| Portuguese (Portugal) | none / unofficial / full (retiring) | unverified | yes | high | high | no (TTS) |
| Arabic | none / unofficial / **beta (retiring)** | yes (ar-SA) | no | medium (FLEURS ~15% WER) | weaker on small models | **already shipped, but its TTS model is retiring** |
| Swedish | none / unofficial / beta (retiring) | **no (server-only in 2022)** | no | high-medium (2.1k training h) | medium-high | no (TTS + device) |
| Danish, Norwegian, Finnish | none / unofficial / beta (retiring) | no (server-only) | no | medium (Norwegian 266 h) | medium | no |
| Dutch, Polish | none / unofficial / beta (retiring) | no (server-only) | no | high-medium | medium-high | no |
| Turkish, Russian | none / unofficial / beta (retiring) | yes | no | medium-high / high | medium-high | no (TTS) |
| Japanese, Korean | none / unofficial / beta (retiring) | yes | yes | high (CER ~6.6) / medium (~15%) | medium (non-Latin script) | no (TTS) |
| Chinese (Mandarin) | none / unofficial / "coming soon" | yes | yes | high (CER ~6.7) | medium | no (TTS) |
| Hindi | none / unofficial / beta (retiring) | no (server-only) | no | medium-low; misdetected as Urdu without a `language` hint | weaker | no |

Notes:
- **Cloud STT.** OpenAI's own wording: "Supplying the input language in ISO-639-1 … will improve accuracy and latency." `gpt-4o-mini-transcribe` has community reports of truncated output, dropped words after a pause on small files, and `language` sometimes ignored. That fits take 1's empty primary transcript, but I found no report specific to empty output on non-English audio. OpenRouter's `/audio/transcriptions` documents a top-level `language` field. **Unverified: whether it actually forwards `language` to OpenAI for this model.** A probe with a deliberately wrong code settles it. `prompt` is not a top-level field on OpenRouter; it only goes through `provider.options` and is silently dropped otherwise.
- **Parser.** The TRD benchmark (10 languages, IWSDS 2026) found LLM date arithmetic "more robust on Indo-European languages with Latin scripts" than on Japanese, Arabic or Hindi, especially for smaller models. MultiTempBench found strong en/de/zh, degraded Arabic, and collapse in low-resource languages. Nobody has benchmarked `gpt-5.6-luna` on relative phrases like "next Tuesday at 3", so the launch gate is our own eval (slice S4), not these tiers.
- **Apple caveats.** The 2022 on-device list is old (iPhone 7, iOS 15.4). The SpeechTranscriber list is a macOS 26.5.2 dump. One report says `supportedLocale(equivalentTo:)` returned `ru_RU` although Russian isn't in `supportedLocales`, so the JS must check that the resolved locale's language equals the requested one (slice S2).

### 1.3 Recommended launch set

**English (live) plus German, French, Spanish, Italian and Brazilian Portuguese.** These are the only languages where every stage, TTS included, is officially supported. Each launches only after it passes the per-language parse eval (S4) and a listen test (S5).

- **Arabic** is already shipped. It is outside the "solid" set, and its TTS model is on a retirement clock (risk 1). Keep it, and fix the TTS route before 2026-11-21.
- **Swedish, the language that started this, is not in the launch set.** There is no official TTS, and on-device dictation is likely server-only. The guard (S1) and the device-locale fix (S2) still fix the Stockholm user's *experience*: an honest "this language isn't supported yet" instead of "Kilometer got lead". Swedish and the Nordics become wave 2 (S10) if a listen test of Swedish on simba-3.0, or whatever multilingual model serves after 2026-11-21, passes.

---

## 2. Pipeline audit (what is hard-coded to English or Arabic today)

The live voice path is the creation job: client `runVoiceHandoff` (`lib/deviceStt.ts`) → `creationJobs.begin` → worker `creationJobActions.run` → `transcribeAudio` (cloud takes only) → `parseTake` → `validateCreationPlans` → `commit` → TTS job. The typed path (`actions.processTypedReminder`) and the legacy voice actions share the same prompt (`buildSystemPrompt`) and planner (`buildReminderPlan`).

### 2.1 Device STT locale selection

> **The central STT bug: `auto` forces `en-US` on every non-English, non-Arabic phone.**
>
> `resolveVoiceLocale` (`lib/deviceStt.ts:39-53`) maps `auto` only to English or Arabic. Every other device language falls through to `en-US` (line 52), and the comment (`:35-37`) assumes "the cloud fallback covers everything else anyway". It doesn't, because **`en-US` dictation does not fail on Swedish. It returns confident English nonsense ("Kilometer got lead")**. `runDeviceStt` (`:166-180`) counts any non-empty text as success, so `runVoiceHandoff` takes the device path (`:236-245`), and **the cloud fallback, which can detect the real language, never runs**. This is the worst failure mode in the pipeline: a wrong-language engine turns a recoverable "couldn't transcribe" into a plausible-looking wrong reminder.
>
> **(a) Fix, slice S2, right after the guard.** `auto` maps to the device's *actual* first preferred language: the full locale, e.g. `sv-SE`, from `getDeviceLocales()[0]`. Whether Apple's on-device engine supports it is answered at runtime by the existing native `status()` (`supportedLocale(equivalentTo:)` → `unsupported`), which already fails fast to the cloud. JS also rejects a device result whose `resolvedLocale` language differs from the one requested, covering Apple's substitution quirk. `en-US` is used only when English really is the device language. The result: a Swedish iPhone either gets Swedish on-device dictation (if iOS 26 supports it on that device) or goes straight to the cloud, never to `en-US`. JS-only, no native build.
>
> **(b) Manual override, slice S6.** The existing picker (`app/settings.tsx:113-123, 310`; `VoiceLanguageSetting = "auto" | "en" | "ar"`, `lib/deviceStt.ts:20`) is extended to the launch languages (de, fr, es, it, pt-BR, plus en and ar) as endonyms. A manual pick sets both the device locale and the cloud `languageHint` (S3).

| Where | Today | Change |
|---|---|---|
| `lib/deviceStt.ts:20` | `VoiceLanguageSetting = "auto" \| "en" \| "ar"` | Becomes a BCP-47 language code drawn from a launch-set table (`"auto" \| "en" \| "ar" \| "sv" \| "de" \| …`). |
| `lib/deviceStt.ts:39-53` `resolveVoiceLocale` | `en`→`en-US`, `ar`→`ar-SA`. `auto` takes the first device language that is `en` or `ar`, and **anything else falls through to `en-US`** (line 52). The comment at 35-37 says "the cloud fallback covers everything else anyway". It doesn't: `en-US` dictation does not fail on Swedish, it produces English words. | `auto` returns the device's first preferred locale as-is (`sv-SE`, `pt-BR`, `en-GB`), and the native `status()` decides whether it runs on-device. With no device locale at all, return `null` (skip the device engine, go to cloud). Never fall back to `en-US` for a device whose primary language is not English. Explicit `en`/`ar` picks keep their current mapping. (S2) |
| `lib/deviceStt.ts:61-81` `getDeviceLocales` | `AppleLanguages` plus `Intl` locale | Fine as is. Its first entry is also the app's UI language and the cloud language hint (2.2). |
| `lib/deviceStt.ts:131-189` `runDeviceStt` | Any non-empty text counts as success | Takes a `null` locale as "skip device" (`reason: "no_locale"`). Optional later: a confidence floor once native returns confidence (see the native slice). |
| `lib/settingsStore.ts:12-25, 67-70, 113` | Persists the 3-value enum, and any unknown value resets to `auto` | Widen the allow-list to the launch-set table. A stored `en`/`ar` still loads. |
| `app/settings.tsx:31-35, 113-123, 309-310` | `Alert.alert` with three buttons. Copy: "Transcribed on this iPhone" | Too many options for an alert now. Use the existing `PickerSheet` component: Automatic plus the launch set, each in its endonym ("Svenska", "Deutsch"). Copy changes from "transcribed on this iPhone" to just "Voice language", because the setting now drives the cloud hint and the parser too. |
| `app/index.tsx:997-1005` | Preheats (`speechPrepare`) the resolved locale, which downloads the assets | Skip when the locale resolves to `null`. Otherwise unchanged. This is where Swedish assets get fetched on a Swedish phone. |
| `app/index.tsx:1391-1396` | Passes `resolveVoiceLocale(…)` into `runVoiceHandoff` | Also passes the resolved **language** into `beginDeviceTake` / `uploadAndBegin` so the server knows what to expect (2.2). |
| `plugins/ios-src/VRSpeech.swift:234-240` | `supportedLocale(equivalentTo:)` on `DictationTranscriber` (the default engine, `lib/deviceStt.ts:24`) or `SpeechTranscriber` | **No native change needed to add locales.** The module already accepts any BCP-47 id and installs assets through `AssetInventory`. Native work is optional: turn on `attributeOptions: [.transcriptionConfidence]` (lines 131-151) to get a confidence score. |

### 2.2 Cloud STT

| Where | Today | Change |
|---|---|---|
| `convex/stt.ts:147-150` | `transcribeAudio(input, { model? })` takes no language | Add `options.language?: string` (ISO-639-1). |
| `convex/stt.ts:178-182, 209-213` | `transcriptions.create({ file, model, response_format: "json" })` sends no `language` and no `prompt`, so both models auto-detect | Pass `language` to **both** attempts when the client sent a hint that is in the launch set. Auto-detect on short (2-5 s) clips is the weak spot: a few seconds of Swedish is easily heard as Norwegian or Danish, and a short clip can come back empty. Keep auto-detect only when there is no hint (a device in an unsupported language). See the matrix notes on whether OpenRouter forwards `language`. |
| `convex/creationJobActions.ts:241-288` `transcribeRecording` | Calls `transcribeAudio(audioFile)` | Pass `job.languageHint`. |
| `convex/creationJobs.ts:236-305` `begin`, `:652-720` `retry`, `convex/schema.ts:229-253` | The job row carries `deviceSttLocale` (device takes only), `localDate`, `localTime`, `timezone`. **Nothing tells the server the user's language for a cloud take.** | New optional arg/column `languageHint` (e.g. `"sv"`), sent on every take, device or cloud. It is optional, so old builds keep validating. |
| `convex/actions.ts:1160, 1567` (legacy voice actions) | Same call | Leave these alone. Only pre-job builds reach them, and those builds have no hint to send. |

### 2.3 Parse prompt (`convex/actions.ts:521-641` `buildSystemPrompt`)

- `:522` "The input may be in ENGLISH or ARABIC." becomes "The input may be in any language; the user's expected language is X."
- `:561-565` LANGUAGE RULES list only Arabic and English. Generalise to "return `title` and `description` in the language of the input". Keep the JSON keys and the enum values in English.
- `:567-611` DATE / RELATIVE TIME / INTERVAL rules give English plus Arabic examples only, and `:611-614` "ARABIC TIME EXPRESSIONS" is Arabic-only. For the launch set, the model's own multilingual ability does the work (matrix). Add one compact, language-neutral note ("weekday names, 'tomorrow', 'in N minutes', 'half past', 24-hour vs am/pm conventions in any language map to the same fields") rather than per-language example tables. Per-language examples belong in the eval set, not the prompt.
- `:626-628` "TIME PARSING (Speech-to-text quirks)" is English-centric ("10 4 p.m."). Leave it.
- `:634` **"If no time specified, use a reasonable default."** This is the line that turns nonsense into a now+1 reminder (section 3).
- The prompt must also return a `language` (ISO-639-1) field and the guard fields (section 3).
- Cache note (`:504-519`): every one of these is static text above CURRENT CONTEXT. The language hint must go **into the CURRENT CONTEXT block at the end**, never above it, or prompt caching breaks.
- `convex/creationJobActions.ts:309`, `convex/actions.ts:1174, 1588, 1677`: `toLocaleDateString("en-US", { weekday: "long" })` feeds the English day name into the context. That is fine. It is an instruction to the model, not user copy.

### 2.4 Spoken line generation and style rules

- `convex/helpers.ts:212` `SPOKEN_LINE_RULE`, `:231` `SPOKEN_LINE_RULES_SECTION`, `:251-256` `buildDescriptionInstruction`, `:258-263` `buildPreReminderInstruction`: the two shapes (bare imperative, "[thing] is right now") are written as English grammar with Arabic glosses. They carry over to Romance and Germanic languages, Polish and Russian. Japanese and Korean have no bare imperative of the same register (plain imperative is rude, so it would be a `〜して` / `-세요` form), and German or French need a register decision (du/Sie, tu/vous). Add a sentence, "in other languages use the shortest natural, polite-neutral instruction form; same two shapes", plus a per-language register table in the eval, not the prompt.
- `convex/helpers.ts:118-156` `BANNED_OPENERS` is English and Arabic only. Non-English openers ("Det är dags att", "Es ist Zeit", "Il est temps de", "Es hora de", "Non dimenticare", "Glöm inte") pass `guardSpokenLine` (`:185`) unchecked. Add per-language opener lists for the launch set. This is the cheap, deterministic half of the voice rule.
- `convex/helpers.ts:11-28` `normalizeReminderDescription` strips greetings with English and Arabic regexes only. Extend it the same way ("Hej", "Hallo", "Hola", "Bonjour", "Ciao").
- `convex/helpers.ts:373-385` `buildHeadsUpTtsText`: the fallback stand-in is the **English template** `` `${title} in ${N} minutes` ``. A Swedish title would be spoken as "Ring mamma in 10 minutes". Needs a per-language template table keyed on the parse's `language`, and when the language has no template, the model's own `preDescription` or nothing.
- `__evals__/reminder-phrasing.eval.ts:44-60` is the live eval battery, English and Arabic only. Extend it to each launch language, with a date/time correctness check as well as phrasing (section 4).

### 2.5 TTS voice and model per language

- `convex/actions.ts:755-770` picks the model from the text: `containsArabicScript(text)` (`helpers.ts:432`) chooses `simba-multilingual`; **everything else goes to `simba-3.2`**. The comment at `:747-751` records that simba-3.2 "does not reject Arabic, it silently mangles it". Expect the same for Swedish.
- `:757` voice `beatrice_32` is used for every language.
- `:865-875` the request body carries `input`, `voice_id`, `model`, and a format. **No `language` field.**
- Change: route by the parse's `language` field (persist it on the reminder), not by script detection. Script detection can't tell Swedish from English. Use one table: `en` → `simba-3.2` + `beatrice_32` (unchanged); `de`/`fr`/`es`/`it`/`pt` → `simba-3.0` + a stock voice for that locale + `language: "de-DE"` and so on; `ar` → see risk 1. A language outside the table is never synthesized. The guard stops it earlier (`unsupported_language`). The same routing is needed in `synthesizeAlarmWav` (`:933-943`), the heads-up synth (`:998`), `regenerateReminderAudio` (`:1316`), and `generateReminderTtsForReminder` (`:1709`). All of them take only `text` today, so the language has to be threaded through, or stored on the reminder row and read back.
- `text_normalization` (`:860-864` comment): number and clock reading ("7:30") is language-dependent. Spot-check per language in the listen test.

### 2.6 Reminder title language

The title is whatever language the parser writes, per LANGUAGE RULES (`actions.ts:561-565`). Today that means English or Arabic, and anything else is undefined behaviour: the model may translate a Swedish request into an English title. With the generalised rule the title follows the input. The UI must cope with titles in any script. RN does, but `ReminderCard` / `DetailSheet` truncation and font fallback should get a visual check for CJK and RTL. Arabic already works, so RTL inside a card is proven.

### 2.7 In-app UI strings

- There is no i18n library (`package.json` has no `expo-localization`, `i18n-js` or `react-i18next`). A rough count gives about 250-400 user-facing literals: about 110 JSX text nodes in `app/` and `components/`, about 130 `title/label/text/message` props, plus string tables in `lib/` (`pendingCardContent.ts:34-38`, `time.ts:311-314, 508-523` "Today at" / "Tomorrow at" / "Next in N min", `remindersMembership.ts:227` "Overdue", `paywallContent.ts`, `notificationsOffNotice.ts`, `feedbackUi.ts`, `usageGate.ts`).
- Native strings need a **native build**: AlarmKit buttons "Done" / "Later" and the intent titles in the Swift template inside `plugins/withAlarmKit.js:626-630, 860`. So do the notification action titles (`lib/notifications.ts:1378` and the category registrations, which are JS but run against the native category API, so a new build is not required). So do the iOS permission prompts (`NSMicrophoneUsageDescription` and friends), which need `expo.locales` in `app.json` plus per-language JSON, and App Store metadata per locale.
- Recommendation: **UI localisation is a separate, later track.** Voice support (understand Swedish, speak Swedish) does not need it, and an English UI with Swedish reminders is acceptable for a first release. When it is done: `expo-localization` (native module, so it rides the next build) plus `i18n-js` or `i18next`, with keys extracted file by file.
- **Paywall and legal copy** (`lib/paywallContent.ts`, `legal-site/`) carry App Review history (3.1.2). Translate them last and review each language, because a mistranslated price or auto-renew sentence is a rejection risk.

---

## 3. The guard

### 3.1 Where a nonsense take becomes a now+1 reminder

1. **The prompt demands a reminder.** `convex/actions.ts:526` "Return exactly this format", `:634` "If no time specified, use a reasonable default.", `:635` "If no frequency specified, assume 'once'." The model has no legal way to say "this is not a reminder". Given "Kilometer got lead" it invents a title and a time (the next minute), and dates it today.
2. **The planner fills holes too.** `convex/actions.ts:298-302`: a missing `time` becomes `getCurrentTimeHM(context.currentTime)`. `:225-237` `nextLocalDateFor` dates it today or tomorrow.
3. **Provenance flags measure the JSON, not the user.** `convex/actions.ts:308-312`: `explicitDate = date !== undefined`, `explicitTime = typeof parsed.time === "string"`. When the model invents a time, both are `true`. They were built to tell "the model named it" from "the planner filled it in", and the prompt makes the model fill it in.
4. **The gate trusts them.** `convex/creationValidate.ts:141-143` `saidInFull`, `:309-311`: a one-off at or before `now` is accepted when `saidInFull`. Anything later than now is accepted regardless. The title check (`:193-198`) only asks "non-empty, ≤200 chars".
5. **Device text has no quality bar.** `lib/deviceStt.ts:166-180`: any non-empty string from the wrong-locale engine is a success, and `creationJobActions.ts:399-418` uses it verbatim.
6. **What already works.** A parse that yields no object at all throws in `convex/helpers.ts:74-86` `normalizeParsedReminders` ("Parse response contained no reminder object"), which `parseTake` (`creationJobActions.ts:344-348`) turns into `parse_failed`, which the client maps to "Couldn't turn that into a reminder — tap to try again" (`lib/pendingTakes.ts:203-205`, `lib/pendingCardContent.ts:36`). That was take 1. Retrying it re-runs the same failing STT, which is pointless when the cause is the language.

### 3.2 Proposed rule

**Parser side (prompt plus planner, JS/Convex only):**

Add three top-level fields to the response envelope: `{"understood": boolean, "language": "sv", "reason"?: "not_a_request" | "unclear" | "no_time", "reminders": [...]}`. On each reminder object, add `"timeSpoken": boolean`, true only when the user actually said a day or time word.

- Prompt: replace `:634` with: "If the input is not a request for a reminder, or you cannot tell what the task is, return `understood: false` and an empty `reminders` array. Never invent a task. If the user named a task but no time, set `timeSpoken: false` and leave time out." Keep the "assume once" rule.
- Gate (`creationValidate.ts`, a new check that runs before the per-plan checks): reject the take when `understood !== true`, or when the array is empty → new code `not_understood`. Then, per plan: a `once` plan with `timeSpoken !== true` → `no_time`.
- Belt and braces, deterministic and cheap: reject when the title shares **no** content word with the transcript (case-folded, diacritics stripped, after removing an opener). Strictly optional. It catches a model that "understood" nonsense, but it misfires on translated titles, so it's an evaluated second step, not part of the first ship.
- Fix `explicitTime` to come from `timeSpoken` (when present) instead of "the model returned a string", so the existing past-instant rule means what its comment says.

**Product decision needed: "no time said".** "Remind me to call mom" with no time works today and gets *some* default. The options are: (a) reject with "When should I remind you?" (recommended: honest, and the same user then says it again with a time); (b) keep a default but never a near-instant one, e.g. +1 h, and flag it on the card. Recommend (a) for once-reminders. Recurring ones without a time ("every day") stay (b) at the prompt's default.

**Language side:**

- The parser's `language` field is checked against the launch set. A clean parse in an unsupported language (say Thai) → `unsupported_language`, and no reminder is created, even though the parse may be fine. TTS would mangle it, so this is the honest failure.
- Device STT (2.1): never run an engine whose locale doesn't match the device's language, which removes the "Kilometer got lead" source entirely.

**Error codes and copy.** `errorCode` is a free `v.string()` (`convex/schema.ts:246`), and old clients map unknown codes to the generic "Something went wrong — tap to retry" (`lib/pendingTakes.ts:203-205`). So:

| Server code | New-client copy (card) | Retry? | Old App Store build sees |
|---|---|---|---|
| `not_understood` | "Didn't catch that — tap to record again" | Record again (re-running the same audio is pointless) | Generic "Something went wrong" |
| `no_time` | "When should I remind you? Tap to record again" | Record again | Generic |
| `unsupported_language` | "Remi doesn't speak this language yet — try English" (no language named if unsure) | No retry; offer discard | Generic |
| `parse_failed` / `unparseable` (existing) | unchanged | tap to retry | unchanged |

Compatibility: the shipped 1.0 build reads the same live Convex (`dev:proper-stoat-767`). Two options: either send the new codes only when the take's `begin` carried a new `clientCaps` / `languageHint` arg (old builds never send it, so they keep getting `unparseable`), or reuse `unparseable` with a new `errorDetail` field. **Recommend `errorDetail`.** It keeps `errorCode` in its closed set, old clients show "Couldn't turn that into a reminder", which is *right* for all three, and new clients read the detail.

Retry cap: `not_understood` / `no_time` / `unsupported_language` should set the job to a non-retryable failed state (or the client should hide "tap to retry"), so they don't burn `MAX_ATTEMPTS` (`convex/creationJobs.ts:55`) on the same audio.

---

## 4. Plan: issue-sized slices

Each slice is one agent work package (about 120-160k tokens of context) with exclusive file ownership. "OTA" means JS plus a Convex push (the coupled pair from CLAUDE.md). Convex pushes go live to every user immediately, so every Convex-touching slice must stay backward compatible with the shipped 1.0 build (optional args only, old error code kept).

### Top risks

1. **Arabic TTS has a deadline.**
   - Arabic lines go to `simba-multilingual` (`convex/actions.ts:756-762`). That model is retired for new workspaces, and works only on workspaces pinned before 2026-09-21. One Speechify doc says it is switched off on **2026-11-21**; the other says it is "served by our current multilingual model" from then on. Arabic isn't an official simba-3.0 language either.
   - If the Speechify account or key is ever recreated, Arabic breaks *now*.
   - Action: confirm the workspace's pinned API version and ask Speechify what the ID serves after 11-21. Listen-test Arabic on simba-3.0 as the fallback. ElevenLabs `eleven_multilingual_v2` is still wired as the keyless fallback (`:728`, `:912-921`) and is a known-good Arabic route if needed.
2. **The garbage-in path is model-dependent and goes live to everyone at once.** The guard is mostly a prompt change to `gpt-5.6-luna`, and Convex is the live deployment the shipped 1.0 build reads. A too-strict `understood:false` rejects real English reminders for every user the moment it's pushed.
   - Gate: run the live eval (English and Arabic battery plus new nonsense, no-time and foreign cases) before the push, and watch `[VR] creation job: plan … rejected` / `errorDetail` counts in the Convex logs for a day after.
   - "No time said → reject" is a behaviour change users will notice. The founder needs to decide it.
3. **Cloud STT can't be steered as assumed.** It's unverified whether OpenRouter forwards `language` to `gpt-4o-mini-transcribe`, and community reports say the model sometimes ignores it or truncates short clips. If the hint does nothing, short non-English takes keep failing the primary model the way take 1 did.
   - Mitigation: S3 opens with a probe (send German audio with `language: "fr"`; if the output changes, the hint is honoured).
   - If it isn't honoured: call OpenAI directly for STT on non-English takes (a second key, already in the env history), or make `whisper-1` the primary when a hint is present.

Also worth knowing: the launch set doesn't include Swedish, so the user who triggered this gets an honest error, not support (see 1.3).

### Slices

| # | Slice | Depends on | Parallel? | Ship type | Owns (exclusive) |
|---|---|---|---|---|---|
| **S1** | **Guard: reject nonsense / no-time / unsupported language** | none | runs first; parallel with S2 | Convex push (live for 1.0 too) + JS OTA for copy | `convex/actions.ts` lines 521-641 only (`buildSystemPrompt`), `convex/helpers.ts` `normalizeParsedReminders` (`:56-86`), `convex/creationValidate.ts`, `convex/creationJobActions.ts`, `convex/creationJobs.ts` `failJob`/patch validator (adds `errorDetail`), `convex/schema.ts` creationJobs table (`errorDetail` optional), `lib/pendingTakes.ts`, `lib/pendingCardContent.ts`, `components/PendingTakeCard.tsx` (retry vs record-again), matching `__tests__`, `__evals__/reminder-phrasing.eval.ts` (nonsense, no-time, foreign cases) |
| **S2** | **`auto` follows the real device language; never force `en-US` (see 2.1 (a))** | none | **right after the guard.** Files are disjoint from S1, so it may run alongside it, but it ships second | JS OTA | `lib/deviceStt.ts` (`resolveVoiceLocale` `auto` → the device's first preferred locale, `null` → cloud; `runDeviceStt` rejects a `resolvedLocale` whose language differs from the request, e.g. `ru_RU` / `en-US` substitution; `"no_locale"` fallback reason), the two call sites `app/index.tsx:997-1005, 1391-1396`, `__tests__/lib/deviceStt.test.ts` |
| S3 | Language plumbing: client hint → job → cloud STT | S1 merged (same files) | serial after S1; parallel with S2 | Convex push + JS OTA | starts with the OpenRouter `language` probe (a script under `scripts/`, run against a test key, not Convex). `convex/stt.ts` (`language` option on both attempts), `convex/creationJobs.ts` `begin`/`retry` (optional `languageHint`), `convex/schema.ts` (**both** new columns: `creationJobs.languageHint` and `reminders.language`, so S4/S5 never touch schema), `convex/creationJobActions.ts` `transcribeRecording`, `convex/actions.ts` `processTypedReminder` args only, `app/index.tsx` begin/retry/typed call sites, `lib/typedTake.ts` |
| S4 | Multilingual parser + spoken-line rules | S3 | **parallel with S5** | Convex push | `convex/actions.ts` `buildSystemPrompt` (generalised LANGUAGE/DATE rules, `language` output field, hint in CURRENT CONTEXT only) and `buildReminderPlan` (carries `language`), `convex/creationJobActions.ts` `toCommitPlan` + `convex/creationJobs.ts` `commit` (write `reminders.language`), `convex/helpers.ts` (per-language `BANNED_OPENERS`, greeting strip, heads-up stand-in templates `:373-385`), `__evals__/` (new multilingual parse eval: 20 transcripts × de/fr/es/it/pt with expected date/time/frequency; **launch gate**: ≥95% schedule-exact per language) |
| S5 | TTS routing per language (+ Arabic continuity) | S3 (`reminders.language` column) | **parallel with S4** | Convex push | `convex/actions.ts` TTS region only (`:715-1010`, `regenerateReminderAudio :1316-1360`, `generateReminderTtsForReminder :1709-1789`): a language→{model, voice, locale} table, `language` in the Speechify body, the language threaded through every synth call (read from the row; fall back to `containsArabicScript` for rows without one). Voice pick via `GET /v1/voices`. Listen test per language in `listen-test/`, including clock/number normalisation. Arabic: verify the workspace pin and choose a post-11-21 route. |
| S6 | Voice language picker: manual override for the launch languages (2.1 (b)) | S2, S3 | serial | JS OTA | `lib/languages.ts` (new: the launch-set table of code, endonym, device locale, TTS locale, imported by client only), `lib/settingsStore.ts`, `app/settings.tsx` (switch to `PickerSheet`, endonyms, copy), `lib/deviceStt.ts` type widening, tests. Release switch: a language appears in the picker and in `auto` only when it's flagged `launched` in the table. |
| S7 | Native: confidence + strict locale match | S2 | parallel, any time | **native build** | `plugins/ios-src/VRSpeech.swift` (`attributeOptions: [.transcriptionConfidence]`, return mean confidence; `supportedLocales` membership check instead of `supportedLocale(equivalentTo:)`), `lib/vrSpeech.ts` contract (additive field), `lib/deviceStt.ts` confidence floor → cloud fallback |
| S8 | i18n foundation + lib string tables | S6 | serial | **native build** (adds `expo-localization`) | `package.json`, `lib/i18n/` (new), `lib/time.ts`, `lib/pendingCardContent.ts`, `lib/remindersMembership.ts`, `lib/notificationsOffNotice.ts`, `lib/usageGate.ts`, `lib/feedbackUi.ts`. English keys first, then de/fr/es/it/pt files. |
| S9a / S9b | UI strings: screens (`app/*.tsx`), then components (`components/**`) | S8 | the two run in parallel with each other | JS OTA (once S8's build is installed) | split by directory |
| S9c | Native and store strings | S8 | parallel with S9a/b | **native build** + ASC | `plugins/withAlarmKit.js` button/intent titles ("Done", "Later"; the Swift lives in a JS template literal, so **no backticks**), `app.json` `expo.locales` + permission strings, notification action titles, ASC localized metadata. Paywall/legal (`lib/paywallContent.ts`, `legal-site/`) only with a per-language human review (3.1.2 history). |
| S10 | Wave 2: Swedish / Nordics / Dutch / Polish | S4 + S5 shipped | later | Convex + table flip | gate: listen test of each on simba-3.0 (unofficial) or Speechify's post-11-21 multilingual model, plus the S4 eval in that language. No native work, because S2 already sends those takes to the cloud. |

Ordering, in short: **S1 (guard) → S2 (auto follows the device language) → S3 → (S4 ∥ S5) → S6 (picker override) → launch de/fr/es/it/pt.** S2 can be built alongside S1 because the files are disjoint, but it ships right after it. S7 can ride any native build. S8-S9 are a separate UI track and don't block the voice launch. Every step follows the standing order: cloud dev build or OTA → the user tests on the iPhone → then Apple.

Device test script for the launch (per language): a one-off with a relative time ("tomorrow at 3"), "in 10 minutes", a weekly recurrence, a two-reminder take, nonsense, and a task with no time. Expect the right schedule, a title and line in that language, a native-sounding voice, and the right error card for the last two.

---

## Sources

TTS (Speechify)
- Language support (current guide): https://docs.speechify.ai/build/guides/text-to-speech/language-support (simba-3.2 English-only, simba-3.0's six languages, legacy list, "upgraded 2026-11-21")
- Language support (older page): https://docs.speechify.ai/docs/language-support (same lists; says "switched off on 2026-11-21", which contradicts the page above)
- `/v1/audio/speech` reference, `language` param: https://docs.speechify.ai/tts/api-reference/text-to-speech/audio/speech
- Speechify blog, 3.2 stays English-only: https://speechify.ai/blog/simba-3-tops-artificial-analysis-tts-leaderboard
- Speechify blog, es-ES voices vs simba-3.0 and filtering `/v1/voices` by `models`: https://speechify.ai/blog/multilingual-voiceover-with-speechify-and-simba-3-0

Apple speech
- WWDC25 session 277, SpeechAnalyzer / SpeechTranscriber / DictationTranscriber: https://developer.apple.com/videos/play/wwdc2025/277
- `SFSpeechRecognizer.supportedLocales()`: https://developer.apple.com/documentation/speech/sfspeechrecognizer/supportedlocales()
- Supported-locales dump (about 63): https://stackoverflow.com/questions/45407986
- On-device locales, empirical 2022 list: https://medium.com/@toru_furuya/available-languages-in-on-device-speech-recognition-on-ios-in-2022-8c6383fac9f2
- SpeechTranscriber locales dump (macOS 26.5.2): https://github.com/bitwize-ai/Logue/issues/41
- `supportedLocale(equivalentTo:)` substitution quirk: https://github.com/bitwize-ai/Logue/issues/34

Cloud STT
- OpenAI speech-to-text guide (supported languages, `language` param): http://platform.openai.com/docs/guides/speech-to-text and https://developers.openai.com/api/docs/guides/speech-to-text
- Transcriptions API reference (`language`, `prompt`): https://developers.openai.com/api/reference/python/resources/audio/subresources/transcriptions/methods/create
- OpenAI, next-gen audio models (FLEURS): https://openai.com/index/introducing-our-next-generation-audio-models/
- Community reports: truncation https://community.openai.com/t/gpt-4o-transcribe-truncates-the-transcript/1148347 ; dropped words after pauses https://community.openai.com/t/gpt-4o-transcribe-leaves-out-words-after-pauses-in-the-speech/1152683 ; language enforcement https://community.openai.com/t/gpt-4o-transcribe-language-enforcement/1357014 ; prompt leakage https://community.openai.com/t/transcription-model-gpt-4o-mini-transcribe-prompt-leakage/1371126
- OpenRouter transcription API: https://openrouter.ai/docs/api/api-reference/stt/create-transcription and https://openrouter.ai/blog/tutorials/transcription-on-openrouter
- Whisper WER by language (third party): https://vocova.app/blog/ai-transcription-accuracy-benchmark-2026 ; Hindi/Urdu misdetection: https://thefastscribe.com/guides/whisper-language-accuracy ; training hours: https://arxiv.org/pdf/2509.25516v1

LLM date/time parsing
- TRD benchmark, IWSDS 2026: https://aclanthology.org/2026.iwsds-1.19.pdf
- MultiTempBench: https://arxiv.org/abs/2603.19017
- HeidelTime vs neural, multilingual: https://aclanthology.org/2023.eacl-main.84.pdf

Unverified, flagged in the text: whether OpenRouter forwards `language` for gpt-4o-mini-transcribe; whether the iOS 26 DictationTranscriber locale list matches the 2022 on-device list; whether the iOS 26 SpeechTranscriber list matches the macOS dump; what `simba-multilingual` serves after 2026-11-21.
