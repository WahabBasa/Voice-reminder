# it (Italian) — translator notes for `it.json` (2026-10-10)

## Style sheet

- **Register: tu.** Apple it uses tu ("tocca il tuo nome", support 118428). Never "Lei".
- **Buttons: second-person imperative**, as Apple it does (Annulla, Elimina, Consenti, Riprova, Riproduci, Passa a Pro). Negative buttons use the infinitive ("Non consentire"). Hints also imperative tu (Tocca…, Controlla…, Scegli…).
- **Errors:** "Impossibile + infinito" for system failures. Remi in first person, masculine ("Non sono riuscito…", "Non ho capito").
- **Typography:** curly apostrophe ’ (also keeps ICU safe), quotes “…”, no space before ? ! :.
- **Gender:** avoided "abbonato/a" toward the user ("Grazie per l'abbonamento!", "Ti diamo il benvenuto in…" instead of "Benvenuto/a").
- **"Promemoria"** is invariable (un promemoria / due promemoria); adjectives carry the plural ("attivo/attivi", "creato/creati").
- **Language names** lowercase ("Ascolto in arabo", "Remi non parla ancora arabo" / "…questa lingua").
- **Plurals (CLDR it):** one (1), many (millions), other. All three present; `many` = `other`. 0 → other ("0 promemoria attivi").
- **No AI provider names**; "servizi di IA di terze parti sicuri".

## Apple terms

| EN | it | Status |
|---|---|---|
| Reminders | Promemoria | Verified (Apple app name) |
| Alarm | Sveglia (Clock) | Verified (118444) |
| Snooze | Posponi | Inferred (the it page excerpt didn't show it) |
| Stop | Interrompi | Inferred |
| Later | Più tardi | Inferred |
| Settings | Impostazioni | Verified |
| Delete | Elimina | Inferred |
| Done | Fine | Inferred (standard iOS it) |
| Allow / Don't Allow | Consenti / Non consentire | Inferred |
| Subscription | abbonamento / Abbonamenti; "Annulla abbonamento" | Verified (118428) |
| Restore Purchases | Ripristina acquisti | Inferred |
| Free Trial | prova gratuita / periodo di prova | Verified ("periodo di prova", 118428) |
| Apple Account | Apple Account | Verified (118428) |
| Repeat | Ripetizione | Verified (118444) |
| Every day / Weekdays | Ogni giorno / Giorni feriali | Inferred |
| slide to stop | Scorri per interrompere | **Not verified**; not used |
| Listening… | In ascolto… | Inferred |
| Silent mode | modalità silenziosa | Verified (118444) |
| Screen Time | Tempo di utilizzo | Inferred |

## Paywall legal

- Path "Impostazioni > [il tuo nome] > Abbonamenti" (Apple: "In Impostazioni, tocca il tuo nome. Tocca Abbonamenti.").
- "addebitato sul tuo Apple Account alla conferma dell'acquisto", "rinnovo automatico", "annullarlo" = standard Italian App Store wording; full meaning preserved.

## Uncertain strings

- `today.header.getPro` / `recording.gate.upgrade` "Passa a Pro" (11). Alt "Prendi Pro" (10) or "Upgrade".
- `paywall.hero.default.*` "Ricorda / tutto / in tempo." (literal "Dimentica di meno" doesn't fit 3×12).
- `paywall.cta.trial` "Prova {length} gratis" (21 with 7 giorni).
- `pending.askPastTime` "Per oggi {time} è già passato…" with fallback "quell'orario" (lowercase, mid-sentence).
- `time.clock.am/pm`, picker AM/PM: placeholders; Italy is 24 h. Use `Intl`.
- `weekday.short.*` without periods (lun, mar…) per CLDR it.

## Overflow risks

| Key | it | Chars / limit |
|---|---|---|
| `tabs.settings` | Impostazioni | 12 / ~10 |
| `today.header.getPro`, `recording.gate.upgrade` | Passa a Pro | 11 / ~10 |
| `paywall.card.badge` | PIÙ CONVENIENTE | 15 / ~12. Alt "CONVENIENTE" (11) |
| `alarm.button.later` | Più tardi | 9 / ~8 |
| `tabs.reminders` | Promemoria | 10 / 10 OK |
