# Simplified Chinese (zh-Hans) UI translation: independent review

Reviewer pass on `zh-Hans.json` against `strings-en.json` and `strings-inventory.md`. I back-translated every string to English myself and compared it with the source before reading the translator's notes. 2 strings changed. Validator: PASS (430 keys, 0 errors; the warnings are "Remi" inside "Reminder", and strings that match English on purpose).

## Verdict: **SHIP**

Clean mainland Simplified Chinese with Apple's terms (轻点, 设置, Apple账户, 屏幕使用时间). The fixes: 工作日 in the 'weekdays' row, and a stiff section label.

## Changes

| key | before | after | back-translation | why |
|---|---|---|---|---|
| `paywall.table.row.schedules` | 工作日、指定日期、每隔几天 | 按星期、按日期、每隔几天 | By weekday, by date, every few days | 'Weekdays' here means days of the week the user picks (Weekly mode), not Monday-Friday working days (工作日 = working days) |
| `repeat.section.repeatOn` | 重复于 | 按星期重复 | Repeat by weekday | Label sits above the weekday chips; old text was a stiff/dangling preposition ('重复于' = 'repeat at') |

## Orchestrator rules

- **Weekdays:** `paywall.table.row.schedules` 工作日 -> 按星期. `repeat.section.repeatOn` -> 按星期重复. `schedule.pickDays` 选择哪几天 was fine.
- **Everyday words:** 提醒, 闹钟, 通知. No change needed.
- **Remi as "I":** 我该什么时候提醒你？ Kept.
- **Language names:** plain ○○语. 正在聆听：{language} and Remi暂不支持{language} are grammatical.
- **Brand / providers / legal:** "Remi" and {product} are left untranslated. No AI provider is named. Both disclosures keep the auto-renewal, the charge to the Apple Account at confirmation, the renewal charge within 24 hours, the opt-out at least 24 hours before the period ends, and the path to Subscriptions.

## Length and open notes

- No string is over its inventory limit. Not changed: 存储 (Apple's Save button word) and 保存 (in messages) both appear, as in Apple's own zh-CN UI.
