# ms (Malay, Malaysia) notes: Remi UI (2026-10-10)

Catalog: `ms.json`, 426 keys, validated (same key set and order, ICU parses, placeholders kept, plurals other-only). Malaysian Malay (Bahasa Melayu) vocabulary, not Indonesian.

Source tags: **[AL]** = verified on applelocalization.com (iOS 26.7.1, ms), **[inf]** = inferred.

## (a) Style sheet

1. **Address the user as "anda"** (lowercase mid-sentence, as Apple ms writes it). Remi refers to itself as "saya" ("Bila saya patut ingatkan anda?").
2. **Malaysian, not Indonesian, word choices:**

   | Concept | ms | (id) |
   |---|---|---|
   | Settings | Seting | Pengaturan |
   | delete | padam | hapus |
   | create | cipta | buat |
   | allow | benarkan | izinkan |
   | upgrade | naik taraf | tingkatkan |
   | free | percuma | gratis |
   | error | ralat | kesalahan |
   | account | akaun | akun |
   | date | tarikh | tanggal |
   | feedback | maklum balas | masukan |
   | link | pautan | tautan |
   | server | pelayan | server |
   | new | baharu | baru |

3. **Tap = "Ketik"** (Apple ms).
4. **Buttons:** Apple capitalizes multi-word system buttons ("Bukan Sekarang", "Jangan Benarkan" [AL]). Remi's own labels use sentence case.
5. **Language names** are bare (Jepun, Inggeris); templates add "bahasa". `pending.thisLanguage` = "ini".
6. **Times:** 12-hour markers are PG/PTG (CLDR ms). Prefer Intl.
7. **No AI provider names.**

## (b) Apple iOS terms

| English | ms | Source |
|---|---|---|
| Reminders (app) | Peringatan | [AL] |
| Alarm | Penggera | [AL] ClockAngel |
| Snooze | Tidur | [AL] ClockAngel / SpringBoard ALARM_SNOOZE (note: not "Tunda") |
| Stop | Henti | [AL] |
| Later | Kemudian | [AL] BUTTON_LATER |
| Not Now | Bukan Sekarang | [AL] (200 hits) |
| Settings | Seting | [AL] |
| Delete | Padam | [AL] |
| Done | Selesai | [AL] |
| Allow / Don't Allow | Benarkan / Jangan Benarkan | [AL] |
| Subscriptions | Langganan | [AL] |
| Restore Purchases | Pulihkan Pembelian | [AL] partial ("Pulihkan Pembelian Tiada") |
| Free Trial | Percubaan Percuma | [AL] StoreKit ("Mulakan Percubaan Percuma") |
| Every day | Setiap Hari | [AL] |
| Weekdays | Hari bekerja | [AL] WEEKDAYS |
| slide to stop | leret untuk henti | [inf] (Apple ms uses "leret" for swipe/slide; the exact string wasn't found) |
| Listening… | Mendengar… | [AL] |
| Apple Account | Akaun Apple | [AL] |
| Screen Time | Masa Skrin | [inf] |

Verified 17 of 19; slide to stop and Screen Time are inferred.

## (c) Remi glossary

- reminder: peringatan; recording: rakaman; record again: rakam semula
- alarm: penggera; spoken line: ayat yang disebut; heads-up: amaran awal
- active reminders: peringatan aktif; interval: selang; window: julat masa
- Free / Pro: pelan percuma / Pro; plan: pelan; feedback: maklum balas; transcribe: mentranskripsi

## (d) Plurals and the paywall

- Other-only. `paywall.term.*` uses `=1` (setiap bulan, RM14.90/bulan).
- **Legal block:** "langganan yang diperbaharui secara automatik", "Bayaran akan dicaj ke Akaun Apple anda semasa pengesahan pembelian", "melainkan pembaharuan automatik dimatikan sekurang-kurangnya 24 jam sebelum tempoh semasa tamat", and the path Seting > Akaun Apple > Langganan. This is the standard MY disclosure wording; meaning is unchanged.

## (e) Uncertain strings

- `time.clock.am/pm` = PG/PTG. Correct per CLDR, but Malaysians often just see AM/PM on English-set phones.
- `quickChoice.thisEvening` = "Petang ini". In Malay "petang" covers late afternoon to early evening; "Malam ini" (tonight) is later. "Petang ini" is closer to the English chip.
- `take.created.action` = "Tak betul?". It's colloquial (tak = tidak) but short and friendly for a toast link. "Tidak betul?" (12) also fits.
- `language.name.bn` = "Benggali" (CLDR ms), not "Bangla".

## (f) Overflow risks

| Key | ms | Limit | Note |
|---|---|---|---|
| `today.header.getPro` | Dapatkan Pro (12) | ~10 | Over by 2. Alternative "Cuba Pro" (8) |
| `paywall.table.col.free` | PERCUMA (7) | ~6 | Over by 1. Widen the column slightly, or use "FREE" |
| `paywall.card.badge` | PALING JIMAT (12) | ~12 | At the limit (changed from "NILAI TERBAIK", which was 13) |
| `recording.gate.upgrade` | Naik taraf (10) | ~10 | At the limit |
| `alarm.button.later` | Kemudian (8) | ~8 | At the limit (AlarmKit button) |
| `aiConsent.notNow` | Bukan Sekarang (14) | — | Secondary button: check its width |
