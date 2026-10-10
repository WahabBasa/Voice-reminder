# th (Thai) notes: Remi UI (2026-10-10)

Catalog: `th.json`, 426 keys, validated (same key set and order, ICU parses, placeholders kept, plurals other-only).

Source tags: **[AL]** = verified on applelocalization.com (iOS 26.7.1, th), **[inf]** = inferred.

## (a) Style sheet

1. **Neutral-polite register, no gendered particles.** Never use ครับ/ค่ะ in UI. Use "คุณ" only where a pronoun is needed ("ของคุณ"), and leave it out where Thai doesn't need one (Apple's habit). Remi asks without "ฉัน/ผม": "ให้เตือนเมื่อไหร่ดี". The one exception is the button "เตือนฉัน" (Remind me), where the user is the speaker.
2. **Spacing:** Thai has no spaces between words. A **space separates sentences or clauses** (it replaces the English full stop and comma), and a space goes around Latin words and digits ("บัญชี Apple", "อีก 5 นาที"), as Apple does ("บัญชี Apple" [AL]). There are no spaces inside a phrase, so line breaking only happens at real phrase boundaries. The renderer's Thai word-breaking (ICU dictionary) handles the rest.
3. **No sentence-final full stops**, which Apple Thai omits. Question marks are left out of questions too (Thai marks questions lexically with ไหม/หรือไม่/อะไร), except the very short `take.created.action` "ไม่ถูกต้อง?", where it makes a tappable link read as a question.
4. **Tap = แตะ** (Apple). Progress states use กำลัง…: กำลังฟัง…, กำลังประมวลผล….
5. **Mai yamok "ๆ"** is written attached, with a space after it ("ทุกๆ ไม่กี่นาที"), the standard form.
6. **AM/PM:** CLDR th gives ก่อนเที่ยง/หลังเที่ยง. Thai iPhones default to 24-hour, so most users never see these. Prefer Intl.
7. **Remi stays in Latin script** and is followed by a space.
8. **No AI provider names.**

## (b) Apple iOS terms

| English | th | Source |
|---|---|---|
| Reminders (app) | เตือนความจำ | [AL] |
| Alarm | นาฬิกาปลุก | [AL] AlarmModule CFBundleDisplayName ("การปลุก" not found) |
| Snooze | เลื่อนปลุก | [AL] ClockAngel / SpringBoard |
| Stop | หยุด | [AL] |
| Later | ภายหลัง | [AL] BUTTON_LATER |
| Not Now | ไม่ใช่ตอนนี้ | [AL] (200 hits) |
| Settings | การตั้งค่า | [AL] |
| Delete | ลบ | [AL] |
| Done | เสร็จสิ้น | [AL] |
| Allow / Don't Allow | อนุญาต / ไม่อนุญาต | [AL] |
| Subscriptions | การสมัครรับ | [AL] AppleAccountIntents "Subscriptions" |
| Restore Purchases | กู้คืนการซื้อ | [inf] |
| Free Trial | ทดลองใช้ฟรี | [AL] StoreKit ACTION_FREE_TRIAL |
| Every day | ทุกวัน | [AL] |
| Weekdays | วันธรรมดา | [AL] |
| slide to stop | เลื่อนเพื่อหยุด | [AL] ClockAngel SLIDE_TO_STOP |
| Listening… | กำลังฟัง… | [AL] |
| Apple Account | บัญชี Apple | [AL] |
| Screen Time | เวลาหน้าจอ | [inf] |

Verified 17 of 19; Restore Purchases and Screen Time are inferred.

## (c) Remi glossary

- reminder: การเตือน (counter: รายการ). The tab uses Apple's app-style word "เตือนความจำ"; in sentences "การเตือน" is shorter.
- recording: การอัดเสียง / เสียงที่อัด; record again: อัดเสียงใหม่
- alarm: นาฬิกาปลุก; spoken line: ข้อความที่พูด; heads-up: เตือนล่วงหน้า
- active reminders: การเตือนที่ใช้งานอยู่; interval: ช่วงห่าง; window: ช่วงเวลา
- Free / Pro: แบบฟรี / Pro; plan: แผน; feedback: คำติชม; transcribe: ถอดความ

## (d) Plurals and the paywall

- Other-only. `paywall.term.*` uses `=1` (เดือน/ปี/สัปดาห์/วัน). Templates attach it directly, "ทุก{term}", so the common case reads ทุกเดือน. For count > 1 it renders "ทุก3 เดือน" (no space after ทุก). That's acceptable in Thai but not ideal, and it's a rare path (2/3/6-month plans only).
- **Legal block:** "การสมัครรับแบบต่ออายุอัตโนมัติ", "ระบบจะเรียกเก็บเงินจากบัญชี Apple ของคุณเมื่อยืนยันการซื้อ", "เว้นแต่จะปิดการต่ออายุอัตโนมัติอย่างน้อย 24 ชั่วโมงก่อนสิ้นสุดรอบปัจจุบัน", and the path การตั้งค่า > บัญชี Apple > การสมัครรับ. Meaning is unchanged; no gendered particles.

## (e) Uncertain strings

- `tabs.days` = "รายวัน" (daily view). Confirm the meaning.
- `recording.listeningIn` = "กำลังฟังเป็น{language}" and `pending.detail.unsupportedLanguage` = "Remi ยังไม่รองรับ{language}". Both rely on the language names carrying the "ภาษา" prefix, which they do.
- `time.clock.am/pm` (ก่อนเที่ยง/หลังเที่ยง) is long next to a time. Prefer Intl or 24-hour.
- `weekday.narrow.thu` = "พฤ" (2 glyphs), as in CLDR. The others are single consonants.

## (f) Overflow risks (Thai is visually compact; character counts overstate width because of combining marks)

| Key | th | Limit | Note |
|---|---|---|---|
| `tabs.reminders` | เตือนความจำ | ~10 | 9 visual cells: tight. Fallback: "การเตือน" |
| `layout.toast.alarmsMayNotFire.title` etc. | — | — | Long toasts wrap fine, with spaces at clause breaks only |
| `paywall.cta.trial` | ทดลองใช้ฟรี 7 วัน | ~24 | Fits |
| `alarm.button.later` | ภายหลัง | ~8 | Fits (6 cells) |
| `settings.row.notifications` | การแจ้งเตือนและนาฬิกาปลุก | — | Long row title: check it doesn't truncate at large Dynamic Type |
