# Italian (it) UI translation: independent review

Reviewer pass on `it.json` against `strings-en.json` and `strings-inventory.md`. Every string was back-translated to English and compared with the source. 14 strings changed. Validator: PASS (warnings are only "Remi" inside "Reminder", and strings that are identical to English on purpose).

## Verdict: **SHIP**

Good tu-register Italian. Two wrong-meaning words were fixed ("suoneria" = ringtone, "Scaduto" = expired) plus the "giorni feriali" (Monday to Friday) shift on the paywall.

## Changes

| key | before | after | back-translation | why |
|---|---|---|---|---|
| `common.done` | Fine | Fatto | Done | Everyday 'Fatto' over Apple's 'Fine'; matches the alarm Done button |
| `repeat.done` | FINE | FATTO | DONE | Same as common.done |
| `reminders.next.none` | Nessuna suoneria programmata | Nessuna sveglia in programma | No alarm scheduled | 'suoneria' means ringtone, not a ring |
| `reminders.next.overdue` | Scaduto · {when} | In ritardo · {when} | Late · {when} | 'Scaduto' means expired, not overdue |
| `pending.quickChoice.a11y` | Ricordamelo {choice} | Ricordamelo: {choice} | Remind me of it: {choice} | Colon pattern so the chip label (stored capitalised) reads correctly mid-sentence; no lower-casing assumed |
| `pending.moreReminders` | +{count} altri: {titles} | {count, plural, one {+# altro} many {+# altri} other {+# altri}}: {titles} | +1 other / +N others: {titles} | '+1 altri' was ungrammatical at count 1 |
| `gate.limit.status` | {limit, plural, one {Hai raggiunto # promemoria attivo. Passa a Pro per averne illimitati.} many {Hai raggiunto # promemoria attivi. Passa a Pro per averne illimitati.} other {Hai raggiunto # promemoria attivi. Passa a Pro per averne illimitati.}} | {limit, plural, one {Limite raggiunto: # promemoria attivo. Passa a Pro per averne illimitati.} many {Limite raggiunto: # promemoria attivi. Passa a Pro per averne illimitati.} other {Limite raggiunto: # promemoria attivi. Passa a Pro per averne illimitati.}} | Limit reached: N active reminders. Go Pro for unlimited. | 'Hai raggiunto # promemoria attivi' reads as 'you got to N reminders', not a limit |
| `gate.limit.toastTitle` | {limit, plural, one {Hai raggiunto # promemoria attivo} many {Hai raggiunto # promemoria attivi} other {Hai raggiunto # promemoria attivi}} | {limit, plural, one {Limite raggiunto: # promemoria attivo} many {Limite raggiunto: # promemoria attivi} other {Limite raggiunto: # promemoria attivi}} | Limit reached: N active reminders | Same as above |
| `take.partial.premium` | Ripetere ogni pochi minuti è una funzione Pro: tocca per passare a Pro. | Ripetere ogni tot minuti è una funzione Pro: tocca per passare a Pro. | Repeating every few minutes is a Pro feature: tap to go Pro. | 'ogni pochi minuti' is a calque; 'ogni tot' matches the existing 'ogni tot giorni' |
| `paywall.hero.interval.subtitle` | Pro ripete un promemoria ogni pochi minuti, nella fascia oraria che scegli. | Pro ripete un promemoria ogni tot minuti, nella fascia oraria che scegli. | Pro repeats a reminder every few minutes, in the time range you choose. | Same calque |
| `paywall.table.row.interval` | Ripeti ogni pochi minuti, nella fascia che scegli | Ripeti ogni tot minuti, nella fascia che scegli | Repeat every few minutes, in the range you choose | Same calque |
| `paywall.table.row.schedules` | Giorni feriali, date, ogni tot giorni | Giorni della settimana, date, ogni tot giorni | Days of the week, dates, every few days | 'Weekdays' here means days of the week (pick Mon, Thu...); the old word means Monday-Friday ('giorni feriali') |
| `paywall.cta.subscribe` | Abbonati a {price} / {term} | Abbonati per {price} / {term} | Subscribe for {price} / {term} | 'Abbonati a {price}' reads as 'subscribe to {price}' |
| `notification.preAlert.fallbackSubject` | il tuo promemoria | Il tuo promemoria | Your reminder | Starts the notification body, so it needs a capital as stored |

## Orchestrator rules

- **Language names / {language} sentences:** Checked: `language.name.*` are lower-case basic forms (inglese). "Ascolto in inglese", "Remi non parla ancora inglese" (fallback "questa lingua") and the subtitle after a middot are grammatical. No change needed.
- **Remind-me chip label:** `pending.quickChoice.a11y` now uses a colon ("…: {choice}"), so the chip label works with the capital it is stored with and no lower-casing is needed.
- **Remi as "I":** `pending.ask`, `askPastTime` and `detail.noTime` keep the first person. No change needed.
- **Weekdays:** `paywall.table.row.schedules` now says days of the week (picked days), not Monday to Friday. `repeat.mode.weekly` and `repeat.section.repeatOn` were checked and are fine.
- **Brand / providers / legal:** "Remi" and "Remi Pro" ({product}) are untranslated. No AI provider is named. Both disclosures keep auto-renew, the charge to the Apple Account, the 24-hours-before cut-off and the path to Subscriptions (written as "[your name]", the label iOS shows, matching the pt-BR reference).

## Everyday word vs Apple term

- **Fatto** over Apple's "Fine" for Done (common.done, repeat.done). Now it matches the alarm button.
- **ogni tot minuti/giorni** over the calque "ogni pochi minuti".

## Length and open notes

- `paywall.card.badge` "PIÙ CONVENIENTE" is 15 against a limit of about 12. No natural shorter form (MIGLIOR PREZZO is 14); check it on the device.
- `tabs.settings` "Impostazioni" is 12 against a limit of about 10. Standard iOS term; check it on the device.
