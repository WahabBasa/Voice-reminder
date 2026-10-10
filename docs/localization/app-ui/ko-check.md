# Korean (ko) UI translation: independent review

Reviewer pass on `ko.json` against `strings-en.json` and `strings-inventory.md`. I back-translated every string to English myself and compared it with the source before reading the translator's notes. 3 strings changed. Validator: PASS (430 keys, 0 errors; the warnings are "Remi" inside "Reminder", and strings that match English on purpose).

## Verdict: **SHIP**

Consistent 해요체 in the UI and 합니다체 in the legal text and permission prompts, which matches Korean iOS apps. Apple terms are right (구입 항목 복원, 스크린 타임, Apple 계정). The fixes: the 'weekdays' row (주중 means Mon-Fri), a subtitle that had lost its meaning, and one calque.

## Changes

| key | before | after | back-translation | why |
|---|---|---|---|---|
| `paywall.table.row.schedules` | 주중, 특정 날짜, 며칠마다 | 요일 지정, 특정 날짜, 며칠마다 | Chosen weekdays, specific dates, every few days | 'Weekdays' here means days of the week the user picks (Weekly mode), not Monday-Friday working days (주중 = Mon-Fri) |
| `time.dueNow` | 지금 | 지금 예정 | Scheduled now | '지금' alone ('Now') lost the 'due' meaning in the row subtitle |
| `pending.moreReminders` | +{count}개 더: {titles} | 외 {count}개: {titles} | {count} more: {titles} | '+N개 더' reads as a calque; '외 N개' is the natural Korean list form |

## Orchestrator rules

- **Weekdays:** `paywall.table.row.schedules` 주중 -> 요일 지정. `repeat.section.repeatOn` (반복 요일) and `schedule.pickDays` (요일 선택) were already right.
- **Everyday words:** 리마인더, 알람, 알림 are what Korean iOS uses and what people say. No change needed.
- **Remi as "I":** 언제 알려 드릴까요? (humble first person). Kept.
- **Language names:** plain ○○어. 듣는 언어: {language} and Remi는 아직 {language} 음성을 지원하지 않아요 are grammatical.
- **Brand / providers / legal:** "Remi" and {product} are left untranslated. No AI provider is named. Both disclosures keep the auto-renewal, the charge to the Apple Account at confirmation, the renewal charge within 24 hours, the opt-out at least 24 hours before the period ends, and the path to Subscriptions.

## Length and open notes

- No string is over its inventory limit.
