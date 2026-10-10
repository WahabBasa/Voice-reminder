# sv (Swedish) — translator notes for `sv.json` (2026-10-10)

## Style sheet

- **Register: du** (Apple sv: "Tryck på ditt namn", 118428).
- **Buttons: imperative** (Avbryt, Radera, Tillåt, Spela upp, Skicka, Återställ). Done = **Klar**. Hints imperative ("Tryck…", "Kontrollera…").
- **Errors:** "Det gick inte att …" (Apple sv pattern).
- **Ellipsis with a space** ("Lyssnar …"), quotes ”…”, as Apple sv does.
- **Notifications = "notiser"** (iOS sv), "aviseringar" in the verb sense.
- **Subscription = "abonnemang"** (Apple sv, 118428), not "prenumeration".
- **Language names** lowercase ("Lyssnar på arabiska", "Remi talar inte arabiska än" / "…det här språket än").
- **Plurals (CLDR sv):** one / other.
- **No AI provider names**.

## Apple terms

| EN | sv | Status |
|---|---|---|
| Reminders | Påminnelser | Inferred (Apple app name) |
| Alarm | Alarm | Verified (118444) |
| Snooze | Snooza / Snooze | Verified ("Snooze", "snoozeknapp", iPhone guide) |
| Stop | Stoppa | Inferred |
| Later | Senare | Inferred |
| Settings | Inställningar | Verified |
| Delete | Radera | Inferred |
| Done | Klar | Verified (118444) |
| Allow / Don't Allow | Tillåt / Tillåt inte | Inferred |
| Subscription | abonnemang / Abonnemang | Verified (118428) |
| Restore Purchases | Återställ köp | Inferred |
| Free Trial | gratis provperiod / provabonnemang | Verified ("provabonnemang", "provperioden", 118428) |
| Apple Account | Apple-konto | Verified (118428) |
| Repeat | Upprepa | Verified (118444) |
| Every day / Weekdays | Varje dag / Vardagar | Inferred |
| slide to stop | Dra för att stoppa | **Not verified**; not used |
| Listening… | Lyssnar … | Inferred |
| Screen Time | Skärmtid | Inferred |

## Paywall legal

- Path "Inställningar > [ditt namn] > Abonnemang" (Apple sv: "Öppna appen Inställningar. Tryck på ditt namn. Tryck på Abonnemang.").
- "debiteras ditt Apple-konto", "förnyas automatiskt", "avsluta" = standard; meaning complete.

## Uncertain strings

- `time.every.*` / `schedule.everyNDays` / `schedule.everyDuration` use "Var # minut/timme/dag" ("var 5 minut"). Correct written form is ordinal ("var 5:e minut", "var 2:a dag"), but the suffix depends on the number, so ICU can't build it. "Var 5 minut" is common and understood. Alt: "Med # minuters mellanrum".
- `time.clock.am/pm` = fm/em, picker FM/EM: placeholders; Sweden is 24 h. Use `Intl`.
- `paywall.card.badge` "BÄSTA KÖPET". Alt "MEST PRISVÄRD" (13).
- `paywall.cta.unavailable` "Inga abonnemang" (shortened).
- `take.created.action` "Fel?" (shortened from "Blev det fel?" for 12).

## Overflow risks

| Key | sv | Chars / limit |
|---|---|---|
| `tabs.reminders` | Påminnelser | 11 / ~10 |
| `tabs.settings` | Inställningar | 13 / ~10 — likely truncation |
| `recording.gate.upgrade` | Uppgradera | 10 / 10 |
