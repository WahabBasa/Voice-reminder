# Norwegian Bokmål (nb) UI translation review (2026-10-10)

Independent review of `nb.json` against `strings-en.json` and `strings-inventory.md`. Every string was back-translated to English and compared with the source; the table lists every string changed.

**Verdict: SHIP**

- Natural Bokmål throughout: du-register, possessive after the noun ("abonnementet ditt"), Apple nb terms (Påminnelser, Innstillinger, varslinger, Ferdig, Gjenopprett kjøp), «» quotes.
- Language names are lowercase basic forms and fit both carrier sentences ("Lytter på norsk", "Remi snakker ikke norsk ennå").
- Paywall legal text is complete; passive "belastes" keeps Apple as the charging party.
- Fixes below are naturalness plus one meaning shift (free-plan cap). Nothing blocks shipping.

## Changes (16)

| key | before | after | back-translation | why |
|---|---|---|---|---|
| `reminders.next.none` | Ingen neste alarm planlagt | Ingen kommende alarm planlagt | No upcoming alarm scheduled | "Ingen neste alarm planlagt" is a calque; "kommende" is the natural word. |
| `pending.quickChoice.a11y` | Minn meg på det {choice} | Minn meg på det: {choice} | Remind me about it: {choice} | The chip label arrives capitalised ("Om 1 time"); the colon keeps the capital grammatical. |
| `pending.settingUp` | Konfigurerer … | Klargjør … | Preparing… | "Konfigurerer" is IT jargon for setting up a reminder. |
| `pending.detail.notUnderstood` | Fikk ikke med meg det – trykk for å ta opp på nytt | Det fikk jeg ikke med meg – trykk for å ta opp på nytt | I didn't catch that – tap to record again | "Fikk ikke med meg det" has an unnatural object position; fronting "Det" is how it is said. |
| `gate.limit.status` | {limit, plural, one {Du har nådd # aktiv påminnelse. Oppgrader for ubegrenset.} other {Du har nådd # aktive påminnelser. Oppgrader for ubegrenset.}} | {limit, plural, one {Du har nådd # aktiv påminnelse. Oppgrader til ubegrenset.} other {Du har nådd # aktive påminnelser. Oppgrader til ubegrenset.}} | You've reached # active reminder(s). Upgrade to unlimited. | "Oppgrader for ubegrenset" is a calque; now matches gate.limit.toastMessage ("oppgradere til ubegrenset"). |
| `take.partial.cap` | {limit, plural, one {Gratisversjonen har # aktiv påminnelse – trykk for å oppgradere.} other {Gratisversjonen har # aktive påminnelser – trykk for å oppgradere.}} | {limit, plural, one {Gratisversjonen har plass til # aktiv påminnelse – trykk for å oppgradere.} other {Gratisversjonen har plass til # aktive påminnelser – trykk for å oppgradere.}} | The free version has room for # active reminder(s) – tap to upgrade. | "Gratisversjonen har # aktiv påminnelse" lost the limit meaning of "keeps # active". |
| `voice.regenFailed.message` | Kunne ikke oppdatere stemmen – den sier fortsatt den gamle replikken. Lagre igjen for å prøve på nytt. | Kunne ikke oppdatere stemmen – den sier fortsatt den gamle teksten. Lagre igjen for å prøve på nytt. | Couldn't update the voice – it still says the old text. Save again to try again. | "replikken" is a theatre line; matched to the new label "Talt tekst". |
| `edit.spokenLine.label` | Talt replikk | Talt tekst | Spoken text | "Talt replikk" sounds theatrical as a field label. |
| `times.addTime` | + Legg til tid | + Legg til tidspunkt | + Add time | "tid" also means appointment; matches the "Tidspunkter" row label. |
| `settings.voiceLanguage.alert.message` | Hvilket språk opptakene dine transkriberes på på denne iPhonen. Automatisk følger språkene på enheten. | Hvilket språk denne iPhonen skal transkribere opptakene dine på. Automatisk følger språkene på enheten. | Which language this iPhone should transcribe your recordings in. Automatic follows the device's languages. | The old sentence had a stumbling "transkriberes på på denne iPhonen". |
| `settings.row.language` | (missing: new key) | Språk | Language | New key: added to strings-en.json during this review; translated here so the file validates. |
| `language.sheet.title` | (missing: new key) | Velg språket ditt | Choose your language | New key: added to strings-en.json during this review; translated here so the file validates. |
| `language.sheet.subtitle` | (missing: new key) | Remi bruker det i appen og for å forstå deg når du snakker. | Remi uses it in the app and to understand you when you speak. | New key: added to strings-en.json during this review; translated here so the file validates. |
| `language.sheet.continue` | (missing: new key) | Fortsett | Continue | New key: added to strings-en.json during this review; translated here so the file validates. |
| `paywall.table.row.schedules` | Ukedager, datoer, med noen dagers mellomrom | Valgte ukedager, datoer, med noen dagers mellomrom | Chosen days of the week, dates, every few days | "Ukedager" alone can be read as Monday–Friday; in Remi "Weekdays" is the Weekly mode where the user picks days of the week (orchestrator correction). "Valgte" removes the ambiguity. |
| `paywall.table.row.activeCount` | Påminnelser aktive samtidig | Aktive påminnelser samtidig | Active reminders at once | "Påminnelser aktive samtidig" has English word order. |

## Kept as is / notes for the owner

- `time.dueNow` = "Nå" drops "due"; kept, reads naturally as a subtitle (pt-BR/es-MX do the same).
- `time.missedAt` = "Tapt" kept; mirrors "Tapt anrop" (missed call) on iOS nb.
- `paywall.cta.unavailable` = "Ingen abonnementer" kept; reads as "no plans available" on the CTA. Inside the ~24 limit.
- Settings path uses "[navnet ditt]", same convention as the reviewed pt-BR.
- `infoPlist.NSAlarmKitUsageDescription` says "Remi", consistent with pt-BR.
- Length: all limited keys fit ("Avbryt", "Oppgrader" 9, "Minn meg på" 11, "I morgen tidlig" 15, "Velg tidspunkt …" 16).
