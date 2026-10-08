# Japanese (ja) localization research: Remi (2026-10-08)

Research only. Nothing was created in App Store Connect. Every quote below comes from a page that was fetched or returned in a search excerpt this session (marked "excerpt" where I only saw the search snippet). Character counts treat each Japanese character, full-width symbol and Latin letter as 1, which is how App Store Connect counts them.

## 1. Top picks

| Field | Limit | Top pick | Chars | Why |
|---|---|---|---|---|
| Subscription group display name | no documented limit (keep short) | **Remi Pro** | 8 | Japanese apps keep brand + tier in Latin script (TimeTree's IAPs are named "TimeTreeプレミアム"). "Pro" is understood as is. |
| Subscription display name (monthly) | 30 | **Pro 月額プラン** | 8 | 月額プラン / 年額プラン is the standard pairing (TimeTree coverage, RevenueCat JP). It also tells the two "Pro" rows apart in the store's IAP list, where TimeTree shows two identical names that differ only by price. |
| Subscription display name (annual) | 30 | **Pro 年額プラン** | 8 | Same reason. |
| Subscription description (both) | 45 | **リマインダー無制限＋「2時間おき」などの間隔指定** | 24 | Noun-ending style, like Japanese subtitles. 無制限 is the word for "unlimited". "2時間おき" is how people actually say "every 2 hours". |
| Subtitle (later update) | 30 | **用件を声で読み上げるアラーム** | 14 | 読み上げ (read aloud) is the dominant verb in Japanese reviews praising talking alarms. 用件 answers the top complaint, "what was this alarm for?" |
| Keyword field (later update) | 100 | see §6 (95 chars) | 95 | Covers the forgetting words (飲み忘れ, 払い忘れ, 物忘れ, うっかり) and use cases (通院, 予約, 誕生日, 親). |

Character limits: Apple's In-App Purchase reference says the display name "must be at least two characters and no more than 30 characters" and the description "must be no more than 45 characters" ([Apple, IAP information](https://developer.apple.com/help/app-store-connect/reference/in-app-purchases-and-subscriptions/in-app-purchase-information/)). The auto-renewable subscription reference lists the subscription display name and the group display name with **no character limit stated**, only a ban on control characters, markup and "special characters" such as emoji ([Apple, auto-renewable subscription information](https://developer.apple.com/help/app-store-connect/reference/in-app-purchases-and-subscriptions/auto-renewable-subscription-information)). Not verified: whether the subscription form enforces the same 30/45. The drafts stay within 30/45 to be safe. Because of the "special characters" rule, the display names use a plain space rather than brackets (（）, 【】).

## 2. Draft alternatives

### Subscription group display name
| # | Text | Chars | Note |
|---|---|---|---|
| **A (pick)** | Remi Pro | 8 | Same as English; brand stays recognisable. |
| B | Remi プロ | 7 | Katakana reads slightly cheaper and more "app-ish". Few big apps do this. |
| C | Remi Proプラン | 11 | Fine, but redundant next to the display names. |

### Subscription display name (monthly / annual)
| # | Monthly | Annual | Chars | Note |
|---|---|---|---|---|
| **A (pick)** | Pro 月額プラン | Pro 年額プラン | 8 / 8 | Clear; matches TimeTree's "月額プラン（300円）または年額プラン（3000円）". |
| B | Pro（月額） | Pro（年額） | 7 / 7 | Compact, but brackets may hit the "special characters" rule. しつこいTODO ships "プレミアムプラン(年)" with half-width brackets, so it probably passes. |
| C | Pro | Pro | 3 / 3 | Same as English. The IAP list on the product page would then show two identical "Pro" rows, as TimeTree's does. |

### Subscription description (both, 45 max)
| # | Text | Chars | Note |
|---|---|---|---|
| **A (pick)** | リマインダー無制限＋「2時間おき」などの間隔指定 | 24 | Short, concrete, noun ending. |
| B | リマインダー登録数が無制限。「2時間おき」の間隔設定も可能 | 29 | Spells out that the limit removed is the number of reminders. |
| C | リマインダーを無制限に登録でき、一定間隔のお知らせも使えます | 30 | Polite です/ます. Warmer, but longer and vaguer. |

"Active reminders": none of the fetched Japanese apps uses a word for "active". 登録数 (number registered) is the natural phrasing; "unlimited Beeps" is localized as "upgrade to unlimited Beeps" in English even on JP Beep Me, so there's no clean local model.

### Subtitle candidates (30 max)
| # | Text | Chars | Note |
|---|---|---|---|
| **A (pick)** | 用件を声で読み上げるアラーム | 14 | Puts 読み上げ, 声 and アラーム in indexed metadata. 用件 = "the thing you need to do". |
| B | 何の用事か声で教えてくれるアラーム | 18 | Mirrors review wording (「何のアラーム？」がなくなりました). Warmest tone. |
| C | しゃべるリマインダー＆アラーム | 15 | Keyword-dense; しゃべる is the store's label for talking alarms. |
| D | 話すだけで登録、声で知らせるアラーム | 18 | Covers voice input + voice output. |

Avoid the literal "しゃべる目覚まし時計" (9). In the Japanese store that phrase belongs to wake-up apps that **read the time aloud** (e.g. 「しゃべる目覚まし時計：時報」, subtitle 「音声で時刻を読み上げるアラーム」), so Remi would land among time-announcing clocks, not reminders.

Optional, if the app name is ever localized: **Remi：しゃべるリマインダー** (15). It pairs with subtitle A without repeating a word.

Close competitor to watch: **VoiceAlarm by app-inc.**, subtitle 「目的を声で知らせるアラーム。Voice Alarm」. Its pitch opens with 「アラームを止めた瞬間、何の予定だったか忘れる」, Remi's exact positioning, with a 30-day trial and monthly/annual/one-time options ([App Store](https://apps.apple.com/jp/app/id6759549515)).

## 3. Vocabulary, with evidence

### Which word wins
- **リマインダー**: the category word for "reminder app". It appears in app titles: 「通知メモ 2 - 忘れ物防止のリマインダーアプリ」, 「Wasurena：リマインダー・タスク管理アプリ」, 「しつこいお薬アラーム - 飲み忘れ防止のお薬リマインダー」, 「Galarm - アラームとリマインダー」. Users also name Apple's Reminders app this way. The verb form is **リマインド** (「しつこいリマインド機能付き」, しつこいTODO subtitle).
- **アラーム**: means "it rings loudly until I stop it". People reach for it when リマインダー/通知 gets missed. A Yahoo!知恵袋 user: 「カレンダーの予定でアラームが鳴ってほしいのですが『ぴろりん』みたいな通知音しか鳴らず困っています」 (2024/12/17). PHILE WEB's explainer sets リマインダー (missable when silenced) against アラーム, which 「消音モードも集中モードも睡眠モードも貫通し」. Remi's silent-mode ringing is an **アラーム** benefit, so say アラーム, not 通知.
- **通知**: plain "notification". Neutral to weak; the complaint word when things get missed. Also used in titles (通知メモ, 通知ほしい).
- **目覚まし**: wake-up alarm. Correct for "alarm clock", but it frames Remi as a wake-up app. The Sleeply talking alarm's JP name is 「しゃべる目覚まし」 (per our Play report).
- **Talking alarm**: in titles it is **しゃべる** (hiragana), e.g. 「しゃべるアラーム (Talking Alarm Clock)」 (Google Play), 「しゃべる目覚まし時計」, 「Voclock: 時報 しゃべる時計」, 「音声時報 しゃべる時計」. Reviews use the kanji **喋る** as often (「タイトルを喋るところが良い！」, 「そもそもしゃべらん」). 「トーキング」 shows up only as a complaint (「トーキングのわりには喋らないんです」).
- **Read aloud = 読み上げ / 読み上げる.** The most frequent verb in Japanese talking-alarm praise (§3.3). Store pages use it too: 「時刻を読み上げる強力アラーム」 (お知らせ便利アラーム subtitle) and 「音声読み上げ」 (リマインダーFLEX).
- **Voice = 声 / 音声.** 声で (plain): 「声で時刻をお知らせ」, 「目的を声で知らせるアラーム」. 音声 is the formal/technical form: 「音声通知」, 「音声読み上げ」.
- **To tell / notify = お知らせ / 知らせる / 教えてくれる.** 「お知らせしてくれる」 is everywhere in reviews and listings (「ピルやお薬の時間をお知らせ通知してくれるお薬手帳です」, お薬記録＆アラーム subtitle).
- **Snooze = スヌーズ.** Beep Me subtitle 「スヌーズとリピートで簡単管理」. お薬のじかん's description uses 「５分後に再度通知」.
- **To-do = ToDo / やることリスト / タスク.** しつこいTODO subtitle 「…やることリスト」; 「ToDoリスト リマインダー通知付きのメモ帳&やることリスト」.
- **Search volume:** not verified. No public source gives App Store search popularity for リマインダー vs アラーム vs しゃべる. Check Apple Ads keyword popularity in a JP campaign before the keyword update.

### Forgetting words
- **飲み忘れ** (forgot to take a pill): the standard term, almost always paired with **防止** (prevention). 「飲み忘れ防止」 appears in nearly every medication app title: お薬記録＆アラーム, しつこいお薬アラーム, お薬のじかん, 「MyTherapy … 薬の飲み忘れ防止・お薬アラーム」. A user review: 「飲み忘れが多すぎるので音でも知らせてくれるアラームはありがたいです」.
- **うっかり / うっかり忘れ**: 「本やレンタルの返却日、サブスク更新日、ポイント期限などのうっかり忘れ防止」 (リマインダーFLEX). In a Sentry review: 「音声で読み上げもしてくれるので、うっかり忘れてた！が解消されます」. 通知メモ quotes users: 「うっかり者には無くてはならない」.
- **物忘れ / ど忘れ**: 「ど忘れや物忘れ防止など」 (リマインダーFLEX). From the top Sentry JP review: 「物忘れが多くなった後期高齢者」.
- **忘れ物** = forgetting an object (通知メモ 「忘れ物防止」). Different from forgetting a task.
- **すっぽかし** (no-show on an appointment): Galarm review 「約束の日まで期間が開く予定のすっぽかし防止に役立っています」.
- **払い忘れ / 支払い忘れ**: **not seen** in any fetched page. The bill-payment app 「毎月の支払い」 phrases it as 「忘れずに支払う通知」. Natural Japanese, but unverified in store copy.

### "It tells me what the alarm is for" (core pitch), in Japanese users' words
From Sentry Talking Alarm Clock Google Play reviews (local file `docs/aso/competitors/talking-alarm/reviews.csv`, pulled 2026-10-07):
- 「アラームが鳴っても "なんの予定だったっけ？？" と思い出せず…アラームの後に言葉で お知らせしてくれるので "あっそうだった!!" と準備できる」 (144 👍)
- 「アラームだけ鳴っても何の目的でアラームをセットしたのか分からなくなるときがあるので、読み上げ機能があるのが良い。お薬飲みましたか？まだなら飲みましょう。…高齢者向けに使っている」
- 「なんでアラーム仕掛けたんだっけとなることがなく本当に助かっています」
- 「何の用事でセットしたのか忘れる事が多く、アラームの台詞を入れられるのが嬉しい」
- 「内容を読み上げてくれるので、何のアラーム？って言うのがなくなりました」
- 「アラームかけても『なんで設定したんだっけ？』ってよくなるんですけど、メモした事を喋ってお知らせしてくれる」
- 「言葉で　知らせてくれるから何のお知らせかよくわかるし…病院の予約に便利です」

The same need shows up for the built-in app on Yahoo!知恵袋 (2025/12/8): 「いちいちリマインダーを開かないと何の通知わからないんですか？…『今日はなになに』と設定した内容見えるようにできないですか？」

### Screenshot themes in local words
- Pills: **お薬** (honorific お is standard: お薬記録, お薬のじかん), 「薬の時間です」 (リマインダーFLEX's example of what its voice says), 服薬 (formal).
- Doctor: **通院** (「通院や薬を飲む時間を通知」, アイン薬局), **病院の予約** (Sentry review).
- Bills: **支払い**, **支払期日** (毎月の支払い), 「サブスク更新日」 (リマインダーFLEX).
- Birthday: 「誕生日や記念日」 (リマインダーFLEX). For a parent: 親. Family framing seen: 「離れて暮らす家族」 and 「高齢者の薬の飲み忘れを防止する」 (お薬のじかん).

## 4. Register and tone
- **Listing descriptions use です/ます**, friendly and simple. Examples: 「声で時刻をお知らせして起きられる便利アラームアプリがiPhoneに登場！…声で時刻を知らせるアラームアプリです」 (お知らせ便利アラーム); 「薬の記録管理は、このアプリに任せちゃいましょう」 (お薬記録＆アラーム, casual-polite).
- **Subtitles and short fields end on a noun (体言止め)**, with no です/ます: 「時刻を読み上げる強力アラーム」, 「スヌーズとリピートで簡単管理」, 「目的を声で知らせるアラーム」. The subscription description should follow this.
- **くれる framing** ("it does it for me") is how users praise: 「読み上げてくれる」, 「お知らせしてくれる」. Use it in screenshot captions: 「時間になったら、声で教えてくれる」.
- **Reviews are casual** (plain form, 「助かってます」, 「神アプリ」), skew older and medication-heavy, and value reliability most (「設定した時刻通りにアラームが鳴らず、恐くて使えない」).

## 5. Subscription conventions
- Apple JP uses **サブスクリプション**, **解約**, **更新**, **無料トライアル** ([Apple サポート「Appleのサブスクリプションを解約する」](https://support.apple.com/ja-jp/118428)).
- Monthly/annual: **月額 / 年額**, as plans **月額プラン / 年額プラン**. TimeTree: 「月額プラン（300円）または年額プラン（3000円）…初めての契約の場合は初月の料金が無料」 ([Appllio](https://appllio.com/news/2022-04-19-26131-timetree-subscription-plan)). RevenueCat JP uses 無料トライアル, 年額プラン / 年間プラン, 月額プラン ([RevenueCat JP](https://www.revenuecat.com/jp/blog/growth/7-day-trial-subscription-app.md)). Ebbing: 「月額プラン・年額プランがあり」.
- Real IAP names in the JP store:

| App | IAP names |
|---|---|
| TimeTree | 「TimeTreeプレミアム ¥300」, 「TimeTreeプレミアム ¥3,000」 (same name twice) |
| しつこいTODO | 「プレミアムプラン ¥250」, 「プレミアムプラン(年) ¥2,500」 |
| しつこいお薬アラーム | 「プレミアムプラン(年) ¥3,000」, 「広告削除の月額課金 ¥300」 |
| Due | 「年間アップグレードパス（携帯機器）」 |
| Galarm | left in English: 「Monthly Premium Subscription ¥100」, 「Annual Premium Subscription ¥1,300」 |

  プレミアム is the most common local tier word. Pro / プロ is less common in reminder apps but needs no explaining.
- Unlimited: **無制限** (リマインダーFLEX FAQ: 「無料で音声読み上げ時報を無制限に作成できます」).
- 7-day free trial (for paywall/description copy, not these fields): 「7日間無料トライアル」 or 「7日間無料」.
- Price context: local reminder subscriptions are cheap (¥100-300/month, ¥1,300-3,000/year). Remi at $6.99 / $39.99 sits far above them; "high cost, weak conversion" (country-selection doc) applies.

## 6. Keyword field idea (100 max, commas, no spaces)
Don't repeat words already in the name or subtitle. Apple indexes those, and AppTweak JP advises 「アプリ名で既に使用しているキーワードの重複は避ける」. Skip 「アプリ」「無料」, which are auto-indexed ([AppTweak JP checklist](https://www.apptweak.com/ja/aso-blog/apple-app-store-aso-checklist)). Assuming subtitle A (用件を声で読み上げるアラーム) and name Remi + リマインダー:

```
薬,飲み忘れ,服薬,通院,予約,支払い,払い忘れ,誕生日,親,高齢者,物忘れ,うっかり,防止,通知,目覚まし,時報,音声,喋る,予定,スケジュール,タスク,やること,リマインド,マナーモード
```
That is 95 characters (24 terms, 23 commas). Spare: ToDo, メモ, 話す, ボイス.

Notes: 防止 is listed on its own on the assumption Apple combines it with 飲み忘れ / 払い忘れ / 物忘れ. Whether App Store tokenization combines Japanese terms across commas is **not verified**; if not, swap in 飲み忘れ防止. 喋る (kanji) is there because the hiragana しゃべる would be in the name if it gets localized. マナーモード is the Japanese word for silent mode (お薬のじかん: 「マナーモード時はアラーム音は鳴りません」), so it fits the "rings even on silent" pitch.

## 7. Competitive note
iOS 26.2 lets Apple's own Reminders app ring an alarm: turn on **「緊急」** and the reminder 「アラームでリマインド」s, through silent mode ([ITmedia Mobile, 2026-02-04](https://www.itmedia.co.jp/mobile/articles/2602/04/news124.html)). "Rings even on silent" is no longer unique on iOS 26.2+. Remi's differentiators in Japan are 声で読み上げ (speaks the 用件) and 話すだけで登録.

## 8. Not covered
- 5ch, X/Twitter, note.com, Reddit r/japan / r/japanlife: not reached. The Parallel Search MCP hit its free-tier rate limit mid-run. Searches aimed at note.com returned no note.com pages. No quotes from those sources are used.
- No App Store search-popularity data. Validate in Apple Ads (JP) before shipping keywords.

## 9. Sources (fetched or seen this session)
Apple:
- https://developer.apple.com/help/app-store-connect/reference/in-app-purchases-and-subscriptions/in-app-purchase-information/ (30 / 45 limits)
- https://developer.apple.com/help/app-store-connect/reference/in-app-purchases-and-subscriptions/auto-renewable-subscription-information (no limits stated; character rules)
- https://developer.apple.com/help/app-store-connect/reference/app-information/required-localizable-and-editable-properties
- https://developer.apple.com/help/app-store-connect/reference/app-information (name/subtitle 30, search excerpt)
- https://support.apple.com/ja-jp/118428

JP App Store listings:
- https://apps.apple.com/jp/app/id6759549515 (VoiceAlarm)
- https://apps.apple.com/jp/app/%E3%81%97%E3%82%83%E3%81%B9%E3%82%8B%E7%9B%AE%E8%A6%9A%E3%81%BE%E3%81%97%E6%99%82%E8%A8%88-%E6%99%82%E5%A0%B1/id6756029103 (しゃべる目覚まし時計：時報, plus its similar-apps list)
- https://apps.apple.com/jp/app/%E3%81%8A%E7%9F%A5%E3%82%89%E3%81%9B%E4%BE%BF%E5%88%A9%E3%82%A2%E3%83%A9%E3%83%BC%E3%83%A0/id6761673051 (お知らせ便利アラーム)
- https://apps.apple.com/jp/app/galarm-%E3%82%A2%E3%83%A9%E3%83%BC%E3%83%A0%E3%81%A8%E3%83%AA%E3%83%9E%E3%82%A4%E3%83%B3%E3%83%80%E3%83%BC/id1187849174 (Galarm)
- https://apps.apple.com/jp/app/%E9%80%9A%E7%9F%A5%E3%83%A1%E3%83%A2-2-%E5%BF%98%E3%82%8C%E7%89%A9%E9%98%B2%E6%AD%A2%E3%81%AE%E3%83%AA%E3%83%9E%E3%82%A4%E3%83%B3%E3%83%80%E3%83%BC%E3%82%A2%E3%83%97%E3%83%AA/id957262050 (通知メモ 2)
- https://apps.apple.com/jp/app/%E3%81%97%E3%81%A4%E3%81%93%E3%81%84todo-%E3%81%97%E3%81%A4%E3%81%93%E3%81%99%E3%81%8E%E3%82%8B%E3%83%AA%E3%83%9E%E3%82%A4%E3%83%B3%E3%83%89%E3%81%A7%E7%B5%B6%E5%AF%BE%E5%BF%98%E3%82%8C%E3%81%AA%E3%81%84/id1528323467 (しつこいTODO)
- https://apps.apple.com/JP/app/id1326572969 (しつこいお薬アラーム)
- https://apps.apple.com/jp/app/%E3%81%8A%E8%96%AC%E8%A8%98%E9%8C%B2-%E3%82%A2%E3%83%A9%E3%83%BC%E3%83%A0-%E3%81%8F%E3%81%99%E3%82%8A%E3%81%AE%E9%A3%B2%E3%81%BF%E5%BF%98%E3%82%8C%E9%98%B2%E6%AD%A2%E3%81%A8%E6%9C%8D%E8%96%AC%E7%AE%A1%E7%90%86/id1552171774 (お薬記録＆アラーム)
- https://apps.apple.com/jp/app/%E3%81%8A%E8%96%AC%E3%81%AE%E3%81%98%E3%81%8B%E3%82%93-%E8%96%AC%E3%81%AE%E9%A3%B2%E3%81%BF%E5%BF%98%E3%82%8C%E3%82%92%E9%98%B2%E6%AD%A2%E3%81%99%E3%82%8B%E3%82%B9%E3%83%9E%E3%83%BC%E3%83%88%E3%83%95%E3%82%A9%E3%83%B3%E3%82%A2%E3%83%97%E3%83%AA/id1173570326 (お薬のじかん, search excerpt)
- https://apps.apple.com/jp/app/%E3%83%AA%E3%83%9E%E3%82%A4%E3%83%B3%E3%83%80%E3%83%BC-%E3%82%A2%E3%83%A9%E3%83%BC%E3%83%A0-beep-me/id412693531 (Beep Me)
- https://apps.apple.com/jp/app/due-reminders-timers/id390017969 (Due)
- https://apps.apple.com/JP/app/id952578473 (TimeTree)
- https://apps.apple.com/jp/app/%E6%AF%8E%E6%9C%88%E3%81%AE%E6%94%AF%E6%89%95%E3%81%84/id820210381 (毎月の支払い)
- https://apps.apple.com/jp/app/ebbing-%E5%8B%89%E5%BC%B7%E8%A8%98%E9%8C%B2-%E5%BE%A9%E7%BF%92%E3%83%AA%E3%83%9E%E3%82%A4%E3%83%B3%E3%83%80%E3%83%BC/id6753039952 (Ebbing, search excerpt)
- https://apps.apple.com/jp/app/wasurena-%E3%83%AA%E3%83%9E%E3%82%A4%E3%83%B3%E3%83%80%E3%83%BC-%E3%82%BF%E3%82%B9%E3%82%AF%E7%AE%A1%E7%90%86/id6746449315?platform=vision (Wasurena, search excerpt)

Google Play (JP):
- https://play.google.com/store/apps/details?hl=ja&id=com.celestialbrain.reminderflex (リマインダーFLEX, search excerpt)
- https://play.google.com/store/apps/details?hl=ja&id=net.east_hino.talking_alarm (しゃべるアラーム, search excerpt)
- https://play.google.com/store/apps/details?hl=ja&id=com.talkmecalendar.free (おしゃべりカレンダー, search excerpt)
- Local: C:\Dev\VR\docs\aso\competitors\talking-alarm\reviews.csv (Sentry Talking Alarm Clock, ja reviews)

Native-speaker Q&A and articles:
- https://detail.chiebukuro.yahoo.co.jp/qa/question_detail/q12308179357 (Yahoo!知恵袋, calendar alarm 「ぴろりん」)
- https://detail.chiebukuro.yahoo.co.jp/qa/question_detail/q12323069042 (Yahoo!知恵袋, 「何の通知わからない」, search excerpt)
- https://www.phileweb.com/review/column/202503/15/2528.html (リマインダー vs アラーム, search excerpt)
- https://www.itmedia.co.jp/mobile/articles/2602/04/news124.html (iOS 26.2 緊急 alarm, search excerpt)
- https://reminekun.com/ (リマインくん LINE bot, search excerpt)
- https://www.ainj.co.jp/app/service.html (通院/服薬アラーム wording, search excerpt)
- https://appllio.com/news/2022-04-19-26131-timetree-subscription-plan
- https://www.revenuecat.com/jp/blog/growth/7-day-trial-subscription-app.md
- https://www.apptweak.com/ja/aso-blog/apple-app-store-aso-checklist
