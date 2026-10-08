# Country selection for Remi ASO + Apple Ads tests (2026-10-08)

Question: which App Store countries give the widest download surface for the least spend, while still paying for subscriptions?

## Data notes
- No source publishes reminder / alarm keyword costs by country. "Productivity" numbers are category averages; inside Productivity, Adapty shows cost per download ranging $2.28-6.53 by niche (Notes niche CPT $3.08).
- AppTweak publishes CPT directly only for US, UK, CA, AU, JP, DE, FR. Elsewhere CPT is estimated as CPI x tap-to-install rate, marked "≈".
- Adapty 2026 country tables list only the 20 most expensive markets; Korea, Taiwan, Saudi, UAE are not among them (CPT < $0.50, exact value unpublished).
- iPhone share: StatCounter mobile, Sept 2026 (Saudi/UAE Aug 2026). iOS downloads: AppTweak Nov 2024-Nov 2025, top 10 only; "<0.8B" = outside the top 10.

| # | Country | iOS downloads/yr | iPhone share | Apple Ads cost | Pays? | Language | Apple Ads | Verdict |
|---|---|---|---|---|---|---|---|---|
|1|Brazil|1.4B (#4, +18%)|21%|CPD $0.41 (Adapty); CPI $1.05, CPT ≈$0.57 (AppTweak)|$15.36 per paying sub; 65 paying subs per $1k (US 15)|PT-BR|Y|Best ratio|
|2|Mexico|<0.8B|28%|CPI $1.10, CPT ≈$0.59|LatAm = "efficient" (Adapty)|ES|Y|Strong|
|3|Germany|0.9B|28%|CPT $0.86-1.11; CPI $1.34-2.14|Expensive but converts (64%)|DE|Y|Pays|
|4|France|0.8B|35%|CPT $0.75-0.92; CPD $1.11|Tap-to-install 67%, best of top 20|FR|Y|Pays|
|5|Taiwan|<0.8B|52%|CPT <$0.50|14.5% install-to-paid|zh-Hant|Y|Hidden gem|
|6|Saudi Arabia|<0.8B|52%|CPI $1.29, CPT ≈$0.70|MEA payers valued lower (regional); tap-through only 5.5%|AR|Y|Good|
|7|Italy|<0.8B|37%|CPI $1.32, CPT ≈$0.74|Europe tier|IT|Y|Good|
|8|Poland|<0.8B|36%|CPI $1.12, CPT ≈$0.65|Europe tier|PL|Y|Good, cheap|
|9|Spain|<0.8B|27%|CPI $1.43|Europe tier|ES|Y|OK, reuses Mexico's Spanish|
|10|South Korea|<0.8B|38%|CPI $1.84; tap-to-install 51%|High spend, local apps dominate|KO|Y|Mid|
|11|Japan|1.4B (#3)|61%|CPT $0.73-1.11; CPI $1.49-2.57; TTI 46-49%|"High cost, weak conversion" (Adapty)|JA|Y|Wide but pricey|
|12|Indonesia|<0.8B|~15%|CPI $0.95|14.76% install-to-paid; 71 paying subs per $1k|ID|Y|Cheap test|
|13|Turkey|<0.8B|23%|CPI $1.02, CPT ≈$0.49|Low local prices|TR|Y|Test only|
|14|UAE|<0.8B|22% (looks low)|CPI $1.38; TTI 60%|MEA tier|EN/AR|Y|Small, English works|
|-|China mainland|4.2B|-|CPD $2.54; TTI 49%|High cost, weak conversion|zh-Hans|Y (extra docs)|Avoid|
|-|Russia|1.1B|-|-|-|RU|N (suspended Mar 2022; accounts blocked Aug 2024)|Avoid for ads|

## The five already chosen
- **Brazil:** best pick. 2nd-largest iOS base outside US/China, +18%/yr, cheapest proven funnel.
- **Japan:** most iPhone users but expensive and weak per dollar. Keep the localized listing (free store traffic), small capped ad test only.
- **South Korea:** mid-cost, moderate base, strong local competitors. Localize; ads optional.
- **Saudi Arabia:** half of phones are iPhones, cheap ads, but low tap-through means the Arabic page must be good. Keep.
- **UAE:** small; English mostly works. Lowest priority.

## Recommended cheap + wide + pays
1. Brazil. 2. Mexico (same Spanish covers Spain + LatAm). 3. Germany and France. 4. Taiwan. 5. Italy or Poland.

## Avoid
Russia (no Apple Ads, billing problems), China mainland (expensive, weak conversion, ICP licence, OpenAI unavailable), cheap-but-leaky markets (Egypt, Nepal, Algeria; likely India, Vietnam), e.g. Nepal $362 per paying subscriber.

## Caveats
- Benchmarks cover 2025 to mid-2026, before Apple added multiple ad slots (Mar 2026). Sources disagree (US CPT $1.58 Adapty / $1.91 AppTweak / $2.25 SplitMetrics): read as ranges.
- Medians across all apps; Remi's real CPT depends on its keywords.
- Willingness to pay is regional only (RevenueCat, Adapty). Apple's automatic regional pricing makes $6.99 cheaper in Brazil, Mexico, Turkey.
- Not verified: exact CPT for Korea, Taiwan, Saudi, UAE; reminder/alarm keyword competition anywhere (needs AppTweak/Astro or Apple's keyword popularity + suggested bid in a campaign); downloads outside the top 10.

## Sources
ads.apple.com/app-store/countries-and-regions; ads.apple.com/news; appleinsider.com/articles/22/03/07/apple-has-suspended-app-store-search-ads-in-russia; app2top.com/news/apple-has-blocked-russian-accounts-for-search-ads-270181.html; appinchina.co/apple-search-ads-in-mainland-china; leave-russia.org/apple; adapty.io/blog/apple-ads-benchmarks-2026; adapty.io/blog/cheapest-and-most-expensive-countries-for-apple-ads/; adapty.io/blog/apple-ads-install-to-paid-rate-benchmarks; uploads.adapty.io/state_of_in_app_subscriptions_2025.pdf; apptweak.com/en/aso-blog/apple-ads-benchmarks; apptweak.com/en/reports/app-downloads-by-country; splitmetrics.com/blog/apple-search-ads-cost/; intentplus.io/blog/apple-ads-benchmarks-2026; admiral.media/apple-search-ads-benchmarks; revenuecat.com/pdf/state-of-subscription-apps-2026-sosa.pdf; Sensor Tower State of Mobile 2026; gs.statcounter.com/os-market-share/mobile/<country>; worldpopulationreview.com (Indonesia only).
