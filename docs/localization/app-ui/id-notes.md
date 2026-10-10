# id (Indonesian) notes: Remi UI (2026-10-10)

Catalog: `id.json`, 426 keys, validated (same key set and order, ICU parses, placeholders kept, plurals other-only).

Source tags: **[AL]** = verified on applelocalization.com (iOS 26.7.1, id), **[inf]** = inferred.

## (a) Style sheet

1. **Address the user as "Anda"** (capitalized), as Apple id does. Remi refers to itself as "saya" in its questions ("Kapan saya harus mengingatkan Anda?"). No "kamu" or slang.
2. **Buttons are imperative verbs:** Hapus, Kirim, Batalkan, Izinkan, Tingkatkan. Apple capitalizes multi-word system buttons ("Jangan Izinkan" [AL]). Remi's own labels use sentence case.
3. **Errors are short and passive-neutral:** "…tidak dapat disimpan", "Gagal membuat…", "Periksa…, lalu coba lagi."
4. **Tap = "Ketuk"** (Apple id).
5. **Language names** are bare (Jepang, Inggris), as in CLDR. Templates add "bahasa" where a sentence needs it ("Mendengarkan dalam bahasa {language}", "Remi belum mendukung bahasa {language}"). So `pending.thisLanguage` = "ini", which gives "bahasa ini".
6. **Times:** Indonesia uses 24-hour time ("pukul 14.00"). AM/PM are kept for 12-hour devices. Prefer Intl.
7. **No AI provider names.**

## (b) Apple iOS terms

| English | id | Source |
|---|---|---|
| Reminders (app) | Pengingat | [AL] |
| Alarm | Alarm | [AL] ClockAngel |
| Snooze | Tunda | [AL] ClockAngel / SpringBoard |
| Stop | Hentikan | [AL] |
| Later / Not Now | Nanti | [AL] NOT_NOW |
| Settings | Pengaturan | [AL] |
| Delete | Hapus | [AL] |
| Done | Selesai | [AL] |
| Allow / Don't Allow | Izinkan / Jangan Izinkan | [AL] |
| Subscriptions | Langganan | [AL] AppleAccountIntents "Subscriptions" |
| Restore Purchases | Pulihkan Pembelian | [AL] partial ("Pulihkan Pembelian yang Hilang") |
| Free Trial | Uji coba gratis | [inf] |
| Every day | Setiap hari | [AL] |
| Weekdays | Hari kerja | [AL] WEEKDAYS |
| slide to stop | geser untuk berhenti | [AL] ClockAngel SLIDE_TO_STOP |
| Listening… | Mendengarkan… | [AL] |
| Apple Account | Akun Apple | [AL] |
| Screen Time | Durasi Layar | [inf] |

Verified 16 of 18; Free Trial and Screen Time are inferred.

## (c) Remi glossary

- reminder: pengingat; recording: rekaman; record again: rekam ulang
- alarm: alarm; spoken line: kalimat yang diucapkan; heads-up: pemberitahuan awal
- active reminders: pengingat aktif; interval: interval; window: rentang waktu
- Free / Pro: paket gratis / Pro; plan: paket; feedback: masukan; transcribe: mentranskripsi; upgrade: tingkatkan

## (d) Plurals and the paywall

- Other-only (Indonesian doesn't mark plurals). `paywall.term.*` uses `=1` so it reads "setiap bulan" and "Rp49.000/bulan".
- **Legal block:** "langganan yang diperpanjang otomatis", "Pembayaran akan ditagihkan ke Akun Apple Anda saat pembelian dikonfirmasi", "kecuali perpanjangan otomatis dinonaktifkan setidaknya 24 jam sebelum periode berjalan berakhir", and the path Pengaturan > Akun Apple > Langganan. This is the standard ID App Store wording; meaning is unchanged.
- `paywall.termShort.*` = bln/thn/mgg/hari. These are common Indonesian abbreviations ("Rp49.000/bln").

## (e) Uncertain strings

- `time.nextIn.minutes` = "Berikutnya {count} mnt lagi". It's natural but long for a row subtitle. "{count} mnt lagi" alone is an option.
- `edit.row.headsUp` = "Pemberitahuan awal" (18 characters) for a row label. The shorter "Ingatkan awal" was rejected as unclear.
- `paywall.hero.*` lines were rewritten for rhythm: "Kurangi lupa. / Ingat / tepat waktu."

## (f) Overflow risks

| Key | id | Limit | Note |
|---|---|---|---|
| `today.header.getPro` | Dapatkan Pro (12) | ~10 | Over by 2. Alternatives: "Coba Pro" (8) if a trial is always offered, or "Beli Pro" (8) |
| `recording.gate.upgrade` | Tingkatkan (10) | ~10 | At the limit |
| `paywall.table.col.free` | GRATIS (6) | ~6 | At the limit |
| `paywall.card.badge` | PALING HEMAT (12) | ~12 | At the limit |
| `today.timeDraft.confirm` | Ingatkan saya (13) | ~14 | Fits |
