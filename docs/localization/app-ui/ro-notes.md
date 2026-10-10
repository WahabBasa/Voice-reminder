# ro (Romanian) in-app UI: notes for Remi (2026-10-10)

Catalog: `ro.json` (426 keys, same order as `strings-en.json`). Validator: `[ro] PASS: 426 keys (en 426), 0 errors, 21 warnings` (all false positives, see the end).

Source tags:
- **[AL]**: applelocalization.com API, iOS 26.7.1, locale `ro` (Apple's own Romanian system strings), queried 2026-10-10, e.g. `https://applelocalization.com/api/ios/26/search?q=Amânare&locale=ro`.
- **[CLDR]**: Unicode CLDR `ro` data (plurals, weekday abbreviations).
- **[inferred]**: my call. No Apple string was found to confirm it.

---

## 1. Style sheet

1. **Address the user formally, as dumneavoastră, with plural verb forms.** Apple's Romanian iOS does this throughout: "Reîncercați mai târziu", "Doriți să ștergeți „%@”?", "contul dvs. Apple", "Permiteți / Nu permiteți" [AL]. Only Fitness competition banter uses "tu". Remi follows Apple: "Atingeți", "Verificați", "vă reamintesc". Write the abbreviation **dvs.** where a possessive is needed ("Feedbackul dvs.").
2. **Buttons use the 2nd-person-plural imperative**, as Apple does: Anulați, Ștergeți, Permiteți, Restaurați, Opriți, Deschideți Configurări [AL]. Setting and row labels use **nouns** (Amânare, Repetare, Configurări notificări), as Apple does in Clock: "Amânare", "Durată amânare" [AL].
3. **Busy states use the impersonal reflexive** ("Se trimite…", "Se generează…") or Apple's noun form ("Ascultare…", "Restaurare…", "Procesare…"). Apple uses "Ascultare…" for Shazam listening [AL].
4. **Sentence case.** Capitalise only the first word. Keys that are upper-case by design stay upper-case (FINALIZATE, ANULAȚI, AVANTAJOS, GRATIS).
5. **Keep the user's gender out of the copy.** Use no past participles or adjectives about the user. "Are you sure…" becomes "Doriți să ștergeți „{title}”?" (Apple's own pattern [AL]). "Welcome" becomes "Vă urăm bun venit". "You've reached" becomes "Ați atins limita…", which is gender-neutral in the plural.
6. **Agreement follows the noun.** *memento* is neuter: un memento creat, două mementouri create, mementoul. *alarmă* is feminine. *abonament* is neuter.
7. **Plurals use CLDR one / few / other in every block** [CLDR]. *few* covers 0, 2–19 and 101–119 ("3 zile"); *other* covers 20+ and takes **de** ("20 de zile"). "Every" plurals use Apple's StoreKit pattern: one = "În fiecare zi" (no number), few = "La fiecare # zile", other = "La fiecare # de zile" [AL `SUBSCRIPTION_DURATION_ADJECTIVE_PREFIX_%lld_DAYS`]. The `#` is therefore dropped in the `one` branch of `time.every.*` and `schedule.everyNDays`, on purpose. Every other branch keeps `#`.
8. **Use Romanian quotation marks „…”**, as Apple does [AL].
9. **Diacritics use the comma-below ș ț (U+0219/U+021B), never the cedilla ş ţ.** The build script asserts this.
10. **Brand and providers.** "Remi" and "Remi Pro" stay untranslated. Info.plist says "Remi", not "VoiceReminder". No AI provider is named; the copy says "servicii AI".
11. **Time and dates.** Romania uses the 24-hour clock. `time.clock.am/pm` and `times.picker.am/pm` are set to CLDR's "a.m." / "p.m." only as a fallback. Prefer `Intl` with `ro` so no suffix appears. Weekdays use CLDR abbreviations: lun., mar., mie., joi, vin., sâm., dum. Narrow forms (Monday first): L M M J V S D [CLDR].

## 2. Apple iOS terms (Romanian)

| English | Romanian | Status |
|---|---|---|
| Reminders (app) | **Mementouri** (sg. memento) | verified [AL] Reminders.app `CFBundleDisplayName` |
| Alarm | **Alarmă** | verified [AL] ClockAngel `Alarm` |
| Snooze | **Amânare** | verified [AL] ClockAngel/MobileTimer `Snooze` |
| Stop (alarm) | **Stop** in Clock's alarm UI; **Opriți** as a generic button | verified [AL] ClockAngel `stop.button` = "Stop"; `STOP` = "Opriți" elsewhere |
| Later | **Mai târziu** | inferred. Apple's "mai târziu" appears in "Configurați mai târziu" [AL], but no standalone Reminders "Later" button was found |
| Settings (iOS app) | **Configurări** | verified [AL] Preferences/CarPlay `CFBundleDisplayName` |
| Delete | **Ștergeți** | verified [AL] |
| Cancel | **Anulați** | verified [AL] ClockAngel `Cancel` |
| Done | **OK** (closes a sheet) / **Gata** (marks an alarm done) | inferred; no Romanian `Done` button string was surfaced |
| Allow / Don't Allow | **Permiteți / Nu permiteți** | verified [AL] `ALLOW`, `DONT_ALLOW` |
| Subscription(s) | **Abonament / Abonamente** | verified [AL] AppleAccountSettings `APPLEID_SUBSCRIPTIONS_CELL_TITLE` |
| Apple Account | **contul Apple** | verified [AL] "Configurări cont Apple", "contul dvs. Apple" |
| Restore Purchases | **Restaurați achizițiile** | partly verified. "Restaurați" and "achiziții" are both Apple's [AL]; StoreKit SwiftUI says "Restaurați cumpărăturile care lipsesc" / "Restaurați abonamentul". The exact "Restore Purchases" string wasn't found |
| Free Trial | **Încercați gratuit** (CTA) / **perioadă de probă** (noun) | CTA verified [AL] StoreKit `ACTION_FREE_TRIAL`, "Încercați gratuit timp de %@, apoi %@/%@"; the noun is inferred |
| Auto-renew wording | "Planul se reînnoiește … până la anulare", "Fără obligații" | verified [AL] StoreKit, NewsCore |
| Every day | **În fiecare zi** | verified [AL] MapKit `Every Day`; StoreKit plural |
| Weekdays | **Zile lucrătoare** | verified [AL] MobileTimer `ALARM_WEEKDAYS`, ReminderKit `Weekdays` |
| slide to stop | **glisați pentru a opri** | verified [AL] ClockAngel `SLIDE_TO_STOP` |
| Listening… | **Ascultare…** | verified [AL] MusicRecognition `RECOGNIZE_MUSIC_LISTENING_VIEW` |
| Notifications | **Notificări** | verified [AL] Preferences |
| Screen Time | **Timp de utilizare** | verified [AL] |
| Try again | **Reîncercați** | verified [AL] |
| Tap | **Atingeți** | inferred (standard Apple RO verb; not queried) |

## 3. Glossary (Remi terms)

| English | Romanian |
|---|---|
| reminder | memento (n.), pl. mementouri |
| alarm | alarmă |
| heads-up (pre-alert) | avertizare |
| spoken line | text rostit |
| voice note | notă vocală |
| recording / take | înregistrare |
| Get Pro / Upgrade | Obțineți Pro / Treceți la Pro |
| Monthly / Annual | Lunar / Anual |
| Billed monthly | Facturat lunar |
| Unlimited | Nelimitat / nelimitate |
| Terms of Use | Termeni de utilizare |
| Privacy Policy | Politica de confidențialitate |
| feedback | feedback (accepted anglicism; articulated "feedbackul") |
| Every N days | La N zile (chip) / La fiecare # zile |
| Overdue | Restant |
| Missed | Ratat |
| In 1 hour / This evening / Tomorrow morning | Peste o oră / Diseară / Mâine dimineață |

## 4. Language names (`language.name.*`)

These fill two frames, so they are lowercase feminine adjectives, which is also CLDR's display form:
- `recording.listeningIn` = "Ascultare în limba {language}" → "Ascultare în limba română"
- `pending.detail.unsupportedLanguage` = "Remi nu vorbește încă limba {language}" → "…limba japoneză"
- `pending.thisLanguage` = "aceasta", so the fallback reads "Remi nu vorbește încă limba aceasta".
- Invariable names stay as they are: hindi, swahili, tagalog, urdu.
- `settings.row.voiceLanguage.subtitle` shows the name bare after "·" ("Transcriere pe acest iPhone · engleză"). It is lowercase there, which is acceptable. `settings.voiceLanguage.en` is a stand-alone button, so it is capitalised ("Engleză").

## 5. Paywall legal block

The wording follows Apple's StoreKit Romanian ("se reînnoiește … până la anulare", "contul Apple", "Abonamente") and the standard Romanian subscription terms phrasing (*debitat din contul Apple la confirmarea achiziției*, *cu excepția cazului în care reînnoirea automată este dezactivată cu cel puțin 24 de ore înainte de sfârșitul perioadei curente*). The meaning is kept 1:1, including "în intervalul de 24 de ore dinaintea fiecărei reînnoiri".

The `{term}` in the disclosure is preceded by "pe" ("4,99 lei pe lună", "pe 3 luni"), which reads naturally for every plural branch. `paywall.billed.every` uses "la fiecare {term}"; that only appears for odd terms (2+ units), so it reads fine.

## 6. Overflow risks (check on device)

| Key | Limit | ro | chars | Note |
|---|---|---|---|---|
| `paywall.hero.default.line1` | ~12 | Uitați mai puțin. | 17 | serif hero; fallback "Uitați rar." (11) |
| `recording.gate.upgrade` | ~10 | Treceți la Pro | 14 | fallback "Abonați-vă" (10) |
| `today.header.getPro` | ~10 | Obțineți Pro | 12 | pill; fallback "Pro" |
| `tabs.settings` | ~10 | Configurări | 11 | Apple's term; tab label |
| `alarm.button.later` / `alarmOverlay.later` | ~8 | Mai târziu | 10 | AlarmKit button; fallback "Amânare" (7, Apple's Snooze) |
| `take.created.action` | ~12 | Nu e corect? | 12 | at the limit |
| `quickChoice.tomorrowMorning` | ~18 | Mâine dimineață | 15 | ok |
| `paywall.cta.trial` | ~24 | Încercați gratuit 7 zile | 24 | at the limit; "20 de zile" / "1 lună" variants differ |
| `paywall.cta.subscribe` | 1 line | Abonați-vă: {price}/{term} | ~25+ | multi-month terms ("3 luni") grow it |
| `paywall.table.col.free` | ~6 | GRATIS | 6 | "GRATUIT" (7) avoided |
| `paywall.card.badge` | ~12 | AVANTAJOS | 9 | "CEL MAI BUN PREȚ" (16) is too long |
| `repeat.mode.everyDay` | ~12 | Zilnic | 6 | Apple's "În fiecare zi" (13) is used for row values, not the chip |
| `layout.toast.alarmsMayNotFire.title` | toast | Este posibil ca alarmele să nu sune | 35 | long toast title |
| `notificationsOff.title` | toast | Memento salvat — notificările sunt dezactivate | 46 | long |

## 7. Uncertain strings / decisions

- **`today.timeDraft.confirm`** ("Remind me", max ~14): I used **"Confirmați"**. A literal "Reamintește-mi" would make the user address Remi informally, which clashes with the formal register.
- **`pending.quickChoice.a11y`**: "Amintește-mi: {choice}" is the user speaking to Remi (VoiceOver only), so it uses the informal "tu" form. Alternative: "Memento {choice}".
- **`common.done` / `repeat.done` = "OK"** and **`alarm.button.done` = "Gata"**: both inferred. iOS Romanian sheets usually close with OK. On an alarm, "Gata" reads as "finished".
- **`reminders.pattern.everyDays`** = "Săptămânal: {days}". A literal "În fiecare {days}" reads badly with abbreviations ("În fiecare lun., joi").
- **`notification.preAlert.fallbackSubject`** is capitalised ("Mementoul dvs.") because it starts the sentence "{subject} peste # minute".
- **`time.ringsAgain`** "Sună din nou {time}": this assumes {time} is a bare time. If code passes "at 3 pm"-style text, add "la".
- **`paywall.trialLabel`** "(probă de {length})" and `paywall.caption.trial` "{length} gratuit, apoi …" are not Apple strings. They are consistent with StoreKit's "Încercați gratuit timp de %@, apoi %@/%@".
- **`paywall.restore` = "Restaurați achiziția"** (singular, as in the English). `paywall.error.alreadyOwned` quotes it exactly.
- **`paywall.termShort.week` = "săpt."**: Romanian has no common 2-letter form.
- Billing terms: `paywall.term.*` one = bare noun ("lună"), giving "4,99 lei/lună".

## 8. Validator warnings (all benign)

- **"'Remi' missing"** (11): false positives. The English contains "Reminder", which matches the substring "Remi".
- **"identical to English"** (10): placeholder-only joins (`{date} · {time}`, `{count} min`), "Interval", "General", "Feedback", and the version line. These are correct in Romanian.
