# ar-SA localization research: Remi: Voice Reminders

Researched 2026-10-08. Research only, nothing created in App Store Connect.
Character counts are Unicode characters (Arabic letters, spaces and punctuation each count 1). No tashkeel (diacritics) is used anywhere: Apple bans diacritics in subscription display names (see 4.1).

## 1. Top picks

| Field (limit) | Top pick | Chars | Why |
|---|---|---|---|
| App name (30) | `Remi: منبه ناطق وتذكير صوتي` | 27 | Puts the two words people actually use (منبه, ناطق) in the most heavily weighted field. Latin brand first, the way Muslim Pro and MyTherapy do it in their Arabic titles. |
| Subtitle (30), paired with that name | `يذكرك بالدواء والمواعيد` | 23 | "Reminds you of your medicine and appointments". No word repeats from the name. It names the top forgotten item (medicine) and uses مواعيد, the word Saudi reviewers use for appointments and medicine times. If the name stays plain "Remi", use `منبه ناطق يذكرك بمواعيدك` (24) instead. |
| Subscription group display name (30, third-party figure) | `Remi Pro` | 8 | Apple keeps "Pro" in Latin on its own Arabic site (iPhone 18 Pro), and Muslim Pro's Saudi IAPs keep Latin product names. It's pure Latin, so there are no bidi issues. |
| Subscription display name (35, Apple) | `اشتراك Pro` | 10 | Arabic "subscription" plus the Latin tier name, so it is clear and still matches the brand. Use the same for monthly and annual: Apple shows the duration and price itself. |
| Subscription description (55, Apple) | `تذكيرات نشطة بلا حدود وتكرار على فترات خلال اليوم` | 49 | "Unlimited active reminders, and repetition at intervals through the day." Plain MSA. "تكرار على فترات" mirrors how a reviewer asked for interval reminders (48 likes, quoted in 2.1). |

## 2. Vocabulary, with evidence

### 2.1 What the Arabic reviews of talking-alarm apps say (local data, Google Play, ar_sa/ar_ae/ar_eg/ar_us pool)
Grep counts across `docs/aso/competitors/talking-alarm/reviews*.csv`:
- **منبه / المنبه** appears in 34 review lines, against **تذكير / تنبيه** in 11. منبه is the everyday word for the thing that rings.
- People describe the talking feature as **ناطق** (talking) and **ينطق** (speaks):
  - "ممتاز جدا وناطق بالعربي انصح به" (44 likes, ZipoApps). *Excellent, talks in Arabic, I recommend it.*
  - "المنبه ناطق بتكتب العباره اللي انت عايز تسمعها" (Egyptian). *The alarm talks: you type the phrase you want to hear.*
  - "الان المنبه لا ينطق" and "لا ينطق الرساله الصوتيه". *The alarm doesn't speak / doesn't speak the voice message.*
  - "التنبيه الناطق" (23 likes), "الساعة الناطقة" (several reviews; this is what people call ZipoApps).
- "It tells me what the alarm is for", in a user's own words: **"ممتاز وفيه صوت اسم التنبيه"** (2026-02-04). *Excellent, it voices the alarm's name.* This is Remi's core feature in one line.
- Voice-reminder variants seen: **تذكير صوتي** ("هو فيه تذكير صوتي مش عارف اشغله"), **تنبيه صوتي** ("ساعة انيقة وجميلة مع تنبيه صوتي رائع"), **رسالة تذكير صوت**.
- Medication, in a user's words: "يذكرنى فى الوقت الذى اتناول فيه الدواء". *It reminds me when to take my medicine.*
- Interval schedules, as a user feature request (48 likes): "نظام تذكيري متكرر يبدأ من الساعة ٨ صباحا وينتهي الساعة ٨ مساءا مثلا ويتكرر كل ربع ساعة". *A repeating reminder from 8am to 8pm, every quarter hour.* That is exactly the Pro interval feature, so **متكرر / يتكرر / تكرار** is the natural word.
- Price sensitivity: "ممتاز لكن سعر الاشتراك مرتفع" and "130 ريال شهريا هذا نصب". **اشتراك** is the word users use for subscription.
- Arabic is the main demand: "صوتها ليس باللغة العربية تحتاج الى صوت باللغة العربية" (27 likes), and on Sentry "ليه ما فيه لغة عربية… مو كل الناس بتعرف بالإنجليزى" (19 likes).
- Caveat: dialect markers are mostly Egyptian/Levantine, with few Gulf ones (already noted in `docs/aso/competitors/talking-alarm/report.md`).

### 2.2 Saudi-written App Store reviews (Gulf dialect)
From مواعيدي و مهامي (developer Yahya Alzahrani, 1,700+ ratings, Saudi store):
- "اقتراح إضافه تنبيه يستمر او يتكرر حتى اغلقه انا حتى انتبه للجوال". *Please add an alert that keeps going or repeats until I close it, so I notice the phone.* This is Gulf phrasing (**الجوال** for phone, and **تنبيه** for the ringing alert), and it describes Remi's ring-until-dismissed behaviour.
- "يليتكم تحطو اشعارات تذكير لما يقرب الوقت" (Gulf: ليتكم تحطون). *Wish you'd add reminder notifications as the time approaches.*
- "ممتاز جدا للمواعيد والتذكير", "افضل تطبيق للمهام والمواعيد", "اقوى تطبيق منقذذذ" (lifesaver).
- Takeaway: Gulf users say **مواعيد** (appointments/times), **تذكير** (reminding), **تنبيه** (the alert that fires) and **الجوال** (phone).

### 2.3 What the store listings call themselves (titles and subtitles)
| App | Arabic title / subtitle | Note |
|---|---|---|
| Apple Reminders | التذكيرات | Apple's own term. |
| Apple Clock / Watch alarms (support page) | منبه, غفوة (snooze), اضبط منبه, تكرار | Apple's official alarm vocabulary. |
| myAlarm (AppMind) | المنبه. Description: "ساعتنا ذات المنبه الناطق" | **المنبه الناطق** = talking alarm, used by a localized store listing. Its IAPs stay Latin ("Premium - Monthly + Trial", AED 19.99). |
| المنبه برو | "المنبه برو: ساعة، مؤقت نوم،طقس" / "استيقظ صباحًا بأصوات عالية" | "Pro" transliterated as **برو** inside an Arabic title. |
| RealAlarm (AlarmKit, iOS 26+) | title shown as "المنبه الحقيقي: منبه النظام". Description: rings "حتى عند كتم صوت الهاتف" | A direct AlarmKit competitor. Its silent-mode phrasing is reusable. |
| MyTherapy | "MyTherapy: تطبيق منبه الدواء" / "تذكير وتتبع أوقات الأدوية" | **منبه الدواء**: a pill app also uses منبه. |
| PillAlert | "PillAlert : تذكير الدواء" / "لا تفوت جرعتك أبدًا ادوية" | تذكير الدواء, جرعة. IAPs stay Latin ("Premium monthly", "Premium annual"). |
| ذكرني - Remind me | Title ذكرني. Description "تطبيق ذكرني هو سكرتيرك الإلكتروني" | The imperative **ذكرني** ("remind me") works as an app name. |
| مواعيدي و مهامي (Saudi dev) | Title only | مواعيد + مهام (tasks / to-do). |
| Muslim Pro | "Muslim Pro: أذان ومواقيت صلاة" / "القرآن الكريم والأذكار اليومية" | Latin brand plus Arabic descriptor. |
| توكلنا (Saudi gov) | "توكلنا" / "التطبيق الوطني الشامل" | MSA, with occasional Saudi touches like "خلك قريب منهم". |
| صحتي (Saudi MoH) | "صحتي \| Sehhaty" / "خدمات صحية لك ولعائلتك" | Formal MSA, bilingual title. |

### 2.4 Which word wins
| Concept | Use | Notes |
|---|---|---|
| alarm (the thing that rings) | **منبه** | Dominant in reviews and in Apple's own Clock UI. Write it without the shadda (منبه, not منبّه): store search ignores tashkeel in practice, and Apple bans diacritics in IAP names. |
| talking alarm | **منبه ناطق** / **المنبه الناطق** | Used by users and by myAlarm. الساعة الناطقة means a talking *clock* (it announces the time). Good as a keyword, wrong for the title. |
| reminder | **تذكير** (pl. تذكيرات) | Apple's app name. Saudi reviewers use it for the feature. |
| alert that fires | **تنبيه** | Gulf reviewers use it for the ringing alert. Weaker than منبه as a search term. |
| voice reminder | **تذكير صوتي** | Seen verbatim in reviews. |
| "tells me what it's for" | "ينطق اسم التنبيه" / "يقول لك وش التذكير" | First form follows the review "صوت اسم التنبيه". The second is Gulf colloquial (وش = what), my suggestion, not seen in a source. |
| snooze | **غفوة** | Apple's term. |
| I forgot / forgetting | نسيت / نسيان | Not found in the review data. Common Arabic, but this specific usage is unverified. |
| to-do / tasks | **مهام** | مواعيدي و مهامي, ذكرني. |
| appointments / times | **مواعيد** | Saudi reviews, Al Jazeera ("مواعيد الدواء"). |
| medication | **الدواء / الأدوية**, dose **جرعة** | PillAlert, MyTherapy, Al Jazeera. |
| phone | **الجوال** (Gulf), not الموبايل | Saudi review. |
| on silent | "حتى عند كتم صوت الهاتف" (RealAlarm). Colloquial "على الصامت" is my suggestion, not seen in a source. | Only true on iOS 26+, so any copy must be qualified. |

### 2.5 Prayer / Islamic apps: vocabulary to avoid
Muslim Pro uses **أذان** (call to prayer), **مواقيت الصلاة** (prayer times), **إشعارات الأذان** and **تذكيرات** in a religious context. Dhikr apps (e.g. منبه ذكر) use منبه/تذكير for أذكار. **Don't use أذان, صلاة, أذكار or ذكر as keywords**: Remi doesn't do prayer times, so those users would bounce, and irrelevant keywords risk review guideline 2.3.7. Note that ذكرني ("remind me") shares the root ذ-ك-ر with ذكر (dhikr). That's fine as a plain word, but don't pair it with religious terms.

## 3. Register and conventions

### 3.1 MSA vs Gulf
- **Titles and subtitles: MSA.** Every Arabic title and subtitle fetched (Apple, Saudi MoH, Tawakkalna, MyTherapy, PillAlert, myAlarm, Muslim Pro, Saudi-made مواعيدي و مهامي) is MSA. Tawakkalna's description is MSA with light Saudi touches ("خلك قريب منهم").
- **Users write in dialect** (وش, ليش, يليتكم تحطو, الجوال, عايز), but the search nouns they use (منبه, تذكير, مواعيد, دواء) are the same in MSA. So MSA store text doesn't cost search relevance.
- **Recommendation:** MSA for name, subtitle, keywords and IAP text. Gulf dialect, if any, only in screenshot captions or promo text (e.g. "لا عاد تنسى دواك"), and only after a native Saudi reviewer checks it. The dialect captions aren't verified here.

### 3.2 Subscription conventions
- Apple's own Saudi support page ("إلغاء اشتراك من Apple"): **اشتراك** (subscription), **إلغاء الاشتراك** (cancel subscription), **الفترة التجريبية** (trial period), **تجديد** (renewal).
- Apple keeps product names in Latin inside Arabic text on apple.com/sa-ar: "iPhone 18 Pro جديد", "iPhone 17 Pro Max".
- Three conventions show up in Saudi IAP lists:
  1. **Latin kept**: Muslim Pro ("Muslim Pro Plus - Yearly", "Premium Version"), myAlarm ("Premium - Monthly + Trial"), PillAlert ("Premium monthly").
  2. **Transliterated brand**: Anghami ("أنغامي بلس", "أنغامي بلَس لايت", "2 أشهر مجاناً من أنغامي بلس"), and the "المنبه برو" title.
  3. **Plain Arabic duration names**: Muslim Pro ("اشتراك سنوي", "اشتراك شهري").
- Arabic terms to use: monthly **شهري**, annual **سنوي**, free trial **تجربة مجانية** (Apple uses الفترة التجريبية), unlimited **بلا حدود** / **غير محدود**.
- Verdict: keep **Pro** in Latin (Apple and Muslim Pro precedent). برو is acceptable, but نسخة مميزة / بريميوم would introduce a second tier name that doesn't match the English UI.

### 3.3 RTL / bidi notes
- Starting with Latin then Arabic ("Remi: منبه ناطق…") is how Muslim Pro and MyTherapy title their Arabic listings. The store renders it fine.
- In a string that is mostly Arabic, a Latin run ("اشتراك Pro") sits at the visual left end. That's normal. Avoid putting punctuation right next to the Latin run (e.g. "Pro،") because bidi can make it jump.
- **Remi vs ريمي:** keep **Remi**. It matches the icon, the in-app name and the English listing, and nobody searches the brand yet. Arabic users can't type "Remi" easily, but brand search volume is negligible now. Revisit if Arabic brand search becomes real.
- Apple's HIG right-to-left page wouldn't render through the fetch tool, so there's no Apple quote on bidi. The points above come from observed listings.

## 4. Drafts with character counts

### 4.1 Limits (verified)
- Apple, "Creating your product page": "In-app purchase names are limited to 35 characters and descriptions are limited to 55 characters". Same page: app name 30, subtitle 30, keywords 100 (comma-separated, no spaces after commas).
- Apple, "Auto-renewable subscription information": subscription group display names and subscription display names "must not contain control characters … or Unicode characters, such as emoticons, diacritics, or special characters". So: **no tashkeel** (no shadda, no tanween such as "أبدًا") in these fields.
- Subscription group display name, 30 characters: from AppsOps (third-party), which also lists IAP name 30 / description 45. That conflicts with Apple's 35/55. The current English description is 50 characters and already live, so 55 is correct for descriptions. To be safe, all drafts below are ≤30 for names and ≤55 for descriptions.

### 4.2 Subscription group display name (≤30)
| # | Text | Chars |
|---|---|---|
| **A (pick)** | `Remi Pro` | 8 |
| B | `ريمي برو` | 8 |
| C | `اشتراك Remi Pro` | 15 |

### 4.3 Subscription display name (≤35, same for monthly and annual)
| # | Text | Chars |
|---|---|---|
| **A (pick)** | `اشتراك Pro` | 10 |
| B | `Pro` | 3 |
| C | `برو` | 3 |

### 4.4 Subscription description (≤55)
| # | Text | Chars | Back-translation |
|---|---|---|---|
| **A (pick)** | `تذكيرات نشطة بلا حدود وتكرار على فترات خلال اليوم` | 49 | Unlimited active reminders and repetition at intervals through the day |
| B | `عدد غير محدود من التذكيرات، وتذكير متكرر خلال اليوم` | 51 | An unlimited number of reminders, and a repeating reminder during the day |
| C | `تذكيرات غير محدودة وتكرار على فترات خلال اليوم` | 46 | Unlimited reminders and repetition at intervals during the day (drops "active") |

A keeps "active" (نشطة), which matters if the free tier caps *active* reminders.

### 4.5 App name / subtitle candidates (for a later app update)
| Field | Text | Chars |
|---|---|---|
| **Name (pick)** | `Remi: منبه ناطق وتذكير صوتي` | 27 |
| Name alt | `Remi: تذكير صوتي ومنبه ناطق` | 27 |
| **Subtitle (pick, with the name above)** | `يذكرك بالدواء والمواعيد` | 23 |
| Subtitle (if the name stays plain "Remi") | `منبه ناطق يذكرك بمواعيدك` | 24 |
| Subtitle alt | `المنبه الناطق للتذكير` | 21 |
| Subtitle alt | `تذكير بصوت يرن حتى على الصامت` | 29. Only true on iOS 26+; needs a qualifier elsewhere. |
| Subtitle alt | `منبه ناطق بالعربي للتذكير` | 25. **Only if the reminder voice actually speaks Arabic.** This is the #1 request in the reviews. |
| Too long | `يذكرك بالدواء والفواتير والمواعيد` | 33 (over 30) |

### 4.6 Keyword field ideas (100 chars, no words already in name/subtitle)
Assuming name `Remi: منبه ناطق وتذكير صوتي` + subtitle `يذكرك بالدواء والمواعيد`:

`تنبيه,ذكرني,مهام,فواتير,موعد الطبيب,عيد ميلاد,الساعة الناطقة,تكرار,جرعة,مذكرة,قائمة,نسيان,منبهات`

96 characters (84 letters and spaces plus 12 commas). Hand-counted, so re-check in ASC.

Alternatives to rotate in: `تذكيرات`, `الأدوية`, `حبوب`, `منظم`, `جدول`, `غفوة`. Never use: أذان, صلاة, أذكار (see 2.5).

## 5. Sources
Fetched and read:
- Apple: product page limits. https://developer.apple.com/app-store/product-page
- Apple: auto-renewable subscription info (diacritics rule). https://developer.apple.com/help/app-store-connect/reference/in-app-purchases-and-subscriptions/auto-renewable-subscription-information
- Apple Support (SA): cancel subscription, Arabic terms. https://support.apple.com/ar-sa/118428
- Apple Support (Arabic, Watch alarms: منبه, غفوة). https://support.apple.com/ar-kw/guide/watch/apd27ce65478/5.0/watchos/5.0
- Apple SA Arabic iPhone page ("Pro" kept in Latin). https://www.apple.com/sa-ar/iphone/
- Apple Reminders (AE, ar). https://apps.apple.com/ae/app/%D8%A7%D9%84%D8%AA%D8%B0%D9%83%D9%8A%D8%B1%D8%A7%D8%AA/id1108187841?l=ar
- myAlarm (AE, ar; المنبه الناطق, Premium IAPs). https://apps.apple.com/ae/app/%D8%A7%D9%84%D9%85%D9%86%D8%A8%D9%87/id1350722971?l=ar
- المنبه برو. https://apps.apple.com/us/app/%E9%AC%A7%E9%90%98%E4%BC%B4%E4%BE%B6%E8%87%A8%E7%9A%84-%E9%AB%98%E6%B8%85%E6%95%B8%E5%AD%97%E9%A1%AF%E7%A4%BA%E5%92%8C%E9%9F%BF%E4%BA%AE%E7%9A%84%E9%9F%B3%E6%A8%82%E6%97%A9%E4%B8%8A%E8%AD%A6%E5%A0%B1/id1168461644?l=ar
- RealAlarm (AlarmKit). https://apps.apple.com/us/app/%EB%A6%AC%EC%96%BC%EC%95%8C%EB%9E%8C-%EC%8B%9C%EC%8A%A4%ED%85%9C-%EC%95%8C%EB%9E%8C-%EB%84%A4%EC%9D%B4%ED%8B%B0%EB%B8%8C-%EC%95%8C%EB%9E%8C-%EC%8B%9C%EA%B3%84-pro/id6748179827?l=ar
- Talking Alarm Clock (NAKAYUBI; no Arabic localization of its title). https://apps.apple.com/us/app/talking-alarm-clock-%EC%95%8C%EB%9E%8C-%EC%8B%9C%EA%B3%84-%EB%AC%B4%EB%A3%8C/id1054238622?l=ar
- MyTherapy (منبه الدواء). https://apps.apple.com/us/app/mytherapy-%E4%BD%A0%E7%9A%84%E6%9C%8D%E8%8D%AF%E6%8F%90%E9%86%92%E5%B0%8F%E7%A8%8B%E5%BA%8F/id662170995?l=ar
- PillAlert. https://apps.apple.com/us/app/%D0%BD%D0%B0%D0%BF%D0%BE%D0%BC%D0%B8%D0%BD%D0%B0%D0%BD%D0%B8%D0%B5-%D0%BE-%D0%BF%D1%80%D0%B8%D0%B5%D0%BC%D0%B5-%D1%82%D0%B0%D0%B1%D0%BB%D0%B5%D1%82%D0%BE%D0%BA/id6444039719?l=ar
- ذكرني - Remind me. https://apps.apple.com/us/app/%D8%B0%D9%83%D8%B1%D9%86%D9%8A-remind-me/id1609860140
- مواعيدي و مهامي (SA) and its reviews. https://apps.apple.com/sa/app/%D9%85%D9%88%D8%A7%D8%B9%D9%8A%D8%AF%D9%8A-%D9%88-%D9%85%D9%87%D8%A7%D9%85%D9%8A/id1459367316?l=ar and https://apps.apple.com/sa/app/1459367316?l=ar&see-all=reviews&platform=iphone
- Muslim Pro (SA, ar; IAP names). https://apps.apple.com/sa/app/id388389451?l=ar
- Anghami (SA, ar; أنغامي بلس IAPs). https://apps.apple.com/sa/app/id545395155?l=ar
- صحتي / Sehhaty (SA). https://apps.apple.com/sa/app/id1459266578?l=ar
- توكلنا (SA). https://apps.apple.com/sa/app/%D8%AA%D9%88%D9%83%D9%84%D9%86%D8%A7/id1613539452?l=ar
- Al Jazeera, medicine-reminder article (MSA terms). https://www.aljazeera.net/tech/2024/8/16/%d9%83%d9%8a%d9%81-%d8%aa%d8%aa%d8%a7%d8%a8%d8%b9-%d9%85%d9%88%d8%a7%d8%b9%d9%8a%d8%af-%d8%a7%d9%84%d8%af%d9%88%d8%a7%d8%a1-%d8%a8%d8%a7%d8%b3%d8%aa%d8%ae%d8%af%d8%a7%d9%85
- iPhone Islam, الساعة الناطقة. https://www.iphoneislam.com/2013/09/arabic-speaking-clock-now-in-google-play/30241
- منبه ذكر (dhikr app). https://mwm.ai/apps/mnbh-dhkr/6753625642
- Local: `docs/aso/competitors/talking-alarm/reviews.csv`, `reviews_zipoapps.csv`, `report.md`.

Seen only as search excerpts (not fetched):
- AppsOps limits table. https://appsops.store/blog/app-store-metadata-localization-character-limits
- Dawai, "منبه الدواء" for Gulf families. https://dawaiapp.com/gcc

Failed or unavailable:
- Reddit (old.reddit.com, r/saudiarabia search): "unable to fetch". No Reddit, X or Arabic forum evidence in this report.
- Apple HIG right-to-left page: rendered empty.
- ZipoApps Google Play Arabic listing: content truncated, so its Arabic title is unverified.
- Parallel Search MCP hit its free-tier rate limit partway through; the rest used WebSearch/WebFetch.

## 6. Open items before shipping
- A native Saudi speaker should read sections 4.4 and 4.5. Nothing here was checked by a native speaker.
- Confirm whether Remi's voice speaks Arabic before using "بالعربي" anywhere.
- Re-count every Arabic string in ASC: all counts here are hand-computed.
