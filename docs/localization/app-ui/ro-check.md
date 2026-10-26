# Romanian (ro) UI translation: independent review

Reviewed 2026-10-10 against `strings-en.json` and `strings-inventory.md`. Every string was back-translated to English and compared with the source; only the rows below changed. Validator: PASS (warnings are "Remi"-inside-"Reminder" false positives and intentional identical tokens).

## Changes (7)

| key | before | after | back-translation | why |
|---|---|---|---|---|
| `today.timeDraft.confirm` | Confirmați | Amintește-mi | Remind me | 'Confirmați' (Confirm) lost the intent; matches pending.quickChoice.a11y. |
| `recording.status.listening` | Ascultare… | Ascult… | I'm listening… | Remi speaks as 'I' (was the noun 'Ascultare'). |
| `recording.listeningIn` | Ascultare în limba {language} | Ascult în {language} | I'm listening in English | Remi's first person; nominative name fits after 'în'. |
| `time.dueNow` | Scadent acum | E timpul | It's time | 'Scadent' is a billing word (payment due). |
| `time.ringsAgain` | Sună din nou {time} | Sună din nou la {time} | Rings again at 3:00 | Missing preposition before a clock time. |
| `reminders.next.overdue` | Restant · {when} | Întârziat · {when} | Late · 3:00 | 'Restant' means arrears (debt). |
| `repeat.section.repeatOn` | Repetare în | Zile de repetare | Repeat days | 'Repetare în' dangled with no object. |

## Notes (not changed)

- `paywall.cta.trial` "Încercați gratuit 7 zile" is 24, at the limit; "20 de zile" variants run longer.
- `edit.row.headsUp` "Avertizare" kept; the value "Cu 5 min înainte" makes it clear.
- Language names were already nominative; `pending.detail.unsupportedLanguage` ("…limba {language}") and the fallback "aceasta" read correctly.

## Verdict

**SHIP**

## Length pass (2026-10-26)

- `today.header.getPro` | Obțineți Pro → Alegeți Pro | formal, 12→11
- `recording.gate.upgrade` | Treceți la Pro → Alegeți Pro | same as getPro, 14→11
- `schedule.everyNDays` | La fiecare # (de) zile → Tot la # (de) zile | idiomatic "tot la două zile"; 100-sample 22→18; one branch kept
- `pending.recordAgain` | Înregistrați din nou → Reînregistrați | 20→14
- `edit.confirm.updatingVoice` | Se actualizează vocea… → Actualizare voce… | busy button, nominal, 22→17
- `edit.emoji.remove` | Eliminați emojiul → Ștergeți emojiul | 17→16
- `paywall.hero.default.line1` | Uitați mai puțin. → Nu mai uitați. | reads naturally before "Amintiți-vă la timp.", 17→14
- `paywall.legal.privacy` | Politica de confidențialitate → Confidențialitate | short link label, 29→17
- `diagnostics.section.systemSettings` | Deschideți configurările de sistem → Deschideți Configurări | Apple's app name, 34→22
