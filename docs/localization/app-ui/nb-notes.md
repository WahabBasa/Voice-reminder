# nb (Norwegian Bokmål) — translator notes for `nb.json` (2026-10-10)

## Style sheet

- **Register: du** (Apple no-no: "Trykk på navnet ditt", 118428).
- **Buttons: imperative** (Avbryt, Slett, Tillat, Spill av, Send, Gjenopprett). Done = **Ferdig** (118444). Apple nb calls Save "Arkiver"; Remi's prose uses "lagre/lagret", which reads naturally in messages.
- **Possessive after the noun** ("abonnementet ditt", "navnet ditt"), as Apple nb writes.
- **Errors:** "Kunne ikke …".
- **Ellipsis with a space** ("Lytter …"), quotes «…» (Apple nb).
- **Notifications = "varslinger"** (iOS nb).
- **Language names** lowercase ("Lytter på arabisk", "Remi snakker ikke arabisk ennå" / "…dette språket ennå").
- **Intervals** use the ordinal-with-period form: "Hvert 5. minutt", "Hver 2. dag".
- **Plurals (CLDR nb):** one / other.
- **No AI provider names**.

## Apple terms

| EN | nb | Status |
|---|---|---|
| Reminders | Påminnelser | Inferred (Apple app name) |
| Alarm | Alarm | Verified (118444) |
| Snooze | Slumre / Slumring | Verified (118444, iPhone guide) |
| Stop | Stopp | Inferred |
| Later | Senere | Inferred |
| Settings | Innstillinger | Verified (118428) |
| Delete | Slett | Verified (118444) |
| Done | Ferdig | Verified (118444) |
| Allow / Don't Allow | Tillat / Ikke tillat | Inferred |
| Subscription | abonnement / Abonnementer; "Avslutt abonnement" | Verified (118428) |
| Restore Purchases | Gjenopprett kjøp | Inferred |
| Free Trial | gratis prøveperiode / prøveabonnement | Verified ("prøveabonnement", "prøveperioden", 118428) |
| Apple Account | Apple-konto | Verified (118428 caption "Apple-kontoinnstillinger") |
| Repeat | Gjenta | Verified (118444) |
| Every day / Weekdays | Hver dag / Ukedager | Inferred |
| slide to stop | Skyv for å stoppe | **Not verified**; not used |
| Listening… | Lytter … | Inferred |
| Silent mode | Lydløsmodus | Verified (118444) |
| Screen Time | Skjermtid | Inferred |

## Paywall legal

- Path "Innstillinger > [navnet ditt] > Abonnementer" (Apple nb: "Åpne Innstillinger. Trykk på navnet ditt. Trykk på Abonnementer.").
- "belastes Apple-kontoen din", "fornyes automatisk", "avslutt" = standard; meaning complete.

## Uncertain strings

- `time.clock.am/pm` = a.m./p.m.: placeholders; Norway is 24 h ("kl. 14.30"). Use `Intl`.
- `pending.quickChoice.a11y` "Minn meg på det {choice}" (choice = "om 1 time", "i kveld").
- `paywall.cta.unavailable` "Ingen abonnementer" (shortened).
- `language.name.no` "norsk" vs `nb` "norsk bokmål".

## Overflow risks

| Key | nb | Chars / limit |
|---|---|---|
| `tabs.reminders` | Påminnelser | 11 / ~10 |
| `tabs.settings` | Innstillinger | 13 / ~10 — likely truncation |
| `today.timeDraft.confirm` | Minn meg på | 11 / 14 OK |
