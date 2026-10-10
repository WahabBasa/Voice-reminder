# Danish (da) UI translation review (2026-10-10)

Independent review of `da.json` against `strings-en.json` and `strings-inventory.md`. Every string was back-translated to English and compared with the source; the table lists every string changed.

**Verdict: SHIP**

- Solid translation: du-register, Apple da terms (Påmindelser, Indstillinger, notifikationer, Gendan køb), correct comma rules, lowercase language names that fit both carrier sentences ("Lytter på dansk", "Remi taler ikke dansk endnu").
- Paywall legal text keeps every clause (charged at confirmation, auto-renew, 24-hour window, manage/cancel path). Passive "opkræves" keeps Apple as the charging party.
- Fixes below are naturalness and one meaning shift (free-plan cap). Nothing blocks shipping.

## Changes (18)

| key | before | after | back-translation | why |
|---|---|---|---|---|
| `reminders.next.none` | Ingen næste alarm planlagt | Ingen kommende alarm planlagt | No upcoming alarm scheduled | "Ingen næste alarm planlagt" is a word-for-word calque; "kommende" is how Danes say it. |
| `pending.quickChoice.a11y` | Påmind mig {choice} | Påmind mig: {choice} | Remind me: {choice} | The chip label arrives capitalised ("Om 1 time", "I aften"); a colon makes the capital grammatical instead of assuming lower-casing. |
| `pending.settingUp` | Konfigurerer … | Klargør … | Preparing… | "Konfigurerer" is IT jargon for a card that is just setting up a reminder. |
| `gate.limit.status` | {limit, plural, one {Du har nået # aktiv påmindelse. Opgrader for ubegrænset.} other {Du har nået # aktive påmindelser. Opgrader for ubegrænset.}} | {limit, plural, one {Du har nået # aktiv påmindelse. Opgrader til ubegrænset.} other {Du har nået # aktive påmindelser. Opgrader til ubegrænset.}} | You've reached # active reminder(s). Upgrade to unlimited. | "Opgrader for ubegrænset" is a calque of "for unlimited"; now matches gate.limit.toastMessage ("opgradere til ubegrænset"). |
| `take.partial.cap` | {limit, plural, one {Gratisversionen har # aktiv påmindelse – tryk for at opgradere.} other {Gratisversionen har # aktive påmindelser – tryk for at opgradere.}} | {limit, plural, one {Gratisversionen har plads til # aktiv påmindelse – tryk for at opgradere.} other {Gratisversionen har plads til # aktive påmindelser – tryk for at opgradere.}} | The free version has room for # active reminder(s) – tap to upgrade. | "Gratisversionen har # aktiv påmindelse" read as a statement of what you have, losing the limit meaning of "keeps # active". |
| `voice.regenFailed.message` | Stemmen kunne ikke opdateres – den siger stadig den gamle replik. Gem igen for at prøve igen. | Stemmen kunne ikke opdateres – den siger stadig den gamle tekst. Gem igen for at prøve igen. | The voice couldn't be updated – it still says the old text. Save again to try again. | "replik" is a theatre line; matched to the new field label "Talt tekst". |
| `edit.spokenLine.label` | Talt replik | Talt tekst | Spoken text | "Talt replik" sounds theatrical and unnatural as a field label. |
| `feedback.notice.editSheet` | Indeholder den gemte påmindelses oplysninger. Dine ændringer bliver her. | Indeholder oplysninger om den gemte påmindelse. Dine ændringer bliver her. | Includes details about the saved reminder. Your edits stay here. | "den gemte påmindelses oplysninger" is a stiff s-genitive; restructured. |
| `repeat.section.repeatOn` | Gentag om | Gentag på | Repeat on | "Gentag om" is the wrong preposition for a list of weekdays. |
| `times.addTime` | + Tilføj tid | + Tilføj tidspunkt | + Add time | "tid" also means appointment; "tidspunkt" matches the "Tidspunkter" row label. |
| `settings.voiceLanguage.alert.message` | Det sprog, dine optagelser transskriberes på denne iPhone. Automatisk følger din enheds sprog. | Hvilket sprog denne iPhone skal transskribere dine optagelser på. Automatisk følger din enheds sprog. | Which language this iPhone should transcribe your recordings in. Automatic follows your device's languages. | The old sentence ("Det sprog, dine optagelser transskriberes på denne iPhone") lacked its preposition and was ungrammatical. |
| `settings.row.language` | (missing: new key) | Sprog | Language | New key: added to strings-en.json during this review; translated here so the file validates. |
| `language.sheet.title` | (missing: new key) | Vælg dit sprog | Choose your language | New key: added to strings-en.json during this review; translated here so the file validates. |
| `language.sheet.subtitle` | (missing: new key) | Remi bruger det i appen og til at forstå dig, når du taler. | Remi uses it in the app and to understand you when you speak. | New key: added to strings-en.json during this review; translated here so the file validates. |
| `language.sheet.continue` | (missing: new key) | Fortsæt | Continue | New key: added to strings-en.json during this review; translated here so the file validates. |
| `paywall.table.row.schedules` | Hverdage, datoer, med få dages mellemrum | Valgte ugedage, datoer, med få dages mellemrum | Chosen days of the week, dates, every few days | "Hverdage" means Monday–Friday; in Remi "Weekdays" is the Weekly mode where the user picks days of the week (orchestrator correction). |
| `paywall.table.row.activeCount` | Påmindelser aktive på én gang | Aktive påmindelser ad gangen | Active reminders at a time | "Påmindelser aktive på én gang" has English word order. |
| `diagnostics.status.notRequested` | Ikke anmodet | Ikke anmodet om | Not requested | "anmode" takes "om"; without it the status reads clipped. |

## Kept as is / notes for the owner

- `time.dueNow` = "Nu" drops "due"; kept, as a row subtitle it reads naturally (pt-BR "É agora", es-MX "Ahora" do the same).
- `time.missedAt` = "Overset" kept; it reads as "missed/overlooked", which is the intent.
- `paywall.cta.unavailable` = "Ingen abonnementer" (no plans) kept; on the paywall CTA it reads as "no plans available". 18 chars, inside the ~24 limit.
- `schedule.everyDuration` "Hver {duration}" gives "Hver 2 t." / "Hver 45 min."; compact but understood in a subtitle.
- Settings path uses "[dit navn]", same convention as the reviewed pt-BR ("[seu nome]").
- `infoPlist.NSAlarmKitUsageDescription` says "Remi" (English source still says "VoiceReminder"), consistent with pt-BR.
- Length: every key with an inventory limit fits ("Annuller" 8, "Opgrader" 8, "Påmind mig" 10, "I morgen tidlig" 15).
