# Apple Ads campaigns built, all paused (2026-10-10)

Built through Campaign Management API v5 (`api.searchads.apple.com/api/v5`, org 24677990, USD, Asia/Dubai) from `apple-ads-campaign-plan-2026-10.md`. **Nothing is running. Nothing has spent.** Enabling needs the user's go. Every value below is from the API read-back after creation (05:07 UTC).

## Status

| Object | ID | status | displayStatus | servingStateReasons |
|---|---|---|---|---|
| Campaign `Remi - BR - Exact` | 2144856461 | PAUSED | PAUSED | PAUSED_BY_USER, APP_NOT_CATEGORIZED, NO_AVAILABLE_AD_GROUPS |
| Ad group `BR - Exact - pt` | 2151764459 | PAUSED | PAUSED | AD_GROUP_PAUSED_BY_USER |
| Campaign `Remi - MX - Exact` | 2144858552 | PAUSED | PAUSED | PAUSED_BY_USER, APP_NOT_CATEGORIZED, NO_AVAILABLE_AD_GROUPS |
| Ad group `MX - Exact - es` | 2151765456 | PAUSED | PAUSED | AD_GROUP_PAUSED_BY_USER |

There are no ad objects (`/ads` returns 0 for both ad groups). The default product page serves without one.

## Settings (read back)

| | BR | MX |
|---|---|---|
| adamId | 6801797784 | 6801797784 |
| countriesOrRegions | BR | MX |
| supplySources | APPSTORE_SEARCH_RESULTS | APPSTORE_SEARCH_RESULTS |
| adChannelType / billingEvent / biddingStrategy | SEARCH / TAPS / MANUAL_CPT | same |
| dailyBudgetAmount | 2.25 USD | 1.75 USD |
| Lifetime budget | **none** (not supported, see deviations) | **none** |
| Campaign start / end | 2026-10-09T20:00 / **2026-11-03T19:59:00.000** | same |
| Ad group defaultBidAmount (CPC) | 0.40 USD | 0.45 USD |
| automatedKeywordsOptIn (Search Match) | false | false |
| deviceClass | included: IPHONE | included: IPHONE |
| appDownloaders | excluded: 6801797784 (new users only) | same |
| age / gender / location / daypart | null (untouched) | null |
| Ad group start / end | 2026-10-10T05:21:29.000 / **2026-11-03T19:59:00.000** | 2026-10-10T05:21:38.000 / **2026-11-03T19:59:00.000** |

Times are UTC; the start values echoed back exactly as they were sent in UTC. 19:59 UTC is 23:59 on Nov 3 in Dubai.

## Keywords (wave 1, EXACT, keyword status ACTIVE under paused ad groups)

Apple's suggested bid comes from the keyword-level report (`insights.bidRecommendation.suggestedBidAmount`). Today it returns **null** for all 16, probably because the keywords are minutes old and have never served. Bids are the plan's fallback values, all under the ceilings ($0.90 BR / $1.00 MX). Re-pull after the campaigns go live and apply 0.7x where a suggestion appears.

| Country | Keyword | ID | Match | Bid (USD) | Suggested |
|---|---|---|---|---|---|
| BR | despertador falante | 2345676536 | EXACT | 0.40 | null |
| BR | alarme que fala | 2345676537 | EXACT | 0.40 | null |
| BR | lembrete por voz | 2345676538 | EXACT | 0.40 | null |
| BR | despertador que fala | 2345676539 | EXACT | 0.40 | null |
| BR | lembrete de remédio | 2345676540 | EXACT | 0.40 | null |
| BR | lembrete de boleto | 2345676541 | EXACT | 0.30 | null |
| BR | lembrete de consulta | 2345684342 | EXACT | 0.30 | null |
| BR | lembrete de aniversário | 2345684343 | EXACT | 0.30 | null |
| MX | alarma que habla | 2345678251 | EXACT | 0.45 | null |
| MX | recordatorios con voz | 2345678252 | EXACT | 0.45 | null |
| MX | alarma con voz | 2345678253 | EXACT | 0.45 | null |
| MX | despertador que habla | 2345678254 | EXACT | 0.40 | null |
| MX | recordatorio de pastillas | 2345678255 | EXACT | 0.40 | null |
| MX | recordatorio de pagos | 2345678256 | EXACT | 0.35 | null |
| MX | recordatorio de citas | 2345678257 | EXACT | 0.30 | null |
| MX | recordatorio de cumpleaños | 2345678258 | EXACT | 0.30 | null |

Wave 2 (the rest of each table in the plan) has not been added.

## Negative keywords (campaign level, both campaigns, match BROAD)

grabadora de voz, gravador de voz, notas de voz, nota de voz, cambiar voz, mudar voz, traductor, tradutor, tonos de alarma, toques de alarme, ringtone. That's 11 per campaign, the Spanish and Portuguese list in each. There are no ad-group-level negatives.

The plan's `reloj` / `relógio` were added at first, then **removed on 2026-10-10 after review**. As BROAD negatives they would block "reloj despertador…", the everyday Mexican phrase for alarm clock.

## Deviations and things to know

1. **No lifetime cap.** `budgetAmount` was rejected with `LIFETIME_BUDGET_NOT_SUPPORTED` ("Lifetime budget is not supported"). Apple removed lifetime budgets in API 5.6 (June 2026). The caps are the daily ones ($4/day combined) plus a **hard stop**: `endTime` 2026-11-03T19:59:00.000 UTC (23:59 Dubai) on both ad groups and both campaigns. The campaign object accepted an end date too.
2. **Negatives are BROAD.** The plan calls them a safety net in case anything ever goes broad, and an exact negative under exact targeting would never fire. Targeting keywords are all EXACT, as planned.
3. **Keyword status is ACTIVE.** That's the per-keyword default. Nothing serves while the campaign and ad group are PAUSED, and enabling later only needs the campaign and the ad group switched on.
4. **`APP_NOT_CATEGORIZED`** shows in both campaigns' serving reasons. Apple hasn't finished categorizing the new app for Ads. It may clear on its own; if it's still there after enabling, it will block serving.
5. Ad group names are `BR - Exact - pt` / `MX - Exact - es`, not a copy of the campaign name.

Scripts: `aa_common.py`, `aa_build.py`, `aa_verify.py` in the session scratchpad. The full read-back JSON is in `aa_state.json`.
