## 1. The STT call

**Use the existing OpenAI SDK with OpenRouter’s multipart endpoint. Add `convex/stt.ts`; do not put network code in the pure `convex/helpers.ts`.**

Both [creationJobActions.ts](C:/Dev/VR/convex/creationJobActions.ts:1) and [actions.ts](C:/Dev/VR/convex/actions.ts:1) declare `"use node"`.

OpenRouter explicitly supports OpenAI SDK multipart requests at `https://openrouter.ai/api/v1`. Required multipart fields are `file` and `model`; JSON responses expose `text`. Its alternative JSON contract requires `model` and `input_audio: { data, format }`, but **do not use that contract here**. [OpenRouter STT documentation](https://openrouter.ai/docs/guides/overview/multimodal/stt).

The installed SDK already posts multipart to `/audio/transcriptions`; no SDK upgrade or raw `fetch` is required. See [installed SDK implementation](C:/Dev/VR/node_modules/openai/src/resources/audio/transcriptions.ts:57).

Create this helper interface:

```ts
transcribeAudio(
  input: Blob | File,
  options?: { model?: string }
): Promise<{ text: string; perf: SttPerf }>
```

Implement these fixed rules:

- Model resolution: trimmed `options.model`, then trimmed `process.env.STT_MODEL`, then `"openai/gpt-4o-mini-transcribe"`. Empty strings fall through.
- Create the SDK client inside the helper invocation, after checking `OPENROUTER_API_KEY`.
- Pass an existing `File` unchanged. Wrap a plain Blob as `new File([input], "recording.m4a", { type: "audio/mp4" })`.
- Reuse the same File for fallback.
- Configure the STT client and request exactly as follows:

```ts
const client = new OpenAI({
  apiKey: process.env.OPENROUTER_API_KEY,
  baseURL: "https://openrouter.ai/api/v1",
  maxRetries: 0,
  timeout: 15_000,
});

const response = await client.audio.transcriptions.create({
  file,
  model: selectedModel,
  response_format: "json",
});
```

- Accept only a string `response.text` whose trimmed value is nonempty. Return that trimmed text.
- Treat a malformed or empty transcript as transcription failure.
- On terminal failure, throw an exported `SttError` carrying the accumulated `perf`; callers must preserve it.
- Leave the parse model, prompt, reasoning settings and TTS behavior unchanged.

**Replace all three call sites:**

| Call site | Exact change |
|---|---|
| [`transcribeRecording`](C:/Dev/VR/convex/creationJobActions.ts:209) | Remove its direct OpenAI STT client and transcription request. Call `transcribeAudio(audioFile)`, merge returned perf into worker perf, and return `text`. In its catch, merge `SttError.perf` before returning `{ ok: false, code: "stt_failed" }`. |
| [`processVoiceReminder`](C:/Dev/VR/convex/actions.ts:1121) | Remove the direct OpenAI client. Preserve base64 decoding and File construction. Replace the transcription request with `transcribeAudio(audioFile)` and use its `text`. Log its perf; preserve this action’s existing return shape without adding a top-level `perf`. |
| [`processVoiceReminderFast`](C:/Dev/VR/convex/actions.ts:1492) | Remove the direct OpenAI client. Preserve storage retrieval, File construction and cleanup. Call `transcribeAudio(audioFile)`, merge its perf into returned action perf, and use its `text`. Preserve cleanup on failure. |

Remove obsolete comments identifying these calls as necessarily Whisper.

OpenRouter’s fetched model page confirms the slug and lists **$1.25/M input tokens, $5/M output tokens and 930 ms P50**. The owner’s 970 ms figure is a changing catalog statistic, not an acceptance guarantee. [Model listing](https://openrouter.ai/openai/gpt-4o-mini-transcribe).

## 2. Fallback

**After primary transcription failure, make one attempt using `openai/whisper-1` through the same OpenRouter client**, because this preserves the chosen single-key path and OpenRouter lists that fallback model. [Whisper listing](https://openrouter.ai/openai/whisper-1).

Execution rules:

1. Make one primary request; SDK retries are disabled.
2. On request rejection, timeout, malformed response or empty transcript, immediately attempt the fallback once without backoff.
3. If the selected primary model is already `openai/whisper-1`, make only that request; do not repeat it as fallback.
4. Missing `OPENROUTER_API_KEY` fails immediately without a request.
5. Never use `OPENAI_API_KEY` from this helper.
6. When both attempts fail, retain the job’s existing **`stt_failed`** code. Legacy actions continue rejecting through their existing failure paths.
7. Do not fallback because of a later parse or validation failure.

`sttMs` must include the failed primary attempt and successful or failed fallback. This prevents fallback latency from disappearing from reports.

## 3. Language

**Leave language detection automatic.**

Omit `language`, `prompt`, `temperature`, timestamps and streaming parameters. Do not derive a language hint from the device locale: a take may contain both Arabic and English.

Use **`response_format: "json"`** for both models. OpenRouter supports `language`, accepts but ignores the multipart `prompt` field, and rejects `"text"` responses with HTTP 400. The selected response shape is `{ text: string, usage?: ... }`. [OpenRouter transcription contract](https://openrouter.ai/docs/guides/overview/multimodal/stt).

## 4. Timers and usage logging

### Shared STT telemetry

Define `SttPerf` in `convex/stt.ts` with these fields:

| Field | Type | Definition |
|---|---|---|
| `sttRequestedModel` | string | Resolved primary model |
| `sttModel` | string | Successful model; last attempted model on terminal failure |
| `sttMs` | number | First request start through final outcome |
| `sttPrimaryMs` | number | Primary request through transcript validation |
| `sttFallbackMs` | optional number | Fallback request through transcript validation |
| `sttFallbackUsed` | boolean | Whether fallback was attempted |
| `sttInputTokens` | optional number | Successful response’s `usage.input_tokens` |
| `sttOutputTokens` | optional number | Successful response’s `usage.output_tokens` |
| `sttAudioSeconds` | optional number | Successful response’s `usage.seconds` |
| `sttCostUsd` | optional number | Successful response’s `usage.cost` |

Read provider-specific usage through a narrow runtime-checked shape; the SDK’s OpenAI usage type does not fully describe OpenRouter’s response. Preserve reported zero values. Omit absent values instead of inventing zeroes. STT usage describes the successful response, not an estimated total for failed requests. [OpenRouter response usage](https://openrouter.ai/blog/tutorials/transcription-on-openrouter/).

At both timed voice call sites, also assign:

```ts
perf.whisperMs = perf.sttMs;
```

Keep this compatibility alias on failures too.

### Worker and schema additions

Extend `WorkerPerf`, [`creationPerfValidator`](C:/Dev/VR/convex/schema.ts:75), and [`CreationServerPerf`](C:/Dev/VR/lib/creationJobWatch.ts:43) with **all STT fields above** and the following fields. Every validator field must be optional so existing jobs remain readable.

| Field | Validator | Measurement |
|---|---|---|
| `schedulerDelayMs` | `v.optional(v.number())` | Handler entry minus scheduling timestamp |
| `jobAgeMs` | `v.optional(v.number())` | Handler entry minus job `createdAt` |
| `getJobMs` | `v.optional(v.number())` | Around initial `ctx.runQuery(getJob)` |
| `transcriptionCheckpointMs` | `v.optional(v.number())` | Around awaited `casPatch(pending → transcribed)` |
| `parsePromptTokens` | `v.optional(v.number())` | `usage.prompt_tokens` |
| `parseCompletionTokens` | `v.optional(v.number())` | `usage.completion_tokens` |
| `parseCachedTokens` | `v.optional(v.number())` | `usage.prompt_tokens_details.cached_tokens` |
| `parseReasoningTokens` | `v.optional(v.number())` | `usage.completion_tokens_details.reasoning_tokens` |

For STT fields, use optional string, boolean or number validators matching the table.

The validator is defined in **`convex/schema.ts`**, then reused by `creationJobs.ts`; do not create a competing validator.

**Scheduling measurement:**

- Capture `handlerEnteredAt = Date.now()` as the worker’s first statement.
- Add required `createdAt: v.number()` to `workerJobValidator` and return `job.createdAt` from `getJob`.
- Add optional `scheduledAt: v.number()` to `run` arguments.
- In both `begin` and `retry`, pass their existing `now` timestamp as `scheduledAt` to `runAfter`.
- Set `jobAgeMs = handlerEnteredAt - job.createdAt`.
- Set `schedulerDelayMs = handlerEnteredAt - args.scheduledAt` when supplied.
- For an already queued generation-1 invocation without `scheduledAt`, use `job.createdAt`.
- For an already queued retry without `scheduledAt`, omit `schedulerDelayMs`.

Thus the initial scheduling measurement is exactly createdAt → handler entry; retries do not misleadingly include time spent waiting for the user.

Set query and checkpoint durations in `finally` blocks so rejected calls retain elapsed time. Preserve the existing meaning of `totalMs`: handler entry through commit completion, excluding scheduler delay.

Keep the existing pre-commit perf payload and later `commitMs`/`totalMs` patch. Failure writes must include all telemetry accumulated before failure.

### Parse usage

Immediately after each successful parse response, extract the four fields above at:

1. `creationJobActions.ts` → `parseTake`.
2. `actions.ts` → `processVoiceReminder`.
3. `actions.ts` → `createTakeWithDeferredAudio`, covering fast voice and typed creation.

Use a new pure `convex/parseUsage.ts` helper to perform this extraction consistently. Include only finite, nonnegative numeric values.

OpenRouter returns usage on non-streaming responses without an extra request parameter. Cached tokens are cache reads; absent reasoning-token data must not be interpreted as zero. [Usage accounting](https://openrouter.ai/docs/cookbook/administration/usage-accounting), [prompt caching](https://openrouter.ai/docs/guides/best-practices/prompt-caching).

For the legacy fast/typed paths, retain `gptMs` and add `parseMs = gptMs`. Widen their perf records from `Record<string, number>` to `Record<string, number | string | boolean>` to accommodate STT labels.

### Log placement and device output

Emit these content-free backend JSON lines:

```text
[VR] stt_perf { traceId, path, ...sttPerf }
[VR] parse_perf { traceId, path, parseMs, ...parseUsage }
[VR] creation_job_perf { creationId, generation, status, ...perf }
```

- Use `creationId` as the worker’s `traceId`; legacy actions use `args.traceId ?? null`.
- Emit STT logs after helper success or failure at each call site.
- Emit parse logs after each successful response.
- Emit the job line after commit or terminal failure.
- Do not include audio, transcripts, prompt text or credentials in these new lines.

**Backend console output is not the reliable device-log transport.** The existing [`logCreationServerPerf`](C:/Dev/VR/lib/perf.ts:190) already emits:

```text
[VR PERF] {"traceId":"…","event":"convex_perf", ...jobPerf}
```

The [app callback](C:/Dev/VR/app/index.tsx:1052) receives it from the job watcher. With the expanded perf object, that existing line provides the requested **STT / parse / cached-token split in one device line**.

Keep the watcher’s immediate import and existing telemetry timeout. For failed jobs, invoke `onServerPerf(job.perf ?? {})` once before disposal so failure timings reach the device too. Do not add polling or delay import.

Correct the job-path legacy summary: it currently labels stop-tap → **server commit** as “micStop→card.” Use `importDone` as its total endpoint and label it **`micStop→import`**. Add `importDone` to `[VR CREATION SUMMARY]`. These are observable application milestones, not claims about the exact painted frame.

## 5. Tests

The grep under `__tests__/convex` found one OpenAI constructor/transcription mock: [legacyActionContract.test.ts](C:/Dev/VR/__tests__/convex/legacyActionContract.test.ts:15).

Update it as follows:

- Keep its SDK constructor mock; multipart SDK use means it does not become a raw-fetch mock.
- Set a dummy `OPENROUTER_API_KEY` and clear `STT_MODEL` before each test.
- Replace the `whisper-1` expectation with `openai/gpt-4o-mini-transcribe` and `response_format: "json"`.
- Assert STT client configuration includes the OpenRouter URL, dummy key, `maxRetries: 0` and `timeout: 15000`.
- Supply parse usage fixtures and assert the new usage fields.
- Update exact fast/typed perf-key expectations for the additions.
- Preserve argument validators, reminder envelopes and the slow voice action’s no-perf return contract.
- Preserve the assertion that typed creation never transcribes.

Add these tests:

| File | Required coverage |
|---|---|
| `__tests__/convex/stt.test.ts` | Default model; environment override; explicit option precedence; empty override handling; multipart File/JSON request; omitted language/prompt; OpenRouter client configuration; successful primary; fallback once; both attempts fail with perf; no duplicate fallback when primary is Whisper; empty transcript; missing usage versus zero usage |
| `__tests__/convex/parseUsage.test.ts` | Exact field extraction; absent fields omitted; zero cached/reasoning values preserved |
| `__tests__/convex/creationJobActions.test.ts` | Mocked-clock scheduler/query/checkpoint timings; first-generation compatibility; retry scheduling timestamp; perf reaches commit; helper terminal error becomes `stt_failed`; parse is not invoked after STT failure |
| Existing `__tests__/lib/perf.test.ts` | Expanded `convex_perf` line contains STT model, STT duration, parse duration and cached tokens; corrected import summary endpoint; logging flag respected |
| Existing `__tests__/lib/creationJobWatch.test.ts` | Complete perf forwarded once; failed-job perf forwarded before disposal; import still dispatched before final perf arrives |
| Existing `__vitest__/convex/creationJobsLifecycle.test.ts` | `getJob` returns `createdAt`; begin/retry schedule `scheduledAt`; expanded perf survives commit, watch projection and perfPatch |

Use controlled clocks and mocked providers; automated tests must not call live APIs.

Required checks:

```text
npm test
npm run test:convex
npx tsc --noEmit
```

## 6. Env

| Variable | Decision |
|---|---|
| `STT_MODEL` | New optional Convex variable. Default: `openai/gpt-4o-mini-transcribe`. Set explicitly to that value on rollout. |
| `OPENROUTER_API_KEY` | Existing required server secret; used for primary STT, fallback STT and parsing. |
| `OPENAI_API_KEY` | Leave the existing deployment secret intact. These three STT paths stop reading it. |
| `EXPO_PUBLIC_VR_PERF_LOGS` | Existing client flag. Set to `"1"` for the device-validation update so release logging is enabled. |

Do not add provider, fallback-model or timeout environment switches.

Deploy the backward-compatible Convex changes first, then the telemetry JS update. **This work requires a backend deployment and an OTA update; no native build.**

## 7. Rollout check

The implementation agent must report this device check as **pending**, not fabricate benchmark results.

Use these five utterances:

| Clip | Spoken input | Required semantic result |
|---|---|---|
| EN short | “Remind me to drink water in ten minutes.” | Drink water; once; stop-time +10 minutes |
| EN detail | “Take the water bottle out of the fridge in twenty minutes.” | Preserve bottle, fridge and removal action; +20 minutes |
| AR short | “ذكّرني أشرب ماء بعد عشر دقائق.” | Drink water; +10 minutes; Arabic reminder text |
| AR/EN mixed | “ذكّرني أعمل check-in للرحلة بعد عشرين دقيقة.” | Flight check-in; +20 minutes; no lost task |
| Mumbled | “Remind me to take my keys in fifteen minutes.” | Record softly with mumbled articulation; preserve keys and +15 minutes |

**Procedure:** On the same iPhone and network, record each utterance three times with `STT_MODEL=openai/whisper-1`, then three times with `STT_MODEL=openai/gpt-4o-mini-transcribe`: **15 baseline takes and 15 candidate takes**. Keep the parser and instrumented client unchanged. Do not delete a take until its `convex_perf` line is captured.

**Switch acceptance criteria — all must pass:**

- All 15 candidate takes produce the intended task and relative time; the bottle/fridge detail remains intact.
- No candidate take uses fallback or fails creation.
- Candidate median `sttMs` is at least **500 ms lower** than baseline median.
- Candidate median stop-tap → import is at least **500 ms lower** than baseline median.
- Every candidate has one terminal `convex_perf` line containing the model, STT/parse durations and all four parse-usage fields.

Report cached-token values as observed; zero is a valid cache miss.

**OLD-106 remains a separate result:** mark the device sample under three seconds only if every candidate’s stop-tap → import is below **3,000 ms**. Passing the STT-switch criteria alone does not close OLD-106.
tokens used
152,158
