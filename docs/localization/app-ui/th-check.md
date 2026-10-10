# Thai (th) UI translation: independent review

Reviewer pass on `th.json` against `strings-en.json` and `strings-inventory.md`. I back-translated every string to English myself and compared it with the source before reading the translator's notes. 2 strings changed. Validator: PASS (430 keys, 0 errors; the warnings are "Remi" inside "Reminder", and strings that match English on purpose).

## Verdict: **SHIP**

Natural Thai with Apple's terms (การตั้งค่า, สมัครรับ, เวลาหน้าจอ, ก่อนเที่ยง/หลังเที่ยง). Leaving out the pronoun in Remi's question (ให้เตือนเมื่อไหร่ดี) is idiomatic and keeps the first-person voice. The fixes: วันธรรมดา (working days), a phrase that read as a question, and the free-plan cap.

## Changes

| key | before | after | back-translation | why |
|---|---|---|---|---|
| `paywall.table.row.schedules` | วันธรรมดา วันที่ระบุ ทุกๆ กี่วัน | วันในสัปดาห์ วันที่ระบุ ทุก N วัน | Days of the week, set dates, every N days | 'Weekdays' here means days of the week the user picks (Weekly mode), not Monday-Friday working days (วันธรรมดา = working days); 'ทุกๆ กี่วัน' read as a question ('every how many days?'), now matches repeat.mode.everyNDays |
| `take.partial.cap` | {limit, plural, other {แบบฟรีใช้งานการเตือนได้ # รายการ แตะเพื่ออัปเกรด}} | {limit, plural, other {แบบฟรีใช้การเตือนได้สูงสุด # รายการ แตะเพื่ออัปเกรด}} | Free plan allows up to # reminders - tap to upgrade. | Added 'up to' so it reads as the cap, not a count |

## Orchestrator rules

- **Weekdays:** `paywall.table.row.schedules` วันธรรมดา -> วันในสัปดาห์. `repeat.section.repeatOn` ทำซ้ำในวัน was fine.
- **Everyday words:** การเตือน in running text, and เตือนความจำ (Apple's name for Reminders) on the tab and header. นาฬิกาปลุก, การแจ้งเตือน. No change needed.
- **Remi as "I":** ให้เตือนเมื่อไหร่ดี leaves out the pronoun, which is idiomatic Thai, and still reads as Remi asking. Kept.
- **Language names:** ภาษาX. กำลังฟังเป็น{language} and Remi ยังไม่รองรับ{language} are grammatical (no space before ภาษา, which is correct).
- **Brand / providers / legal:** "Remi" and {product} are left untranslated. No AI provider is named. Both disclosures keep the auto-renewal, the charge to the Apple Account at confirmation, the renewal charge within 24 hours, the opt-out at least 24 hours before the period ends, and the path to Subscriptions.

## Length and open notes

- `tabs.reminders` เตือนความจำ is 11 code points against a ~10 limit, but 3 of them are stacked vowel or tone marks, so it renders about 8 columns wide. It is also Apple's own Thai name for Reminders. Kept; check it on the device.
