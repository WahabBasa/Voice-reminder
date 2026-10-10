# Traditional Chinese (Taiwan) (zh-Hant) UI translation: independent review

Reviewer pass on `zh-Hant.json` against `strings-en.json` and `strings-inventory.md`. I back-translated every string to English myself and compared it with the source before reading the translator's notes. 2 strings changed. Validator: PASS (430 keys, 0 errors; the warnings are "Remi" inside "Reminder", and strings that match English on purpose).

## Verdict: **SHIP**

Reads as Taiwan Traditional Chinese: 網路, 帳號, 訂閱項目, 點一下, 隱私權政策, 「」 quotes, full-width punctuation. The fixes: 平日 in the 'weekdays' row, and a stiff section label.

## Changes

| key | before | after | back-translation | why |
|---|---|---|---|---|
| `paywall.table.row.schedules` | 平日、指定日期、每隔幾天 | 按星期、按日期、每隔幾天 | By weekday, by date, every few days | 'Weekdays' here means days of the week the user picks (Weekly mode), not Monday-Friday working days (平日 = working days) |
| `repeat.section.repeatOn` | 重複於 | 按星期重複 | Repeat by weekday | Label sits above the weekday chips; old text was a stiff/dangling preposition ('重複於' = 'repeat at') |

## Orchestrator rules

- **Weekdays:** `paywall.table.row.schedules` 平日 -> 按星期. `repeat.section.repeatOn` -> 按星期重複.
- **Ellipsis:** kept **⋯** (U+22EF). The built-in Traditional Chinese on iOS uses U+22EF as its ellipsis, not U+2026 (cool3c.com/article/141893, which notes that the 刪節號 iOS produces in Traditional Chinese is U+22EF). Apple's zh-TW strings use ⋯ too, so this matches the platform. All 17 ellipsis strings use ⋯ consistently; there is no stray `…`.
- **Taiwan vocabulary:** 網路, 帳號 (Apple 帳號), 訂閱項目, 點一下, 隱私權政策, 螢幕使用時間, 意見回饋, 「」 quotes. Language names use ○○文, which is the Taiwan norm.
- **Remi as "I":** 我該什麼時候提醒你？ Kept.
- **Language names:** 正在聆聽：{language} and Remi還不支援{language} are grammatical.
- **Brand / providers / legal:** "Remi" and {product} are left untranslated. No AI provider is named. Both disclosures keep the auto-renewal, the charge to the Apple Account at confirmation, the renewal charge within 24 hours, the opt-out at least 24 hours before the period ends, and the path to Subscriptions.

## Length and open notes

- No string is over its inventory limit.
