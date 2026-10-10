# ja (Japanese, Japan) app UI notes: Remi (2026-10-10)

Companion to `ja.json` (426 keys, same order as `strings-en.json`). Built on `docs/aso/research/localization/ja.md` (読み上げ, リマインダー, アラーム, 用件, 無制限, 月額/年額プラン).

## (a) Mini style sheet

**Register**
- Sentences (alerts, hints, errors, toasts, paywall copy, legal) use です/ます. Errors use Apple's pattern 「〜できませんでした。」 + 「もう一度お試しください。」.
- Buttons, chips, row labels, tab labels and section headers are plain nouns or noun + する: 削除, 完了, 許可, 購入を復元, 時刻を選択, 有効にする. No です/ます on buttons.
- VoiceOver labels follow the button style: 「この録音を破棄」, 「リマインダーを作成」.
- Status lines and busy states use 〜中…: 聞き取り中…, 処理中…, 復元中…, 送信中….
- Remi's own questions to the user stay polite and warm: 「いつお知らせしましょうか？」. Avoid あなた except where the source is about the user's voice (Info.plist).
- Short "tap to…" tails on error cards are plain (「タップして再試行」), matching iOS banners.
- No upper case in Japanese. CANCEL, DONE, BEST VALUE and COMPLETE map to ordinary words (キャンセル, 完了, いちばんお得, 完了済み). The PRO column header became "Pro".

**Punctuation and spacing**
- Sentence punctuation is full-width: 。、？！：「」（）.
- Quotes use 「」 (「{title}」を削除…, Remi heard: 「{quote}」). No ASCII apostrophes anywhere, which also avoids ICU apostrophe quoting.
- Ellipsis is "…" (U+2026), one character. English "..." became "…".
- No space between Japanese text and Latin/numbers (Remiは, Proにする, App Storeに). This is Apple JP practice.
- The middle-dot separator " · " is kept as in English, because `remindersMembership.ts:247` re-splits on it.
- Ranges use 〜 (「{start}〜{end}」) instead of the en dash. That's standard JP UI.
- Half-width "/" is kept inside the bold price run (`{price}/{termShort}` → ¥980/月). The CTA uses full-width ／.
- `settings.version` keeps half-width ASCII parentheses (version strings are technical).

**Numbers, time, dates**
- Counters: 件 for reminders, 分/時間/日/週間/か月/年 for durations. Trials use 日間/年間 (7日間の無料トライアル).
- `time.clock.am/pm` = 午前/午後. **Ordering bug:** Japanese puts 午前/午後 *before* the time (午前8:00). `formatClockTime` appends the suffix ("8:00 午前"), which is wrong. Replace it with `Intl.DateTimeFormat('ja-JP')` (or use 24-hour, which most JP users run) before shipping ja. Same for the picker wheel.
- Weekdays: short and narrow are both single kanji (日 月 火 水 木 金 土). JP calendars traditionally start on Sunday, while Remi hard-codes Monday (product call, see inventory).
- `reminders.pattern.everyDays` = 毎週{days}. The {days} join should be 「、」 or 「・」 in ja (月・木), not ", ". That's a code change in the joiner.

## (b) Apple iOS terms (ja-JP)

| English | Japanese | Status |
|---|---|---|
| Reminders (the app) | リマインダー | [verified: https://support.apple.com/ja-jp/111952 (app list) and https://support.apple.com/ja-jp/guide/reminders/remne4b02adc/mac] |
| Alarm | アラーム | [verified: https://support.apple.com/ja-jp/118444] |
| Snooze | スヌーズ | [verified: https://support.apple.com/ja-jp/118444] |
| Stop | 停止 | [verified: https://support.apple.com/ja-jp/guide/shortcuts/apd932ff833f/ios (「停止された」 alarm trigger)] |
| Later | あとで | [inferred] |
| Settings | 設定 (app: 設定アプリ) | [verified: https://support.apple.com/ja-jp/120681] |
| Delete | 削除 | [verified: https://support.apple.com/ja-jp/118444 (アラームを削除する)] |
| Done | 完了 | [verified: https://support.apple.com/ja-jp/118444 (「完了」ボタン)] |
| Allow / Don't Allow | 許可 / 許可しない | [inferred; the setting 「通知を許可」 is verified: https://support.apple.com/ja-jp/120681] |
| Subscription | サブスクリプション | [verified: https://support.apple.com/ja-jp/118428] |
| Restore Purchases | 購入を復元 | [inferred; Apple guide title uses 「購入した項目…を復元」 https://support.apple.com/ja-jp/guide/iphone/iphfe205f2e5/ios] |
| Free Trial | 無料トライアル | [verified: https://support.apple.com/ja-jp/118428 (per ja.md research)] |
| Every day | 毎日 | [verified: https://support.apple.com/ja-jp/guide/shortcuts/apd932ff833f/ios] |
| Weekdays | 平日 | [inferred] |
| slide to stop | スライドで停止 | [verified: https://news.mynavi.jp/article/20251221-iphone_why (quotes the iOS 26.1 button; not an Apple page)] |
| Listening… | 聞き取り中… | [inferred] |
| Apple Account | Apple Account (Latin, not translated) | [verified: https://support.apple.com/ja-jp/108318] |
| Settings › [name] › Subscriptions | 設定 > ユーザ名 > サブスクリプション | [verified: https://support.apple.com/ja-jp/118448 , /108318] |
| Silent mode / Focus | 消音モード / 集中モード | [verified: https://support.apple.com/ja-jp/118444] |
| Screen Time | スクリーンタイム | [inferred] |

That's 11 of the 16 requested terms verified (10 on Apple pages, plus スライドで停止 from mynavi) and 5 inferred. Research stopped at 4 searches.

## (c) Remi glossary (ja)

| Concept | ja | Note |
|---|---|---|
| reminder | リマインダー | Counter 件 (#件のリマインダー) |
| alarm | アラーム | Not 目覚まし (wake-up framing, per ja.md) |
| recording / take | 録音 | "failed take" → 失敗した録音 |
| spoken line | 読み上げる内容 | 読み上げ is the core verb (ja.md) |
| Remi says | Remiの読み上げ | |
| voice note | 音声メモ | Avoids ボイスメモ, which is Apple's app name |
| heads-up (pre-alert) | 事前通知 | |
| repeat | 繰り返し | Apple Clock term |
| interval | 間隔 (chip), {duration}ごと (values) | 2時間ごと |
| window (quiet outside) | 時間帯 | "Stays quiet outside the window" → 時間帯の外では鳴りません |
| active reminders | 有効なリマインダー | |
| unlimited | 無制限 | ja.md |
| Pro / Remi Pro | Pro / Remi Pro | Latin, never プロ |
| Get Pro / Upgrade | Proにする / アップグレード | |
| monthly / annual (card) | 月額プラン / 年額プラン | ja.md |
| billed monthly | 毎月のお支払い | |
| free plan | 無料プラン (table column 無料) | |
| feedback | フィードバック | |
| Message from Remi | Remiからのメッセージ | |
| Days tab | 日別 | See (d) |
| Ringing now / Due now | 鳴っています / 時間です | |
| Missed | 見逃し | |
| Overdue | 期限切れ | |
| quick chips | 1時間後 / 今夜 / 明日の朝 / 時刻を選択… | |

## (d) Uncertain strings, overflow, open items

**Uncertain**
- `tabs.days` = 日別. "Days" is a calendar-by-day tab. カレンダー would be clearer but longer (5). A native reviewer should pick.
- `time.ringsAgain` = 「{time}に再通知」. This assumes {time} is a clock time (8:05). If the code passes a relative phrase, it reads wrong.
- `time.dueNow` = 時間です (literally "it's time"). Alternative: 予定時刻です.
- `today.timeDraft.confirm` = この時刻で設定 ("set at this time"), not a literal "Remind me". It reads better as a confirm button.
- `pending.quickChoice.a11y` = {choice}にリマインド. Fine for 1時間後 / 今夜 / 明日の朝. It is awkward only if {choice} is ever 時刻を選択….
- `take.partial.title` = 「{total, plural, other {#件中}}{created}件のリマインダーを作成しました」 (3件中2件…). Word order is reversed vs English; both args are kept.
- `paywall.term.*`: ja is other-only, so count 1 renders 「1か月」 (CTA 「¥980／1か月で登録」, disclosure 「1か月ごとに¥980」). That's correct Japanese but slightly wordy. If the team wants 「¥980／月」 for 1, use `=1 {月}` (ICU allows it) or route count 1 to `termShort`. I kept it other-only per the brief.
- `paywall.trialLabel` = （{length}のトライアル） keeps English's lack of "free". The CTA and caption say 無料トライアル as in English.
- `paywall.caption.trial` adds その後 ("then"), which English implies with a comma. The meaning is unchanged.
- `paywall.caption.commitment` = 契約期間の縛りなし。いつでも解約できます。 縛りなし is common JP marketing for "no commitment", but slightly colloquial.
- Legal disclosures: the Settings path uses Apple JP's 「設定」＞ユーザ名＞「サブスクリプション」, and the account stays "Apple Account" in Latin script, as Apple JP writes it. English says "Settings > Apple Account > Subscriptions". The JP form names the same row (the user's name row *is* the Apple Account). Have a reviewer confirm the legal reading.
- `diagnostics.status.provisional` = 仮許可. Apple has no short user-facing label for provisional authorization.
- `infoPlist.NSAlarmKitUsageDescription`: English says "VoiceReminder". Per the brief, ja says "Remi".
- `notification.preAlert.fallbackSubject` = リマインダーの時刻 → 「リマインダーの時刻まで、あと15分」. With a real title: 「母に電話まで、あと15分」. That's acceptable, but a 「」-quoted subject would read better (code change).

**Overflow risks** (limit from the inventory; JP glyphs are about 2× Latin width, so compare visually)
| key | en | ja | limit | risk |
|---|---|---|---|---|
| `recording.gate.upgrade` | Upgrade (7) | アップグレード (7 full-width) | ~10 chars, small button | **Medium**: 7 full-width glyphs ≈ 14 Latin widths |
| `tabs.reminders` | Reminders (9) | リマインダー (6 FW) | ~10 | Medium: ≈12 Latin widths in a tab |
| `today.header.getPro` | Get Pro (7) | Proにする (5) | ~10 | Low |
| `today.timeDraft.confirm` | Remind me (9) | この時刻で設定 (7 FW) | ~14 | Low-medium |
| `paywall.card.badge` | BEST VALUE (10) | いちばんお得 (6 FW) | ~12 | Low-medium |
| `paywall.table.col.free` | FREE (4) | 無料 (2 FW) | ~6 | Low |
| `paywall.table.col.pro` | PRO | Pro | ~5 | None |
| `quickChoice.tomorrowMorning` | 16 | 明日の朝 (4 FW) | ~18 | Low |
| `take.created.action` | Not right? (10) | 違いますか？ (6 FW) | ~12 | Medium |
| `feedback.list.fromRemi` | 17 | Remiからのメッセージ (13 mixed) | ~20 | Medium |
| `paywall.cta.trial` | Start {length} free trial | {length}の無料トライアルを開始 (→ 7日間の無料トライアルを開始, 15) | ~24, one line | **Medium-high**: ≈30 Latin widths |
| `composer.speak` | Speak (5) | 話す (2) | ~8 | None |
| `alarm.button.later` / `alarmOverlay.later` | Later | あとで (3) | ~8 | None |
| `paywall.hero.*.line*` | ~12 | ≤9 FW (うっかりを減らす。) | ~12 | Medium at serif display size |

**Left open**
- AM/PM ordering (see (a)) needs the Intl formatter before ja ships.
- The weekday joiner for `reminders.pattern.everyDays` (", " → 「・」).
- Native-speaker review of the paywall hero lines (うっかりを減らす。/ 大事なことを / 時間どおりに。 and 終わるまで / くり返し / お知らせ。). These are adapted, not literal.
- The validator was not run. See the agent report.
