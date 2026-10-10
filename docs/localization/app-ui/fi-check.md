# Finnish (fi) UI translation review (2026-10-10)

Independent review of `fi.json` against `strings-en.json` and `strings-inventory.md`. Every string was back-translated to English and compared with the source; the table lists every string changed.

**Verdict: SHIP**

- Natural, Apple-consistent Finnish: sinä-register without the pronoun, passive progress states ("Kuunnellaan…"), "tee X napauttamalla" hints, Remi's first person ("Milloin muistutan sinua?").
- Case handling is sound: `recording.listeningIn` already used the colon pattern ("Kuuntelukieli: englanti"); paywall terms and trial lengths are delivered in the genitive so "Aloita 7 päivän ilmainen kokeilu" and "{term} välein" are grammatical.
- Paywall legal text is complete; passive "veloitetaan" keeps Apple as the charging party.
- The one real bug was the unsupported-language card with its fallback ("…osaa kieltä: tämä kieli"), fixed below.

## Changes (17)

| key | before | after | back-translation | why |
|---|---|---|---|---|
| `time.ringsAgain` | Soi taas {time} | Soi taas klo {time} | Rings again at {time} | {time} is a bare clock time (lib/time.ts formatRingsAgain); Finnish puts "klo" before a clock time. |
| `time.missedAt` | Ohitettu · {time} | Vastaamatta · {time} | Unanswered · {time} | "Ohitettu" means skipped/dismissed, which suggests the user acted. The state is an unanswered ring (cf. iOS "vastaamaton puhelu"). |
| `reminders.next.none` | Seuraavaa soittoa ei ole ajastettu | Seuraavaa herätystä ei ole ajastettu | No next alarm scheduled | "soitto" reads as a phone call; "herätys" is the alarm term used everywhere else in this file. |
| `composer.speak.a11y` | Puhu mieluummin | Puhu sen sijaan | Speak instead | "Puhu mieluummin" means "rather speak" (a preference); the intent is switching input mode. |
| `pending.detail.noTime` | Milloin muistutan sinua? Nauhoita uudelleen ja kerro aika napauttamalla | Milloin muistutan sinua? Nauhoita uudelleen napauttamalla ja kerro aika | When should I remind you? Tap to record again and say a time | The old order ("…ja kerro aika napauttamalla") said "tell the time by tapping". |
| `pending.detail.unsupportedLanguage` | Remi ei vielä osaa kieltä: {language} | Remi ei vielä puhu tätä kieltä: {language} | Remi doesn't speak this language yet: {language} | Colon pattern kept so the basic form fits, but the frame now names "this language" itself, so the fallback below reads correctly. Same shape as the reviewed hu string. |
| `pending.thisLanguage` | tämä kieli | tuntematon kieli | unknown language | The fallback is only used when the language has no name in the table; the old "tämä kieli" produced "Remi ei vielä osaa kieltä: tämä kieli". Meaning shifts from "this language" to "unknown language", which is what the case actually is. |
| `edit.row.headsUp` | Ennakko | Ennakkoilmoitus | Advance notice | "Ennakko" alone is vague (also "advance payment"); the row is the pre-alert. |
| `times.every` | Välein | Toistoväli | Repeat interval | The label sits left of the stepper value; "Välein" (postposition, "at intervals of") can't stand before the value. Matches repeat.section.repeatEvery. |
| `feedback.list.empty` | Ei vielä lähetettyä. | Mitään ei ole vielä lähetetty. | Nothing has been sent yet. | "Ei vielä lähetettyä." is a clipped, machine-sounding fragment. |
| `settings.voiceLanguage.en` | englanti | Englanti | English | Standalone alert button and subtitle value; Finnish capitalises the first word of a button (the language.name.* keys stay lowercase for mid-sentence use). |
| `settings.row.language` | (missing: new key) | Kieli | Language | New key: added to strings-en.json during this review; translated here so the file validates. |
| `language.sheet.title` | (missing: new key) | Valitse kieli | Choose a language | New key: added to strings-en.json during this review; translated here so the file validates. |
| `language.sheet.subtitle` | (missing: new key) | Remi käyttää sitä apissa ja ymmärtääkseen sinua, kun puhut. | Remi uses it in the app and to understand you when you speak. | New key: added to strings-en.json during this review; translated here so the file validates. |
| `language.sheet.continue` | (missing: new key) | Jatka | Continue | New key: added to strings-en.json during this review; translated here so the file validates. |
| `paywall.table.row.schedules` | Arkipäivät, päivämäärät, muutaman päivän välein | Valitut viikonpäivät, päivämäärät, muutaman päivän välein | Chosen days of the week, dates, every few days | "Arkipäivät" means Monday–Friday; in Remi "Weekdays" is the Weekly mode where the user picks days of the week (orchestrator correction). |
| `paywall.table.row.activeCount` | Muistutuksia käynnissä kerralla | Aktiivisia muistutuksia kerralla | Active reminders at a time | "Muistutuksia käynnissä kerralla" was a calque of "running"; "aktiivinen" is the term used in the rest of the paywall and gate strings. |

## Kept as is / notes for the owner

- `common.cancel` = "Kumoa" is Apple fi's Cancel; kept.
- `today.timeDraft.confirm` = "Muistuta" (8 chars) kept; "Muistuta minua" (14) also fits if the owner prefers it.
- `paywall.cta.subscribe` "Tilaa: {price} {term} välein" gives "Tilaa: 4,99 € kuukauden välein" — grammatical, slightly formal; kept because {term} is shared with the legal text.
- `time.dueNow` = "Nyt" drops "due"; kept, as in pt-BR/es-MX.
- Settings path uses "[nimesi]", the form Apple fi support uses.
- Length: all limited keys fit ("Valitse aika…" 13, "Huomenna aamulla" 16, "Hanki Pro" 9).
