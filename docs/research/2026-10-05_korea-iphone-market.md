# South Korea iPhone market: inputs for a Korean localization decision
*Researched 2026-10-05. Every figure carries its source and date. Estimates and conflicts are flagged.*

## Summary
- iPhone is a minority platform in Korea. Gallup's 2026 survey puts it at 19% of users, and Omdia puts it at 26.1% of 2025 shipments. The trend is flat to down, and Gallup shows the 20s cohort, the one iPhone stronghold, moving toward Galaxy: 65% (2024) → 60% (2025) → 53% (2026). Part of that drop may come from Gallup's change of survey method in 2026.
- Korea is a top-4 market worldwide for in-app spend, still dominated by games. Since 2025, AI subscriptions (ChatGPT, Gemini at about ₩29–30k/month) show strong willingness to pay for utility subscriptions.
- Productivity and alarm subscriptions in Korea are priced low, at about ₩2.5k–7.7k/month. Korean-made apps (Alarmy, Alarmmon, TodoMate) lead their niches.
- On regulation: Apple's 26% commission on external payments in Korea is under active enforcement (violation found 2026-08-12, fine pending). The 2025 consent rule for subscriptions applies to trial-to-paid conversions. Apple Ads is available in Korea.

## 1. iPhone share of the smartphone market

**Share of users (Gallup Korea):**

| Survey | iPhone | Galaxy | Method |
|---|---|---|---|
| 2026 (fieldwork 2026-05-23 to 06-11, released 2026-07-13) | 19% | 81% | Face-to-face, n≈1,675–1,700, ages 13+ (teens included for the first time), ±2.4pp |
| 2025 (2026-07-01 to 07-03) | 24% | 72% | CATI phone, n=1,001, ages 18+, ±3.1pp; 1% other, 7% no answer |
| 2024 (Gallup Korea) | 23% | 69% | From the Korea Herald article |

**Flag:** Gallup warns that 2025 → 2026 is not directly comparable because the method changed and teens were added.

Sources:
- [Seoul Economic Daily](https://en.sedaily.com/finance/2026/07/13/samsung-galaxy-tops-korea-smartphone-usage-at-81-percent)
- [EBN](https://www.ebn.co.kr/news/articleView.html?idxno=1716204)
- [Edaily 2025](https://www.edaily.co.kr/News/Read?newsId=04188566642232552&mediaCodeNo=257)
- [Korea Herald](https://www.koreaherald.com/article/3466695)

**By age, 2026 (Gallup):**
- 20s: iPhone 53% / Galaxy 47%. This is the only age group where iPhone leads. Among women in their 20s, iPhone is 67%.
- Galaxy share in older groups: 30s 62%, 40s 84%, 50s 97%, 60+ 100%.
- By gender: men are 84% Galaxy and 16% iPhone; women are 78% Galaxy and 22% iPhone.
- Teenage girls are reportedly 58% iPhone (EBN). This is a single mention and was not cross-checked.
- Purchase intention: Galaxy 78%, iPhone 21%. Galaxy repurchase loyalty is 96%.

**20s trend:**
- iPhone share: 65% (ages 18–29, 2024) → 60% (2025) → 53% (2026).
- Women in their 20s: 75% (2024) → 67% (2026).

Sources:
- [Korea Herald](https://www.koreaherald.com/article/3466695)
- [News Space](https://www.newsspace.kr/news/article.html?no=14813)
- [MTN](https://news.mtn.co.kr/news-detail/2026081016565065126)

**New devices (sales/shipments):**
- **Omdia, full-year 2025 shipments:** Samsung 71.7% (9.9M units), Apple 26.1% (3.6M), others 2.2%. Apple's share by year: 24.6% (2023) → 25.5% (2024) → 26.1% (2025). Source: [Hankyung, 2026-03-19](https://www.hankyung.com/article/202603191800g).
- **Counterpoint quarterly sales share, Samsung / Apple:**
  - Q1 2025: 78% / 22%
  - Q2 2025: 84% / 16%
  - Q3 2025: 81% / 18% ([SamMobile, 2025-12-12](https://www.sammobile.com/news/despite-solid-sales-apple-still-cant-catch-samsung-on-its-home-turf/))
  - Q4 2024: 60% / 39%, Apple's record quarter; Q3 2024 was 80% / 19% ([Hankyung Magazine](https://magazine.hankyung.com/business/article/202503179606b))
  - The pattern is strongly seasonal, with an Apple spike every Q4.
- **iPhone 17 (Counterpoint via 9to5Mac, 2026-05-04):** sales were up 3x year-over-year in Korea in Q1 2026. No share figure was given. [9to5Mac](https://9to5mac.com/2026/05/04/report-iphone-17-ranked-as-worlds-top-selling-smartphone-in-q1-2026/)
- **Not found:** Counterpoint's Korea figures for Q4 2025 and Q1–Q2 2026.

**Conflicting measure:** StatCounter shows iOS at 37.82% of Korean mobile web traffic in Sep 2026 ([StatCounter](https://gs.statcounter.com/os-market-share/mobile/south-korea)). This counts page views, not devices, and over-represents iPhone. Don't use it as device share.

**Discarded:** accio.com "trend" pages are AI-generated aggregates with no primary data.

## 2. iOS version adoption (AlarmKit needs iOS 26+)
- **Apple official, worldwide (measured from devices that made App Store transactions):**
  - iOS 26 was on 66% of all devices and 74% of devices from the last 4 years on 2026-02-12 ([9to5Mac](https://9to5mac.com/2026/02/13/apple-announces-ios-26-usage-numbers-heres-how-they-compare/)).
  - It reached 79% of all iPhones and 86% of last-4-year iPhones on 2026-06-07 ([MacRumors](https://www.macrumors.com/2026/06/09/ios-26-adoption-stats-wwdc/)).
  - That is slightly behind iOS 18's pace (82% / 88% in June 2025).
- **Korea-specific, StatCounter web traffic, Sep 2026:**
  - iOS 26.6: 45.78%
  - iOS 26.5: 10.41%
  - iOS 27: 3.65%
  - iOS 18.7: 12.85%
  - iOS 15.8: 2.71%
  - iOS 16.7: 2.28%
  - Source: [StatCounter Korea](https://gs.statcounter.com/ios-version-market-share/mobile/south-korea)
- **Why the StatCounter Korea figure is a floor:** Safari 26 reports an old OS version in its user-agent string ("iPhone OS 18_6"). StatCounter applied a correction on 2026-01-19, but some "18.x" traffic may still be iOS 26 ([Daring Fireball](https://daringfireball.net/2026/01/ios_26_adoption_rate_is_not_bizarrely_low)). Read the Korean iOS 26+ share as at least about 60%, and likely close to Apple's global figure. That last step is an inference; there are no official Korea-only figures.

## 3. App Store consumer spending

**Apple ecosystem study** (Analysis Group plus a Seoul National University professor; commissioned by Apple; published 2026-08-06):
- 2025 billings and sales through the Korean App Store: ₩38.1T ($26.8B).
  - Physical goods and services: ₩32.3T
  - **Digital goods and services: ₩3.7T** (the slice relevant to app subscriptions)
  - In-app advertising: ₩2.1T
- More than 90% of billings carried no Apple commission.
- Growth in digital goods came from games, streaming and **productivity**.
- About 12M weekly App Store visitors and about 670M downloads in 2025.
- Korean-made apps took about 60% of domestic downloads and about 50% of revenue.
- Source: [Korea Times](https://www.koreatimes.co.kr/business/companies/20260806/korean-app-store-spending-topped-268-bil-in-2025-apple)

**Global rank:**
- Korea was **4th worldwide in mobile in-app revenue in 2025**, behind the US, China and Japan (Sensor Tower "State of Mobile 2026", via [HeraldK, 2026-02-03](http://www.heraldk.com/2026/02/03/%ec%95%b1%ec%8a%a4%ed%86%a0%ec%96%b4%ec%97%90%ec%84%9c-%e2%80%98ai%ec%95%b1%e2%80%99-%ed%8c%94%ec%95%84-%eb%b2%88-%eb%8f%88-1%eb%85%84%ec%83%88-450-%eb%8a%98%ec%97%88%eb%8b%a4)).
- Earlier figure: Korea was also 4th in 2023, at $7.86B ([data.ai via KED Global](https://www.kedglobal.com/mobile-networks/newsView/ked202401110013)).
- No 2025 Korea total in USD was found.

**Games vs everything else:**
- 2023 (data.ai): games were $6.34B of $7.86B, about 81%.
- 2025 Korean mobile game in-app revenue was projected at $5.3B, with Google Play at 75% (Sensor Tower, Oct 2025; [Tiger](https://www.itiger.com/news/1137548920)).
- iOS share of Korean game revenue was 26.4% in H1 2025, up from 24.1%, while iOS had only 29% of downloads ([Sensor Tower KR](https://sensortower.com/ko/blog/1H2025-mobile-games-recap-in-Korea)).
- In the "software" category, revenue grew from 12% to over 20% of in-app revenue, driven by ChatGPT ([Airbridge / Sensor Tower](https://www.airbridge.io/ko/blog/2026-apac-app-trends)).
- No 2025 figure was found for the share of Korean spending that goes to subscriptions.

**Per-user spending:**
- No 2025 per-user figure was found.
- Old data point: Korea had the world's highest iOS revenue per download, $16, in 2023 ([Sensor Tower KR, Oct 2023](https://sensortower.com/ko/blog/YouTube-holds-the-top-position-in-revenue-across-all-categories-in-the-Korean-iOS-market)).
- ChatGPT's revenue per download in Korea is $8.7, 2nd worldwide; Korea is 1.5% of ChatGPT downloads but 5.4% of its revenue ([Sensor Tower KR, Nov 2025](https://sensortower.com/ko/blog/Korea-ranks-No-2-globally-in-ChatGPT-revenue-per-download)).

**Willingness to pay for utility subscriptions:**
- Korea has the most paid ChatGPT users outside the US (OpenAI, May 2025; [KED Global](https://www.kedglobal.com/artificial-intelligence/newsView/ked202505260006)).
- Korean generative-AI in-app revenue in 2025:
  - $235M, up 513.6% ([Inven, 2026-02-06](https://www.inven.co.kr/webzine/news/?news=313405)), versus
  - about $200M, up 450% ([HeraldK](http://www.heraldk.com/2026/02/03/%ec%95%b1%ec%8a%a4%ed%86%a0%ec%96%b4%ec%97%90%ec%84%9c-%e2%80%98ai%ec%95%b1%e2%80%99-%ed%8c%94%ec%95%84-%eb%b2%88-%eb%8f%88-1%eb%85%84%ec%83%88-450-%eb%8a%98%ec%97%88%eb%8b%a4)).
  - **The two sources conflict.** HeraldK also reports that the share of users paying for two AI services rose from 23.2% to 40.8%.
- Korea Chamber of Commerce / Embrain survey (2025-01-20 to 01-31; n=1,000, ages 19–69; [Korcham](https://www.korcham.net/nCham/Service/Economy/appl/KcciReportDetail.asp?CHAM_CD=B001&SEQ_NO_C010=20120940674)):
  - 94.8% have used a subscription service.
  - 39.8% currently hold 3–4 subscriptions.
  - Total monthly spend on subscriptions: 30.5% spend under ₩30k, 14.9% spend over ₩150k.
  - Video streaming is the top category (60.8%).
- No productivity-specific willingness-to-pay data was found.

## 4. Reminder / alarm / to-do landscape (live store pages fetched 2026-10-05)

**Free Productivity top 25 (KR):**
1. Claude
2. Gemini
3. TeraBox
4. ChatGPT
5. **LockDay** (to-do app with a lock-screen calendar; by Dat Pham; Korean title; ₩4,400/month, ₩17,000/year, ₩33,000–44,000 lifetime; only 52 ratings)

Others in the top 25 include Notion (#13), the habit app "-잉" (#15), Calvak (#18, calendar for university students), Minical (#19), the Eisenhower Matrix app (#21), A. (SKT's AI assistant, #22), TimeTree (#24) and **Clova Note** (Naver's voice recording and transcription app, #25).

Source: [App Store KR Productivity chart](https://apps.apple.com/kr/charts/iphone/productivity-apps/6007)

**To-do apps:**

| App | Origin | Rank / rating | Price |
|---|---|---|---|
| [TodoMate](https://apps.apple.com/kr/app/%ED%88%AC%EB%91%90%EB%A9%94%EC%9D%B4%ED%8A%B8-%ED%95%A0-%EC%9D%BC-%EB%A3%A8%ED%8B%B4/id1505220130) | Korean | #31 Productivity, 4.8★, 110k ratings | ₩2,500/month, ₩7,500/year |
| [TickTick](https://apps.apple.com/kr/app/ticktick-%ED%95%A0%EC%9D%BC-%EB%AA%A9%EB%A1%9D-%EC%8A%A4%EC%BC%80%EC%A4%84-%ED%94%8C%EB%9E%98%EB%84%88-%EB%AF%B8%EB%A6%AC%EC%95%8C%EB%A6%BC-%EB%8B%AC%EB%A0%A5/id626144601) | Foreign | #101, 7.1k ratings | ₩7,700/month, ₩77,000/year |

**Alarm apps:**

| App | Origin | Rank / rating | Price |
|---|---|---|---|
| [Alarmy (알라미)](https://apps.apple.com/kr/app/%EC%95%8C%EB%9D%BC%EB%AF%B8-%EB%AC%B4%EC%A1%B0%EA%B1%B4-%EA%B9%A8%EC%9B%8C%EC%A3%BC%EB%8A%94-%EC%95%8C%EB%9E%8C-%EC%8B%9C%EA%B3%84/id1163786766) | Delight Room (Korean) | #46 Lifestyle, 4.7★, 110k ratings | Premium ₩2,200–8,500 per tier; annual ₩58,000–71,000 |
| [Alarmmon (알람몬)](https://apps.apple.com/kr/app/%EC%95%8C%EB%9E%8C%EB%AA%AC-%EC%95%84%EC%B9%A8%EC%9D%84-%EA%B9%A8%EC%9A%B0%EB%8A%94-%EC%83%88%EB%A1%9C%EC%9A%B4-%EC%95%8C%EB%9E%8C-alarm/id529141346) | Malang Studio (Korean) | 4.5★, 16k ratings | Sells K-pop idol voice alarms (e.g. NCT127) and morning calls, ₩3,300–29,000 per pack |

Alarmy supports Korean plus 32 other languages.

**Voice-first and talking-alarm apps:**
- **[모닝콜 (Stone Seoul, Korean)](https://apps.apple.com/kr/app/%EB%AA%A8%EB%8B%9D%EC%BD%9C-%EC%95%8C%EB%9E%8C-ai-%EC%A0%84%ED%99%94-%EC%95%8C%EB%9E%8C-%EB%AF%B8%EB%9D%BC%ED%81%B4-%EB%AA%A8%EB%8B%9D-%EC%95%8C%EB%9E%8C%EC%8B%9C%EA%B3%84/id6654901061):** actual phone calls as alarms plus an "AI morning briefing" in selectable AI voices. 4.8★ from 364 ratings; Pro ₩5,700. This is the closest local analogue to Remi.
- **[말하는 시계 (talking clock)](https://apps.apple.com/kr/app/id6739522220):** a foreign app with 7 ratings, charging ₩9,900/month, ₩55,000/year and ₩229,000 lifetime.
- A Turkish "voice reminder alarm" app and Open Rhapsody's "말하는 목소리 알람" ([listing](https://mwm.ai/ko/apps/talking-voice-alarm-reminder/6445911723)) also exist. No chart data was found for either.
- Remindly AI, RemindMe and similar results were Google Play (Android-only), so they were discarded.

**Inference (not data):** a Korean-language voice-to-reminder app with an AI-voiced alarm does not appear to have a chart-leading incumbent. None was seen in the charts fetched.

## 5. Behaviour relevant to a voice-input app
- **Voice-assistant usage: no reliable 2024–2026 Korean survey found.**
  - Discarded: the widely repeated "Korea 71% voice search, highest globally" and "41% smart speaker penetration" claims. They appear only on SEO aggregator sites ([example](https://www.digitalapplied.com/blog/voice-search-statistics-2026-data-points)) with no primary source.
  - Discarded as too old: KISDI's voice-assistant report from 2017.
- **Indirect signals:**
  - 44.5% of Koreans have used generative AI and 67.0% use some AI service in daily life (Ministry of Science and ICT "2025 Internet Usage Survey", released 2026-03-31; [korea.kr](https://www.korea.kr/briefing/pressReleaseView.do?newsId=156751949&pWise=main&pWiseMain=L1)).
  - ChatGPT was the most-used app in Korea in 2025 (WiseApp).
  - Clova Note (voice transcription) is in the Productivity top 25 today.
  - Apple Intelligence has supported Korean since iOS 18.4 (April 2025) ([Korea Herald review](https://www.koreaherald.com/article/10467676)).
  - Siri's wake phrase in Korean is "Siri야".
- **Public spaces:**
  - Seoul Metro logged 2,734 complaints about phone use in Jan–Apr 2025, mostly loud calls and speakers without earphones ([Asia Times KR, 2026-05-27](https://www.asiatime.co.kr/article/20260527500208)).
  - There is no law against calls on the subway, but quiet use is the norm.
  - Inference: speaking a reminder aloud on public transport is socially awkward, so at-home or private moments are more likely. No survey backs this.
- **Commuting:**
  - Average one-way commute in Seoul is 34.5 min (Seoul Institute, 2025 report on 2023 data); 1 in 7 residents spend more than 2 hours a day commuting ([Korea Herald](https://www.koreaherald.com/article/10551438)).
  - OECD (2016): Korea's one-way average was 58 min against an OECD average of 28.
- **Alarm habits:** no survey found. The commercial success of "unbreakable" mission alarms (Alarmy: 4.7★, 110k Korean ratings) and paid idol voice alarms (Alarmmon) shows people pay for alarm features, but that is indirect evidence.

## 6. Localization expectations
- **English:** Korea ranks #48 on the EF English Proficiency Index 2025 ("moderate"). Score 522; speaking is the weakest skill at 489 ([EF fact sheet](https://www.ef.com/assetscdn/WIBIwq6RdJvcD9bc8RMd/cefcom-epi-site/fact-sheets/2025/ef-epi-fact-sheet-south-korea-english.pdf)).
- **App naming:** AppTweak (2024-02-27) found that 75% of the top 25 apps and games in Korea use a Korean name or a Korean + English name. They recommend native-speaker translation and mixing Korean and English keywords ([AppTweak](https://www.apptweak.com/en/aso-blog/how-to-localize-your-app-in-korean)).
- **Search behaviour:** Asodesk (2022) says Koreans often drop spaces in search queries (e.g. "킹덤디펜스"), so keywords need both spaced and unspaced forms. They advise against machine translation alone and suggest Papago over Google Translate ([Asodesk](https://asodesk.com/blog/how-aso-specialists-should-localize-apps-for-the-korean-market/)). This is ASO-vendor advice, not measured data.
- **General study:** CSA Research's "Can't Read, Won't Buy" (2020; 8,709 consumers in 29 countries) found 76% prefer to buy with information in their own language and 40% never buy from sites in other languages ([newswire](https://www.newswire.com/news/survey-of-8-709-consumers-in-29-countries-finds-that-76-prefer-21174283)). It is not Korea-specific.
- **Not found:** Korea-specific data on penalties for English-only or machine-translated apps.

## 7. Platform and regulation
- **In-app payment law (Telecommunications Business Act amendment, Sept 2021).** Apple complies through the StoreKit External Purchase Entitlement (KR):
  - Requires a separate app build distributed only on the Korean storefront, which cannot also use Apple's in-app purchase.
  - If the app replaces an existing one, the old app must be removed from the Korean store.
  - One payment provider per entitlement; pre-approved providers are KCP, Inicis, Toss and NICE.
  - **26% commission**, with monthly reporting and audit rights. Apple's page lists no small-business or second-year reduced rate.
  - Source: [Apple Developer](https://developer.apple.com/support/storekit-external-entitlement-kr/)
- **Enforcement:**
  - In Oct 2023 the regulator proposed fines of ₩68B (Apple ₩20.5B, Google ₩47.5B).
  - The KMCC (방미통위) re-heard the case on 2026-08-12 and found both companies in violation; sanctions are to be decided later ([JoongAng Daily, 2026-08-12](https://www.koreajoongangdaily.com/business/korea-finds-google-apple-violated-inapp-purchases-law/12822157); [IT Daily, 2026-08-13](https://www.itdaily.kr/news/articleView.html?idxno=240978)). As of 2026-10-05 no final decision was found.
- **Newer rule, the e-commerce "dark pattern" amendments (in force 2025-02-14):**
  - Before a free trial converts to paid, or a recurring price increases, the seller must get the consumer's consent within the 30 days before the change.
  - The seller must state the before and after prices, the timing, and how to cancel.
  - Repeated nagging of a choice the user already made is banned (users can opt out for 7+ days).
  - Source: [korea.kr policy news](https://www.korea.kr/news/policyNewsView.do?newsId=148939436); [Korea Herald](https://www.koreaherald.com/article/10417265)
  - **Flag:** the 2024 draft coverage cited a 14-day window for trial conversion ([Nate](https://m.news.nate.com/view/20240718n16040)), and secondary sources disagree on fines. Unverified: whether this applies to the developer or is satisfied by Apple's own billing for App Store subscriptions.
- **Apple Ads:** South Korea is on the current list of Apple Ads countries ([ads.apple.com](https://ads.apple.com/app-store/countries-and-regions)). It has been available since Aug 2018. The page doesn't say which ad placements run there.
