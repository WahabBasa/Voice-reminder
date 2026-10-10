# German (de) UI translation: independent review

Reviewer pass on `de.json` against `strings-en.json` and `strings-inventory.md`. Every string was back-translated to English and compared with the source. 23 strings changed. Validator: PASS (warnings are only "Remi" inside "Reminder", and strings that are identical to English on purpose).

## Verdict: **SHIP**

Natural du-register German. The main fixes were the systematic "sichern" → "speichern", a wrong verb agreement in `take.partial.cap`, the clumsy "Upgrade auf..." lines, and the legal text's "automatisch verlängertes" (already-extended), now "sich automatisch verlängerndes" (auto-renewing).

## Changes

| key | before | after | back-translation | why |
|---|---|---|---|---|
| `common.setting` | Wird gestellt … | Wird eingestellt … | Being set... | 'Wird gestellt' is not idiomatic for setting a time |
| `today.alert.saveChoiceFailed.title` | Deine Auswahl konnte nicht gesichert werden | Deine Auswahl konnte nicht gespeichert werden | Your choice couldn't be saved | Everyday 'speichern' over Apple's 'sichern' (sichern also reads as 'back up') |
| `today.alert.recordingSaveFailed.message` | Die Aufnahme konnte nicht gesichert werden. Prüfe den Speicherplatz deines Geräts und versuche es erneut. | Die Aufnahme konnte nicht gespeichert werden. Prüfe den Speicherplatz deines Geräts und versuche es erneut. | The recording couldn't be saved. Check your device storage and try again. | speichern over sichern |
| `today.timeDraft.confirm` | Erinnern | Erinnere mich | Remind me | 'Erinnern' dropped 'me'; button now says what the English says (13 chars, limit 14) |
| `recording.status.upgradeToContinue` | Upgrade auf Pro, um fortzufahren | Auf Pro upgraden, um fortzufahren | Upgrade to Pro to continue | 'Upgrade auf Pro, um...' was a noun used as a verb |
| `pending.quickChoice.a11y` | Erinnere mich {choice} | Erinnere mich: {choice} | Remind me: {choice} | Colon pattern so the chip label (stored capitalised) reads correctly mid-sentence; no lower-casing assumed |
| `gate.limit.status` | {limit, plural, one {Du hast # aktive Erinnerung erreicht. Upgrade für unbegrenzt viele.} other {Du hast # aktive Erinnerungen erreicht. Upgrade für unbegrenzt viele.}} | {limit, plural, one {Limit erreicht: # aktive Erinnerung. Mit einem Upgrade unbegrenzt viele.} other {Limit erreicht: # aktive Erinnerungen. Mit einem Upgrade unbegrenzt viele.}} | Limit reached: N active reminders. Unlimited with an upgrade. | 'Du hast # aktive Erinnerungen erreicht' is a literal calque; now matches the toast title |
| `gate.limit.toastMessage` | Tippe für ein Upgrade auf unbegrenzt viele. | Tippe für ein Upgrade ohne Limit. | Tap for an upgrade with no limit. | 'Upgrade auf unbegrenzt viele' was clumsy |
| `take.partial.premium` | Wiederholen alle paar Minuten ist eine Pro-Funktion – tippe für ein Upgrade. | Wiederholung alle paar Minuten ist eine Pro-Funktion – tippe für ein Upgrade. | Repeating every few minutes is a Pro feature - tap for an upgrade. | Noun form reads naturally |
| `take.partial.cap` | {limit, plural, one {Gratis sind # aktive Erinnerung möglich – tippe für ein Upgrade.} other {Gratis sind # aktive Erinnerungen möglich – tippe für ein Upgrade.}} | {limit, plural, one {Gratis ist # aktive Erinnerung möglich – tippe für ein Upgrade.} other {Gratis sind # aktive Erinnerungen möglich – tippe für ein Upgrade.}} | Free allows N active reminders - tap for an upgrade. | Verb agreement: singular needs 'ist', not 'sind' |
| `take.partial.failed` | Der Rest konnte nicht gesichert werden. Nimm sie bitte erneut auf. | Der Rest konnte nicht gespeichert werden. Nimm sie bitte erneut auf. | The rest couldn't be saved. Please record them again. | speichern over sichern |
| `notificationsOff.title` | Erinnerung gesichert – Mitteilungen sind aus | Erinnerung gespeichert – Mitteilungen sind aus | Reminder saved - notifications are off | speichern over sichern |
| `voice.regenFailed.message` | Die Stimme konnte nicht aktualisiert werden – sie sagt noch den alten Text. Sichere erneut, um es nochmal zu versuchen. | Die Stimme konnte nicht aktualisiert werden – sie sagt noch den alten Text. Speichere erneut, um es noch mal zu versuchen. | Couldn't update the voice - it still says the old text. Save again to retry. | speichern over sichern |
| `voice.rescheduleFailed.message` | Stimme aktualisiert, aber der Alarm konnte nicht neu geplant werden – prüfe deine Verbindung und sichere erneut | Stimme aktualisiert, aber der Alarm konnte nicht neu geplant werden – prüfe deine Verbindung und speichere erneut | Voice updated, but the alarm couldn't be rescheduled - check your connection and save again | speichern over sichern |
| `edit.alert.saveFailed` | Erinnerung konnte nicht gesichert werden | Erinnerung konnte nicht gespeichert werden | Reminder couldn't be saved | speichern over sichern |
| `feedback.notice.editSheet` | Enthält die gesicherten Details der Erinnerung. Deine Änderungen bleiben hier. | Enthält die gespeicherten Details der Erinnerung. Deine Änderungen bleiben hier. | Includes the reminder's saved details. Your edits stay here. | speichern over sichern |
| `feedback.toast.saveFailed.title` | Deine Nachricht konnte nicht gesichert werden | Deine Nachricht konnte nicht gespeichert werden | Your message couldn't be saved | speichern over sichern |
| `feedback.toast.queued.title` | Auf diesem iPhone gesichert | Auf diesem iPhone gespeichert | Saved on this iPhone | speichern over sichern |
| `aiConsent.learnMore` | Mehr dazu in unserer <link>Datenschutzrichtlinie</link>. | Mehr dazu in unserer <link>Datenschutzerklärung</link>. | More in our privacy policy. | 'Datenschutzerklärung' is the standard German name for a privacy policy |
| `settings.row.privacy` | Datenschutzrichtlinie | Datenschutzerklärung | Privacy policy | Same term everywhere |
| `paywall.legal.privacy` | Datenschutzrichtlinie | Datenschutzerklärung | Privacy policy | Same term everywhere |
| `paywall.billed.every` | Abrechnung pro {term} | Abrechnung alle {term} | Billed every {term} | 'pro 3 Monate' is ungrammatical; 'alle 3 Monate' is right (key is used for multi-unit terms) |
| `paywall.legal.disclosure.generic` | {product} ist ein automatisch verlängertes Abo. Die Zahlung wird bei Bestätigung des Kaufs über deinen Apple Account abgerechnet, und das Abo verlängert sich automatisch, bis du es kündigst. Du kannst es jederzeit unter Einstellungen > [dein Name] > Abonnements verwalten oder kündigen. | {product} ist ein sich automatisch verlängerndes Abo. Die Zahlung wird bei Bestätigung des Kaufs über deinen Apple Account abgerechnet, und das Abo verlängert sich automatisch, bis du es kündigst. Du kannst es jederzeit unter Einstellungen > [dein Name] > Abonnements verwalten oder kündigen. | {product} is a self-renewing subscription. Payment is charged to your Apple Account at confirmation of purchase, and it renews automatically until you cancel. Manage or cancel anytime in Settings > [your name] > Subscriptions. | 'automatisch verlängertes' means 'already extended'; legal meaning now exact (auto-renewing) |

## Orchestrator rules

- **Language names / {language} sentences:** Checked: `language.name.*` are basic forms (Englisch). "Hört auf Englisch zu", "Remi spricht Englisch noch nicht" (fallback "diese Sprache"), and the voice-language subtitle after a middot are all grammatical. No change needed.
- **Remind-me chip label:** `pending.quickChoice.a11y` now uses a colon ("…: {choice}"), so the chip label works with the capital it is stored with and no lower-casing is needed.
- **Remi as "I":** `pending.ask`, `askPastTime` and `detail.noTime` keep the first person. No change needed.
- **Weekdays:** `paywall.table.row.schedules` now says days of the week (picked days), not Monday to Friday. `repeat.mode.weekly` and `repeat.section.repeatOn` were checked and are fine.
- **Brand / providers / legal:** "Remi" and "Remi Pro" ({product}) are untranslated. No AI provider is named. Both disclosures keep auto-renew, the charge to the Apple Account, the 24-hours-before cut-off and the path to Subscriptions (written as "[your name]", the label iOS shows, matching the pt-BR reference).

## Everyday word vs Apple term

- **speichern** over Apple's "sichern" for Save (10 keys). People say speichern; sichern also reads as "back up".
- **Abo** over "Abonnement" in running text (translator's choice, kept). The iOS path keeps "Abonnements", because that is the label on screen.
- **Datenschutzerklärung** over "Datenschutzrichtlinie": the standard German name for a privacy policy.
- Kept **Mitteilungen** (Apple) rather than "Benachrichtigungen": it is the label iPhone users see in iOS Settings, which the diagnostics row opens. A defensible call either way.

## Length and open notes

- Tabs `tabs.reminders` (Erinnerungen, 12) and `tabs.settings` (Einstellungen, 13) are over the limit of about 10. These are the standard iOS terms and there is no shorter natural form; check the bottom bar on the device.
- `paywall.legal.disclosure.priced` "pro {term}" works for 1-unit terms. A multi-unit term would read "pro 3 Monate" (it should be "alle 3 Monate"). This is structural, and only monthly and annual plans exist today.
