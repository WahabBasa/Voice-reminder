# Keyword rankings

Where Remi (App Store id `6801797784`) shows up in App Store search, per keyword and country. Apple doesn't publish organic search terms, so rank is our proxy for which keywords can bring organic downloads.

| File | What |
|---|---|
| `keywords.json` | The keyword set: each term, its language, where it came from, and (optionally) a country override |
| `rank_check.py` | The checker. Reads `keywords.json`, writes a CSV |
| `2026-11-03_baseline.csv` | Baseline, taken two days after 1.0.4 went live (en-US title "Remi: Talking Alarm Clock"), before the new screenshots |

## Method

- For each (keyword, country) pair, call the iTunes Search API: `https://itunes.apple.com/search?term=<t>&country=<cc>&entity=software&limit=200` (iPhone apps).
- `remi_rank` = 1-based position of trackId 6801797784 in the results. `>200` = not in the top 200. If the API returned fewer than 200 results and Remi isn't among them, it says `>N` (N = result count). `not_listed` = Remi isn't sold in that storefront (checked first with `/lookup?id=...&country=...`).
- `results_count` = number of results the API returned (capped at 200). A low number means a thin, low-competition term.
- `top1..top3` = the first three apps, with their rating count in brackets, to show how crowded the term is.
- `source` = where the term came from, `;`-joined when more than one: `title` (name/subtitle, plus obvious phrases built from them), `asc_keywords` (the live version's keyword field), `apple_ads` (Apple Ads exact-match keyword lists), `docs` (`docs/aso/research/`: the BR/MX campaign plan, the DE and AR user-voice reports).
- Throttled to 15 requests/min (4 s apart). On 403/429/5xx it backs off 60/120/240/480 s and retries.

## Countries per language

| Language | Countries |
|---|---|
| en | US, GB, AU, AE, CH, FR (+ SE for the English terms the SE Apple Ads campaign bids on) |
| pt | BR |
| es | MX, US (es-MX is indexed on the US storefront) |
| de | DE, CH |
| ar | AE |
| sv | SE |
| brand (`remi`) | all ten |

No French terms exist in our docs, so FR only gets the English set.

## Caveats

- **The Search API is not the App Store search.** Its order is close to, but not the same as, what a phone shows: no personalisation, no Apple Ads slot, no spelling correction or suggestion expansion, and its index can lag the store by a day or so. Treat ranks as approximate and compare runs with each other, not with a phone screenshot.
- Rank isn't volume. A #1 rank on a term nobody types brings nothing. Cross-check against Apple Ads search popularity / impression data.
- Results are capped at 200, so `results_count` can't separate "crowded" from "very crowded".
- A storefront's results use the localizations Apple indexes for it (e.g. US indexes en-US + es-MX). Our ar-SA, de-DE, pt-BR localizations only matter where Apple indexes them.
- One snapshot. Ranks move daily; for a trend, rerun at the same time of day a few times.

## Rerun

```
cd C:\Dev\VR\docs\aso\rankings
python rank_check.py --dry-run                 # see the planned requests
python rank_check.py                           # writes <today>_check.csv
python rank_check.py --out 2026-12-01_after-screenshots.csv
python rank_check.py --only-country DE         # one storefront
```

- Standard library only (Python 3.8+). About 435 requests, so ~30 min at 15/min.
- If it's interrupted, run the same command again: it resumes from `<out>.partial.jsonl`.
- To change the set, edit `keywords.json`. Add `"countries": [...]` to a keyword to override its language's default countries. When the ASC keyword field or Apple Ads lists change, add the new terms here (keep the old ones so runs stay comparable).
