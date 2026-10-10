# fi (Finnish) app UI translation notes: Remi (2026-10-10)

Translation of `strings-en.json` (426 keys) into `fi.json`. Approach mirrors the pt-BR / es-MX style guides.

Source tags: **[AL]** = applelocalization.com API, iOS 26, locale `fi` (Apple's own system strings), queried 2026-10-10. **[AS]** = Apple Support fi-fi pages opened this session: https://support.apple.com/fi-fi/118444 (alarms) and https://support.apple.com/fi-fi/118428 (cancel a subscription). **[CLDR]** = Unicode locale data, from memory, not re-fetched. **[inferred]** = my call, no source opened.

## 1. Mini style sheet

**Register.** Apple's Finnish iOS uses the informal second person singular (sinä), mostly without the pronoun: "Voit asettaa…", "Napauta Valmis-painiketta" [AS]. Remi does the same. It never uses the formal "Te". Remi speaks in the first person in its own cards ("Milloin muistutan sinua?").

**Buttons.** Use the 2nd person singular imperative, as Apple does: Poista, Tallenna, Kumoa, Salli, Älä salli, Palauta, Lopeta [AL][AS]. Status and progress strings use the passive present ("Kuunnellaan…", "Käsitellään…", "Palautetaan…"), which is how Apple writes progress states [AL]. Hints use the "tee X napauttamalla" form ("Yritä uudelleen napauttamalla"), as Apple does. Everything is in sentence case. Weekdays, months and language names are lowercase.

| English | Finnish | Status |
|---|---|---|
| Reminders (app) | Muistutukset | verified [AL] (iCloud strings "nämä muistutukset"; "Muistutus" in UpNext/SearchUI) |
| Alarm | Herätys (pl. Herätykset) | verified [AS] (Clock "Herätykset-välilehti") |
| Snooze | Torkku | verified [AL] SpringBoard `ALARM_SNOOZE`, ClockAngel; [AS] |
| Stop | Lopeta | verified [AL] ClockAngel `stop` → "lopeta" |
| Later | Myöhemmin | inferred (standard Finnish; the API search returned nothing) |
| Settings | Asetukset | verified [AS] ("Asetukset-appi") |
| Delete | Poista | verified [AS] |
| Done | Valmis | verified [AL][AS] |
| Cancel | Kumoa | verified [AL] (`CANCEL` → Kumoa in many bundles) |
| Allow / Don't Allow | Salli / Älä salli | verified [AL] FamilyControls `ALLOW`, `COMMON_DONT_ALLOW` |
| Not now | Ei nyt | verified [AL] |
| Subscription | Tilaus (pl. Tilaukset) | verified [AL][AS] |
| Restore Purchases | Palauta ostot | partly verified: Apple's StoreKit label is "Palauta puuttuvat ostot" / "Palauta tilaus" [AL]. The short form follows the third-party paywall convention |
| Free Trial | Ilmainen kokeilu | verified [AL] StoreKit `MODE_FREE`, "Aloita ilmainen kokeilu" |
| Every day | Joka päivä | inferred (the MobileTimer key couldn't be pulled) |
| Weekdays | Arkipäivät / arkisin | partly verified: Home uses "%@ arkisin" [AL]. Clock's exact summary wasn't found |
| slide to stop | Lopeta liu'uttamalla | inferred, not used in the catalog (AlarmKit draws it). Follows the iOS "liu'uta…" pattern |
| Listening… | Kuunnellaan… | verified [AL] (Shazam, MusicRecognition) |
| Repeat (alarm field) | Toista | verified [AL] ClockAngel `Repeat` → Toista. **But** "Toista" also means Play, so Remi uses the noun **Toisto** for the Repeat row and title (see uncertainties) |
| Apple Account | Apple-tili | verified [AL] |
| Settings › [name] › Subscriptions | Asetukset > [nimesi] > Tilaukset | verified [AS] ("Napauta nimeäsi Asetukset-kohdassa. Napauta Tilaukset.") |
| Screen Time | Ruutuaika | verified [AL] |
| Tap | napauta | verified [AS] |
| app | appi | verified [AS] ("Kello-appi") |

## 2. Loanwords and deliberate English-identical strings

- **Loanwords used:** "Pro", "emoji", "App Store", "iPhone", "appi" (Apple's own Finnish word). "Feedback" is translated as **palaute**, the normal Finnish word.
- **Validator "identical to English" warnings (all deliberate):** `time.dateAndTime`, `schedule.timesAndDays`, `schedule.moreTimes`, `paywall.card.a11y` (pure placeholder joins), `duration.minutes` ("min" is the Finnish abbreviation too), `settings.version` (brand + version).
- **Validator "'Remi' missing" warnings (false positives):** `tabs.reminders`, `today.header.title`, `today.timeDraft.confirm`, `pending.quickChoice.a11y`, `take.created.title`, `notificationsOff.title`, `edit.title.placeholder`, `edit.delete.title`, `paywall.table.row.activeCount`, `notification.fallbackTitle`, `alarm.fallbackTitle`. The English text contains "Remi" only as part of "Remind"/"Reminder", not as the brand.
- **Inflected brand:** "Remiltä" (from Remi), as in "Viesti Remiltä". Finnish needs case endings, and this is the standard way to inflect a name ending in -i.

## 3. Grammar decisions that matter for the wiring

- **Numbers + nouns.** After a number Finnish uses the partitive singular ("2 päivää"). Most count strings are instead built on the genitive, which is the same for 1 and for many ("# tunnin välein", "# minuutin päästä", "# päivän kokeilu"). That is why many one/other branches are identical. They are not copy errors.
- **`paywall.term.*` are in the genitive** ("kuukauden", "3 kuukauden", fallback "laskutuskauden") so they slot into "{term} välein" (every {term}). All three uses (`billed.every`, `cta.subscribe`, `disclosure.priced`) are phrased around "välein". If code ever drops `{term}` into another frame, it will read wrong.
- **`paywall.trial.*` are in the genitive** ("7 päivän") so they work in "({length} kokeilu)", "Aloita {length} ilmainen kokeilu" and "{length} ilmainen kokeilu".
- **{language} is never inflected.** Strings use a colon frame: "Kuuntelukieli: {language}" and "Remi ei vielä osaa kieltä: {language}". Language names stay in the nominative and lowercase (CLDR style), e.g. "englanti". `language.name.bn` uses "bengali" (the CLDR fi name).
- **{time} frames** ("Soi taas {time}", "{time} on tänään jo mennyt") assume a bare clock time like "15.42". Finnish normally writes "klo 15.42". The formatter output should be checked on a device.
- **12-hour suffixes:** `time.clock.am/pm` and `times.picker.am/pm` are "ap." / "ip.". Finland uses the 24-hour clock, so the Intl formatter should replace these (see the inventory wiring notes).
- **Weekdays:** short forms are "su ma ti ke to pe la" (lowercase, no period) [CLDR]. Narrow forms, Monday first, are M T K T P L S [CLDR].

## 4. Uncertain strings

- `edit.row.repeat`, `repeat.title` → **Toisto** (noun). Apple's Clock uses "Toista", but "Toista" is also the Play button (`edit.voiceNote.play`) on the same sheet, so I used the noun.
- `pending.detail.unsupportedLanguage` + `pending.thisLanguage` → "Remi ei vielä osaa kieltä: tämä kieli" when the language is unknown. That is acceptable but stiff. A cleaner fix needs a separate key for the unknown case.
- `paywall.cta.subscribe` → "Tilaa: {price} {term} välein" (literally "Subscribe: €4.99 every month"). Correct, but less snappy than English. "Tilaa: {price} / kk" would need a nominative term.
- `reminders.pattern.everyDays` → "Joka {days}" with abbreviations ("Joka ma, to"). Readable, though Finnish would normally write "maanantaisin ja torstaisin".
- `edit.row.headsUp` → "Ennakko" (short for an advance alert). "Ennakkomuistutus" (16 chars) is clearer but may not fit.
- `diagnostics.status.provisional` → "Alustava". Apple's Finnish term for provisional notification authorization wasn't checked.
- `time.missedAt` → "Ohitettu" (skipped or missed). An alternative is "Jäi väliin".
- `edit.row.alarm` / `diagnostics.title` → "Herätys(set)". Apple uses this for every Clock alarm, but in everyday Finnish it leans toward "wake-up". "Hälytys" was rejected because iOS uses it for alerts.
- `paywall.closing.brand` and the paywall hero lines are free renderings, not literal translations.

## 5. Overflow risks (against the inventory limits)

| Key | Finnish | Chars | Limit |
|---|---|---|---|
| `tabs.reminders` | Muistutukset | 12 | ~10 (Apple's own word; no shorter natural option) |
| `common.reportProblem` | Ilmoita ongelmasta | 18 | none given, link row |
| `permission.enable` | Laita päälle | 12 | ~10 (alt "Ota käyttöön" is also 12) |
| `alarmOverlay.later` / `alarm.button.later` | Myöhemmin | 9 | ~10 / ~8 for AlarmKit (1 over) |
| `paywall.table.col.free` | ILMAINEN | 8 | ~6 |
| `paywall.cta.unavailable` | Ei tilausvaihtoehtoja | 21 | ~24 OK |
| `paywall.cta.trial` | Aloita 7 päivän ilmainen kokeilu | ~32 | ~24 (over) |
| `quickChoice.tomorrowMorning` | Huomenna aamulla | 16 | ~18 OK |
| `paywall.card.badge` | PARAS HINTA | 11 | ~12 OK |
| `repeat.mode.date` | Tiettynä päivänä | 16 | ~12 (chip) |
| `repeat.mode.everyNDays` | N päivän välein | 15 | ~12 (chip) |

Finnish compounds are long and don't wrap well. Chips and the CTA need min-width rather than fixed width, plus a device check.

## 6. Confidence

**Medium-high.** The core iOS terms (Torkku, Lopeta, Valmis, Kumoa, Salli, Tilaukset, Apple-tili, Asetukset, Kuunnellaan…) are confirmed against Apple's own Finnish strings and support pages. The risk is in case-inflection frames around placeholders and in a few chip lengths, which need a native-speaker pass and a device check.
