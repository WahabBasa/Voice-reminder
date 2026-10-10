# sw (Swahili) in-app UI: translator notes (2026-10-10)

Catalog: `sw.json`, 426 keys, same order as `strings-en.json`. Built from `scratchpad/sw/build_sw.py`. The validator passes with 0 errors and 16 warnings. All 16 warnings are harmless (see "Validator warnings" below).

## 1. Mini style sheet

**iOS doesn't come in Swahili.** iOS has no Swahili system language. Apple ships Swahili only for things like keyboards, dictation and region formats, not for the system UI. A Swahili user's iPhone is almost always set to English. So Apple has no Swahili wording to copy. I used the terms people already see on Android and Google apps. Android has a full Swahili UI, and AOSP ships `values-sw` strings.
- Consequence 1: wherever a string points at an iOS screen (Settings path, Screen Time, App Store), I left the iOS label in **English**, because that's what the user's iPhone shows. Examples: `paywall.legal.*`, `settings.alert.manageFailed.message`, `paywall.error.notAllowed`.
- Consequence 2: the system permission buttons (Allow / Don't Allow) are drawn by iOS in the phone's language, probably English. Our own consent card uses Swahili.
- Before shipping, check that iOS's per-app language picker offers Swahili when the system language is not Swahili.

**Register.** Standard Swahili that reads the same in Tanzania and Kenya. Swahili has no formal/informal "you". Address the user as singular *wewe* (u- prefix: "Umefikia", "ujaribu").
- Remi speaks in the first person ("Nikukumbushe lini?", "Sikuelewa").
- Remi is treated as a person (a-wa class: "Remi amesikia", "Remi anasema", "Remi bado hazungumzi").
- Status lines follow Android: i- prefix plus the -na- tense ("Inasikiliza…", "Inapakia…", "Imeshindwa…").
- Failures use the Android pattern "Imeshindwa ku-…" ("failed to…").

**Button form.** Bare imperative or verb stem, the way Android does it: Futa, Ghairi, Ruhusu, Washa, Tuma, Rudia, Rekodi tena. Hints use the subjunctive after *ili*: "Gusa ili ujaribu tena".

**Terms** (V = verified from a source this session, I = inferred).

| English | Swahili | Status / source |
|---|---|---|
| Reminders | Vikumbusho (sg. kikumbusho, ki-vi class) | I: standard noun. AOSP DeskClock's snooze label is "Nikumbushe baadaye" (V), same root |
| Alarm | Kengele | V: AOSP DeskClock `values-sw` ("Ongeza kengele", "Kengele imezimwa") |
| Snooze | Ahirisha ("Imeahirishwa") | V: DeskClock "Imeahirishwa". Remi doesn't use it; its button is "Later" |
| Stop | Simamisha | V: DeskClock `timer_stop` |
| Later | Baadaye | V: DeskClock "Nikumbushe baadaye" |
| Settings | Mipangilio | V: DeskClock `settings` / `menu_item_settings` |
| Delete | Futa | V: DeskClock `delete` |
| Cancel | Ghairi | V: DeskClock `timer_cancel` |
| Done | Nimemaliza | I: Android/Gboard Swahili "Done" convention, not re-checked this session |
| Allow / Don't Allow | Ruhusu / Usiruhusu | V: AOSP CompanionDeviceManager `values-sw` |
| Notifications | Arifa | V: same AOSP file |
| Subscription | Usajili (verb: kujisajili) | I: Google Play Swahili usage |
| Restore Purchases | Rejesha ununuzi | I |
| Free Trial | jaribio la bure / "Jaribu bure kwa {length}" | I. "Bure" is what people say; the formal "bila malipo" is longer |
| Every day | Kila siku | V: DeskClock `every_day` |
| Weekdays | Siku za wiki (paywall row) | I. Remi has no "Weekdays" chip, so this only appears in the feature row |
| slide to stop | Telezesha ili usimamishe | I. Remi has no such string; listed for future use |
| Listening… | Inasikiliza… | I: Android -na- progress form |
| Today / Tomorrow | Leo / Kesho | V: DeskClock |
| min (abbrev.) | dak | V: DeskClock plural "Dak %d" |

**Number order.** Swahili puts the number after the noun: "dakika 5", "saa 2", "vikumbusho 3". All placeholders follow that order ("dak {count}", "saa {hours} dak {minutes}").

**Plurals.** Only one/other. dakika, saa, siku and wiki don't change, so both branches are the same. kikumbusho/vikumbusho, mwezi/miezi and mwaka/miaka change, and so does agreement: "kinachotumika" for one, "vinavyotumika" for other. For "Every 1 X", the `one` branch drops the number ("Kila saa", "Kila siku", "Kila dakika"), as Apple does in es-419.

**Weekdays.**
- Short forms: Jpi, Jtt, Jnn, Jtn, Alh, Iju, Jmo. This is the common app and calendar convention (I). CLDR `sw` uses the full names for "abbreviated", which are too long for subtitles.
- Narrow forms: M T W T F S S, which is CLDR `sw` narrow (I, from memory). These are English letters. No unambiguous Swahili one-letter set exists, since five days start with J. Better: generate them with `Intl` once wired.

**Language names** follow CLDR `sw` ("Ki-" + name): Kiingereza, Kihispania, Kifaransa, Kiarabu, Kibengali, Kinorwe cha Bokmål, and so on.

## 2. Loanwords and kept-English (deliberate)

- **Remi, Remi Pro, Pro, PRO:** brand names.
- **App Store, Apple Account, Settings, Subscriptions, Screen Time:** iOS UI labels. iOS has no Swahili, so they stay in English. "Akaunti yako ya Apple" is used in running prose.
- **iPhone, emoji, intaneti, maikrofoni, seva:** established loans that Android Swahili uses too.
- **AI:** written "akili bandia (AI)" the first time in the consent card and the Info.plist string. "Akili bandia" is the standard term, and "(AI)" helps recognition. No provider is named.
- **am / pm / AM / PM:** CLDR `sw` uses AM/PM. I didn't use the traditional "saa za Kiswahili" clock, which is offset by 6 hours (see risk 1).

## 3. Validator warnings (all acceptable)

- 11 × "'Remi' missing": false positives. The English "Reminder(s)" and "Remind me" contain the substring "Remi". The Swahili text (Kikumbusho, Nikumbushe) correctly has no brand.
- 5 × "identical to English": `time.dateAndTime`, `schedule.timesAndDays`, `schedule.moreTimes`, `schedule.window`, `paywall.card.a11y`. These are placeholder-plus-punctuation joins with no words to translate.

## 4. Uncertain strings

1. **Time display (`time.ringsAgain`, `pending.askPastTime`, every `{time}`).** Many Swahili speakers read clock times in "saa za Kiswahili", where 7am is "saa moja asubuhi". The formatter will output "7:00 AM" (Western). That's normal in apps, but a native reviewer should confirm "Italia tena {time}" reads fine with a Western time. There's also an ambiguity: "saa 2" as a *duration* (`duration.hours`, "Baada ya saa 1") is fine, but could be misread as "8 o'clock" with no context.
2. **`common.done` / `alarm.button.done` / `alarmOverlay.done` / `repeat.done` = "Nimemaliza"** ("I'm finished"). It works for the alarm (the task is done). For the edit-sheet confirm it's a little odd. "Hifadhi" (Save) would be clearer there but changes the meaning. Needs a native check.
3. **`take.partial.title`** = "Vikumbusho {created} kati ya {total} vimeundwa". Agreement is plural even when `{created}` is 1 ("Vikumbusho 1 kati ya 3 vimeundwa"). That's acceptable partitive usage, but not perfect. `{created}` isn't a plural argument, so it can't branch.
4. **`paywall.hero.interval.*`** ("Kirudie / hadi / kikamilike."): the three-line break puts the short "hadi" alone on line 2. Fine typographically, but the lines are uneven.
5. **`weekday.narrow.*`**: English letters (CLDR). A native may prefer the short forms in that column.
6. **`notificationsOff.message`** says "Mipangilio" (Remi's own tab). If this means iOS Settings, it should read "Settings" in English.
7. **`edit.row.headsUp`** = "Onyo la mapema" ("early warning"). It's a little strong. "Taarifa ya mapema" is an alternative.
8. **`paywall.caption.commitment`** = "Hakuna mkataba wa lazima" ("no binding contract"). This is the closest natural equivalent of "No commitment".

## 5. Length and overflow (limits from the inventory)

| key | sw | chars | limit | status |
|---|---|---|---|---|
| tabs.reminders | Vikumbusho | 10 | ~10 | at limit |
| tabs.settings | Mipangilio | 10 | ~10 | at limit |
| common.done | Nimemaliza | 10 | ~10 | at limit |
| alarm.button.done | Nimemaliza | 10 | ~8 (very short) | **OVERFLOW risk**: AlarmKit button |
| alarm.button.later / alarmOverlay.later | Baadaye | 7 | ~8 / ~10 | ok |
| alarmOverlay.done | Nimemaliza | 10 | ~10 | at limit |
| permission.enabled | Imewashwa | 9 | ~10 | ok |
| today.header.getPro | Pata Pro | 8 | ~10 | ok |
| recording.gate.upgrade | Boresha | 7 | ~10 | ok |
| composer.speak | Ongea | 5 | ~8 | ok |
| take.created.action | Si sahihi? | 10 | ~12 | ok |
| quickChoice.in1Hour | Baada ya saa 1 | 14 | ~16 | ok |
| quickChoice.tomorrowMorning | Kesho asubuhi | 13 | ~18 | ok |
| feedback.list.fromRemi | Ujumbe wa Remi | 14 | ~20 | ok |
| paywall.card.badge | THAMANI BORA | 12 | ~12 | at limit |
| paywall.table.col.free | BURE | 4 | ~6 | ok |
| paywall.cta.trial | Jaribu bure kwa siku 7 | 22 | ~24 | ok (with "siku 7") |
| paywall.cta.unavailable | Mipango haipatikani | 19 | ~24 | ok |
| repeat.done | NIMEMALIZA | 10 | none given | upper-case and wide; check |
| paywall.hero lines | ≤ 12 | ~12 | ok |

The only real overflow risk is the AlarmKit **Done** button. If it clips, the fallback is "Tayari" (6), which reads more like "ready".

## 6. Paywall legal

`paywall.legal.disclosure.priced` keeps every element of the English meaning: price and period; charged to your Apple Account when you confirm the purchase; renews automatically at the same price; charged within 24 hours before each renewal; renewal can be turned off at least 24 hours before the current period ends; manage or cancel at Settings > Apple Account > Subscriptions (iOS labels in English, see §1). Auto-renew is "kusasishwa kiotomatiki" and the charge is "kutozwa". A native legal read is still recommended.

## 7. Confidence

**Medium.** Grammar and agreement were checked string by string, and the core terms come from AOSP's Swahili strings. But Apple has no Swahili wording to copy, and "Nimemaliza", time-of-day reading, and the paywall and legal tone still need a native Tanzanian or Kenyan reviewer.

## Sources (this session)
- AOSP DeskClock `res/values-sw/strings.xml`: https://android.googlesource.com/platform/packages/apps/DeskClock/+/refs/heads/main/res/values-sw/strings.xml (Kengele, Futa, Rudia, Leo, Kesho, Ondoa, Imeahirishwa, "Dak %d", Kila siku, Mipangilio, Simamisha, Ghairi)
- AOSP CompanionDeviceManager `values-sw/strings.xml`: https://android.googlesource.com/platform/frameworks/base/+/8cc360e96547/packages/CompanionDeviceManager/res/values-sw/strings.xml (Ruhusu, Usiruhusu, Arifa)
- GPI blog, Android translated into Swahili and iOS is not: https://www.globalizationpartners.com/2014/09/24/how-multilingual-is-your-mobile-device (old; iOS's lack of a Swahili system language is from my knowledge, not re-checked against Apple's current language list)
