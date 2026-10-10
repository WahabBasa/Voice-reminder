# nl (Dutch, Netherlands) — translator notes for `nl.json` (2026-10-10)

## Style sheet

- **Register: je/jij** (Apple nl: "Tik in de Instellingen-app op je naam", 118428). Never "u".
- **Buttons: imperative stem**, Apple nl style (Annuleer, Verwijder, Sta toe, Herstel, Stuur, Speel af, Neem opnieuw op). Done = **Gereed**. Hints imperative too (Tik…, Controleer…, Kies…).
- **Errors:** "Kan … niet …" / "… kon niet worden …".
- **Quotes / UI names:** single curly quotes ‘…’ as Apple nl does ('Gereed', 'Sluimer').
- **Notifications = "meldingen"** (iOS nl).
- **Language names** capitalised (Arabisch). Fallback-safe: "Remi spreekt {language} nog niet" → "…spreekt deze taal nog niet". "Luistert in het {language}".
- **Plurals (CLDR nl):** one / other. Note "uur" and "jaar" don't pluralise after numbers ("2 uur", "2 jaar").
- **No AI provider names**; "beveiligde AI-diensten van derden".

## Apple terms

| EN | nl | Status |
|---|---|---|
| Reminders | Herinneringen | Inferred (Apple app name) |
| Alarm (Clock) | Wekker | Verified (118444) — Remi uses "alarm" for its ringing reminders |
| Snooze | Sluimer | Verified (118444) |
| Stop | Stop | Inferred |
| Later | Later | Inferred |
| Settings | Instellingen | Verified |
| Delete | Verwijder | Inferred |
| Done | Gereed | Verified (118444) |
| Allow / Don't Allow | Sta toe / Sta niet toe | Inferred |
| Subscription | abonnement / Abonnementen; "Zeg abonnement op" | Verified (118428) |
| Restore Purchases | Herstel aankopen | Inferred |
| Free Trial | gratis proefperiode / proefabonnement | Verified ("gratis proefabonnement", 118428) |
| Apple Account | Apple Account | Verified (118428) |
| Every day / Weekdays | Elke dag / Weekdagen | Inferred |
| slide to stop | Veeg om te stoppen | **Not verified**; not used |
| Listening… | Luistert… | Inferred |
| Silent mode | stille modus | Verified (118444) |
| Screen Time | Schermtijd | Inferred |

## Paywall legal

- Path "Instellingen > [je naam] > Abonnementen".
- "in rekening gebracht via je Apple Account", "automatisch verlengd", "opzeggen" = standard Dutch App Store wording; meaning complete.

## Uncertain strings

- `today.header.getPro` "Neem Pro". Alt "Haal Pro".
- `paywall.hero.default.*` "Op tijd / eraan / denken." (rewritten to fit 3 short lines).
- `paywall.cta.unavailable` "Geen abonnementen" (shortened to fit 24).
- `time.dueNow` "Nu" (short; alt "Nu aan de beurt").
- `time.clock.am/pm`, picker: placeholders; NL is 24 h.

## Overflow risks

| Key | nl | Chars / limit |
|---|---|---|
| `tabs.reminders` | Herinneringen | 13 / ~10 — likely truncation; no shorter natural word |
| `tabs.settings` | Instellingen | 12 / ~10 |
| `paywall.cta.trial` | Probeer 7 dagen gratis | 22 / 24 OK |
| `paywall.billed.*` | "Maandelijks gefactureerd" 24 — card line 2, check |
