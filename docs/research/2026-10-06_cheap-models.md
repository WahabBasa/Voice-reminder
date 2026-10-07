# Cheaper models for Remi's STT and parse slots (2026-10-06)

Research only. No paid API calls were made; prices come from public pages and OpenRouter's public `GET /api/v1/models` and `/api/v1/models/{id}/endpoints` (pulled 2026-10-06 ~18:10). Our own numbers come from `outputs/stt-bakeoff2/results.md` and `raw_synthetic.json`.

## TL;DR

- **The pipeline is already cheap.** A server-side reminder costs about **$0.00042** today (STT ~$0.00018 + parse ~$0.00024 with a warm prompt cache). With a cold cache the parse alone is ~$0.0010.
- **vals.ai has one STT benchmark (VoiceCodeBench), but it's English-only and uses long clips**, so it doesn't tell us much about short multilingual takes. It has **no instruction-following, JSON or date/time benchmark**. Its closest proxy for our parse task is **MedScribe** (transcript → structured note).
- **STT to bake off:** `microsoft/mai-transcribe-2`, `openai/whisper-large-v3-turbo`, `openai/whisper-large-v3`, `meta/muse-voice-transcribe-1.0`, plus the current `gpt-4o-mini-transcribe` as baseline. All are on OpenRouter.
- **Parse to bake off:** `openai/gpt-6-luna`, `xiaomi/mimo-v2.6-flash`, `z-ai/glm-5.3-flash`, `deepseek/deepseek-v4.1-flash`, plus the current `openai/gpt-5.6-luna`. All are on OpenRouter.
- **Best realistic saving: ~40–80% per reminder**, a fraction of a hundredth of a cent. The bigger win is still accuracy: the bake-off showed the `lang` tag is a prompt problem. Test model swaps **after** the prompt fix, or the results will mix the two effects.

---

## 1. What vals.ai offers

### STT: VoiceCodeBench (the only voice benchmark)
Source: https://www.vals.ai/benchmarks/voice-code-bench (page "Updated 9/24/2026"; benchmark list https://www.vals.ai/benchmarks says 9/24/2026, 20 models).

- It is **English-only**: 300 human-recorded workplace clips, **35–123 s long**, scored on exact structured values (URLs, emails, codes). The page says it "measures exact-value recovery rather than multilingual or conversational transcription quality."
- It finds **dates, times and plain numbers "effectively solved" (98–99%)** for every model. Those are exactly the values our reminders need, so the benchmark can't tell the candidates apart for our use.
- No prompting or language hints are used.

| Model | TSR | CTEM | WAcc | Price (vals model page) |
|---|---|---|---|---|
| GPT Live Transcribe | 67.7% | 91.4% | 94.1% | $0.017/min |
| Grok Voice Transcribe 2.0 | 65.3% | 90.6% | 89.5% | ~1/5 of leader (per vals) |
| Cartesia Ink 2 | 62.0% | 89.5% | 90.8% | – |
| GPT-4o Transcribe | 59.7% | 88.7% | 96.0% | – |
| Deepgram Nova-3 (streaming) | 59.3% | 88.0% | 90.5% | – |
| Reson8 Resonant-1 | 59.0% | 88.7% | 93.6% | $0.006878/min |
| Inworld STT 1 | 57.3% | 88.0% | 91.9% | $0.0025/min |
| Whisper Large-v3 Turbo | 57.0% | 87.6% | 93.3% | "$0.0007 per task", the cheapest offline option |
| Muse Voice Transcribe | 57.0% | 87.9% | 92.4% | – |
| Google Chirp 3 | 55.3% | 86.8% | 93.4% | – |
| ElevenLabs Scribe v2 Realtime | 55.3% | 86.8% | 94.9% | – |
| Whisper Large-v3 | 54.3% | 87.2% | 94.2% | – |
| Voxtral Mini Transcribe 2 | 53.0% | 87.0% | 94.5% | – |
| Grok Voice Transcribe 1.0 | 52.0% | 84.7% | 91.0% | $0.003333/min |
| GPT-4o Mini Transcribe (streaming) | 51.7% | 86.6% | 95.2% | – |
| Cohere Transcribe | 44.7% | 83.9% | 93.0% | – |
| Azure Speech Universal | 37.3% | 80.7% | 89.6% | – |
| AssemblyAI Universal-3.5 Pro | 30.3% | 77.1% | 94.5% | – |

TSR = every target value in the clip correct. Model pages: https://www.vals.ai/models/openai_gpt-live-transcribe, https://www.vals.ai/models/reson8_resonant-1, https://www.vals.ai/models/inworld_inworld-stt-1, https://www.vals.ai/models/grok_grok-voice-transcribe-1.0. The vals table doesn't show per-minute prices for every model; the gaps are marked –.

**A better multilingual source (not vals):** Artificial Analysis AA-WER, non-streaming: https://artificialanalysis.ai/speech-to-text/non-streaming (pulled 2026-10-06; prices in USD per 1,000 min):

| Model | AA-WER | $/1k min |
|---|---|---|
| MAI-Transcribe-2 | 2.0% | 1.67 |
| Scribe v2 (ElevenLabs) | 2.2% | 3.67 |
| Grok Voice Transcribe 2.0 | 2.3% | 1.67 |
| Gemini 3.5 Transcribe | 2.6% | 5.00 |
| GPT Transcribe | 3.3% | 4.50 |
| Voxtral Mini Transcribe 2 | 3.6% | 3.00 |
| Inworld STT 1 | 3.9% | 2.50 |
| GPT-4o Transcribe | 4.0% | 6.00 |
| Speechmatics Enhanced / Melia | 4.0% / 4.9% | 12.50 / 4.00 |
| Chirp 3 | 4.3% | 16.00 |
| GPT-4o Mini Transcribe | 4.5% | 3.00 |

AA-WER is mostly English too. For multilingual results, Microsoft claims **#1 on FLEURS with 5.2% average WER across 60 languages** (https://microsoft.ai/models/mai-transcribe-2/, 2026-09-03). That is a vendor claim. A third-party page (https://maitranscribe2.com/, unverified) repeats FLEURS figures as told-language / guessed-language WER: MAI-2 5.2%, Scribe v2 6.2/6.5%, Gemini 3.5 Transcribe 5.9/8.6%, GPT-Transcribe 10.4/10.6%, Whisper v3 Large 22.8/23.5%.

### LLM: which vals benchmarks fit the parse task
Benchmark catalog: https://www.vals.ai/benchmarks (pulled 2026-10-06).

- **None measures instruction-following, JSON or schema adherence, or date/time arithmetic.**
- **MGSM** (multilingual math) is the only multilingual benchmark. It was last updated **2026-01-09**, has only older models, and vals calls it "reaching saturation" (https://www.vals.ai/benchmarks/mgsm). Not useful for today's cheap models.
- **MedScribe** (updated 2026-09-29, https://www.vals.ai/benchmarks/medscribe) has models turn transcripts into structured SOAP notes. It is the closest analogue to "transcript → structured reminder", though it is English and long-form.
- **Public Benefits Bench** and **SAGE** are weaker proxies. MMLU Pro and LegalBench are general-knowledge measures.

Cheap-model rows from vals model pages (tested with reasoning **high/max**, not our `none`):

| Model | vals price in/out | Vals Index | MedScribe | SAGE | Public Benefits | Release |
|---|---|---|---|---|---|---|
| GPT-5.6 Luna (current) | $0.20/1.20 | 51.69% | 84.39% (#34) | 44.22% | 61.16% | 2026-07-09 |
| GPT-6 Luna | $0.10/0.50 | 51.22% (#25/43) | 83.71% (#41) | 48.09% | 57.65% | 2026-09-22 |
| MiMo V2.6 Flash | $0.14/0.28 | 53.23% (#17/43) | 85.28% (#28) | 43.53% | 67.59% (#12) | 2026-09-21 |
| GLM 5.3 Flash | $0.07/0.25 | 53.11% | **88.94% (#7/106)** | – | – | 2026-08-26 |
| DeepSeek V4.1 Flash | $0.30/1.20 | 51.32% (#23/43) | 85.50% (#25) | 47.88% | 64.28% | 2026-09-10 |
| Gemini 3.8 Flash | $1.50/7.50 | 54.83% | 84.50% | 35.06% | 65.29% | 2026-09-02 |
| Gemini 3.5 Flash Lite | $0.30/2.50 | 51.85% | **70.89% (#90)** | 47.30% | 51.83% | 2026-07-21 |

Sources: https://www.vals.ai/models/openai_gpt-5.6-luna, https://www.vals.ai/models/openai_gpt-6-luna, https://www.vals.ai/models/xiaomi_mimo-v2.6-flash, https://www.vals.ai/models/zai_glm-5.3-flash, https://www.vals.ai/models/deepseek_deepseek-v4.1-flash, https://www.vals.ai/models/google_gemini-3.8-flash, https://www.vals.ai/models/google_gemini-3.5-flash-lite.

What the table shows:
- The cheap tier sits **within about ±2 points** of the current model on MedScribe; vals' error bars are ~±2.
- GLM 5.3 Flash stands out on MedScribe.
- Gemini 3.5 Flash-Lite is clearly weaker at structured transcription.

**Price discrepancies (flag):** vals' prices don't always match OpenRouter:
- Gemini 3.8 Flash: $1.50/$7.50 on vals vs $0.75/$3.75 on OpenRouter.
- GLM 5.3 Flash: $0.07/$0.25 on vals vs $0.15/$0.50 on the Z.AI endpoint ($0.075/$0.25 on DeepInfra).
- DeepSeek V4.1 Flash: $0.30/$1.20 on vals vs $0.15/$0.60 on the DeepSeek endpoint.

Use the OpenRouter prices.

**Multilingual (not vals):** Gemini models top the Artificial Analysis Multilingual Index, including Hindi, Bengali and Swahili (https://artificialanalysis.ai/models/multilingual). The cheap models above weren't visible in the excerpt we could read, so we have no third-party multilingual scores for them. That leaves our own bake-off as the only evidence.

---

## 2. OpenRouter availability and price

### STT models (`GET /api/v1/models?output_modalities=transcription`, 24 models)
STT IDs aren't in the default `/models` list. All of these use `POST /api/v1/audio/transcriptions`.
- **Accepted formats:** wav/mp3/flac/m4a/ogg/webm/aac, but "support varies by provider."
- **Detected language:** only with `response_format: "verbose_json"`, and only where the provider returns it. `openai/gpt-4o-transcribe` and `microsoft/mai-transcribe-1.5` reject `verbose_json` with a 400.
- **Routing:** requests are load-balanced by price across providers, and per-request `order`/`only` routing **is not applied** on this endpoint.

Docs: https://openrouter.ai/docs/guides/overview/multimodal/stt and https://openrouter.ai/blog/tutorials/transcription-on-openrouter/ (2026-09-24).

| OpenRouter ID | Provider(s) | $/min | Languages / LID | Notes |
|---|---|---|---|---|
| openai/gpt-4o-mini-transcribe (current) | OpenAI | list $0.003; **measured $0.00215** (bake-off, 4.1 s avg clip) | ~50+, auto | Token-priced; `verbose_json` support not confirmed |
| openai/whisper-1 (fallback) | OpenAI | $0.006 (measured $0.0068) | 50+ | Per second |
| **microsoft/mai-transcribe-2** | Azure | **$0.00167** ($0.10/hr, "limited time" to end of 2026) | **60 incl. he, ur, sw, fa, bn, hi, th, vi**; auto LID, code-switching | Supports `verbose_json` with `language` (OpenRouter docs example). Model card lists **WAV/MP3/FLAC input only**: AAC needs testing. Microsoft Learn calls it **public preview, not for production**. |
| **openai/whisper-large-v3-turbo** | DeepInfra ($0.0002), Groq ($0.00067) | **$0.0002** | 99, auto | VoiceCodeBench 57.0%. Whisper hallucinates on silence. |
| openai/whisper-large-v3 | DeepInfra ($0.00045), Together, Groq | $0.00045 | 99, auto | Weak on low-resource FLEURS (unverified 3rd-party: ~23% WER) |
| meta/muse-voice-transcribe-1.0 | Meta | $0.003 | 25 incl. ar, bn, he, hi (https://dev.meta.ai/docs/speech-to-text) | AA streaming WER 3.1%; no Urdu/Swahili confirmed |
| x-ai/grok-stt-1.0 | xAI | $0.00167 | Formatting list incl. ar, fa, hi; he/ur/sw not listed | OpenRouter lists 1.0 only (AA-WER 4.0%). 2.0 (2.3%) is xAI-direct. Unclear whether the OpenRouter slug routes to 2.0. |
| qwen/qwen3-asr-1.7b | DeepInfra | $0.00045 | 30 languages; **no he/ur/sw/bn** | Ruled out by language coverage |
| mistralai/voxtral-mini-transcribe | Mistral | $0.003 | **13 languages** | Ruled out |
| deepgram/nova-3 | Deepgram | $0.0043 | multilingual, auto LID | More expensive |
| openai/gpt-transcribe | OpenAI | $0.0045 | multi | More expensive |
| google/gemini-3.5-transcribe | Google AI Studio | token-priced (~$0.005 per AA) | multi | More expensive |
| google/chirp-3 | Vertex | $0.016 | 100+ | Much more expensive |
| assemblyai/universal-3-5-pro | AssemblyAI | $0.0075 on OR | 18 languages | Last on VoiceCodeBench |
| microsoft/mai-transcribe-1.5 | Azure | $0.006 | 43 | Superseded by MAI-2 |

Unit check: `pricing.prompt` is $/second for duration models. MAI-2's value of `0.1` is per hour; OpenRouter's docs example bills 6.4 s at $0.000178, which matches $0.10/hr.

**Gemini audio-in via chat (architecture idea, unverified accuracy).** `google/gemini-3.5-flash-lite` takes audio at $0.30/M tokens on `/chat/completions`. One call could transcribe *and* parse, removing a network hop. That needs its own test.

### LLM candidates (OpenRouter endpoints API, standard tier)
All support `response_format`/`structured_outputs` on the main endpoints.
- OpenRouter's live latency fields were `null` in the API, and Artificial Analysis latency figures are for **reasoning max/high** (e.g. GPT-6 Luna max TTFT 96 s, MiMo 5.2 s, Gemini 3.5 Flash-Lite 9.3 s). So **no published latency matches our `reasoning: none`, 3.8k-in/90-out call. It must be measured.**
- OpenAI and Google also list cheaper `flex` and pricier `fast`/`priority` endpoints. Flex is the slow queue, so make sure we don't land on it.

| ID | $/M in | cached in | cache write | $/M out | Providers | Notes |
|---|---|---|---|---|---|---|
| openai/gpt-5.6-luna (current) | 0.20 | 0.02 | 0.25 | 1.20 | OpenAI, Azure, Bedrock | AA marks it deprecated ("newer release GPT-6 Luna") |
| **openai/gpt-6-luna** | 0.10 | 0.01 | 0.125 | 0.50 | OpenAI, Azure, Bedrock (+flex $0.05, fast $0.20) | Same family; AA says roughly half GPT-5.6 Luna's price (https://artificialanalysis.ai/articles/gpt-6-sol-and-luna-push-the-cost-efficiency-frontier, 2026-09-22) |
| **xiaomi/mimo-v2.6-flash** | 0.14 | 0.0028 | – | 0.28 | Xiaomi, DeepInfra, Novita, GMICloud, Io Net, Darkbloom, Venice | 1-day uptime 95–99%; slow decoding (55 t/s, AA) |
| **z-ai/glm-5.3-flash** | 0.075 (DeepInfra) – 0.15 (Z.AI) | 0.015–0.03 | – | 0.25–0.50 | ~25 providers | Pin a good provider; quality can vary by host |
| **deepseek/deepseek-v4.1-flash** | 0.15 (DeepSeek) | 0.003 | – | 0.60 | ~30 providers | DeepSeek endpoint has implicit caching |
| qwen/qwen3.8-flash | 0.15 | 0.016 | 0.20 | 0.47 | Alibaba only | No vals data; reserve |
| mistralai/mistral-small-2603 | 0.15 | 0.015 | – | 0.60 | Mistral | No vals data; reserve |
| google/gemini-3.1-flash-lite | 0.25 | 0.025 | – | 1.50 | Google | Not cheaper; strong multilingual pedigree but weak MedScribe for 3.5 FL |
| anthropic/claude-haiku-4.5 | 1.00 | 0.10 | 1.25 | 5.00 | Anthropic, Bedrock, Azure, Vertex | ~4–5× today's cost; excluded |
| meta/muse-spark-1.3-contributor | 0.10 | 0.002 | – | 0.20 | Meta | "contributor" tier probably means data sharing (**unverified**); avoid for user voice data |

---

## 3. Direct-provider STT (each would need a new account and key)

| Provider / model | Price | Multilingual / LID | Source (date) |
|---|---|---|---|
| Azure MAI-Transcribe-2 | $0.10/hr ($0.00167/min), limited time | 60 languages, auto LID | microsoft.ai model page (2026-09-03). Same price via OpenRouter, so no reason to go direct. |
| Speechmatics Melia (batch) | $0.129/hr ($0.00215/min) | multilingual | usagepricing.com (unverified date) |
| AssemblyAI Universal-2 / Universal-3.5 Pro | $0.15/hr / $0.21/hr; per second, no minimum | U-2 multilingual with LID; U-3.5 Pro 18 languages | cekura.ai, verified against assemblyai.com 2026-09-08 |
| ElevenLabs Scribe v2 | $0.22/hr ($0.0037/min) | 90+, LID; AA-WER 2.2% | https://elevenlabs.io/pricing/api. **Our ElevenLabs account was disabled during the bake-off.** |
| Deepgram Nova-3 Multilingual | ~$0.0052/min pre-recorded | 45+, auto detect | Gladia blog / deepgram.com/pricing (page partly garbled) |
| Google Chirp 3 | $0.016/min | 100+ with LID | AA table |
| Azure standard batch | $0.18/hr | multilingual | https://azure.microsoft.com/en-us/pricing/details/speech/ |

None beats MAI-Transcribe-2 through OpenRouter on price, and the per-reminder differences are fractions of a hundredth of a cent. **Recommendation: no new accounts.**

---

## 4. Cost per reminder

Assumptions:
- 5 s of audio.
- Parse prompt of 3,800 tokens: 3,500-token static prefix (cacheable) + 300 dynamic, and 90 output tokens.
- **Warm** = prefix served from cache. **Cold** = first call after the cache expired (OpenAI charges a 25% cache-write premium).

Our bake-off measured **$0.000251 per parse** (3,863 in / 92 out, 398 parses run back to back), which matches the "warm" row. Production with sparse traffic will often be cold.

**Prompt caching** is listed by OpenRouter for: OpenAI (automatic, ≥1024-token prefix), DeepSeek (implicit), Xiaomi/DeepInfra/Z.AI (cache-read prices listed), Gemini (implicit).

### STT (5 s)
| Model | $/reminder | vs today |
|---|---|---|
| gpt-4o-mini-transcribe (today, measured) | $0.00018 | – |
| whisper-1 fallback (rare) | $0.00050 | – |
| mai-transcribe-2 | $0.00014 | −22% |
| whisper-large-v3 (DeepInfra) | $0.000037 | −79% |
| whisper-large-v3-turbo (DeepInfra) | $0.000017 | −91% |
| muse-voice-transcribe-1.0 | $0.00025 | +39% (accuracy play) |

### Parse
| Model | warm | cold | vs today (warm) |
|---|---|---|---|
| gpt-5.6-luna (today) | $0.000238 | $0.00104 | – |
| gpt-6-luna | $0.000110 | $0.00051 | −54% |
| mimo-v2.6-flash | $0.000077 | $0.00056 | −68% |
| deepseek-v4.1-flash (DeepSeek) | $0.000110 | $0.00062 | −54% |
| glm-5.3-flash (DeepInfra / Z.AI) | $0.000097 / $0.000195 | $0.00031 / $0.00062 | −59% / −18% |

### Total per server-side reminder (warm)
| Setup | Cost |
|---|---|
| Today: mini-transcribe + GPT-5.6 Luna | **~$0.00042** |
| MAI-Transcribe-2 + GPT-6 Luna | ~$0.00025 (−40%) |
| whisper-large-v3 + MiMo V2.6 Flash | ~$0.00011 (−73%) |
| whisper-large-v3-turbo + MiMo V2.6 Flash | ~$0.00009 (−78%) |

At 10,000 server-side reminders/month, today's setup costs ~$4–10 (warm vs cold), and the cheapest stack ~$1–6.

---

## 5. Shortlists for our bake-off (all testable now with the existing OpenRouter key)

### STT
1. **microsoft/mai-transcribe-2.** Covers every weak language we have (he, ur, sw, fa, bn, hi), has auto-LID, returns `language`, has the best published WER, and is the cheapest high-accuracy option. Check two things: (a) whether it accepts our AAC, or whether the server must send m4a/mp3; (b) its preview status, and that the price is promotional until end of 2026.
2. **openai/whisper-large-v3-turbo.** Roughly 10× cheaper than today. Whisper-1 was the most noise-robust model in our bake-off (no drop from clean to moderate noise). Watch for hallucinations on silence and for Hindi/Urdu script swaps.
3. **openai/whisper-large-v3.** The same idea with a larger model; check whether it helps on low-resource languages.
4. **meta/muse-voice-transcribe-1.0.** An accuracy check at today's list price; it covers Hebrew and Bengali.
5. Baseline: the current **gpt-4o-mini-transcribe**, with gpt-4o-transcribe kept as a Hebrew control.

### Parse
1. **openai/gpt-6-luna.** A drop-in successor at half the price, with vals scores equal within error. Check that `reasoning_effort: "none"` works and that latency stays at or under today's 1–1.9 s.
2. **xiaomi/mimo-v2.6-flash.** Cheapest warm cost and the best Public Benefits score of the group. The risks are latency (slow decoding; thinking must be disabled) and provider uptime (95–99%).
3. **z-ai/glm-5.3-flash.** The best MedScribe result among cheap models (88.94%, #7). Pin a provider (DeepInfra or Z.AI).
4. **deepseek/deepseek-v4.1-flash.** Solid across the board, with very cheap cache reads on DeepSeek's own endpoint.
5. Baseline: **openai/gpt-5.6-luna**.

Score each against the bake-off guard (lang, date, time). Add specific checks for "halb drei" (14:30), Swahili hours, and the Hindi/Urdu/Persian/Hebrew `lang` tag. Record p50/p90 latency, cold and warm.

## Not verified / open questions
- MAI-Transcribe-2's AAC acceptance through OpenRouter, its 2027 price, and its production SLA (Azure says preview).
- Whether `x-ai/grok-stt-1.0` on OpenRouter routes to Grok Transcribe 1.0 or 2.0.
- Latency at `reasoning: none` for every LLM candidate: no published source matches our call shape.
- Whether gpt-4o-mini-transcribe returns `language` under `verbose_json` on OpenRouter.
- What the Meta "contributor" tier means for data use.
- How long OpenRouter keeps routing to the same provider (cache warmth) for non-OpenAI models.
- Third-party FLEURS numbers on maitranscribe2.com, and the Deepgram multilingual price (garbled page).
