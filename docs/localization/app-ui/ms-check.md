# Malay (ms) UI translation: independent review

Reviewer pass on `ms.json` against `strings-en.json` and `strings-inventory.md`. I back-translated every string to English myself and compared it with the source before reading the translator's notes. 6 strings changed. Validator: PASS (430 keys, 0 errors; the warnings are "Remi" inside "Reminder", and strings that match English on purpose).

## Verdict: **SHIP**

Natural Malaysian Malay with Apple's terms (Seting, Masa Skrin, Akaun Apple, Ketik, Naik taraf, PG/PTG). The fixes: 'hari bekerja', an over-long header pill, and a few ungrammatical upgrade phrases.

## Changes

| key | before | after | back-translation | why |
|---|---|---|---|---|
| `paywall.table.row.schedules` | Hari bekerja, tarikh, setiap beberapa hari | Hari dalam seminggu, tarikh, setiap beberapa hari | Days of the week, dates, every few days | 'Weekdays' here means days of the week the user picks (Weekly mode), not Monday-Friday working days ('hari bekerja' = working days) |
| `today.header.getPro` | Dapatkan Pro | Jadi Pro | Go Pro | Length: 'Dapatkan Pro' is 12 chars vs ~10 limit |
| `repeat.section.repeatOn` | Ulang pada | Ulang pada hari | Repeat on days | Label sits above the weekday chips; old text was a stiff/dangling preposition |
| `gate.limit.status` | {limit, plural, other {Anda telah mencapai # peringatan aktif. Naik taraf untuk tanpa had.}} | {limit, plural, other {Anda telah mencapai # peringatan aktif. Naik taraf untuk penggunaan tanpa had.}} | You've reached # active reminders. Upgrade for unlimited use. | 'untuk tanpa had' was ungrammatical |
| `gate.limit.toastMessage` | Ketik untuk naik taraf kepada tanpa had. | Ketik untuk naik taraf dan guna tanpa had. | Tap to upgrade and use without limits. | 'kepada tanpa had' was ungrammatical |
| `take.partial.cap` | {limit, plural, other {Pelan percuma mengekalkan # peringatan aktif — ketik untuk naik taraf.}} | {limit, plural, other {Pelan percuma terhad kepada # peringatan aktif — ketik untuk naik taraf.}} | Free plan is limited to # active reminders - tap to upgrade. | 'mengekalkan' (maintains) did not say it is a cap |

## Orchestrator rules

- **Weekdays:** `paywall.table.row.schedules` hari bekerja -> Hari dalam seminggu. `repeat.section.repeatOn` -> Ulang pada hari.
- **Language names:** bare forms (Inggeris, Jepun). The sentences add 'bahasa {language}'. `pending.thisLanguage` = 'ini' works the same way as in id.
- **Everyday words:** 'Peringatan' is Apple's Malay name for Reminders and is kept. Penggera, pemberitahuan. No change needed.
- **Remi as "I":** Bila saya patut ingatkan anda? Kept.
- **Brand / providers / legal:** "Remi" and {product} are left untranslated. No AI provider is named. Both disclosures keep the auto-renewal, the charge to the Apple Account at confirmation, the renewal charge within 24 hours, the opt-out at least 24 hours before the period ends, and the path to Subscriptions.

## Length and open notes

- `today.header.getPro` was shortened to fit. Nothing else is over a limit.
