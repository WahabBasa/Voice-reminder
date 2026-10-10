# hi (Hindi) app UI translation notes: Remi (2026-10-10)

File: `docs/localization/app-ui/hi.json` (426 keys, same order as `strings-en.json`). Script: Devanagari throughout. "Remi", "Remi Pro", "Pro", "App Store", "iPhone", "Apple" and "AI" stay in Latin letters, as Apple's own Hindi UI does.

Source tags:
- **[AL]**: applelocalization.com API, iOS 26.7.1, locale `hi`. These are Apple's shipped Hindi system strings, queried 2026-10-10 (bundle in brackets).
- **[CLDR]**: Node `Intl` (full ICU) with `hi-IN`, which matches what iOS formatters print.
- **[J]**: my judgment, no direct source.

---

## 1. Mini style sheet

**Register.** Use आप with polite imperative forms (-एँ / -ें: चुनें, करें, जाँचें). Apple's Hindi UI does the same throughout [AL]. Never use तुम or तू.

**Buttons.** Use the polite imperative, usually noun + करें: रद्द करें, डिलीट करें, स्नूज़ करें, अनुमति दें, सब्सक्राइब करें [AL]. Hindi buttons don't take an infinitive. Status and progress lines use the passive or progressive: सुना जा रहा है…, सेट हो रहा है….

**Loanwords.** Indian iOS uses English loanwords in Devanagari for most tech nouns, and I followed it: रिमाइंडर, अलार्म, सब्सक्रिप्शन, डिलीट, रीस्टोर, ट्रायल, सेटिंग. Purist forms like अनुस्मारक or स्मरण-पत्र would look foreign on an iPhone. I kept the nukta spelling Apple uses: ख़रीदारी, मुफ़्त, आवाज़, फ़ीडबैक.

**Remi's gender.** Remi is treated as masculine (Remi करता है, Remi कहता है), the usual default for a brand or app. In first-person lines I used gender-neutral verbs: मैं आपको कब याद दिलाऊँ?, Remi ने सुना.

**User's gender.** Neutral where it was cheap: "You've reached…" became "…की सीमा पूरी हो गई", and "You already own…" became "…पहले से आपके पास है". Where it wasn't, the line takes the masculine-honorific default, as Apple does (आप … कर सकते हैं). Affected keys: `permission.subtitle`, `restore.expired.message`, `paywall.toast.expired.message`, `feedback.sheet.placeholder`.

**Apple terms:**

| English | Hindi | Status |
|---|---|---|
| Reminders | रिमाइंडर | verified [AL RemindersUICore "सभी रिमाइंडर", "नया रिमाइंडर जोड़ें"] |
| Alarm | अलार्म | verified [AL ClockAngel `Alarm`] |
| Snooze | स्नूज़ करें | verified [AL SpringBoard `ALARM_SNOOZE`] (not used in our strings) |
| Stop | रोकें | verified [AL ClockAngel `stop.button`] |
| Later | बाद में | verified as Apple's phrasing [AL RemindersUICore "मुझे बाद में याद दिलाएँ…"]; as a bare button: inferred |
| Settings (iOS app) | सेटिंग | verified [AL Preferences.app `CFBundleDisplayName`] (some Apple strings say सेटिंग्ज़; the app name is सेटिंग) |
| Delete | डिलीट करें | verified [AL RemindersUICore `Delete`] |
| Done | पूर्ण | verified [AL many `Done`/`DONE` keys] |
| Cancel | रद्द करें | verified [AL ClockAngel, SpringBoard] |
| Allow / Don't Allow | अनुमति दें / अनुमति न दें | verified [AL UserNotificationsServer `PERMISSION_ALERT_ALLOW`, `COMMON_DONT_ALLOW`] |
| Not Now | अभी नहीं | verified [AL `NOT_NOW`] |
| Subscription | सब्सक्रिप्शन | verified [AL StoreKit, SupportFlow] |
| Restore Purchases | ख़रीदारी रीस्टोर करें | Apple's own label is "अनुपलब्ध ख़रीदारी रीस्टोर करें" [AL _StoreKit_SwiftUI `RESTORE_PURCHASES_LABEL`]; the short form is inferred |
| Free Trial | मुफ़्त ट्रायल; CTA मुफ़्त में आज़माएँ | verified [AL StoreKit `MODE_FREE`; _StoreKit_SwiftUI `ACTION_FREE_TRIAL`, "%@ मुफ़्त, फिर %@/%@"] |
| Every day | प्रतिदिन (Clock) / हर दिन (StoreKit) | verified [AL MobileTimer `ALARM_EVERY_DAY`] |
| Weekdays | कार्य दिवस | verified [AL MobileTimer `ALARM_WEEKDAYS`] |
| slide to stop | बंद करने के लिए स्लाइड करें | verified [AL ClockAngel `SLIDE_TO_STOP`] (not in our catalog) |
| Listening… | सुना जा रहा है… | verified [AL ShazamKit, MusicRecognition, VoiceControl] |
| Notifications | सूचनाएँ | verified [AL UserNotificationsServer body text] |
| Apple Account | Apple खाता | verified [AL CompanionSetup, Diagnostics] |
| Privacy Policy | गोपनीयता नीति | verified [AL _StoreKit_SwiftUI `PRIVACY_POLICY_LABEL`] |
| Terms of Use | उपयोग की शर्तें | verified [AL GenerativePartnerServiceUI "%@ उपयोग की शर्तें"] |
| auto-renew | ऑटो-रिन्यू | verified [AL NewsCore "प्लान ऑटो-रिन्यू होता रहेगा"]; StoreKit also uses "ऑटो-नवीनीकृत" |
| No commitment | कोई प्रतिबद्धता नहीं | verified [AL NewsCore] |
| Repeat | दोहराएँ | verified [AL MobileTimer] |
| Monthly / Annual | मासिक / वार्षिक | verified [AL _StoreKit_SwiftUI `SUBSCRIPTION_DURATION_SHORT_*`] |
| per month (suffix) | माह | verified [AL `%lld_MONTHS_SHORT_ABBREVIATED`, "प्रति माह"] |
| Something went wrong. Please try again. | कुछ गड़बड़ हो गई। कृपया फिर कोशिश करें। | close to Apple's "कुछ गड़बड़ हुई है। कृपया फिर कोशिश करें।" [AL] |
| Silent mode | मौन मोड | verified [AL CarPlaySettings `RESTORE_SILENT_MODE`] |
| Weekday abbreviations | रवि सोम मंगल बुध गुरु शुक्र शनि; narrow र सो मं बु गु शु श | verified [CLDR] |
| am / pm | am / pm (Latin, lowercase) | verified [CLDR hi-IN prints "3:09 pm"] |
| Language names | CLDR Hindi names | verified [CLDR `Intl.DisplayNames('hi')`], except Tagalog (see 2) |

## 2. Deliberate choices and loanwords

**Identical to English (validator warnings, all intended):**
- `time.dateAndTime`, `schedule.timesAndDays`, `schedule.moreTimes`, `schedule.window`, `paywall.card.a11y`: pure placeholders and punctuation.
- `settings.version`: brand plus version.
- `time.clock.am/pm` and `times.picker.am/pm`: am/pm, because CLDR hi uses Latin "am"/"pm". The picker went lowercase to match.
- `paywall.table.col.pro`: "PRO" (brand).

**The 11 "'Remi' missing" warnings are false positives.** The English text contains "Reminder", which contains "Remi". Every key where English names the brand keeps "Remi" in Latin.

**Other choices:**
- **Settings**: सेटिंग (the iOS app's display name) for the tab, the screen title and the paths.
- **`language.name.bn`**: बंगाली (the CLDR name). बांग्ला also exists; बंगाली is what iOS shows.
- **`language.name.tl`**: टैगलॉग, which matches the English "Tagalog". CLDR hi says फ़िलिपीनो.
- **`language.name.hi`**: हिन्दी, the CLDR spelling. हिंदी is also common.
- **`schedule.daily`** = रोज़ाना and **`schedule.everyDay`** / **`repeat.mode.everyDay`** = प्रतिदिन (Apple Clock), so the two English keys stay distinct.
- **`settings.voiceLanguage.auto`**: ऑटोमैटिक, a loanword. स्वचालित is the purist alternative.
- **Plurals.** Hindi nouns barely change in these contexts (रिमाइंडर, दिन, मिनट, घंटे in the oblique), so most `one`/`other` branches are identical and both use `#`. That makes 0 safe, since 0 falls in `one` [CLDR].
- **`paywall.term.*`**: oblique-friendly forms (one = माह/दिन/सप्ताह/वर्ष, other = "# महीने" etc.), so the terms read correctly after हर ("हर माह", "हर 3 महीने") and after "/". The `one` branches have no `#`, mirroring English.
- **`paywall.trial.months`**: both branches use "# महीने", because every use is followed by का ("1 महीने का ट्रायल").
- **`paywall.cta.trial`**: "{length} मुफ़्त में आज़माएँ" (Apple's StoreKit CTA) instead of a literal "Start … free trial", which runs over 30 characters.
- **`paywall.caption.trial`**: Apple's pattern "{length} मुफ़्त, फिर {price}/{termShort}", which adds "फिर" (then). The meaning is the same as the English.
- **`edit.delete.message`**: "“{title}” डिलीट करें?" (Apple-style, gender-neutral) instead of "Are you sure…".
- **`take.partial.title`**: reordered as "{total} में से {created} रिमाइंडर बनाए गए". `{created}` sits inside the plural branches, which ICU allows. This needs the i18n runtime to pass both values.
- **`infoPlist.NSAlarmKitUsageDescription`**: says "Remi", not "VoiceReminder", per the brief.

## 3. Uncertain strings

- `alarm.button.later`, `alarmOverlay.later` ("बाद में"): Apple's bare Later button wasn't found. "स्नूज़ करें" would be Apple's term if Later really snoozes. I kept the literal meaning.
- `alarm.button.done`, `alarmOverlay.done`, `common.done` ("पूर्ण"): Apple's Done. On an alarm, "हो गया" might read more naturally ("I've done it"). This needs a device check.
- `time.dueNow` ("समय हो गया", "it's time"), `reminders.next.overdue` ("देर हो गई"), `reminders.next.none` ("अगली रिंग शेड्यूल नहीं है"): no Apple equivalent, so these are my judgment.
- `edit.row.headsUp` ("पूर्व-सूचना"): a formal-ish term for the pre-alert. "पहले से अलर्ट" is the casual alternative.
- `feedback.context.remiSays` ("Remi कहता है") gives Remi masculine gender. Fine for a brand, but a native reviewer should confirm.
- `paywall.hero.*`: the lines were reordered to keep Hindi word order ("कम भूलें। / समय पर / याद रखें।", "काम पूरा / होने तक / दोहराएँ।"). Check the visual rhythm in the serif display font.
- `paywall.legal.disclosure.priced`: "हर {term} {price}" depends on `paywall.term.*` filling oblique forms. If the runtime passes a different term string, the grammar may break.
- `settings.alert.manageFailed.message`: the path "सेटिंग › आपका Apple खाता › सब्सक्रिप्शन" mirrors the English. Apple's real path is Settings › [your name] › Subscriptions. I didn't confirm the Hindi Settings row label for "Subscriptions" (assumed सब्सक्रिप्शन).

## 4. Length and overflow risks

Devanagari code-point counts run high because of matras and conjuncts, but the visual width is usually about 60-75% of the code-point count.

| key | limit | Hindi | code points | risk |
|---|---|---|---|---|
| `recording.gate.upgrade` | ~10 | अपग्रेड करें | 12 | low (about 8 glyph clusters). Fallback: अपग्रेड |
| `common.delete` | n/a | डिलीट करें | 10 | fine |
| `today.header.getPro` | ~10 | Pro लें | 7 | fine |
| `today.timeDraft.confirm` | ~14 | याद दिलाएँ | 10 | fine |
| `aiConsent.allow` | ~10 | अनुमति दें | 10 | fine |
| `permission.enable` | ~10 | चालू करें | 9 | fine |
| `feedback.sheet.send` | ~10 | भेजें | 5 | fine |
| `composer.speak` | ~8 | बोलें | 5 | fine |
| `take.created.action` | ~12 | सही नहीं है? | 12 | fine |
| `quickChoice.*` | 16-18 | 1 घंटे में / आज शाम / कल सुबह / समय चुनें… | ≤10 | fine |
| `repeat.mode.everyDay` | ~12 | प्रतिदिन | 8 | fine |
| `paywall.card.badge` | ~12 | सबसे फ़ायदेमंद | 14 | **medium**: the pill may clip. Fallback: बेस्ट वैल्यू (11) |
| `paywall.table.col.free` | ~6 | मुफ़्त | 6 | fine |
| `paywall.cta.trial` | ~24 | "7 दिन मुफ़्त में आज़माएँ" | 23 | fine |
| `paywall.cta.subscribe` | 1 line | "₹299 / माह में सब्सक्राइब करें" | ~30 | **medium**: check on the smallest iPhone |
| `alarm.button.later` / `done` | ~8 | बाद में / पूर्ण | 6 / 5 | fine |
| `tabs.*` | ~10 | रिमाइंडर / दिन / सेटिंग | 8 / 3 / 6 | fine |
| `paywall.hero.*` lines | ~12 | ≤10 each | | fine |

Devanagari also needs extra line height (matras above, conjuncts below). Check toasts and 2-line status text for vertical clipping.

## 5. Not verified

- Hindi on-device rendering (fonts, line height).
- Apple's bare Hindi "Later" button.
- The Hindi Settings › Subscriptions row label.
- No native-speaker review.

## 6. Confidence

**Medium-high.** Apple's own shipped Hindi strings back the core iOS terms, and the formats come from CLDR. The remaining risk is idiom and naturalness in Remi's conversational lines, plus default-masculine gender in a few sentences, which a native reviewer should skim.
