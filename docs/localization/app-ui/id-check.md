# Indonesian (id) UI translation: independent review

Reviewer pass on `id.json` against `strings-en.json` and `strings-inventory.md`. I back-translated every string to English myself and compared it with the source before reading the translator's notes. 9 strings changed. Validator: PASS (430 keys, 0 errors; the warnings are "Remi" inside "Reminder", and strings that match English on purpose).

## Verdict: **SHIP**

Natural Indonesian with Apple's terms (Pengaturan, Durasi Layar, Akun Apple, Ketuk, Tingkatkan). The fixes: 'hari kerja', an over-long header pill, a wrong language name (Polski), and a few ungrammatical upgrade phrases.

## Changes

| key | before | after | back-translation | why |
|---|---|---|---|---|
| `paywall.table.row.schedules` | Hari kerja, tanggal, setiap beberapa hari | Hari dalam seminggu, tanggal, setiap beberapa hari | Days of the week, dates, every few days | 'Weekdays' here means days of the week the user picks (Weekly mode), not Monday-Friday working days ('hari kerja' = working days) |
| `today.header.getPro` | Dapatkan Pro | Jadi Pro | Go Pro | Length: 'Dapatkan Pro' is 12 chars vs ~10 limit |
| `language.name.pl` | Polski | Polandia | Polish | 'Polski' is the Polish endonym, not the Indonesian name |
| `repeat.section.repeatOn` | Ulangi pada | Ulangi pada hari | Repeat on days | Label sits above the weekday chips; old text was a stiff/dangling preposition |
| `gate.limit.status` | {limit, plural, other {Anda sudah mencapai # pengingat aktif. Tingkatkan untuk tanpa batas.}} | {limit, plural, other {Anda sudah mencapai # pengingat aktif. Tingkatkan untuk penggunaan tanpa batas.}} | You've reached # active reminders. Upgrade for unlimited use. | 'untuk tanpa batas' was ungrammatical |
| `gate.limit.toastMessage` | Ketuk untuk meningkatkan ke tanpa batas. | Ketuk untuk meningkatkan dan gunakan tanpa batas. | Tap to upgrade and use without limits. | 'meningkatkan ke tanpa batas' was ungrammatical |
| `take.partial.cap` | {limit, plural, other {Paket gratis menyimpan # pengingat aktif — ketuk untuk meningkatkan.}} | {limit, plural, other {Paket gratis maksimal # pengingat aktif — ketuk untuk meningkatkan.}} | Free plan: at most # active reminders - tap to upgrade. | 'menyimpan' (stores) misread 'keeps active' as storage |
| `restore.nothing.title` | Tidak ada yang dipulihkan | Tidak ada yang dapat dipulihkan | Nothing can be restored | Old text read 'nothing was restored' |
| `paywall.toast.nothing.title` | Tidak Ada yang Dipulihkan | Tidak Ada yang Dapat Dipulihkan | Nothing to Restore | Same as above |

## Orchestrator rules

- **Weekdays:** `paywall.table.row.schedules` hari kerja -> Hari dalam seminggu. `repeat.section.repeatOn` -> Ulangi pada hari.
- **Language names:** bare forms (Inggris, Jepang). The sentences add 'bahasa {language}'. Fixed pl (Polski -> Polandia). `pending.thisLanguage` = 'ini' works because it is only inserted into 'Remi belum mendukung bahasa {language}' ('bahasa ini').
- **Everyday words:** pengingat, alarm, notifikasi. No change needed.
- **Remi as "I":** Kapan saya harus mengingatkan Anda? Kept.
- **Brand / providers / legal:** "Remi" and {product} are left untranslated. No AI provider is named. Both disclosures keep the auto-renewal, the charge to the Apple Account at confirmation, the renewal charge within 24 hours, the opt-out at least 24 hours before the period ends, and the path to Subscriptions.

## Length and open notes

- `today.header.getPro` was shortened to fit. Nothing else is over a limit.
