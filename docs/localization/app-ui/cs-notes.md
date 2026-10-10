# cs (Czech) in-app UI: translator notes (2026-10-10)

Translation of `strings-en.json` (426 keys) into `cs.json`. Validator: `[cs] PASS: 426 keys (en 426), 0 errors, 19 warnings` (the warnings are false positives: "Remi" matched inside "Reminder", plus keys that are pure placeholders like `{date} · {time}`).

Source tags:
- **[AL]** applelocalization.com API, iOS 26, locale `cs`, queried 2026-10-10 (Apple's own Czech system strings; bundle and key given).
- **[inf]** inferred: Apple convention or common Czech iOS usage, not confirmed by a source this session.

---

## 1. Mini style sheet

1. **Address the user formally (vykání: vy / vám / váš, lowercase).** This is what Apple's Czech iOS does: "Aplikace „%@“ vám chce posílat oznámení" [AL UserNotificationsServer `USER_NOTIFICATION_PERMISSION_ALERT_TITLE`], "Zkuste to znovu později" [AL CheckerBoard `TRY_AGAIN_MESSAGE`]. Never tykání.
2. **Buttons: infinitive.** Apple: Odložit, Zastavit, Zkusit znovu, Povolit, Nepovolovat, Obnovit předplatné [AL]. So `Send` = Odeslat, `Delete` = Smazat, `Remind me` = Připomenout.
3. **Hints: "Klepnutím + 2nd-person future", Apple's pattern** ("zastavíte přejetím" [AL ClockAngel `SLIDE_TO_STOP`], "Podržením zastavíte" [AL SpringBoard]). So "Tap to read" = "Klepnutím si ji přečtete", "tap to retry" = "klepnutím to zkusíte znovu". Direct instructions use the formal imperative (Klepněte, Zkontrolujte, Vyberte).
4. **Errors: "X se nepodařilo + infinitive"** (Apple: "Soubor se nepodařilo smazat" [AL]). Impersonal, gender-free.
5. **No gendered forms about the user.** Czech past tense and conditionals are gendered even with vykání (dosáhl/dosáhla jste, abyste mohl/mohla). Rewrites used: passive "Dosažen limit…", present tense "Co se stalo a co chcete udělat?", "Upozornění dostanete, až je zapnete", "Odeslané zprávy a odpovědi na ně", "Opravdu chcete smazat…?" (not "Jste si jisti").
6. **Remi is masculine** (a name): "Remi slyšel", "Remi mohl", "zpráva od Remiho". Where Remi is the app, "aplikace Remi" (f.): "až bude aplikace Remi otevřená". "Remi" and "Remi Pro" are never translated; "Remiho" is the standard genitive of the name.
7. **Remi's own voice is first person singular, present tense** (gender-free): Poslouchám…, Vytvářím připomínku…, Připravuji…, Tomu nerozumím, Kdy vám to mám připomenout?
8. **Sentence case**; weekdays and months lowercase. Upper-case only where English is upper-case by design (ZRUŠIT, HOTOVO, DOKONČENO, NEJVÝHODNĚJŠÍ, ZDARMA).
9. **Typography:** Czech quotes „…“, en dash with spaces ( – ) for the English em dash, single ellipsis character …, 24-hour clock (the hand-built am/pm keys got "dop."/"odp." per CLDR cs, but Intl should replace them).
10. **No provider names**; "služby AI" only.

## 2. Apple iOS terms (cs)

| English | Czech | Status |
|---|---|---|
| Reminders (app/list) | Připomínky (reminder = připomínka, f.) | verified [AL ReminderKit `Reminders`] |
| Alarm | Budík | verified [AL ClockAngel `Alarm`] |
| Snooze | Odložit | verified [AL SpringBoard `ALARM_SNOOZE`] |
| Stop (alarm) | Zastavit | verified [AL SpringBoard `ALARM_STOP`] |
| Later | Později | inferred (common word, appears in Apple strings such as "Nastavit později" [AL CompanionSetup `SET_UP_LATER`], but no standalone "Later" button found) |
| Settings | Nastavení | verified [AL AVKitRoutingService `CONTROL_SETTINGS`] |
| Delete | Smazat | verified [AL `ATTACHMENT_DELETION_BUTTON_TITLE`] |
| Done | Hotovo | verified [AL `Done`, `DONE`] |
| Allow / Don't Allow | Povolit / Nepovolovat | verified [AL `DONT_ALLOW` in iCloud, CloudKit, Default.bundle]; "Povolit" verified as a verb in [AL], button inferred |
| Not Now | Teď ne | verified [AL `NOT_NOW`, many bundles] |
| Try Again | Zkusit znovu | verified [AL AccessorySetupUI `Try Again`] |
| Notifications | Oznámení | verified [AL `USER_NOTIFICATION_PERMISSION_ALERT_TITLE`] |
| Subscription | Předplatné | verified [AL StoreKit `RESTORE_SUBSCRIPTION_LABEL` "Obnovit předplatné"] |
| Restore Purchases | Obnovit nákupy | inferred short form; Apple's own StoreKit label is "Obnovit chybějící nákupy" [AL `RESTORE_PURCHASES_LABEL`] |
| Free Trial | Vyzkoušet zdarma / "%@ zdarma, potom %@/%@" | verified [AL StoreKit `ACTION_FREE_TRIAL`, `SUBSCRIPTION_PRICE_%@_FREE_TRIAL_THEN_%@_PER_%@`] |
| Auto-renews until cancelled | "Předplatné se … automaticky prodlužuje, dokud ho nezrušíte." | verified [AL StoreKit `SUBSCRIPTION_PRICE_%@_PER_%@_LONG`] |
| Every day | Každý den | verified [AL MobileTimer `ALARM_EVERY_DAY`] |
| Weekdays | Všední dny | verified [AL FocusSettingsUI `WEEKDAYS`, HealthUI]; Clock detail says "každý všední den" |
| slide to stop | zastavíte přejetím | verified [AL ClockAngel `SLIDE_TO_STOP`] |
| Listening… | Poslouchám… | verified [AL ShazamKit `SHAZAM_MODULE_LISTENING`, Siri] |
| Apple Account | účet Apple | verified (lowercase "účet Apple" in running text, e.g. [AL Diagnostic-9008]) |
| Screen Time | Čas u obrazovky | verified [AL `NOTIFICATION_AUTH_REQUEST_MESSAGE_EXTENDED`] |
| Privacy Policy | Zásady ochrany osobních údajů | verified [AL StoreKit `ERROR_PRIVACY_POLICY_TITLE`] |
| General / About (Settings sections) | Obecné / Informace | inferred (iOS Settings labels, not queried) |

## 3. Glossary (Remi-specific choices)

| English | Czech |
|---|---|
| reminder / reminders | připomínka / připomínky (f.) |
| alarm | budík |
| recording / take | nahrávka |
| spoken line | mluvený text |
| heads-up | Upozornit předem; "{minutes} min předem" |
| voice note | hlasová poznámka |
| feedback | zpětná vazba |
| Get Pro / Upgrade | Získat Pro / Přejít na Pro |
| Free (plan) | zdarma / bezplatná verze |
| plan (pricing) | tarif |
| Every {duration} (interval) | Jednou za {duration} (works with any number and the abbreviations "h"/"min"; "Každých" would need number agreement) |
| Billed every {term} | Platba jednou za {term} |
| {price} every {term} | {price} za {term} |
| Tap to … | Klepnutím … |
| language names | adverbs: česky, anglicky, arabsky… (see §4) |

## 4. Grammar decisions

- **Plurals:** every plural block has one / few / many / other. few = 2–4 (dny, hodiny, připomínky), other = 0 and 5+ (dní, hodin, připomínek), many = decimals (genitive singular: 1,5 dne / hodiny / připomínky). Case follows the governing word: "za # hodinu/hodiny/hodin" (accusative), "z # připomínky/připomínek" (genitive), "Dosažen limit # aktivní připomínky / aktivních připomínek" (genitive; few takes genitive plural too).
- **`one` forms drop the number where Czech does:** "Každou minutu", "Každou hodinu", "Každý den" (like Apple's es/pt plural sets). `paywall.term.*` one = bare noun (měsíc, rok) as in English.
- **`take.multiCreated`** had only `other` in English; Czech supplies all four with the participle agreeing (Vytvořena / Vytvořeny / Vytvořeno).
- **Billing term in sentences:** "every {term}" can't be translated with a fixed "každý" (the word changes with number: každý měsíc / každé 2 měsíce / každých 6 měsíců), so all templates use "za {term}" / "jednou za {term}", where the plural forms in `paywall.term.*` are already in the right (accusative) case.
- **Language names** are adverbs, not nouns. Both slots read naturally without case changes: "Poslouchám česky", "Remi zatím neumí česky"; fallback `pending.thisLanguage` = "tento jazyk" ("Remi zatím neumí tento jazyk"). The settings alert button `settings.voiceLanguage.en` is a noun ("Angličtina") because it stands alone. If the runtime ever uses `language.name.*` standalone (a list), they would need noun forms (čeština, angličtina…).
- **`pending.askPastTime` / `pending.detail.pastTime`:** "Na {time} už je dnes pozdě." works for a clock time and for the fallback `pending.thatTime` = "tento čas" (lowercase on purpose; it's mid-sentence after "Na").
- **`pending.quickChoice.a11y`** = "Připomenout {choice}", relies on the code lower-casing the chip label ("Připomenout za hodinu", "Připomenout zítra ráno").
- **`reminders.pattern.everyDays`** = "Vždy {days}" ("Vždy Po, Čt"). "Každé/Každý" would need weekday gender.

## 5. Paywall legal block

Wording follows Apple's own Czech StoreKit text ("Předplatné se za %@/%@ automaticky prodlužuje, dokud ho nezrušíte", "%@ zdarma, potom %@/%@") and the standard 3.1.2 points. "Platba se strhne z vašeho účtu Apple při potvrzení nákupu" is the usual Czech App Store formula. Path: "Nastavení > Účet Apple > Předplatné" (Czech iOS: Settings top row = účet Apple, its subscriptions screen = Předplatné). The alert in `settings.alert.manageFailed.message` uses "váš účet Apple" mirroring the English "your Apple Account". A native reviewer should check the disclosures once; meaning is exact.

## 6. Overflow risks

| Key | Czech | Chars / limit |
|---|---|---|
| `paywall.card.badge` | NEJVÝHODNĚJŠÍ | 13 / ~12 (alt: "TOP CENA") |
| `repeat.mode.everyNDays` | Každých N dní | 13 / ~12 |
| `paywall.hero.default.line1` | Míň zapomínat. | 14 / ~12 serif display |
| `paywall.hero.default.line2` | Pamatovat si | 12 / ~12 (at limit) |
| `alarm.button.later` | Později | 7 / ~8 (AlarmKit, fits) |
| `tabs.reminders` | Připomínky | 10 / ~10 (at limit) |
| `today.header.getPro`, `recording.gate.upgrade` | Získat Pro | 10 / ~10 (at limit) |
| `paywall.table.col.free` | ZDARMA | 6 / ~6 (at limit) |
| `settings.row.privacy`, `paywall.legal.privacy` | Zásady ochrany osobních údajů | 29 (vs 14 in English; footer link row may wrap) |
| `paywall.cta.subscribe` | Předplatit za {price} / {term} | long with Kč prices, one-line CTA |
| `edit.row.headsUp` | Upozornit předem | 16 (row label) |

Everything else is within the inventory limits.

## 7. Uncertain strings (native review suggested)

- `diagnostics.status.provisional` = "Prozatímně povoleno": Apple's Czech term for provisional notifications not found.
- `time.dueNow` = "Je čas" (short and natural, but less literal than "due").
- `repeat.mode.date` = "Jednorázově" (the mode rings once on a picked date; chosen over "V určitý den" for length).
- `paywall.hero.*` lines are a rewrite, not a literal split: "Míň zapomínat. / Pamatovat si / včas." and "Připomínat, / dokud to / neuděláte."
- `pending.heard` = "Remi slyšel: „{quote}“" and `permission.subtitle` "…aby vás Remi mohl…" treat Remi as masculine.
- `paywall.closing.brand` "Vytvořil ji jeden vývojář…" (masculine developer is factual).
- `time.clock.am/pm`, `times.picker.am/pm` = "dop."/"odp.": Czech normally uses the 24-hour clock; these keys should go away once Intl formats the time.
- `language.name.hi` "hindsky", `language.name.ur` "urdsky", `language.name.tl` "tagalsky": correct but rare adverbs.
