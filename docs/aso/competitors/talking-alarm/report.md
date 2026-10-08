# Talking Alarm competitor review mining (Google Play)

Pulled 2026-10-07 with `google-play-scraper` (sort NEWEST, paginated to the end per (lang, country) query). Language detection: `lingua` restricted to ~30 plausible languages + script rules for ja/ko/th/he and keyboard-letter rules to split Arabic-script text into ar/fa/ur.

**Big caveat:** Google Play does not report reviewer country. Every country figure here is inferred from language. Google buckets reviews by the reviewer's language; the `country` query parameter does not change results (§3).

## 1. Which app

Nothing big on Play is literally named "Talking Alarm". Candidates:

| Title | Package | Developer | Installs | Ratings | Score |
|---|---|---|---|---:|---:|
| **Talking Alarm Clock Beyond** | com.sentryapplications.alarmclock | Sentry Apps | 10M+ (11.6M) | 126,570 | 4.70 |
| Talking Alarm Clock & Sounds | alarm.clock.night.watch.talking | ZipoApps | 1M+ (3.3M) | 73,228 | 4.52 |
| Speaking Alarm Clock | wan.pclock | Wansoft | 5M+ | 95,688 | 4.43 |
| Talking Alarm (JP しゃべる目覚まし / KR 말하는 알람) | com.monmonapps.android.talkingalarm | Sleeply | 5K+ | 61 | 4.46 |
| Talk! Alarm Clock | com.kentanko74.talkalarmclock | Associate One | 10K+ | 942 | 4.55 |
| Talking Alarm Clock | com.talkingalarmclock | HS Mobile | 5K+ | 80 | 4.5 |

- **Primary: Sentry "Talking Alarm Clock Beyond"**: most installs of any "Talking Alarm..." title; a 2025 review says it was recently renamed "to add the word 'Talking'".
- **Secondary: ZipoApps**: very different language mix, and it speaks Arabic.
- **Sleeply "Talking Alarm"**: the only literal match; 26 reviews (ja 8, ko 9, en 4, ru 3).

## 2. Totals

| App | Unique reviews | Avg ★ | Last 12 months |
|---|---:|---:|---:|
| Sentry | **51,350** | 4.64 | 5,650 |
| ZipoApps | 15,674 | 4.56 | 645 |
| Sleeply | 26 | - | - |

Only reviews with text are returned (~41% of Sentry's ratings). Deduped by reviewId.

## 3. Does the country parameter matter? No.

Within a language, every country returned an identical review set (Jaccard 1.00):
- **Sentry:** en/us = gb = in = au = ng = pk = za (12,650 each); ar/ae = sa = eg = us (80); ja/jp = ja/us (447); ko/kr = ko/us (1,212); es/es = mx = us (7,332); fr/fr = fr/ca; ru/ru = ru/ua.
- **ZipoApps:** same pattern across all 11 English, 4 Arabic, 3 Spanish, 2 French and 2 Russian countries.

Only different language codes differ (zh, zh-TW and zh-CN are separate buckets).

## 4. Language breakdown, Sentry

"Google bucket" = the language Google filed the review under; "detected" = lingua's reading of the text.

| lang | Google bucket | % | avg ★ | detected |
|---|---:|---:|---:|---:|
| en | 12,650 | 24.6% | 4.61 | 11,410 |
| ru | 7,844 | 15.3% | 4.57 | 6,850 |
| es | 7,332 | 14.3% | 4.73 | 5,605 |
| pt | 6,790 | 13.2% | 4.75 | 5,438 |
| fr | 3,690 | 7.2% | 4.61 | 3,180 |
| de | 3,223 | 6.3% | 4.65 | 2,833 |
| pl | 2,126 | 4.1% | 4.71 | 1,438 |
| it | 1,944 | 3.8% | 4.59 | 1,813 |
| id | 1,389 | 2.7% | 4.68 | 756 |
| tr | 1,260 | 2.5% | 4.58 | 1,156 |
| **ko** | **1,212** | 2.4% | 4.69 | 1,143 |
| nl | 640 | 1.2% | 4.63 | 586 |
| uk | 470 | 0.9% | 4.64 | 696 |
| **ja** | **447** | 0.9% | **4.24** | 445 |
| zh (all) | 81 | 0.2% | 4.54 | 44 |
| **ar** | **80** | 0.2% | 4.22 | 116 |
| fa / he / hi | 57 / 37 / 25 | <=0.1% | | |
| und (too short / emoji only) | | | | 7,383 (14.4%) |

Where text was long enough to detect, detected language matched Google's bucket for ~90%. Most mismatches: short undetectable texts; ru -> uk (343, Ukrainians writing Ukrainian on a Russian-language phone); en -> fr (202).

## 5. Language breakdown, ZipoApps

| lang | n | % | avg ★ |
|---|---:|---:|---:|
| es | 7,296 | 46.5% | 4.68 |
| **ar** | **1,515** | 9.7% | 4.51 |
| pt | 1,226 | 7.8% | 4.53 |
| en | 1,176 | 7.5% | 4.34 |
| id | 952 | 6.1% | 4.38 |
| fr | 697 | 4.4% | 4.54 |
| ru | 553 | 3.5% | 4.38 |
| fa | 525 | 3.3% | 4.46 |
| tr / th / pl | 335 / 309 / 304 | ~2% each | |
| ja | 47 | 0.3% | 4.04 |
| ko | 39 | 0.2% | 4.38 |

ZipoApps has ~19x Sentry's Arabic volume; its reviewers say it speaks Arabic ("ناطق بالعربي").

## 6. Inferred country

| Language | Likely countries | Confidence |
|---|---|---|
| ja | Japan | High |
| ko | South Korea | High |
| pt | Brazil (Portugal small) | High |
| ru | Russia + CIS | Medium |
| pl / tr / id / it / nl | Poland / Türkiye / Indonesia / Italy / NL+BE | Medium-High |
| de | DE / AT / CH | Medium |
| fr | France, Canada, Belgium, Africa | Medium |
| es | Mexico, Spain, Argentina, Colombia, US Hispanics... | Low for any single country |
| en | US, UK, India, CA, AU, NG, PH + English-locale phones everywhere (much of the Gulf) | Very low |
| ar | Saudi, UAE, Egypt, Iraq, Maghreb | Low |

Arabic: dialect markers in ZipoApps' 1,515 Arabic reviews were sparse (Egyptian 12, Levantine 8, Iraqi 5, Maghrebi 5, Gulf 3); one Saudi review complains about "130 riyal a month". Many Gulf users run English-locale phones, so the Gulf hides inside the English bucket. Explicit country mentions in text are too rare to use.

## 7. Japanese, Korean and Arabic

| | Sentry | ZipoApps | Sleeply | Sentry last 12 mo | Sentry avg ★ |
|---|---:|---:|---:|---:|---:|
| ja | 447 | 47 | 8 | 86 | 4.24 |
| ko | 1,212 | 39 | 9 | 107 | 4.69 |
| ar | 80 | 1,515 | 0 | 15 | 4.22 |

- Sentry Japanese reviews per year: 52 (2022), 63, 84, 98 (2025): rising every year.
- Sentry Korean reviews peaked at 368 in 2021, ~140-190/yr since.

## 8. Recency

| Year | 2018 | 2019 | 2020 | 2021 | 2022 | 2023 | 2024 | 2025 | 2026 (to Oct 7) |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Sentry | 123 | 493 | 3,521 | 9,480 | 8,926 | 7,757 | 9,230 | 7,612 | 4,208 |
| ZipoApps | - | - | 135 | 990 | 7,936 | 4,421 | 1,106 | 625 | 461 |

Sentry is still active; ZipoApps peaked in 2022 and is fading.

## 9. Complaints and praise

Keyword theme counts for Sentry, all languages: 1-2★ (n=2,766), 4-5★ (n=47,169). Regexes in `scripts/themes.py`.

**Complaints**
1. **Alarm doesn't go off / unreliable (394):** battery optimisation, app killed in background, broken by updates. *"Sometimes alarms go off and sometimes they don't."* / *"My alarms don't go off without opening the app."*
2. **Ads (143):** full-screen ads after dismissing an alarm, ads where you tap, ads keeping the screen on. *"It's an ad generator that happens to have an alarm function built in."* (60 👍)
3. **Dismiss / snooze UX (84):** alarm screen not in front, stray touches change settings, skipped alarms no longer reset.
4. Smaller: battery / background killing (100, overlaps #1), voice not speaking (61), volume (54).

**Praise:** "great / love" (~11K), easy to use (3,647), actually wakes me (2,501), the voice speaks the time and the user's own message (860), flexible scheduling (specific dates, every N days, shift calendars).

### Japanese (Sentry n=447, avg 4.24, least satisfied major language)
Complaints: alarm doesn't always ring; stray touches open settings or ad links; no Japanese-holiday support.
- 「設定した時刻通りにアラームが鳴らず、恐くて使えない。」 *The alarm doesn't ring at the set time. Too scary to rely on.*
- 「トーキングのわりには喋らないんです。」 *For a "talking" alarm, it doesn't talk.*

Praise: hearing what the alarm is for.
- 「アラームの後に言葉でお知らせしてくれるので "あっそうだった!!" と準備できる…後期高齢者」 *After the alarm it tells me in words what it's for, so I go "oh right!" and get ready. [I'm] elderly.* (144 👍, top Japanese review)
- 「予定の詳細（約束の時間、出発時間、場所、誰と、持ち物）も読み上げてもらっている」 *I have it read out the details: time, departure, place, who with, what to bring.*

### Korean (Sentry n=1,212, avg 4.69)
Complaints: alarms silently fail; "not really talking, only says the time and not my memo"; heavy / racy ads; dial instead of typing the time.
- 「유료 결제까지 했는데 중요한 알람을 연속으로 두번을 놓침」 *I even paid, and it missed two important alarms in a row.* (89 👍)
- 「시간은 말하고 메모내용은 왜 안읽어주는지…」 *It says the time, but why won't it read my memo?*

Praise: says the reason for the alarm; shift workers can pick specific dates.
- 「알람을 맞춰둔 이유도 말해주니 아주 좋습니다」 *It tells me the reason I set the alarm. Really good.*
- 「교대근무자로 특정일자를 선택할수 있어 편리합니다」 *As a shift worker, picking specific dates is convenient.* (135 👍)

### Arabic (Sentry 80, ZipoApps 1,515)
Sentry's #1 complaint: no Arabic UI or voice. ZipoApps: price, voice not speaking.
- 「ليش ما فيه لغة عربية… مو كل الناس بتعرف بالإنجليزي」 *Why no Arabic? Not everyone knows English.*
- 「صوتها ليس باللغة العربية تحتاج الى صوت باللغة العربية」 *The voice isn't Arabic. It needs an Arabic voice.* (27 👍)
- 「130 ريال شهريا هذا نصب」 *130 riyals a month is a rip-off.*

Praise: easy to use, alarms on specific months/days, "speaks Arabic, I recommend it" (ZipoApps, 44 👍).

## 10. What this means for Remi

- **Core value matches.** In Japanese and Korean, "tell me in words what this alarm is for" is the top praise, and failing at it a top complaint. That is Remi's core feature.
- **Reliability is the opening.** "It didn't ring" is the #1 complaint (Android killing apps in the background). iOS AlarmKit avoids this, so "it always rings" is a credible pitch.
- **Arabic is a gap.** A native Arabic voice and UI is something the market leader doesn't offer.
- **Country to add: Brazil.** Portuguese is the largest bucket that maps to essentially one country (~8,000 reviews across both apps). English can't be split by country; Spanish spans ~20 countries; Russian points to Russia, where Apple Search Ads doesn't run. Of the four chosen markets, Korea has the strongest signal.

## 11. Limitations

- Country is inferred, never reported; the country parameter had no effect (§3).
- These are Android users; iOS reviewers in the same countries may skew differently.
- Only reviews with text are returned.
- Languages outside the 26 queried buckets (cs, hu, sv, ro, el, bn...) weren't pulled.
- Empty results can be transient (ZipoApps ar/sa returned 0, then 1,515 on retry); fil/tl returned 0-1 (probably not a supported bucket).
- Sentry's English bucket was fetched for 7 of 12 English-speaking countries after the first proved identical; an interrupted en/ca pull stopped at 4,000 was discarded.
- Theme counts come from keyword regexes: indicative only. Quotes were read and translated by hand.
- Arabic dialect inference rests on a handful of reviews.

## Files

- `reviews.csv`: Sentry, 51,350 rows (reviewId, date, score, text, thumbsUp, appVersion, queryPairs, queryLangs, detectedLang)
- `reviews_zipoapps.csv`: 15,674 rows
- `reviews_sleeply.csv`: 26 rows
- `scripts/fetch.py`, `scripts/analyze.py`, `scripts/themes.py`: the pipeline. Raw JSON was in the session scratchpad only.
