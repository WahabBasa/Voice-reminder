# Cheaper image model for Remi screenshots — bake-off (2026-10-08)

Baseline: `openai/gpt-5.4-image-2`, 2K 9:16, ~$0.29/shot (`out/gen_costs.log`), 1440x2560.
Test: the exact production prompts + reference images from `gen_or_shots.py` (frozen copy in `gen_snapshot.py`):
**(a)** es-MX `02-voice` (ref `renders/02-recording.png`), **(b)** pt-BR `07-birthday` (ref `renders/01-lockscreen.png`).
Endpoint `POST /api/v1/images` with `input_references`, 9:16, one attempt each; all 10 calls succeeded first try.
**Total spend: $0.3575** (cap $1.50). Per-call log: `calls.json`. Sheet: `compare.png`.

Shortlist rationale (live OpenRouter pricing, `models.json`): Flare = cheap sibling of the current GPT family, 16 refs; Nano Banana 2.1 = new Google model at half NB2's token rate, strong text; Seedream 5 Flash = cheapest flat price with 14 refs; Qwen Image 3 = known for text rendering, 4 refs. Skipped: FLUX 3 ($0.10 at 2K), MAI 2.6 Flash (768-wide output), Riverflow/Recraft (ref limits / design-oriented).

## Scores (1-5; baseline = 5 on every criterion)

Criteria: **C1** headline exact + blue phrase + heavy geometric sans · **C2** phone UI faithful · **C3** bubble/chip text exact, nothing extra · **C4** style/composition matches set · **C5** resolution for 1290x2796

| Model (config) | $/shot (actual) | Native size | C1 | C2 | C3 | C4 | C5 | Sum | Notes |
|---|---|---|---|---|---|---|---|---|---|
| `openai/gpt-image-2.5-flare` medium | **$0.023** | 864x1536 | 5 | 4 | 5 | 5 | 3 | **22** | All text exact incl. á/ã/ç/é. Serif list titles kept like the app. es: bus emoji mangled, a faint ghost "(2) ˅" row peeks under the list (from the ref's "COMPLETE (2)"), 3 deco bubbles. pt: cleanest layout of all, bubble clear of the digits. Needs 1.49x upscale: soft, slight halo on the headline. |
| `openai/gpt-image-2.5-flare` high | $0.047 | 864x1536 | 5 | 4 | 5 | 4 | 3 | 21 | Same text accuracy, better emoji. es keeps ghost "LETE (2)" from the ref. pt: bubble tail touches the last "0" of 9:00. Same 864px limit, so "high" buys little. |
| `google/gemini-nano-banana-2.1` 2K | $0.057 | 1536x2752 | 3 | 3 | 5 | 3 | 5 | 19 | Bubble text exact. pt: "o" left navy (whole line should be blue). es: list titles switched to sans (app uses serif), clock 9:19/battery 25, 4 deco bubbles (basket, calendar copied from ref). pt: extra bell + gift icons, bubble covers the end of "9:00". Lighter headline weight. |
| `bytedance-seed/seedream-5-0-flash` 2K | **$0.018** | 1152x2048 | 4 | 3 | 4 | 3 | 4 | 18 | Text spelled right. Headline weight lighter (semibold, not ExtraBold). es: sans list titles, red bus, blob-shaped mystery decorations, ghost "IE (0)" text. pt: bubble covers the second "0" of 9:00; "dela." oddly indented. |
| `qwen/qwen-image-3` 2K | $0.033 (+$0.003/ref) | 1152x2048 | 1 | 3 | 1 | 4 | 4 | 13 | es fine, but pt fails: "escqueça", "anivervàrio", "Hojé", "aniverwáhio". Disqualified for accented locales. |
| *baseline* `openai/gpt-5.4-image-2` | $0.29 | 1440x2560 | 5 | 5 | 5 | 5 | 5 | 25 | — |

## Recommendation

**`openai/gpt-image-2.5-flare` at `quality: "medium"`, about $0.023/shot (~8% of $0.29, 12x cheaper).** It is the only cheap model that got every string exact in both locales and kept the set's look (same family as the current model, so it sits next to the existing shots). Use `/api/v1/images` with `input_references`, `aspect_ratio: "9:16"`.

Caveats:
- **Resolution is the real gap.** Flare returns 864x1536 at 9:16 (no `resolution`/`size` option listed on OpenRouter), so `export_ppo.py` upscales 1.49x instead of downscaling. Headline and bubbles look slightly soft with a faint halo at full size. Fine for thumbnails, visibly less crisp than the baseline when zoomed. Options: run a 2x upscaler (e.g. Real-ESRGAN) before export, or keep the $0.29 model for the final hero set and use Flare for drafts and locale variants.
- Small UI drift (emoji, ghost text from the reference's "COMPLETE (2)" row). Cropping/cleaning `renders/02-recording.png` so it has no half-hidden row would likely fix the ghost for every model.
- "high" doubles the price without fixing the resolution; not worth it.
- One sample per prompt: re-run 2-3 more slots before switching the whole pipeline.

Runner-ups: **Nano Banana 2.1** ($0.057) if native 2K resolution matters more than fidelity, but it drifted on headline colour and invented UI details. **Seedream 5 Flash** ($0.018) is the cheapest, with accurate spelling but a lighter headline and weaker UI fidelity. **Qwen Image 3**: not usable for pt-BR/es-MX.

Files: `bakeoff.py` (runner), `gen_snapshot.py` (frozen prompt source), `list_models.py` + `models.json` (pricing), `sheet.py` → `compare.png`, `baseline/` (copies of the current renders), `<config>/{es-voice,pt-bday}.png`.
