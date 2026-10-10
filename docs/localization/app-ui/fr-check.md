# French (fr) UI translation: independent review

Reviewer pass on `fr.json` against `strings-en.json` and `strings-inventory.md`. Every string was back-translated to English and compared with the source. 11 strings changed. Validator: PASS (warnings are only "Remi" inside "Reminder", and strings that are identical to English on purpose).

## Verdict: **SHIP**

Solid, natural vous-register French throughout. The fixes were calques ("toutes les quelques minutes"), plural agreement and one wrong-meaning term ("jours de semaine").

## Changes

| key | before | after | back-translation | why |
|---|---|---|---|---|
| `pending.quickChoice.a11y` | Me le rappeler {choice} | Me le rappeler : {choice} | Remind me: {choice} | Colon pattern so the chip label (stored capitalised) reads correctly mid-sentence; no lower-casing assumed |
| `pending.moreReminders` | +{count} autres : {titles} | {count, plural, one {+# autre} many {+# autres} other {+# autres}} : {titles} | +1 other / +N others: {titles} | '+1 autres' was ungrammatical at count 1; ICU plural fixes agreement |
| `edit.row.headsUp` | Préavis | Pré-alerte | Pre-alert | 'Préavis' reads as a legal notice period |
| `take.partial.premium` | Répéter un rappel toutes les quelques minutes est une fonction Pro — touchez pour passer à Pro. | La répétition à quelques minutes d’intervalle est une fonction Pro — touchez pour passer à Pro. | Repeating at a few minutes' interval is a Pro feature - tap to go Pro. | 'toutes les quelques minutes' is not idiomatic French |
| `paywall.hero.interval.subtitle` | Pro répète un rappel toutes les quelques minutes, dans la plage horaire de votre choix. | Pro répète un rappel à quelques minutes d’intervalle, dans la plage horaire de votre choix. | Pro repeats a reminder a few minutes apart, within the time range you choose. | Same calque as above |
| `paywall.table.row.interval` | Répéter toutes les quelques minutes, dans la plage choisie | Répéter à quelques minutes d’intervalle, dans la plage choisie | Repeat a few minutes apart, in the chosen range | Same calque as above |
| `paywall.table.row.schedules` | Jours de semaine, dates, tous les X jours | Jours de la semaine, dates, tous les X jours | Days of the week, dates, every X days | 'Weekdays' here means days of the week (pick Mon, Thu...); the old word means Monday-Friday ('jours de semaine') |
| `paywall.billed.every` | Facturé par {term} | Facturé par période de {term} | Billed per period of {term} | 'Facturé par 3 mois' is ungrammatical for multi-unit terms (this key is only used for odd terms like 3 months) |
| `paywall.card.badge` | MEILLEURE OFFRE | MEILLEUR PRIX | BEST PRICE | Length: 15 -> 13 chars (limit ~12); no natural 12-char form |
| `repeat.section.repeatOn` | Répéter le | Jours de répétition | Repeat days | 'Répéter le' left a dangling article above the day chips |
| `notification.preAlert.fallbackSubject` | votre rappel | Votre rappel | Your reminder | Starts the notification body ('{subject} dans 15 minutes'), so it needs a capital as stored |

## Orchestrator rules

- **Language names / {language} sentences:** Checked: `language.name.*` are lower-case basic forms (anglais). `recording.listeningIn` "Écoute en anglais", `pending.detail.unsupportedLanguage` "Remi ne parle pas encore anglais" (fallback "cette langue"), and `settings.row.voiceLanguage.subtitle` (after a middot, filled from `settings.voiceLanguage.*`, "Anglais") are all grammatical. No change needed.
- **Remind-me chip label:** `pending.quickChoice.a11y` now uses a colon ("…: {choice}"), so the chip label works with the capital it is stored with and no lower-casing is needed.
- **Remi as "I":** `pending.ask`, `askPastTime` and `detail.noTime` keep the first person. No change needed.
- **Weekdays:** `paywall.table.row.schedules` now says days of the week (picked days), not Monday to Friday. `repeat.mode.weekly` and `repeat.section.repeatOn` were checked and are fine.
- **Brand / providers / legal:** "Remi" and "Remi Pro" ({product}) are untranslated. No AI provider is named. Both disclosures keep auto-renew, the charge to the Apple Account, the 24-hours-before cut-off and the path to Subscriptions (written as "[your name]", the label iOS shows, matching the pt-BR reference).

## Everyday word vs Apple term

- Kept **Réglages** (not "Paramètres"): it is the name of the iOS Settings app the user has to open, and the paths in the alerts and legal text must match it.
- **OK** for Done, **Touchez** for Tap: Apple's words, and also what French users say. No conflict.

## Length and open notes

- `paywall.card.badge` is 13 chars against a limit of about 12 ("MEILLEUR PRIX"). No natural shorter form; check it on the device.
- `today.timeDraft.confirm` "Me le rappeler" is 14, which fits the limit of 14.
- `paywall.legal.disclosure.priced` "par {term}": fine for 1-unit terms (par mois / par an). A 3-month plan would read "par 3 mois", which is understandable but stiff. The fix is structural (a term-aware phrase in code). Only monthly and annual plans exist today.
