# da (Danish) — translator notes for `da.json` (2026-10-10)

## Style sheet

- **Register: du** (Apple da support uses "du/din").
- **Buttons: imperative** (Annuller, Slet, Tillad, Afspil, Send, Gendan). Done = **OK** in Apple's Clock (118444: "Tryk på knappen OK"); "Færdig" for Remi's "mark done" alarm button.
- **Comma before a second main clause and before subordinate clauses** ("Tjek din forbindelse, og prøv igen"; "…, når købet bekræftes"), as Apple da writes.
- **Errors:** "… kunne ikke …".
- **Ellipsis with a space** ("Lytter …"), quotes ”…”.
- **Notifications = "notifikationer"** (Apple da).
- **Language names** lowercase ("Lytter på arabisk", "Remi taler ikke arabisk endnu" / "…dette sprog endnu").
- **Intervals** use the Danish ordinal-with-period form: "Hver 5. minut", "Hver 2. dag" (`Hver #. dag`).
- **Plurals (CLDR da):** one / other.
- **No AI provider names**.

## Apple terms

| EN | da | Status |
|---|---|---|
| Reminders | Påmindelser | Inferred (Apple app name) |
| Alarm | Alarm | Verified (118444) |
| Snooze | Snooze | Verified (118444, "Varighed af Snooze") |
| Stop | Stop | Inferred |
| Later | Senere | Inferred |
| Settings | Indstillinger | Verified (support pages) |
| Delete | Slet | Inferred |
| Done | OK | Verified (118444) |
| Allow / Don't Allow | Tillad / Tillad ikke | Inferred |
| Subscription | abonnement / Abonnementer; "Annuller abonnement", "opsige" | Verified (118428) |
| Restore Purchases | Gendan køb | Inferred |
| Free Trial | gratis prøveperiode | Inferred |
| Apple Account | Apple-konto | Verified (118428, "Indstillinger for Apple-konto") |
| Repeat | Gentag | Verified (118444) |
| Every day / Weekdays | Hver dag / Hverdage | Inferred |
| slide to stop | Skub for at stoppe | **Not verified**; not used |
| Listening… | Lytter … | Inferred |
| Screen Time | Skærmtid | Inferred |

## Paywall legal

- Path "Indstillinger > [dit navn] > Abonnementer".
- "opkræves via din Apple-konto", "fornyes automatisk", "opsige" = standard; meaning complete.

## Uncertain strings

- `time.clock.am/pm`, picker AM/PM: placeholders; Denmark is 24 h ("kl. 14.30"). Use `Intl`.
- `time.ringsAgain` "Ringer igen kl. {time}": assumes a clock time.
- `schedule.everyDuration` "Hver {duration}" → "Hver 2 t." acceptable; "Hver 45 min." fine.
- `paywall.cta.unavailable` "Ingen abonnementer" (shortened).

## Overflow risks

| Key | da | Chars / limit |
|---|---|---|
| `tabs.reminders` | Påmindelser | 11 / ~10 |
| `tabs.settings` | Indstillinger | 13 / ~10 — likely truncation |
| `permission.enabled` | Slået til | 9 / 10 |
