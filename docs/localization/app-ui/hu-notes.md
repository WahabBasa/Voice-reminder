# Hungarian (hu) in-app UI: style sheet and translator notes (2026-10-10)

Catalog: `hu.json` (426 keys, same order as `strings-en.json`). Validator: `[hu] PASS: 426 keys (en 426), 0 errors, 17 warnings`. All 17 warnings are false positives: "Remi" matched inside "Reminder(s)", or format-only strings that stay identical (`{date} · {time}`, `Remi v{version} ({build})`).

Source tags:
- **[AL]**: applelocalization.com API, iOS 26.7.1, locale `hu` (Apple's own Hungarian system strings). Queried 2026-10-10.
- **[inferred]**: my call, with no Apple string found.

---

## 1. Mini style sheet

1. **Register: Ön (formal), the way Apple writes Hungarian iOS.**
   - Apple's hu system strings address the user formally: "csúsztassa el a feloldáshoz", "Koppintson duplán új emlékeztető létrehozásához", "Kérjük, próbálja újra később", "az Ön személyes adatai" [AL].
   - So instructions use the formal imperative: **Koppintson**, **Próbálja újra**, **Ellenőrizze**, **Válasszon**.
   - Possessives are 3rd person: "a hangját", "az előfizetése". Never mix in tegezés (te-forms).
2. **Buttons, menu items and row titles use a verbal noun (-ás/-és), as on iOS.** Apple examples: Törlés, Leállítás, Engedélyezés, Tiltás, Ismétlés, "Vásárlások visszaállítása", "Ingyenes próbaidőszak megkezdése" [AL]. Write "Visszajelzés küldése", not "Küldjön visszajelzést".
   - Exception: Apple's Cancel is **Mégsem**, and its Done is **Kész** [AL].
   - Remi's "Remind me" button is **Emlékeztessen**, following Apple Health's "Emlékeztessen 10 perc múlva" [AL].
3. **Progress states take the verbal noun plus an ellipsis:** Figyelés…, Feldolgozás…, Küldés…, Visszaállítás… (Apple "Figyelés…" [AL]).
4. **Remi's own voice is first person singular:** "Mikor emlékeztessem?", "Ezt nem értettem". Team-level lines use 1st person plural, as in the English: "Nem hallottuk Önt", "Vizsgáljuk", "Köszönjük".
5. **Sentence case.** Capitalize only the first word and proper nouns. Language names, weekdays and months are lowercase in Hungarian.
6. **Quotes and dashes:** „…” for quoted text, an en dash with spaces ( – ) for the English em dash.
7. **Brand and provider rules:**
   - "Remi" and "Remi Pro" stay as they are.
   - Remi is used as a persona name with no article ("Remi ezt hallotta", "Üzenet Remitől").
   - "MI" (mesterséges intelligencia) is the generic AI word. No provider names anywhere.
   - The Info.plist AlarmKit string now says "Remi" (the English still says "VoiceReminder").
8. **Plurals.** CLDR hu has `one` and `other`. Every plural block has both, and the noun stays singular after a number in both ("1 nap" / "5 nap", "# emlékeztető"). That's why most blocks show identical branches; this is correct. `take.multiCreated` got a `one` branch the English lacks.
9. **Placeholders and suffixes.**
   - No case suffix or article is attached to any placeholder. Vowel harmony and a/az depend on the runtime value.
   - The tools used instead:
     - a colon label: "Újra csörög: {time}", "Időköz: {duration}", "Emlékeztessen: {choice}"
     - the placeholder as a bare subject: "{time} ma már elmúlt."
     - a parenthesis: "Lejárt az előfizetése ({product})."
     - "{product}: …" as a sentence opener
   - The one exception is `paywall.toast.activated.message`. It became "{product}: üdvözöljük!" to avoid "a(z) Remi Pro-ban".
10. **Times.** Hungarian uses the 24-hour clock. `time.clock.am/pm` = "de." / "du.", picker "DE" / "DU" (CLDR hu), but the clock should come from `Intl` with the `hu` locale.

---

## 2. Apple terms (verified vs inferred)

| English | Hungarian | Status / source |
|---|---|---|
| Reminders (app) / reminder | Emlékeztetők / emlékeztető | **verified** [AL] iCloud.app "Nem nyitható meg az Emlékeztetők"; ReminderKit "Új emlékeztető" |
| Alarm | **Ébresztés** (noun for an alarm event and the toggle) | **verified** [AL] SpringBoard `ALARM_DEFAULT_TITLE` = "Ébresztés"; MobileTimer "Az ébresztő ki van kapcsolva". The Clock tab name "Ébresztő" was not retrieved, so the tab name is **inferred** |
| Snooze | Szundi | **verified** [AL] ClockAngel, SpringBoard (not used in this catalog) |
| Stop | Leállítás | **verified** [AL] ClockAngel `stop.button` |
| slide to stop | leállítás csúsztatással | **verified** [AL] ClockAngel `SLIDE_TO_STOP` (not in this catalog) |
| Later | Később | **inferred**. A common Apple word ("Beállítás később" [AL]), but no Clock/AlarmKit "Later" button was found |
| Settings | Beállítások | **verified** [AL] CarPlaySettings `CFBundleDisplayName` |
| Delete | Törlés | **verified** [AL] |
| Done | Kész | **verified** [AL] |
| Cancel | Mégsem | **verified** [AL] |
| Allow / Don't Allow | Engedélyezés / Tiltás | **verified** [AL] FamilyControls `ALLOW`, iCloud `DONT_ALLOW`. Note: TCC permission prompts use "Nem engedélyezem" for deny |
| Subscription(s) | Előfizetés / Előfizetések | **verified** [AL] AppleAccountIntents "Subscriptions" → "Előfizetések" |
| Restore Purchases | Vásárlások visszaállítása | **inferred**. Apple StoreKit SwiftUI has "Hiányzó vásárlások visszaállítása" [AL]. I dropped "Hiányzó" |
| Free Trial | ingyenes próba / ingyenes próbaidőszak | **verified** [AL] StoreKit `MODE_FREE` "Ingyenes próba"; Music "Ingyenes próbaidőszak megkezdése" |
| Every day | Minden nap | **verified** [AL] MapKit "Every Day" |
| Weekdays | Hétköznap / minden hétköznap | **verified** [AL] MobileTimer `ALARM_DETAIL_WEEKDAYS` "minden hétköznap" |
| Listening… | Figyelés… | **verified** [AL] SharingViewService `TLV_LISTENING_TITLE` |
| Repeat | Ismétlés | **verified** [AL] ClockAngel |
| Apple Account | Apple-fiók | **verified** [AL] |
| Silent mode | Néma mód | **verified** [AL] (not in this catalog) |
| Screen Time | Képernyőidő | **verified** [AL] |
| auto-renews until canceled | automatikusan megújul a lemondásig | **verified** [AL] StoreKit "Az előfizetés automatikusan megújul %@/%@ áron a lemondásig." |
| Tap | koppint / Koppintson | **verified** [AL] |

support.apple.com/hu-hu was not opened. The applelocalization API returned Apple's own iOS 26.7.1 strings, which is a stronger source.

## 3. Remi glossary

emlékeztető (reminder) · ébresztés (alarm) · felvétel (recording) · Előjelzés (heads-up / pre-alert) · Időköz (interval; also used for "Every {duration}") · Időablak (the "Between" window) · Elhangzó szöveg (spoken line) · Hangüzenet (voice note) · Felismerés nyelve (voice language) · Átírás (transcription) · Visszajelzés (feedback) · csomag (plan) · Havi / Éves (Monthly / Annual) · INGYEN (FREE column) · LEGJOBB ÁR (BEST VALUE) · Pro verzió (Pro) · Adatvédelmi irányelvek (Privacy Policy) · Felhasználási feltételek (Terms of Use).

## 4. Paywall legal block

- Wording follows Apple's StoreKit hu phrasing ("automatikusan megújul … a lemondásig", "/hónap" [AL]). The path is updated to **Beállítások > Apple-fiók > Előfizetések**.
- "terheljük az Apple-fiókjára" is the standard Hungarian subscription-app phrasing for "charged to your Apple Account".
- `{price} / {term}` replaces "every {term}". Hungarian "every month" needs a suffixed or adverbial form ("havonta", "3 havonta"), which a nominative `{term}` can't give.
  - The meaning is kept: "{product}: 4,99 € / hónap", and it "renews automatically at the same price ({price} / {term})".
- All Guideline 3.1.2 elements are present:
  - charge at confirmation
  - auto-renewal
  - the charge within 24 hours before renewal
  - turn off auto-renew at least 24 hours before the period ends
  - where to manage or cancel

## 5. Uncertain strings / decisions

- **`paywall.trial.*` use the adjective form**: "# napos", "# hónapos", "# éves". `{length}` only appears before a noun ("7 napos próba", "7 napos ingyenes próba"), so this reads naturally. If `{length}` is ever used standalone, it needs nominative variants.
- **`paywall.cta.trial`** = "{length} ingyenes próba" is a noun phrase with no verb (Apple's StoreKit button is also "Ingyenes próba"). The full verb form "… ingyenes próbaidőszak megkezdése" is about 40 chars.
- **`pending.detail.unsupportedLanguage`** = "Remi ezt a nyelvet még nem beszéli: {language}". The fallback `pending.thisLanguage` was changed to "ismeretlen nyelv" (unknown language) so the sentence still reads well. The English "this language" would double up.
- **`pending.askPastTime` / `detail.pastTime`** = "{time} ma már elmúlt." This works for "8:00" and for the fallback "Ez az időpont". Strictly it wants an article ("A 8:00…"); it was left out on purpose.
- **Language names** are lowercase (Hungarian rule). They appear after a colon or "·", so lowercase is right there. `settings.voiceLanguage.en` is a standalone alert button, so it is "Angol". The Arabic endonym stays as it is.
- **`reminders.pattern.everyDays`** = "Hetente: {days}" ("weekly: H, Cs"), because "Minden {days}" would need the -n suffix on each day name.
- **`today.header.getPro`** = "Pro verzió" (a label, not a verb). Alternative: "Váltás Próra" (12).
- **`paywall.hero.default.line1`** = "Ne felejtsen." ("Don't forget"). "Felejtsen kevesebbet." (21) is too long for the ~12-char hero line. The closing headline keeps "Felejtsen kevesebbet."
- **Alarm noun:** "ébresztés" vs "ébresztő". I chose Apple's SpringBoard alert title "Ébresztés". A native reviewer may prefer "Ébresztő" for the toggle row.
- **`composer.status.reading`** ("Reading that…") became plain "Feldolgozás…". **`composer.speak.a11y`** is first person ("Inkább kimondom"), as a VoiceOver action.

## 6. Overflow risks (inventory limits)

| Key | EN limit | hu | chars | Risk |
|---|---|---|---|---|
| `tabs.reminders` | ~10 | Emlékeztetők | 12 | **over**. Tab label; check at the smallest width |
| `tabs.settings` | ~10 | Beállítások | 11 | slight |
| `recording.gate.upgrade` | ~10 | Előfizetés | 10 | at limit |
| `aiConsent.allow` | ~10 | Engedélyezés | 12 | **over**. Primary button, probably has room |
| `permission.enable` | ~10 | Bekapcsolás | 11 | slight |
| `permission.enabled` | ~10 | Bekapcsolva | 11 | slight (status pill) |
| `common.cancel` / `common.done` | ~10 | Mégsem / Kész | 6 / 4 | ok |
| `composer.speak` | ~8 | Beszéd | 6 | ok |
| `feedback.sheet.send` | ~10 | Küldés | 6 | ok |
| `today.timeDraft.confirm` | ~14 | Emlékeztessen | 13 | ok |
| `take.created.action` | ~12 | Nem stimmel? | 12 | at limit |
| `quickChoice.tomorrowMorning` | ~18 | Holnap reggel | 13 | ok |
| `quickChoice.pickTime` | ~16 | Időpont… | 8 | ok (shortened from "Időpont választása…") |
| `repeat.mode.everyDay` | ~12 | Minden nap | 10 | ok |
| `edit.row.repeat` | ~12 | Ismétlés | 8 | ok |
| `feedback.list.fromRemi` | ~20 | Üzenet Remitől | 14 | ok |
| `paywall.table.col.free` | ~6 | INGYEN | 6 | at limit |
| `paywall.card.badge` | ~12 | LEGJOBB ÁR | 10 | ok |
| `paywall.cta.trial` | ~24 | 7 napos ingyenes próba | 22 | ok; "12 hónapos ingyenes próba" = 25 |
| `paywall.cta.unavailable` | ~24 | Nem érhetők el csomagok | 23 | ok |
| `paywall.cta.subscribe` | 1 line | Előfizetés: 4,99 € / hónap | ~26 | likely ok |
| `paywall.hero.interval.line3` | ~12 | el nem végzi. | 13 | slight |
| `alarm.button.later` | ~8 | Később | 6 | ok |
| `alarm.button.done` | short | Kész | 4 | ok |
| `layout.toast.alarmsMayNotFire.title` | toast | Az ébresztések elmaradhatnak | 28 | 2 lines likely |
| `notificationsOff.title` | toast | Emlékeztető mentve – az értesítések ki vannak kapcsolva | 54 | wraps |

Hungarian long compounds ("Mikrofonhozzáférés", "Hónapválasztó") don't hyphenate automatically. Allow wrapping or shrinking on status lines.
