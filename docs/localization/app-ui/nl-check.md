# Dutch (nl) UI translation: independent review

Reviewer pass on `nl.json` against `strings-en.json` and `strings-inventory.md`. Every string was back-translated to English and compared with the source. 20 strings changed. Validator: PASS (warnings are only "Remi" inside "Reminder", and strings that are identical to English on purpose).

## Verdict: **SHIP**

Natural je-register Dutch. The fixes were "bewaren" → "opslaan", "Gereed" → "Klaar", calques in the limit and free-plan strings, and "weekdagen" (Monday to Friday) on the paywall.

## Changes

| key | before | after | back-translation | why |
|---|---|---|---|---|
| `common.done` | Gereed | Klaar | Done | Everyday 'Klaar' over Apple's 'Gereed'; matches the alarm Done button |
| `repeat.done` | GEREED | KLAAR | DONE | Same as common.done |
| `today.header.getPro` | Neem Pro | Haal Pro | Get Pro | 'Neem Pro' (take Pro) is unidiomatic |
| `today.alert.saveChoiceFailed.title` | Je keuze kon niet worden bewaard | Je keuze kon niet worden opgeslagen | Your choice couldn't be saved | Everyday 'opslaan' over Apple's 'bewaren' |
| `today.alert.recordingSaveFailed.message` | Je opname kon niet worden bewaard. Controleer de opslagruimte van je apparaat en probeer het opnieuw. | Je opname kon niet worden opgeslagen. Controleer de opslagruimte van je apparaat en probeer het opnieuw. | Your recording couldn't be saved. Check your device storage and try again. | opslaan over bewaren |
| `pending.quickChoice.a11y` | Herinner me {choice} | Herinner me: {choice} | Remind me: {choice} | Colon pattern so the chip label (stored capitalised) reads correctly mid-sentence; no lower-casing assumed |
| `pending.moreReminders` | +{count} meer: {titles} | +{count} andere: {titles} | +N others: {titles} | '+2 meer' is an anglicism |
| `gate.limit.status` | {limit, plural, one {Je hebt # actieve herinnering bereikt. Upgrade voor onbeperkt.} other {Je hebt # actieve herinneringen bereikt. Upgrade voor onbeperkt.}} | {limit, plural, one {Limiet bereikt: # actieve herinnering. Upgrade voor onbeperkt.} other {Limiet bereikt: # actieve herinneringen. Upgrade voor onbeperkt.}} | Limit reached: N active reminders. Upgrade for unlimited. | 'Je hebt # actieve herinneringen bereikt' is a literal calque |
| `gate.limit.toastTitle` | {limit, plural, one {Je hebt # actieve herinnering bereikt} other {Je hebt # actieve herinneringen bereikt}} | {limit, plural, one {Limiet bereikt: # actieve herinnering} other {Limiet bereikt: # actieve herinneringen}} | Limit reached: N active reminders | Same as above |
| `take.partial.cap` | {limit, plural, one {Met gratis blijft # herinnering actief – tik om te upgraden.} other {Met gratis blijven # herinneringen actief – tik om te upgraden.}} | {limit, plural, one {In de gratis versie blijft # herinnering actief – tik om te upgraden.} other {In de gratis versie blijven # herinneringen actief – tik om te upgraden.}} | In the free version N reminders stay active - tap to upgrade. | 'Met gratis' is not Dutch |
| `take.partial.failed` | De rest kon niet worden bewaard. Probeer ze opnieuw op te nemen. | De rest kon niet worden opgeslagen. Probeer ze opnieuw op te nemen. | The rest couldn't be saved. Try recording them again. | opslaan over bewaren |
| `notificationsOff.title` | Herinnering bewaard – meldingen staan uit | Herinnering opgeslagen – meldingen staan uit | Reminder saved - notifications are off | opslaan over bewaren |
| `notificationsOff.message` | Zet ze aan in Instellingen om gewaarschuwd te worden | Zet ze aan in Instellingen om meldingen te krijgen | Turn them on in Settings to get notifications | 'gewaarschuwd worden' sounds like a warning |
| `voice.regenFailed.message` | De stem kon niet worden bijgewerkt – hij zegt nog de oude tekst. Bewaar opnieuw om het nog eens te proberen. | De stem kon niet worden bijgewerkt – hij zegt nog de oude tekst. Sla opnieuw op om het nog eens te proberen. | Couldn't update the voice - it still says the old text. Save again to retry. | opslaan over bewaren |
| `voice.rescheduleFailed.message` | Stem bijgewerkt, maar het alarm kon niet opnieuw worden gepland – controleer je verbinding en bewaar opnieuw | Stem bijgewerkt, maar het alarm kon niet opnieuw worden gepland – controleer je verbinding en sla opnieuw op | Voice updated, but the alarm couldn't be rescheduled - check your connection and save again | opslaan over bewaren |
| `edit.alert.saveFailed` | Herinnering kon niet worden bewaard | Herinnering kon niet worden opgeslagen | Reminder couldn't be saved | opslaan over bewaren |
| `feedback.notice.editSheet` | Bevat de bewaarde gegevens van de herinnering. Je wijzigingen blijven hier. | Bevat de opgeslagen gegevens van de herinnering. Je wijzigingen blijven hier. | Includes the reminder's saved details. Your edits stay here. | opslaan over bewaren |
| `feedback.toast.saveFailed.title` | Je bericht kon niet worden bewaard | Je bericht kon niet worden opgeslagen | Your message couldn't be saved | opslaan over bewaren |
| `feedback.toast.queued.title` | Bewaard op deze telefoon | Opgeslagen op deze telefoon | Saved on this phone | opslaan over bewaren |
| `paywall.table.row.schedules` | Weekdagen, datums, om de paar dagen | Dagen van de week, datums, om de paar dagen | Days of the week, dates, every few days | 'Weekdays' here means days of the week (pick Mon, Thu...); the old word means Monday-Friday ('weekdagen') |

## Orchestrator rules

- **Language names / {language} sentences:** Checked: `language.name.*` are basic forms (Engels). "Luistert in het Engels", "Remi spreekt Engels nog niet" (fallback "deze taal") and the subtitle after a middot are grammatical. No change needed.
- **Remind-me chip label:** `pending.quickChoice.a11y` now uses a colon ("…: {choice}"), so the chip label works with the capital it is stored with and no lower-casing is needed.
- **Remi as "I":** `pending.ask`, `askPastTime` and `detail.noTime` keep the first person. No change needed.
- **Weekdays:** `paywall.table.row.schedules` now says days of the week (picked days), not Monday to Friday. `repeat.mode.weekly` and `repeat.section.repeatOn` were checked and are fine.
- **Brand / providers / legal:** "Remi" and "Remi Pro" ({product}) are untranslated. No AI provider is named. Both disclosures keep auto-renew, the charge to the Apple Account, the 24-hours-before cut-off and the path to Subscriptions (written as "[your name]", the label iOS shows, matching the pt-BR reference).

## Everyday word vs Apple term

- **opslaan** over Apple's "bewaren" for Save (10 keys). It is the everyday word.
- **Klaar** over Apple's "Gereed" for Done (common.done, repeat.done). Now it matches the alarm button.
- Kept the Apple imperatives **Annuleer / Verwijder / Herstel**: they are normal in Dutch iOS apps.

## Length and open notes

- `tabs.reminders` "Herinneringen" (13) and `tabs.settings` "Instellingen" (12) are over the limit of about 10. Standard terms; check the bottom bar on the device.
- `paywall.cta.unavailable` "Geen abonnementen" is a slightly loose rendering of "Plans unavailable". It was kept because the literal form is over the limit of about 24.
