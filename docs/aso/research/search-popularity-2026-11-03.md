# Search popularity of Remi's low-competition keywords (2026-11-03)

The question: of the terms where Remi could rank #1 cheaply, which ones do people actually search? That decides where to "dominate, then run ads".

**Short answer:** almost none of them have searchers we can measure. Apple gives every one of the 145 candidate terms the lowest possible score. Over a week of exact-match ads, only **DE `zeitansage`** combined real searches with low competition. **SE `medicinpåminnelse`** is the only other low-competition term with a single impression. Everything else with a low competitor count is either unproven or got 0 impressions.

**Head terms are where the volume is.** See "Head terms" below. Apple scores CH `wecker`, `erinnerungen` and `alarm` at 3/5, and those three are the recommended Switzerland campaign.

## Where the numbers come from

**1. Apple's search popularity: the Apple Ads Platform API (`api.ads.apple.com/v1`), not Campaign Management v5.** Two endpoints were tried. Both are query-only POSTs.

- `POST /v1/insights/apps/search-term-popularity/query` is the real 1–5 score, the same "Search Popularity" the Apple Ads UI shows. It returns only the **top 500 terms per genre per country**. Data runs to Sept 2026 (monthly) and the week of 10-18 (weekly); October monthly and the latest week come back empty.
  - Of the 145 (country, term) pairs, **none** is in any genre's top 500 for its country, in Sept or the 10-11/10-18 weeks. The only hits were the wrong-intent fragments `tarjeta` (MX, finance, 3) and `idoso` (BR, food & drink, 2).
  - The lowest-ranked term in every list still scores **3/5** (searchPopularity1to100 41–59). Health & Fitness and Productivity/Utilities, all 10 countries, Sept: a filter for `1to5 <= 2` returns 0 rows.
  - So a term that's absent scores **1 or 2 out of 5**. The API can't say which. The table writes this as **≤2**.
  - For scale, the head terms around us: `alarm clock` 3–4 (US/GB/AU/SE/AE), `wecker` 4 (DE), `منبه` 3 (AE), `väckarklocka` 3 (SE), `reminders` 4 (US/GB), `recordatorios` 4 (MX), `despertador` 3–4 (MX/BR).
- `POST /v1/suggestions/keywords/query` with a seed term (`terms IN [...]`, `countriesOrRegions`) is **useless for lookups**. It echoes back the seed with popularity 5 (on its 0–100 scale) for anything:
  - The control `xqzvbn plorft` (US) returned 5.
  - So did `zebra talking toaster` (DE).
  - So did `alarm clock` (US), which the popularity endpoint puts at 57/100.
  - It returns a real score only for terms in its suggestion set, such as `wecker` 54 (DE), `reminder` 44 and `medication reminder` 36 (US), `despertador` 31 (MX), and `memo`/`alert`/`nudge`/`tarjeta`, which are wrong intent. Every candidate came back at the 5 default, so this endpoint adds no signal.
- `POST /v1/suggestions/phrases/query` (SEARCH route) returned 0 rows for every phrase, including `alarm`. The SUGGESTION route rejected our app ID ("not found or access denied").

**2. Our own delivery** (`metrics_1103.json`, refreshed today, read-only), exact match, $1.20 bids, $1.30–1.50/day:

| Campaign | Live during 10-28 → 11-03 | Impressions | Taps |
|---|---|---|---|
| DE | 10-28 → paused 11-01 evening (~4.5 days) | 7 | 1 |
| AE | 10-28 → paused 11-01 evening (~4.5 days) | 3 | 0 |
| GB | created 11-01 evening (~1.5 days) | 5 | 0 |
| SE | created 11-01 evening (~1.5 days) | 4 | 0 |
| AU | created 11-01 evening (~1.5 days) | 2 | 0 |
| BR, MX | on hold | 0 | 0 |

**How thin this is:**
- There were 21 impressions in total.
- A 0 over ~4.5 days (AE/DE) says "fewer than one search a day that we could win". It doesn't say nobody searches.
- A 0 over ~1.5 days (GB/AU/SE) says almost nothing.
- A $1.20 bid can also lose an auction, but on terms this niche there are few rival bidders, so a 0 is mostly a demand signal.
- CH, FR, US, BR and MX have no running campaign, so those rows have no ad evidence at all.

**3. Competition and rank** come from `rankings/2026-11-03_baseline.csv` (iTunes Search API, top ~200, one snapshot).

**Candidate set:**
- Every baseline row with fewer than 60 results or Remi in the top 10.
- The new terms from proposal §8: spoken, nag, alert, memo, senior/elderly, compromisso, idoso, parlante, olvidadizo, pago/tarjeta, uhrzeit, sprachausgabe, يتكلم, منبه بصوت عالي, the sv set, and natural phrases built from them.
- The live ad terms in each storefront.

## Verdicts

- **worth owning:** ads proved people search it, and competition is low (<60 results) or the term is a direct product match.
  - "via ads only" means searched but crowded (150+ results): fine for an exact-match bid, but no metadata dominance.
- **tiny:** no evidence either way. Popularity ≤2 and no ad impressions yet, or no campaign. Owning it through metadata is free, but don't spend ad money on it.
- **dead:**
  - "0 impressions in ~4.5 live days" (AE/DE exact match): nobody to win.
  - "keyword-field fragment": a single word that only works as keyword-field glue. Nobody searches it alone with our intent, and the ones with volume (`memo`, `alert`, `nudge`, `tarjeta`, `pago`, `idoso`) mean something else.

## Table

`popularity`: 1–5 from Apple's search-term-popularity data; `≤2` = not in the top 500 for any genre in that country (Sept 2026 + weeks of 10-11 and 10-18). `competitors` = baseline `results_count`. `Remi rank` from the baseline (`>N` = absent from N results). `impressions` = our exact-match impressions 10-28→11-03 and how long that campaign actually ran; `not bid` = that country had a campaign but not this keyword.

| country | term | popularity | competitors | Remi rank | our ad impressions 10-28→11-03 | verdict |
|---|---|---|---|---|---|---|
| AE | alarm with voice | ≤2 | 50 | >50 | not bid (AE live) | tiny: unproven, below popularity floor |
| AE | speaking alarm clock | ≤2 | 44 | 19 | 0 (~4.5d) | dead: 0 impressions in ~4.5 live days |
| AE | talking alarm clock | ≤2 | 183 | >183 | 0 (~4.5d) | dead: 0 impressions in ~4.5 live days |
| AE | voice reminder | ≤2 | 180 | >180 | 0 (~4.5d) | dead: 0 impressions in ~4.5 live days |
| AE | الساعه الناطقه | ≤2 | 1 | 1 | 0 (~4.5d) | dead: 0 impressions in ~4.5 live days |
| AE | المنبه الناطق | ≤2 | 12 | 5 | not bid (AE live) | tiny: unproven, below popularity floor |
| AE | الناطقه | ≤2 | 3 | 2 | not bid (AE live) | dead as a search: keyword-field fragment |
| AE | تذكير صوتي | ≤2 | 195 | >195 | 0 (~4.5d) | dead: 0 impressions in ~4.5 live days |
| AE | تذكير صوتي بالعربي | ≤2 | 12 | 5 | not bid (AE live) | tiny: unproven, below popularity floor |
| AE | تطبيق ذكرني | ≤2 | 41 | 39 | not bid (AE live) | tiny: unproven, below popularity floor |
| AE | ذكرني بالصوت | ≤2 | 7 | 6 | 0 (~4.5d) | dead: 0 impressions in ~4.5 live days |
| AE | ساعة ناطقة | ≤2 | 0 | >0 | 0 (~4.5d) | dead: 0 impressions in ~4.5 live days |
| AE | صوتي | ≤2 | — | not in baseline | not bid (AE live) | dead as a search: keyword-field fragment |
| AE | منبه الوقت الناطق | ≤2 | 4 | 4 | 0 (~4.5d) | dead: 0 impressions in ~4.5 live days |
| AE | منبه الوقت بالصوت | ≤2 | 12 | 6 | 0 (~4.5d) | dead: 0 impressions in ~4.5 live days |
| AE | منبه بصوت عالي | ≤2 | 13 | >13 | not bid (AE live) | tiny: unproven, below popularity floor |
| AE | منبه صوتي | ≤2 | 189 | 73 | 0 (~4.5d) | dead: 0 impressions in ~4.5 live days |
| AE | منبه ناطق | ≤2 | 14 | 5 | 0 (~4.5d) | dead: 0 impressions in ~4.5 live days |
| AE | منبه ناطق بالعربي | ≤2 | 2 | 1 | 0 (~4.5d) | dead: 0 impressions in ~4.5 live days |
| AE | منبه يتكلم | ≤2 | 1 | >1 | not bid (AE live) | tiny: unproven, below popularity floor |
| AE | ناطقه | ≤2 | 8 | 3 | not bid (AE live) | dead as a search: keyword-field fragment |
| AE | نطق الوقت | ≤2 | 23 | 15 | 0 (~4.5d) | dead: 0 impressions in ~4.5 live days |
| AE | يتكلم | ≤2 | — | not in baseline | not bid (AE live) | dead as a search: keyword-field fragment |
| AU | hourly chime | ≤2 | 160 | >160 | 2 (~1.5d) | worth owning via ads only: searched, but 160 rivals |
| AU | speaking clock | ≤2 | 165 | 101 | 0 (~1.5d) | tiny: 0 so far, window too short |
| AU | talking alarm clock | ≤2 | 177 | 39 | 0 (~1.5d) | tiny: 0 so far, window too short |
| AU | talking clock | ≤2 | 172 | 88 | 0 (~1.5d) | tiny: 0 so far, window too short |
| BR | alarme com voz | ≤2 | 23 | >23 | no campaign | tiny: unproven, below popularity floor |
| BR | compromisso | ≤2 | — | not in baseline | no campaign | dead as a search: keyword-field fragment |
| BR | despertador falante | ≤2 | 181 | >181 | no campaign | tiny: unproven, below popularity floor |
| BR | despertador para idoso | ≤2 | — | not in baseline | no campaign | tiny: unproven, below popularity floor |
| BR | idoso | 2 (food_drink) | — | not in baseline | no campaign | dead as a search: keyword-field fragment (big but wrong intent) |
| BR | lembrete de compromisso | ≤2 | — | not in baseline | no campaign | tiny: unproven, below popularity floor |
| BR | lembrete falado | ≤2 | 56 | 14 | no campaign | tiny: unproven, below popularity floor |
| BR | lembrete para tomar remédio | ≤2 | 50 | >50 | no campaign | tiny: unproven, below popularity floor |
| BR | lembrete por voz | ≤2 | 188 | 3 | no campaign | tiny: unproven, below popularity floor |
| BR | lembretes por voz | ≤2 | 188 | 3 | no campaign | tiny: unproven, below popularity floor |
| CH | akustische erinnerung | ≤2 | 0 | >0 | no campaign | tiny: unproven, below popularity floor |
| CH | alarm with voice | ≤2 | 51 | >51 | no campaign | tiny: unproven, below popularity floor |
| CH | ansagen | ≤2 | 49 | 31 | no campaign | dead as a search: keyword-field fragment |
| CH | erinnerung ansagen | ≤2 | 8 | 7 | no campaign | tiny: unproven, below popularity floor |
| CH | erinnerung mit sprache | ≤2 | 23 | >23 | no campaign | tiny: unproven, below popularity floor |
| CH | erinnerung vorlesen | ≤2 | 20 | >20 | no campaign | tiny: unproven, below popularity floor |
| CH | medikamentenwecker | ≤2 | 3 | 2 | no campaign | tiny: unproven, below popularity floor |
| CH | speaking alarm clock | ≤2 | 42 | 23 | no campaign | tiny: unproven, below popularity floor |
| CH | sprachansage | ≤2 | 10 | 7 | no campaign | tiny: unproven, below popularity floor |
| CH | sprachansage wecker | ≤2 | 2 | 2 | no campaign | tiny: unproven, below popularity floor |
| CH | sprachausgabe | ≤2 | — | not in baseline | no campaign | dead as a search: keyword-field fragment |
| CH | spracherinnerung | ≤2 | 6 | >6 | no campaign | tiny: unproven, below popularity floor |
| CH | sprechende erinnerung | ≤2 | 11 | 10 | no campaign | tiny: unproven, below popularity floor |
| CH | sprechende uhr | ≤2 | 190 | >190 | no campaign | tiny: unproven, below popularity floor |
| CH | sprechender wecker | ≤2 | 180 | 47 | no campaign | tiny: unproven, below popularity floor |
| CH | sprechender wecker senioren | ≤2 | 3 | >3 | no campaign | tiny: unproven, below popularity floor |
| CH | termin ansage | ≤2 | 1 | 1 | no campaign | tiny: unproven, below popularity floor |
| CH | termine ansagen | ≤2 | 1 | 1 | no campaign | tiny: unproven, below popularity floor |
| CH | uhrzeit | ≤2 | — | not in baseline | no campaign | dead as a search: keyword-field fragment |
| CH | uhrzeit ansage | ≤2 | 6 | >6 | no campaign | tiny: unproven, below popularity floor |
| CH | wecker für blinde | ≤2 | 4 | >4 | no campaign | tiny: unproven, below popularity floor |
| CH | wecker mit ansage | ≤2 | 1 | >1 | no campaign | tiny: unproven, below popularity floor |
| CH | wecker mit sprachansage | ≤2 | 0 | >0 | no campaign | tiny: unproven, below popularity floor |
| CH | wecker mit sprachausgabe | ≤2 | 0 | >0 | no campaign | tiny: unproven, below popularity floor |
| CH | zeitansage | ≤2 | 13 | 13 | no campaign | worth owning (free): same term as DE, 13 rivals; no CH ads to prove it |
| CH | zeitansage uhr | ≤2 | 9 | >9 | no campaign | tiny: unproven, below popularity floor |
| DE | akustische erinnerung | ≤2 | 0 | >0 | 0 (~4.5d) | dead: 0 impressions in ~4.5 live days |
| DE | ansagen | ≤2 | 47 | 41 | not bid (DE live) | dead as a search: keyword-field fragment |
| DE | erinnerung ansagen | ≤2 | 9 | 9 | 0 (~4.5d) | dead: 0 impressions in ~4.5 live days |
| DE | erinnerung mit sprache | ≤2 | 24 | >24 | 0 (~4.5d) | dead: 0 impressions in ~4.5 live days |
| DE | erinnerung vorlesen | ≤2 | 20 | >20 | not bid (DE live) | tiny: unproven, below popularity floor |
| DE | medikamentenwecker | ≤2 | 4 | 3 | 0 (~4.5d) | dead: 0 impressions in ~4.5 live days |
| DE | sprachansage | ≤2 | 10 | 10 | not bid (DE live) | tiny: unproven, below popularity floor |
| DE | sprachansage wecker | ≤2 | 2 | 2 | 0 (~4.5d) | dead: 0 impressions in ~4.5 live days |
| DE | sprachausgabe | ≤2 | — | not in baseline | not bid (DE live) | dead as a search: keyword-field fragment |
| DE | spracherinnerung | ≤2 | 6 | >6 | 0 (~4.5d) | dead: 0 impressions in ~4.5 live days |
| DE | sprechende erinnerung | ≤2 | 11 | 10 | 0 (~4.5d) | dead: 0 impressions in ~4.5 live days |
| DE | sprechende uhr | ≤2 | 186 | >186 | 0 (~4.5d) | dead: 0 impressions in ~4.5 live days |
| DE | sprechender wecker | ≤2 | 176 | >176 | 2 (~4.5d) | worth owning via ads only: searched, but 176 rivals |
| DE | sprechender wecker senioren | ≤2 | 3 | >3 | not bid (DE live) | tiny: unproven, below popularity floor |
| DE | termin ansage | ≤2 | 1 | 1 | not bid (DE live) | tiny: unproven, below popularity floor |
| DE | termine ansagen | ≤2 | 1 | 1 | 0 (~4.5d) | dead: 0 impressions in ~4.5 live days |
| DE | uhrzeit | ≤2 | — | not in baseline | not bid (DE live) | dead as a search: keyword-field fragment |
| DE | uhrzeit ansage | ≤2 | 6 | >6 | 0 (~4.5d) | dead: 0 impressions in ~4.5 live days |
| DE | wecker für blinde | ≤2 | 4 | >4 | not bid (DE live) | tiny: unproven, below popularity floor |
| DE | wecker mit ansage | ≤2 | 1 | >1 | 0 (~4.5d) | dead: 0 impressions in ~4.5 live days |
| DE | wecker mit sprachansage | ≤2 | 0 | >0 | 0 (~4.5d) | dead: 0 impressions in ~4.5 live days |
| DE | wecker mit sprachausgabe | ≤2 | 0 | >0 | 0 (~4.5d) | dead: 0 impressions in ~4.5 live days |
| DE | zeitansage | ≤2 | 12 | 12 | 2 (~4.5d) | worth owning: ads proved searches; 12 rivals; we're last (#12) |
| DE | zeitansage uhr | ≤2 | 9 | >9 | 0 (~4.5d) | dead: 0 impressions in ~4.5 live days |
| FR | alarm with voice | ≤2 | 42 | >42 | no campaign | tiny: unproven, below popularity floor |
| FR | speaking alarm | ≤2 | 157 | 7 | no campaign | tiny: unproven, below popularity floor |
| FR | speaking alarm clock | ≤2 | 39 | 7 | no campaign | tiny: unproven, below popularity floor |
| FR | time announcer | ≤2 | 57 | 22 | no campaign | tiny: unproven, below popularity floor |
| FR | time announcer app | ≤2 | 57 | 23 | no campaign | tiny: unproven, below popularity floor |
| GB | elderly | ≤2 | — | not in baseline | not bid (GB live) | dead as a search: keyword-field fragment |
| GB | hourly chime | ≤2 | 161 | >161 | 4 (~1.5d) | worth owning via ads only: searched, but 161 rivals |
| GB | nag | ≤2 | — | not in baseline | not bid (GB live) | dead as a search: keyword-field fragment |
| GB | nudge | ≤2 | — | not in baseline | not bid (GB live) | dead as a search: keyword-field fragment (big but wrong intent) |
| GB | senior | ≤2 | — | not in baseline | not bid (GB live) | dead as a search: keyword-field fragment |
| GB | speaking clock | ≤2 | 170 | 151 | 0 (~1.5d) | tiny: 0 so far, window too short |
| GB | spoken | ≤2 | — | not in baseline | not bid (GB live) | dead as a search: keyword-field fragment |
| GB | talking alarm clock | ≤2 | 169 | 114 | 0 (~1.5d) | tiny: 0 so far, window too short |
| GB | talking clock | ≤2 | 173 | 68 | 0 (~1.5d) | tiny: 0 so far, window too short |
| MX | alarma con voz | ≤2 | 28 | 7 | no campaign | tiny: unproven, below popularity floor |
| MX | alarma que habla | ≤2 | 181 | 15 | no campaign | tiny: unproven, below popularity floor |
| MX | despertador parlante | ≤2 | — | not in baseline | no campaign | tiny: unproven, below popularity floor |
| MX | olvidadizo | ≤2 | — | not in baseline | no campaign | dead as a search: keyword-field fragment |
| MX | pago | ≤2 | — | not in baseline | no campaign | dead as a search: keyword-field fragment (big but wrong intent) |
| MX | parlante | ≤2 | — | not in baseline | no campaign | dead as a search: keyword-field fragment |
| MX | recordatorio con voz | ≤2 | 65 | 1 | no campaign | tiny: unproven, below popularity floor |
| MX | recordatorio de pago | ≤2 | — | not in baseline | no campaign | tiny: unproven, below popularity floor |
| MX | recordatorio de pago de tarjeta | ≤2 | 21 | >21 | no campaign | tiny: unproven, below popularity floor |
| MX | recordatorio para tomar pastillas | ≤2 | 38 | >38 | no campaign | tiny: unproven, below popularity floor |
| MX | recordatorios con voz | ≤2 | 190 | 3 | no campaign | tiny: unproven, below popularity floor |
| MX | reloj parlante | ≤2 | — | not in baseline | no campaign | tiny: unproven, below popularity floor |
| MX | tarjeta | 3 (finance) | — | not in baseline | no campaign | dead as a search: keyword-field fragment (big but wrong intent) |
| SE | fröken ur | ≤2 | 180 | >180 | 1 (~1.5d) | worth owning via ads only: searched, but 180 rivals |
| SE | glömsk | ≤2 | — | not in baseline | not bid (SE live) | dead as a search: keyword-field fragment |
| SE | läkemedelspåminnelse | ≤2 | 6 | >6 | 0 (~1.5d) | tiny: 0 so far, window too short |
| SE | medicinpåminnelse | ≤2 | 61 | >61 | 1 (~1.5d) | worth owning: 1 impression in ~1.5 days; needs the sv locale + medicine word |
| SE | pillerpåminnelse | ≤2 | 11 | >11 | 0 (~1.5d) | tiny: 0 so far, window too short |
| SE | påminnelse med röst | ≤2 | 83 | >83 | 0 (~1.5d) | tiny: 0 so far, window too short |
| SE | röstlarm | ≤2 | 1 | >1 | 0 (~1.5d) | tiny: 0 so far, window too short |
| SE | röstpåminnelse | ≤2 | 3 | >3 | 0 (~1.5d) | tiny: 0 so far, window too short |
| SE | speaking alarm clock | ≤2 | 41 | 16 | 0 (~1.5d) | tiny: 0 so far, window too short |
| SE | talande alarm | ≤2 | 5 | >5 | 0 (~1.5d) | tiny: 0 so far, window too short |
| SE | talande klocka | ≤2 | 5 | >5 | 0 (~1.5d) | tiny: 0 so far, window too short |
| SE | talande väckarklocka | ≤2 | 5 | >5 | 0 (~1.5d) | tiny: 0 so far, window too short |
| SE | tidsangivelse | ≤2 | — | not in baseline | not bid (SE live) | dead as a search: keyword-field fragment |
| SE | time announcer | ≤2 | 58 | 28 | 0 (~1.5d) | tiny: 0 so far, window too short |
| SE | time announcer app | ≤2 | 58 | 33 | 0 (~1.5d) | tiny: 0 so far, window too short |
| SE | uppläsning | ≤2 | — | not in baseline | not bid (SE live) | dead as a search: keyword-field fragment |
| SE | väckarklocka med röst | ≤2 | 13 | >13 | 0 (~1.5d) | tiny: 0 so far, window too short |
| US | alarm for elderly | ≤2 | — | not in baseline | no campaign | tiny: unproven, below popularity floor |
| US | alarma con voz | ≤2 | 167 | 10 | no campaign | tiny: unproven, below popularity floor |
| US | alert | ≤2 | — | not in baseline | no campaign | dead as a search: keyword-field fragment (big but wrong intent) |
| US | elderly | ≤2 | — | not in baseline | no campaign | dead as a search: keyword-field fragment |
| US | memo | ≤2 | — | not in baseline | no campaign | dead as a search: keyword-field fragment (big but wrong intent) |
| US | nag | ≤2 | — | not in baseline | no campaign | dead as a search: keyword-field fragment |
| US | nag reminder | ≤2 | — | not in baseline | no campaign | tiny: unproven, below popularity floor |
| US | recordatorio con voz | ≤2 | 171 | 5 | no campaign | tiny: unproven, below popularity floor |
| US | recordatorios con voz | ≤2 | 172 | 1 | no campaign | tiny: unproven, below popularity floor |
| US | reminder for seniors | ≤2 | — | not in baseline | no campaign | tiny: unproven, below popularity floor |
| US | senior | ≤2 | — | not in baseline | no campaign | dead as a search: keyword-field fragment |
| US | spoken | ≤2 | — | not in baseline | no campaign | dead as a search: keyword-field fragment |
| US | spoken alarm | ≤2 | — | not in baseline | no campaign | tiny: unproven, below popularity floor |
| US | talking reminder | ≤2 | — | not in baseline | no campaign | tiny: unproven, below popularity floor |

### Ad terms that got impressions but sit outside the candidate set (crowded)

These are the only other terms with proven searches this week. They're for context: they show where real demand sits.

| country | term | competitors | Remi rank | impressions (taps) |
|---|---|---|---|---|
| GB | hourly chime | 161 | >161 | 4 |
| DE | hourly chime | n/a (not in DE baseline) | n/a | 2 |
| AU | hourly chime | 160 | >160 | 2 |
| SE | hourly chime | 154 | 89 | 1 |
| DE | sprechender wecker | 176 | >176 | 2 (1 tap) |
| AE | talking alarm | 171 | 69 | 2 |
| AE | voice reminder app | 175 | >175 | 1 |
| GB | talking time | 135 | 121 | 1 |
| SE | speaking alarm | 171 | >171 | 1 |
| SE | fröken ur | 180 | >180 | 1 |
| DE | pillenwecker | 179 | >179 | 1 |

- **`hourly chime`** is the most consistent searched term we bid on: 4 countries, 9 impressions. The top app there, "Hourly Chime - hourly reminder", has only 21 ratings in SE and AE.
- **`sprechender wecker` in DE.** Remi is absent from the top 176, even though the de-DE title is `Remi: Sprechender Wecker` (it ranks #1 on `termine ansagen` with that title). Worth a re-check in the next rank run.

## Ranked shortlist: demand plus low competition

1. **DE `zeitansage`** (and CH `zeitansage`, which shares the de-DE metadata). This is the only term where real searches meet low competition: 2 impressions in ~4.5 days, 12 competitors, and the leader has 22 ratings. We're last today (#12 of 12).
   - Metadata: the de-DE subtitle change in proposal §9 (`Spracherinnerung & Zeitansage`) targets exactly this.
   - Ads: re-enable a DE exact-match `zeitansage` keyword. The DE campaign is paused today.
2. **SE `medicinpåminnelse`.** 1 impression in ~1.5 days, 61 competitors, and the leader has 0 ratings. Owning it needs the sv locale plus the medicine word, which is the user's call (§6c/§7). Keep the SE exact-match bid running.
3. **Ads only, not dominance targets:** `hourly chime` (GB/AU/SE/DE) and AE `talking alarm`. Both are searched, but 150–170 apps compete, so metadata won't make us #1. They're the best exact-match bids we have, though.
4. **Already owned, but nobody searches.** We're #1–5 in AE (`منبه ناطق بالعربي`, `الساعه الناطقه`, `منبه الوقت الناطق`, `منبه ناطق`) and #1–3 in DE (`termine ansagen`, `sprachansage wecker`, `medikamentenwecker`). All got 0 impressions over ~4.5 days.
   - Dominance there is already done and worth almost nothing.
   - Don't spend ad money on them.
   - Keep them in metadata because they cost nothing.
5. **Unproven: BR/MX/US-Spanish `lembrete(s) por voz` (#3), `recordatorio(s) con voz` (#1–5), and SE `talande …`/`röst…` (1–13 competitors).**
   - The popularity score is ≤2 everywhere, and there's no usable ad data: BR and MX are on hold, and SE ran only 1.5 days.
   - The cheapest next step is to let the SE campaign run its full week, and to un-hold a $1/day MX or BR exact campaign on just the #1–3 terms.
   - Judge on 14 days of impressions before "dominating" them.

**Bottom line for "dominate low-competition countries, then advertise":** Apple's data says these niches sit below the 3/5 floor in every country we checked. Our week of ads confirms search volume there is on the order of zero to one search a day per term. Ranking #1 in those places will bring a handful of installs a month at most. The one exception with evidence is German `zeitansage`.

## Head terms: Switzerland first, France next (added after the user's 11-03 decision)

**What we know from earlier rounds:**
- The long-tail round (AE/DE/GB/AU/SE, 10-28→11-03) got 21 impressions and 0 installs. All five campaigns are now paused.
- The BR+MX head-term round (10-10→10-13) got 761 impressions, 30 taps and 12 installs at about $0.28 CPT. It bid on one-word category terms (`alarme`, `despertador`, `lembretes`, `alarma`, `recordatorios`) at $0.35–0.40.

**The user's decision:** $14 in total; 2–3 head terms; CH first (4 organic users there, and the de-DE listing has been live since 11-01); FR once a French listing ships in 1.0.5.

**Source: the API.**
- These scores are Apple's own 1–5 Search Popularity from `POST /v1/insights/apps/search-term-popularity/query`. Head terms do make the top-500 lists, so nobody needs to check the Apple Ads website.
- Columns are Sept 2026 (monthly) plus the weeks of 10-11 and 10-18. `rank` is the term's rank by volume within its genre.
- Remi's organic rank comes from a fresh iTunes Search check today (top ~180).

### CH (German listing)

| term | popularity 1–5 | /100 | genre, rank | Remi organic | leader (ratings) | use |
|---|---|---|---|---|---|---|
| kalender | 4 | 62–67 | Productivity #43–49 | >173 | Apple Kalender (63,786) | no: calendar intent, not ours |
| uhr | 3–4 | 55–61 | Productivity #115–123 | >177 | Clock (261) | no: clock/watch-face intent |
| notizen | 3–4 | 56–62 | Productivity #91–109 | — | — | no: notes |
| to do | 3–4 | 54–60 | Productivity #128–139 | — | — | no: task lists |
| **wecker** | **3** | **54–59** | Health & Fitness #31–46 | >182 | Clock (261), Alarmy (2,304) | **yes, #1 pick** |
| **erinnerungen** | **3** | **55** | Productivity #243–248 | >182 | Apple Erinnerungen (23,448) | **yes** |
| uhr wecker | 3 | 52–53 | Health & Fitness #104–106 | >171 | Clock (261) | reserve |
| **alarm** | **3** | **51–52** | Health & Fitness #120–131 | >180 | Alarmy (2,304) | **yes** |
| wecker gratis | 3 | 50–51 | Health & Fitness #140–156 | >29 (29 results) | Clock (261) | reserve: "free" intent |
| timer | 3 | 55–56 | Health & Fitness #64–68 | — | — | no |
| alarmy | 3–4 | 56–61 | Health & Fitness #25–32 | — | — | no: competitor brand |
| erinnerung, wecker app, erinnerungs app, termine, wecker kostenlos, reminder(s), aufgaben, sprechende uhr, réveil, rappel, sveglia, promemoria | ≤2 | — | not in the CH top 500 | — | — | no |

**Recommended CH keywords (EXACT): `wecker`, `erinnerungen`, `alarm`.** These are the German equivalents of the BR/MX winners (`despertador` / `lembretes` / `alarma`), and they match the de-DE title `Remi: Sprechender Wecker`. `alarm` is also in the English title, which CH indexes.
- Remi is absent from all three organically, so the ads carry the visibility. Apple still shows ads only where the app is judged relevant, and these terms are in our metadata.
- Reserve if one of the three gets no impressions in 2 days: `uhr wecker`.
- `kalender` and `uhr` score higher, but the intent is wrong. They'd spend the $14 on taps that don't install.
- The keyword-suggestion endpoint (unseeded, our app, CH) agrees on what's big in the category: kalender 67, to do 61, wecker 60, uhr 56, alarm 45, reminder 43. Seeded with `erinnerung`, it returns erinnerungen 37, reminder 35, reminders 27.

### FR (for later, once fr-FR ships)

| term | popularity 1–5 | /100 | genre, rank | Remi organic | note |
|---|---|---|---|---|---|
| horloge | 4 | 64–70 | Health & Fitness #12–14 | >173 | clock intent; test last |
| **reveil** (no accent) | **3–4** | 56–63 | Health & Fitness #54–65 | >178 | the spelling people actually type |
| **alarme** | **3–4** | 54–61 | Health & Fitness #77–89 | >179 | |
| **rappel** | **3–4** | 54–61 | Productivity #284–300 | >184 | leader is Apple Rappels (80,676) |
| reveil gratuit | 3 | 49–56 | Health & Fitness #143–166 | >184 | reserve |
| alarme reveil | 3 | 51–52 | Health & Fitness #321–322 | >176 | reserve |
| réveil (accented) | 3 | 49 | Health & Fitness #430–463 | >179 | much smaller than `reveil` |
| rappels, réveil matin, reveil matin, rappel app, pense bête | ≤2 | — | not in the FR top 500 | — | skip |

**FR head list, in priority order: `reveil`, `alarme`, `rappel`**, with `reveil gratuit` / `alarme reveil` in reserve. `horloge` and `agenda` / `calendrier` are bigger, but they're wrong intent.

### CH dry-run campaign

`create_ch.py` sits in the scratchpad `appleads/` folder. Run without arguments, it prints the plan and makes no API calls. **`go` is for the user to approve; it was not run.**
- **Campaign:** "Remi - CH - Head", CH, search results, iPhone, new users only, Search Match off.
- **Dates:** 00:00 5 Nov → 23:59 13 Nov Zurich (9 days).
- **Budget:** $1.50/day = $13.50 max, plus a $14 lifetime `budgetAmount`.
- **Keywords:** EXACT `wecker` $0.55, `erinnerungen` $0.50, `alarm` $0.45 (default bid $0.50).
- **Checkpoint:** after 2 days, cut any term with no installs.

## Method notes

- Scripts and raw data, all read-only, are in the session scratchpad `appleads/` folder:
  - `popularity.py` → `popularity_1103.json`
  - `pop_control.py` (nonsense-string controls and genre root lookups)
  - `pop_floor.py` (top-500 floor per country)
  - `head_terms.py` → `head_terms_1103.json` (CH/FR head terms)
  - `create_ch.py` (dry-run only)
  - `metrics_1103.py` → `metrics_1103.json`
  - `build_md.py`
- API calls made: `GET /v1/me` and `GET /v1/acls` (Platform API); `POST /v1/insights/apps/search-term-popularity/query`; `POST /v1/suggestions/keywords/query`; `POST /v1/suggestions/phrases/query`; v5 `GET /campaigns/{id}` and `POST /reports/...`.
  - All are queries.
  - No campaign, ad group or keyword was created, edited, paused or enabled.
  - No recommendation was applied or dismissed.
- One `keywords/query` call (GB `hourly chime`) hit a 504; its value would have been the meaningless default anyway.
- The Campaign Management API v5 sunsets 2027-01-26. The Platform API at `api.ads.apple.com/v1` already works with our existing credentials (ad account 24677990, role "API Campaign Manager"), so future scripts should move there.
