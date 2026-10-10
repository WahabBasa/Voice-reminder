# Japanese (ja) UI translation: independent review

Reviewer pass on `ja.json` against `strings-en.json` and `strings-inventory.md`. I back-translated every string to English myself and compared it with the source before reading the translator's notes. 3 strings changed. Validator: PASS (430 keys, 0 errors; the warnings are "Remi" inside "Reminder", and strings that match English on purpose).

## Verdict: **SHIP**

Natural, polite です/ます Japanese throughout, close to Apple's own wording (「設定」＞ユーザ名＞「サブスクリプション」, 購入を復元, スクリーンタイム). The fixes: the 'weekdays' row used 平日 (working days), and the legal text kept 'Apple Account' in English instead of Apple's 'Apple アカウント'.

## Changes

| key | before | after | back-translation | why |
|---|---|---|---|---|
| `paywall.table.row.schedules` | 平日、日付指定、数日ごと | 曜日指定、日付指定、数日ごと | Chosen weekdays, set dates, every few days | 'Weekdays' here means days of the week the user picks (Weekly mode), not Monday-Friday working days (平日 = working days) |
| `paywall.legal.disclosure.generic` | {product}は自動更新サブスクリプションです。お支払いは購入確定時にApple Accountに請求され、解約するまで自動的に更新されます。管理や解約は「設定」＞ユーザ名＞「サブスクリプション」からいつでも行えます。 | {product}は自動更新サブスクリプションです。お支払いは購入確定時にApple アカウントに請求され、解約するまで自動的に更新されます。管理や解約は「設定」＞ユーザ名＞「サブスクリプション」からいつでも行えます。 | (same text) ... charged to your Apple Account ... | Apple's current Japanese name is 'Apple アカウント'; 'Apple Account' was left in English |
| `paywall.legal.disclosure.priced` | {product}は{term}ごとに{price}です。お支払いは購入確定時にApple Accountに請求されます。現在の期間が終了する24時間以上前に自動更新をオフにしない限り、{term}ごとに{price}で自動的に更新され、各更新前の24時間以内にアカウントに請求されます。管理や解約は「設定」＞ユーザ名＞「サブスクリプション」からいつでも行えます。 | {product}は{term}ごとに{price}です。お支払いは購入確定時にApple アカウントに請求されます。現在の期間が終了する24時間以上前に自動更新をオフにしない限り、{term}ごとに{price}で自動的に更新され、各更新前の24時間以内にアカウントに請求されます。管理や解約は「設定」＞ユーザ名＞「サブスクリプション」からいつでも行えます。 | (same text) ... charged to your Apple Account ... | Same as above |

## Orchestrator rules

- **Weekdays:** `paywall.table.row.schedules` 平日 -> 曜日指定. `repeat.section.repeatOn` (繰り返す曜日), `repeat.mode.weekly` (毎週) and `schedule.pickDays` (曜日を選択) already said days of the week.
- **読み上げ, not 目覚まし時計:** the selling point is the voice. `paywall.hero.default.subtitle` (声で読み上げる), `edit.spokenLine.*`, `feedback.context.remiSays` (Remiの読み上げ), `paywall.table.row.spokenAlarms` (用件を読み上げるアラーム) and the AlarmKit prompt (読み上げリマインダー) all use 読み上げ. 目覚まし時計 appears nowhere, and nothing claims the app reads the clock time.
- **Everyday words:** リマインダー (Apple's and everyday), アラーム, 通知, 録音. No change needed.
- **Remi as "I":** `pending.ask` いつお知らせしましょうか？ is first person (Japanese drops the pronoun). Kept.
- **Language names:** plain ○○語. 「{language}で聞き取り中」 and 「Remiはまだ{language}に対応していません」 are grammatical.
- **Brand / providers / legal:** "Remi" and {product} are left untranslated. No AI provider is named. Both disclosures keep the auto-renewal, the charge to the Apple Account at confirmation, the renewal charge within 24 hours, the opt-out at least 24 hours before the period ends, and the path to Subscriptions.

## Length and open notes

- No string is over its inventory limit.
