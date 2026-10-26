# ur (Urdu, Pakistan) — translator notes for `ur.json` (2026-10-26)

File: `docs/localization/app-ui/ur.json` (430 keys, same order as `locales/en.json`), copied byte-identical to `locales/ur.json`. Native prompts: `locales/ios/ur.json`. Script: Urdu (Nastaliq-ready Perso-Arabic) with Urdu letters only (ی U+06CC, ک U+06A9, ہ U+06C1, ے U+06D2; never Arabic ي ك ه). "Remi", "Remi Pro", "Pro", "PRO", "App Store", "Apple", "iPhone" and "AI" stay Latin.

Source tags:
- **[AL]**: applelocalization.com API, iOS 26.7.1 (23H30), locale `ur`, queried 2026-10-26. Apple's own shipped Urdu strings; bundle in brackets. Urdu coverage in the dataset is thin (many keys come back untranslated), so a lot below is inferred.
- **[CLDR]**: Node `Intl` (full ICU), locale `ur` / `ur-PK`, which matches what iOS formatters print.
- **[J]**: my judgment.

## Style sheet

- **Register: آپ** with polite imperative (-یں: ٹیپ کریں، بولیں، چنیں، چیک کریں). Never تم / تو. Apple Urdu does the same ("اسے چالو کریں", "بولیں") [AL WorkflowKit, VoiceTriggerUI].
- **Buttons:** short polite imperatives — منسوخ کریں، حذف کریں، اجازت دیں، چالو کریں، بھیجیں، چلائیں، دوبارہ کوشش کریں. "Done" = **ہو گیا** (brief). "Not now" = ابھی نہیں. "Later" = بعد میں.
- **Progress states:** passive or progressive, gender-neutral where possible: سنا جا رہا ہے…، بھیجا جا رہا ہے…، سیٹ ہو رہا ہے…، بحال ہو رہا ہے….
- **Punctuation:** Urdu full stop ۔ (U+06D4) at sentence ends, Arabic comma ، (also in the `paywall.card.a11y` VoiceOver join), question mark ؟, ellipsis … (single char). Em dash — kept where the English has it. Quotes “…” as Apple Urdu does [AL WorkflowKit, VoiceTriggerUI]. No bidi control characters anywhere (Apple's own Urdu strings use ⁨⁩ isolates around Latin names; the app handles direction, so the catalog doesn't).
- **Settings path separators** `>` / `›` kept as in English; `›` is a bidi-mirrored character, so it flips correctly in RTL.
- **Vocabulary:** everyday Urdu where it is what people say, loanwords where Pakistani iPhone users and Apple Urdu use them:
  - Reminder = **یاد دہانی** (f), plural یاد دہانیاں, oblique plural یاد دہانیوں. Apple's Reminders app says **ریمائنڈر** [AL RemindersUICore "%d ریمائنڈر"]; the brief asked for یاد دہانی and it reads naturally (banks and telcos in Pakistan use it). Swap to ریمائنڈر is a global replace if testers prefer Apple's word.
  - Notifications = **اطلاعات** (sg اطلاع) — Apple's term [AL UserNotificationsUIKit, ScreenTimeSettingsUI], not "نوٹیفیکیشنز".
  - Feedback = **رائے** ("رائے بھیجیں", "آپ کی رائے") rather than فیڈبیک.
  - Save = **محفوظ کریں / محفوظ ہو گیا**; Delete = **حذف کریں** [AL ChatKit "بات چیت حذف کریں"].
  - Recording = ریکارڈنگ (f), Alarm = الارم (m) [AL MobileTimer], Subscription = سبسکرپشن (f) [AL Email.framework], Upgrade = اپ گریڈ, Unlimited = لامحدود, Active = فعال, Free = مفت, Free trial = مفت ٹرائل.
- **Language names:** CLDR Urdu names [CLDR `Intl.DisplayNames('ur')`], with three fixes: `id` = انڈونیشیائی (CLDR has the typo انڈونیثیائی with ث), `pt` = پرتگالی (CLDR adds a pesh diacritic), `tl` = ٹیگالوگ to match English "Tagalog" (CLDR ur says فلیپینو). Sentences are built so the `pending.thisLanguage` fallback (یہ زبان) also fits: "فی الحال Remi یہ زبان نہیں بولتا".
- **Plurals (CLDR ur): one / other only** (`one` = exactly 1 with no decimals; 0 → other) [CLDR `Intl.PluralRules('ur')`]. Noun/verb agreement per branch:
  - 1 گھنٹہ / # گھنٹے — but every plural string here puts the number in an oblique context (… میں، ہر …), where the singular is also گھنٹے, so both branches read "# گھنٹے".
  - دن, منٹ, سال, ماہ are invariant → both branches identical with `#`.
  - یاد دہانی / یاد دہانیاں and verbs agree: "# یاد دہانی فعال رہ سکتی ہے" vs "# یاد دہانیاں فعال رہ سکتی ہیں"; "# فعال یاد دہانی کی حد" vs "# فعال یاد دہانیوں کی حد"; "یاد دہانی بن گئی" vs "یاد دہانیاں بن گئیں".
  - `take.multiCreated` keeps only `other` like the English (count ≥ 2).
  - `paywall.term.*`: `one` has no `#`, mirroring English "day" vs "# days": دن / # دن، ہفتے / # ہفتے، ماہ / # ماہ، سال / # سال. Forms chosen to read right after ہر and after "/" ("ہر ماہ", "ہر 3 ماہ", "ہر ہفتے"). ماہ is used instead of مہینہ because it does not inflect.
  - `take.partial.title`: `{created}` moved inside the plural branches ("# میں سے {created} یاد دہانیاں بن گئیں", # = total); argument names unchanged and ICU parses.
- **Gender.** Remi does not know the user's gender. The polite imperative is gender-neutral, and wherever English says "you can / you were / are you sure" I used passive or possessive constructions instead of the masculine-honorific default (…بنائی جا سکتی ہیں، …سبسکرائب کیا جا سکتا ہے، "آپ کا مقصد کیا تھا؟"، "کیا “{title}” کو حذف کر دیا جائے؟"، "یہ سبسکرپشن پہلے سے آپ کے پاس ہے"). **Remi speaks as masculine**: "میں سمجھ نہیں سکا" (`pending.detail.notUnderstood`), and in the third person "Remi کہتا ہے / بولتا / کرتا ہے". "میں نے سنا" (`pending.heard`) is ergative and not gendered. Reminders are feminine (یاد دہانی… بجتی ہے، بجے گی، چھوٹ گئی); the alarm is masculine (الارم… بجتا رہتا ہے).
- **No AI provider names**; "محفوظ تھرڈ پارٹی AI سروسز" (consent) and "محفوظ AI سروسز" (Info.plist), as the English does.

## Apple terms

| EN | ur | Status |
|---|---|---|
| Reminders (app) | ریمائنڈر | Verified [AL RemindersUICore `%d Reminders`] — catalog uses یاد دہانی, see style sheet |
| Alarm | الارم | Verified [AL MobileTimer "${alarm} الارم چالو کریں"] |
| Turn on / off | چالو کریں / بند کریں | Verified [AL MobileTimer] |
| Notifications | اطلاعات (sg اطلاع) | Verified [AL UserNotificationsUIKit `DEFAULT_HIDDEN_PREVIEW_PLACEHOLDER`, ScreenTimeSettingsUI] |
| Settings | سیٹنگز | **Inferred.** Apple Urdu running text says "سیٹنگ میں" / "اسکرین ٹائم کی سیٹنگ" [AL SystemVersionSettings, CommunicationSafetySettingsUI]; the Settings app's display name could not be pulled. Used سیٹنگز (brief, common Pakistani usage). Check on an Urdu iPhone |
| Screen Time | اسکرین ٹائم | Verified [AL CommunicationSafetySettingsUI] |
| Subscription(s) | سبسکرپشن / سبسکرپشنز | سبسکرپشن verified [AL Email.framework]; plural screen name inferred |
| Delete | حذف کریں | Verified [AL ChatKit `DELETE_CONVERSATION`] |
| Learn more | مزید جانیں | Verified [AL PassKit] |
| "+N more" | {x} اور {count} مزید | Verified pattern [AL AppStoreKit `INFO_LIST_MORE_LANGUAGES_SUMMARY`] → `pending.moreReminders` "+{count} مزید: {titles}" |
| Every day / every N days | ہر دن / ہر %d دن | Verified [AL QueryParser `N_EVERY_DAY`] |
| Privacy | رازداری | Verified [AL PassKit, payLater]; "رازداری کی پالیسی" inferred |
| Terms of Use | استعمال کی شرائط | Inferred |
| Cancel | منسوخ کریں | Inferred (dataset returns English for Cancel keys) |
| Done | ہو گیا | Inferred (brief); Apple Urdu may use "ہو گیا" or "مکمل" — not retrievable |
| Allow / Don't Allow | اجازت دیں / اجازت نہ دیں | Inferred (only "Allow" is used) |
| Not Now | ابھی نہیں | Inferred |
| Later | بعد میں | Inferred |
| Restore Purchases | خریداریاں بحال کریں | Inferred |
| Free Trial | مفت ٹرائل; CTA "{length} مفت آزمائیں" | Inferred |
| Apple Account | Apple اکاؤنٹ | Inferred |
| Listening… | سنا جا رہا ہے… | Inferred |
| Weekdays | اتوار پیر منگل بدھ جمعرات جمعہ ہفتہ | Verified [CLDR ur, short = long] |
| Narrow weekdays | ا پ م ب ج ج ہ | [J] — CLDR ur narrow is Latin S M T W T F S, useless here. First letters; Thu/Fri both ج, like English T/T and S/S |
| am / pm | AM / PM (Latin) | Verified [CLDR ur prints "3:09 PM"]; fallbacks only, the code should format via Intl. Native alternative ق د / ب د (قبل دوپہر / بعد دوپہر) is rare on phones |

## Paywall legal

- Both disclosures keep the full meaning: price per term, charged to the Apple Account at purchase confirmation (خریداری کی تصدیق پر ادائیگی آپ کے Apple اکاؤنٹ سے لی جاتی ہے), auto-renews until cancelled (منسوخ کیے جانے تک اس کی خودکار تجدید ہوتی رہتی ہے), account charged within 24 hours before each renewal, unless auto-renew is turned off at least 24 hours before the current period ends (جب تک کہ موجودہ مدت ختم ہونے سے کم از کم 24 گھنٹے پہلے خودکار تجدید بند نہ کر دی جائے), manage or cancel anytime in "سیٹنگز > Apple اکاؤنٹ > سبسکرپشنز".
- auto-renew = خودکار تجدید (formal Urdu, the usual store/legal wording in Pakistan). Legal review out of scope.
- `paywall.error.alreadyOwned` quotes the restore link exactly as `paywall.restore` ("خریداری بحال کریں").

## Uncertain strings

- `tabs.settings` / `settings.title` / paths: **سیٹنگز** vs Apple's possible **سیٹنگ** (see table). If an Urdu iPhone shows "سیٹنگ", replace in ~10 keys.
- `pending.heard` "میں نے سنا: “{quote}”" — first person instead of "Remi نے سنا", so the line doesn't start with a Latin word; Remi already speaks in first person on the ask card ("میں آپ کو کب یاد دلاؤں؟").
- `settings.row.voiceLanguage.subtitle` "اسی iPhone پر متن میں تبدیل · {language}" — "transcribed" has no short everyday Urdu word; ٹرانسکرائب is the loanword alternative.
- `paywall.card.badge` "بہترین سودا" (best deal) for BEST VALUE. Alt "سب سے کفایتی".
- `time.missedAt` "چھوٹ گئی · {time}" and `time.ringingNow` "ابھی بج رہی ہے" assume the subject is the reminder (f). If the row reads as the alarm, switch to چھوٹ گیا / بج رہا ہے.
- `edit.row.headsUp` "پیشگی اطلاع"; `times.between` "درمیان" (label left of two time pills) — terse but natural in that layout.
- `today.header.getPro` "Pro لیں" — starts with a Latin word; no natural Urdu order keeps the brand non-initial in 10 chars. Same for `feedback.context.remiSays` "Remi کہتا ہے", `feedback.list.fromRemi` "Remi کا پیغام", `settings.version`, and the two legal disclosures that start with `{product}`. Everything else was reordered to start with an Urdu word.
- `paywall.toast.activated.title` "مبارک ہو! Pro فعال ہو گیا 🎉" adds "مبارک ہو!" so the line opens in Urdu.
- `paywall.cta.trial` "{length} مفت آزمائیں" ("try {length} free") — shorter than "{length} کا مفت ٹرائل شروع کریں" to fit one line.

## Overflow risks

| Key | ur | Chars / limit |
|---|---|---|
| `tabs.reminders` | یاد دہانیاں | 11 / ~10 — Urdu script is narrow, probably fits; check. Alt ریمائنڈر (8) |
| `tabs.settings` | سیٹنگز | 6 / 10 OK |
| `common.cancel`, `repeat.cancel` | منسوخ کریں | 10 / 10 OK |
| `recording.gate.upgrade` | اپ گریڈ | 7 / 10 OK |
| `paywall.card.badge` | بہترین سودا | 11 / ~12 OK |
| `feedback.list.fromRemi` | Remi کا پیغام | 13 / ~20 OK |
| `paywall.cta.unavailable` | پلانز دستیاب نہیں | 17 / ~24 OK |
| `paywall.cta.trial` | "{length} مفت آزمائیں" → "7 دن مفت آزمائیں" | ~16 / ~24 OK |
| `paywall.cta.subscribe` | "سبسکرائب کریں: {price} / {term}" | ~30 with a PKR price — may wrap; check |
| `paywall.hero.*` lines | کم بھولیں۔ / وقت پر / یاد رکھیں۔ ; کام پورا / ہونے تک / دہرائیں۔ | all ≤ 10 / ~12 OK |
| Nastaliq line height | — | Urdu fonts (Noto Nastaliq) are much taller than Latin; iOS falls back to its Urdu font. Check clipping in single-line rows, chips and the tab bar |
