# Japan iPhone market: localization input for Remi (2026-10-05)

## Summary
- Japan is the #3 app market by consumer spend ($16.5B in 2024), but about two-thirds of that goes to games.
- iPhone is roughly half of the market: ~46% of phones in use (MMD, Aug 2026, trending down) and ~50% of FY2025 handset shipments (MM Research). StatCounter web traffic shows 60.5% iOS.
- At least ~66% of Japanese iOS web traffic is on iOS 26 or later, so AlarmKit reach is good.
- Talking alarms are an established paid niche (licensed character-voice alarms, ¥650–¥1,000). No AI-voice, speak-to-create reminder incumbent was found.
- Productivity subscriptions sell at ¥800–¥890/mo.
- Main risks:
  - Voice-assistant use is low (13.5% weekly vs 22.5% global) and there are strong public-quiet norms.
  - Localization has to be native-quality across the whole speech-to-text, parsing and TTS pipeline.
  - English-only apps are at a strong disadvantage.
- The Smartphone Act (in force 18 Dec 2025) lowered Apple's Japan commission to 10% for small developers and second-year subscriptions, plus a 5% In-App Purchase processing fee.
- Apple Ads runs in Japan; cost per tap is roughly half the US level, but conversion is lower.

## 1. iPhone / iOS share

| Metric | Figure | Date / period | Source |
|---|---|---|---|
| Main phone in use (survey) | iPhone 45.6%, Android 54.1% | Aug 2026 survey, released 17 Sep 2026 | [MMD Labo](https://mmdlabo.jp/investigation/detail_2567.html) |
| Same series | 49.0% | Feb 2026 | [MMD Labo](https://mmdlabo.jp/investigation/detail_2527.html) |
| Same series, earlier | 50.0% (Sep 2023), 49.6% (Sep 2024), 48.3% (Sep 2025) | — | [Yahoo News expert article, 30 Dec 2025](https://news.yahoo.co.jp/expert/articles/490b73c0540fa7a7afe00949ae2d24c848b2dd4f) |
| Web traffic share | iOS 60.51% | Sep 2026 | [StatCounter](https://gs.statcounter.com/os-market-share/mobile/japan) |
| Shipments, full year | Apple 16.15M units, 50.1% of all handsets; Google 12.4%, Samsung 11.0%, Sharp 7.1% | FY2025 (Apr 2025–Mar 2026), released 14 May 2026 | [MM Research via Keitai Watch](https://k-tai.watch.impress.co.jp/docs/news/2108557.html) |
| Shipments, half year | Apple 43.7% (−1.0pt) | H1 FY2025 | [MM Research](https://www.m2ri.jp/release/detail.html?id=697) |
| Shipments, quarter | Apple 46.4%, down from 52.8% | Q2 2025 | [IDC Japan via Business Network](https://businessnetwork.jp/article/29953/) |

- Trend: share of phones in use is drifting down (50.0% → 45.6% over 2023–26). Share of new sales is about flat at ~50%.
- MM Research forecasts FY2026 shipments down 7.0% (memory prices).
- iPhone skews young: the iPhone 17 is the top device for people in their teens and 20s. People aged 40+ lean Android (AQUOS) (MMD, Aug 2026).
- Conflict: [appleworld.today](https://appleworld.today/2025/09/apple-now-has-49-of-japans-smartphone-markets-as-sales-skyrocket-38-year-over-year/) reports Q2 2025 at 49%, up from 40% (Counterpoint-style data). That contradicts IDC.
- StatCounter measures web traffic, not ownership.
- Discarded: accio.com and worldpopulationreview aggregates (unsourced).

## 2. iOS version adoption
- **Japan:** StatCounter, Sep 2026, iOS web traffic: [source](https://gs.statcounter.com/ios-version-market-share/mobile/japan)
  - iOS 26.6: 55.36%
  - iOS 26.5: 7.98%
  - iOS 27.0: 2.2%
  - iOS 18.7: 12.17%
  - iOS 18.6: 1.94%
  - iOS 16.7: 1.78%
- That means at least ~65.5% of traffic is on iOS 26 or later, from the listed versions alone.
- Caveat: StatCounter notes that Safari misreported iOS 26.2 as 18.7, with a fix applied on 19 Jan 2026. Part of the 18.7 bucket may really be iOS 26.
- **Worldwide (Apple, devices that transacted on the App Store):**
  - 7 Jun 2026: 79% of all iPhones on iOS 26, 86% of iPhones from the last four years ([MacRumors](https://www.macrumors.com/2026/06/09/ios-26-adoption-stats-wwdc/)).
  - 12 Feb 2026: 66% of all iPhones, 74% of the last four years ([9to5Mac](https://9to5mac.com/2026/02/13/apple-announces-ios-26-usage-numbers-heres-how-they-compare/)).
- iOS 27 shipped on 14 Sep 2026 ([MacRumors](https://www.macrumors.com/2026/09/09/apple-announces-ios-27-release-date/)) and also supports AlarmKit.
- Apple publishes no Japan-specific figure.

## 3. App Store consumer spending
- **Total, 2024:** $16.5B consumer app spend, #3 worldwide after China and the US ([Adjust/Sensor Tower, Jul 2025](https://sensortower.com/ja/blog/adjust-sensor-tower-2025-JP); [Sensor Tower 2024 report](https://sensortower.com/blog/japan-app-trends-2024-report-by-adjust-and-sensor-tower)). 2023 was $17.9B, so spending is falling in USD terms.
- **Games:** ~$11B in-app purchase revenue (over ¥1.6T), Aug 2024–Jul 2025. Japan is second in Asia after China iOS ([Sensor Tower, Sep 2025](https://sensortower.com/blog/state-of-japan-gaming-2025)). Games are therefore roughly two-thirds of spend. That is an estimate, mixing different periods.
- **Non-game:** the top earners are manga apps (Piccoma, LINE Manga), then Google One. Finance installs are growing fast ([Adjust/Sensor Tower 2026 summary](https://gamedevreports.substack.com/p/adjust-and-sensor-tower-japans-mobile)).
- **Global context, 2025:** in-app purchase revenue was $167B (+10.6%). Non-game revenue (+21%) passed games (~$82B, +1.3%) for the first time ([Sensor Tower State of Mobile 2026](https://sensortower.com/blog/state-of-mobile-2026)).
- **Per user:** no current source. Sensor Tower's per-capita ranking is 2018 data (Japan #1, [link](https://sensortower.com/blog/per-capita-app-store-spending)). $16.5B ÷ ~124M people ≈ $133 per person per year (own arithmetic, all platforms).
- **Subscriptions:**
  - RevenueCat 2024: Japan had the highest renewal rates across weekly, monthly and annual plans, and the lowest App Store refund rate ([GIGAZINE summary, Mar 2024](https://gigazine.net/gsc_news/en/20240313-apps-subscription-stats/)).
  - RevenueCat 2026: Productivity benchmarks are global, not Japan-specific. Median monthly price ~$9.99, yearly ~$34.80, 77% of plans monthly, year-1 LTV $24.95 per payer. The Asia-Pacific median trial-to-paid rate is 31.9% ([RevenueCat](https://www.revenuecat.com/state-of-subscription-apps)).
  - Unverified (search snippet only): RevenueCat says a long scrolling paywall beat the US-style layout by more than 20% in Japan.
- **Unverified:** an Analysis Group/Apple figure of about $52B in Japan ecosystem billings for 2025. It comes from a search snippet; the [PDF](https://www.apple.com/newsroom/pdfs/Apples_Global_App_Store_Ecosystem_and_Its_Growth_2025.pdf) would not parse.

## 4. Reminder / alarm / to-do landscape (JP App Store)
- **Top alarm apps** (my-best ranking, updated 24 May 2026, [link](https://my-best.com/1981)): バモス (mission alarm), おこしてME (Alarmy), アラーム クロック, Sleep Music Alarm, イヤホン目覚まし時計. They focus on anti-oversleep games and puzzles, not voice.
- **Alarmy (おこしてME)** on the JP App Store: 4.6★ from 68K ratings. Premium tiers ¥440–¥800, Premium Plus ¥6,600 ([App Store](https://apps.apple.com/jp/app/alarmy-alarm-clock-sleep/id1163786766)). A secondary source gives ¥800/mo or ¥6,600/yr.
- **To-do apps:**
  - TickTick: ¥800/mo, ¥8,000/yr, 4.7★ from 16K ratings. Supports voice task creation via Siri/AI ([App Store](https://apps.apple.com/jp/app/ticktick-to-do-list-calendar/id626144601)).
  - Todoist Pro: ¥890/mo, ¥8,080/yr, 22K ratings ([App Store](https://apps.apple.com/jp/app/todoist-to-do-list-planner/id572688855)).
  - my-best's Oct 2026 task-app ranking puts Notion, Lifebear and Google ToDo on top (search snippet only, [link](https://my-best.com/2352)).
- **Talking / voice alarms: the niche is confirmed.**
  - Applion's top 20 "ボイスアラーム" list is entirely licensed character apps, paid upfront at ¥650–¥1,000: ごちうさ, リゼロ (556 ratings), 転スラ, 五等分の花嫁, おそ松さん, ガルパン, 白猫 and others, mostly from TENDA GAMES ([Applion](https://applion.jp/iphone/topic/220251/)).
  - app-liv's 2026 list adds free or freemium titles: MakeS, シチュカレアラーム, まいにちコンパイルハート ([link](https://app-liv.jp/lifestyle/scheduler/1672/)).
  - Zeeny Assistant: voice-actor and VTuber voices for the time, alarms, calendar reminders 10 minutes before events, and notification read-out. Freemium (8 free characters), with paid characters and a monthly subscription; the price is not stated ([Zeeny](https://zeeny.com/pages/zeeny-assistant)).
- **Voice-first reminders:**
  - "ボイスリマインダー" (create by voice, announced by voice): the JP App Store page now returns 404, so it may have been removed.
  - おしゃべりタイマー: a TTS timer, ¥300 one-time, 161 ratings ([App Store](https://apps.apple.com/jp/app/%E5%A3%B0%E3%81%A7%E3%81%8A%E7%9F%A5%E3%82%89%E3%81%9B-%E3%81%8A%E3%81%97%E3%82%83%E3%81%B9%E3%82%8A%E3%82%BF%E3%82%A4%E3%83%9E%E3%83%BC/id1582848182)).
  - Discarded: リマインダーFLEX, which is Android-only.
- No AI-generated-voice, speak-to-create reminder app with meaningful traction was found. The live charts were not checked.

## 5. Voice and behaviour
- **Weekly voice-assistant use:** Japan 13.5% of internet users aged 16+, against a 22.5% global average, US 28.8% and Mexico 33.7%. DataReportal/We Are Social, Q4 2025, published 22 Apr 2026 ([Statista](https://www.statista.com/statistics/1661033/voice-assistant-use-by-territory/)).
- **Voice search:** 32% use it (men 35%, women 28%). The top use is hands-free while driving or cooking (52.7%), and 50.7% say they use it more than 1–2 years ago. PLAN-B, Mar 2025; small sample of n=150 screened from 2,000 ([PR Times](https://prtimes.jp/main/html/rd/p/000000311.000068228.html)).
- **Older surveys:**
  - U-Site, Dec 2019: 50% of Japanese had never used a voice assistant, versus a majority of users in the US and China. Reluctance to speak in public was cited ([U-Site](https://u-site.jp/survey/voice-assistant-1)).
  - KDDI 2017: 71.1% would be embarrassed to voice-search in public. Old, and only seen quoted second-hand ([The Egg](https://www.theegg.com/seo/japan/3-tips-for-voice-search-optimization-in-japan/)).
- **Public-space norms:** Japan Private Railway Association 2025 survey (Oct–Nov 2025, n=5,202):
  - "Noisy conversation" ranks #3 at 30.2%.
  - Smartphone misuse ranks #5 at 21.6%; phone calls and ringtones are 6.6% within that ([Mintetsu](https://www.mintetsu.or.jp/activity/enquete/2025.html)).
- **Alarm habits:** 64% of smartphone-alarm users keep the default sound. PR Times, Mar 2025, n=500 ([link](https://prtimes.jp/main/html/rd/p/000001577.000044800.html)). No current data on snoozing or smartphone-alarm share was found; the 71.1% figure is from 2014.
- Apple Intelligence has supported Japanese since iOS 18.4 (31 Mar 2025) ([Apple](https://www.apple.com/newsroom/2025/03/apple-intelligence-features-expand-to-new-languages-and-regions-today/)).

## 6. Localization expectations
- **CSA Research 2020:** 90% of Japanese respondents prefer product information in their own language. Only 50% would pick a major global brand over local-language information, the lowest of the countries surveyed ([tcworld](https://www.tcworld.info/news/cant-read-wont-buy-1061)).
- **EF English Proficiency Index 2025:** Japan ranks 96th of 123, band "very low", score 446 vs a 488 global average ([SoraNews24](https://soranews24.com/2025/12/04/japans-ef-english-proficiency-index-rank-drops-for-11th-straight-year-hits-lowest-ever/)).
- **App Store search** (practitioner claims, not Apple data):
  - Users type hiragana and often leave queries in hiragana.
  - Katakana wins for loanwords.
  - Abbreviations beat their full forms.
  - Machine translation picks the wrong forms (Adapty, 24 Mar 2025, [link](https://adapty.io/blog/how-to-optimize-aso-for-japan/)).
  - Indexed fields are title 30 + subtitle 30 + keywords 100 characters.
- No hard data was found on how much machine-translated apps are penalised. The evidence is practitioner opinion only.

## 7. Platform and regulation
- **Smartphone Act (MSCA)** fully in force 18 Dec 2025 ([JFTC](https://www.jftc.go.jp/msca/)). Apple announced its changes on 17 Dec 2025 (iOS 26.2) ([Apple](https://developer.apple.com/news/?id=074b3wzz)). Apple now allows:
  - alternative app marketplaces;
  - alternative in-app payments;
  - links to outside purchases;
  - browser and search-engine choice screens.
- Developers had to accept the updated developer agreement by 17 Mar 2026.
- **Japan fees** ([Apple](https://developer.apple.com/support/app-distribution-in-japan/)):
  - Commission 10% for Small Business Program members and for auto-renewing subscriptions after year 1; 21% otherwise.
  - +5% if paid through Apple In-App Purchase.
  - Web purchases through an in-app link: 15%, or 10% for SBP members and subscriptions after year 1. Only sales within 7 days of the tap count.
  - Core Technology Commission of 5% for apps on alternative marketplaces.
- **Pushback:** in Feb 2026 the JFTC asked Apple and Google to explain the basis for their fees. Industry groups call the fee levels a "de-facto nullification" of the law ([Abe Legal](https://abe-legal.jp/en/news/smartphone-act-implementation-2026)). No uptake data yet.
- **Apple Ads:** available in Japan since Apple's 27 Jul 2018 announcement ([Apple](https://developer.apple.com/news/?id=07272018a)). Some sources say 2019.
- **Apple Ads benchmarks** (Adapty, 13 Jul 2026, [link](https://adapty.io/blog/apple-ads-benchmarks-2026/)):

  | Metric | Japan | US |
  |---|---|---|
  | Cost per tap | $0.73 | $1.58 |
  | Cost per acquisition | $1.49 | $2.51 |
  | Tap-through rate | 9.2% | 9.0% |
  | Conversion rate | 49.3% | 62.7% |

  Conflict: another benchmark cites a $1.11 median cost per tap for Japan.
