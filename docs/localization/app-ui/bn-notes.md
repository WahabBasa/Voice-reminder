# bn (Bangla) in-app UI notes: Remi (2026-10-10)

Translation of `strings-en.json` (426 keys) into standard Bangla (Bengali script, Bangladesh-neutral, also readable in West Bengal). File: `bn.json`. Validator: `[bn] PASS: 426 keys (en 426), 0 errors, 18 warnings` (warnings reviewed below).

Source tags: **[V]** verified (source seen this session), **[I]** inferred (my call or common app convention, no source opened).

---

## 1. Mini style sheet

**Does iOS ship a Bangla UI?** Yes. Wikipedia's iOS 26 article lists Bangla among the 56 system languages [V]. Older Apple Community threads (2022) complain it was missing, so it's a recent addition. I tried applelocalization.com (iOS 26.7.1, locale `bn`), but its search barely works for this locale: Bangla-text queries return nothing, and most English-key hits come back untranslated. So most Apple terms below are **inferred** from the dominant Android, Google and Bangladeshi app conventions. What the Apple dataset did confirm:
- Register is **আপনি** ("আপনি যাতে আপনার আর্থিক স্থিতির…", Apple Pay Later onboarding) [V].
- Apple writes **নোটিফিকেশন** ("%dটি নোটিফিকেশন") and **সাবস্ক্রিপশন** ("%2$@টি সাবস্ক্রিপশন") as transliterated loanwords, not purist forms (বিজ্ঞপ্তি / গ্রাহকতা) [V].
- Counts use the classifier **টি** glued to the number ("%luটি") [V]. Every-period phrases use **প্রতিদিন** and **প্রতি ঘণ্টায়** [V].
- Latin brand names take a hyphenated case suffix: "Apple Inc.-এর" [V]. I copied this for "Remi-র", "{product}-এর", "App Store-এর", "iPhone-এ".

**Register:** আপনি everywhere, with polite imperative verb forms (-উন / করুন). Never তুমি or তুই.

**Button form:** the polite imperative ("বাতিল করুন", "মুছুন", "পাঠান", "চালু করুন"). This is the standard Bangla UI convention (Google/Android bn, Bangladeshi banking apps). Bangla has no infinitive-button tradition like pt/es [I]. State labels and toggles use nouns or adjectives ("সম্পন্ন", "চালু আছে").

**Sentence end:** দাঁড়ি **।** for sentences. `?` and `!` stay as they are. Ellipsis `…` / `...` mirrors the English.

**Numerals:** literal numbers I wrote by hand use Bengali digits (১ ঘণ্টা, ২৪ ঘণ্টা). Placeholder numbers (`#`, `{count}`) come from the formatter; `Intl` with the `bn` locale outputs Bengali digits by default, so this stays consistent. If the app forces the Latin numbering system, switch ১/২৪ back to 1/24.

| English | Bangla | Status |
|---|---|---|
| Reminders | রিমাইন্ডার | [I] dominant app loanword; the purist "অনুস্মারক" is rarely seen in apps |
| Alarm | অ্যালার্ম | [I] universal loanword |
| Snooze | স্নুজ (not used in this catalog; Remi says "Later") | [I] |
| Stop | থামান | [I] |
| Later | পরে | [I] |
| Settings | সেটিংস | [I] Android/Google bn and most apps |
| Delete | মুছুন | [I] Google bn |
| Done | সম্পন্ন | [I] (Google sometimes uses "হয়ে গেছে"; সম্পন্ন is shorter and fits the alarm button) |
| Allow / Don't Allow | অনুমতি দিন / অনুমতি দেবেন না | [I] Android permission dialog convention |
| Subscription | সাবস্ক্রিপশন | [V] Apple bn |
| Restore Purchases | কেনাকাটা পুনরুদ্ধার করুন | [I] |
| Free Trial | ফ্রি ট্রায়াল | [I] what BD apps show; "বিনামূল্যে ট্রায়াল" is more formal |
| Every day | প্রতিদিন | [V] Apple bn uses প্রতিদিন |
| Weekdays | সপ্তাহের নির্দিষ্ট দিন (paywall row) | [I] see uncertainties: in Bangladesh the weekend is Fri–Sat |
| slide to stop | থামাতে স্লাইড করুন (not in this catalog) | [I] |
| Listening… | শুনছি... (Remi in first person) | [I] |
| Notifications | নোটিফিকেশন | [V] Apple bn |
| Apple Account | Apple অ্যাকাউন্ট | [I] Apple keeps brand names in Latin script |

## 2. Loanword choices

I chose the English loanwords Bangla app users actually see over purist Sanskritized words: রিমাইন্ডার, অ্যালার্ম, সেটিংস, নোটিফিকেশন, সাবস্ক্রিপশন, ফ্রি, ট্রায়াল, আপগ্রেড, প্ল্যান, ফিডব্যাক, রিপিট, ভয়েস, রেকর্ড, ট্যাপ, সেভ, এডিট, লিংক, ইমোজি, ডেভেলপার, স্ক্রিন টাইম, আনলিমিটেড, বিল, চার্জ, পেমেন্ট. Formal words kept where they are standard: পুনরুদ্ধার (restore), গোপনীয়তা নীতি, ব্যবহারের শর্তাবলী, স্বয়ংক্রিয়ভাবে নবায়ন (auto-renew), সক্রিয় (active).

Kept in Latin script on purpose (validator "identical to English" or "Remi missing" warnings):
- `settings.voiceLanguage.en` = "English": it's a language option in a list next to the "العربية" endonym, so an endonym is correct.
- `settings.version`, `paywall.card.a11y`, `time.dateAndTime`, `schedule.timesAndDays`, `schedule.moreTimes`, `schedule.window`: placeholder-only joins.
- `paywall.table.col.pro` = "PRO": brand.
- `time.clock.am/pm`, `times.picker.am/pm` = AM/PM: CLDR `bn` day periods are AM/PM, and BD apps show them in Latin [I].
- The 11 "'Remi' missing" warnings are false positives: the validator finds "Remi" inside "Reminder".

## 3. Uncertain strings

- `paywall.table.row.schedules` ("Weekdays, dates, every few days"): in Bangladesh, "weekdays" (Mon–Fri) is wrong, because the work week is Sun–Thu. I rendered it as "সপ্তাহের নির্দিষ্ট দিন" (chosen days of the week), which matches what the feature does.
- `paywall.cta.trial` / `paywall.caption.trial` / `paywall.trialLabel`: `{length}` comes in as "৭ দিন", so the CTA reads "৭ দিন ফ্রি ট্রায়াল শুরু করুন". Natural Bangla would be "৭ দিনের" (genitive), but the shared `paywall.trial.days` string can't carry the suffix. It's colloquially fine, but a reviewer may prefer a separate genitive key.
- `notification.preAlert.body`: changed the shape to "{subject} — # মিনিট পরে", because "{subject} in N minutes" doesn't map onto Bangla word order. Confirm it reads well with real titles.
- `take.partial.title`: reordered to "{total}টির মধ্যে {created}টি রিমাইন্ডার তৈরি হয়েছে" (Bangla puts "out of N" first). Placeholders are intact.
- `time.ringsAgain` ("আবার বাজবে {time}"): depends on what `{time}` contains ("3:00 pm" vs "tomorrow 3 pm"). Check on a device.
- `paywall.billed.every` / `paywall.legal.disclosure.priced`: "প্রতি {term} অন্তর". With the singular `{term}` ("মাস") it reads "প্রতি মাস অন্তর", which is acceptable but slightly stiff.
- `edit.spokenLine.label` ("যে কথা বলবে", lit. "what it will say"): no settled Bangla term exists. Alternative: "উচ্চারিত লাইন" (too formal).
- `paywall.hero.*` lines: a 3-line hero split doesn't follow Bangla word order. Lines read "কম ভুলুন। / মনে রাখুন / সময়মতো।" and "রিপিট করুন / যতক্ষণ না / কাজ শেষ।", which are grammatical but poetic.
- Weekday narrow (`weekday.narrow.*`): CLDR bn narrow forms are র সো ম বু বৃ শু শ. These are multi-character clusters in a 1-char column, slightly wider than Latin letters.

## 4. Overflow risks

Measured in visible glyph clusters (Bangla clusters render wider than Latin letters):
- `paywall.cta.trial`: about 26 clusters once filled ("৭ দিন ফ্রি ট্রায়াল শুরু করুন") against a ~24-char one-line CTA. **Likely tight.** Fallback: "{length} ফ্রি ট্রায়াল নিন".
- `today.timeDraft.confirm` "মনে করিয়ে দিন": 14 code points, 9 clusters. Fine.
- `common.cancel` / `aiConsent.allow` / `permission.enable`: 7 clusters each. Fine.
- `paywall.cta.unavailable`: 14 clusters, fine. Every other button and chip is within its limit.
- Bengali script needs more line height (stacked conjuncts, vowel signs above and below). Check clipping in single-line toasts and tab labels at default Dynamic Type.

## 5. Paywall legal text

Both disclosures are translated faithfully: auto-renewing, charged to the Apple Account at purchase confirmation, renews for the same price each term, charged within 24 hours before renewal unless auto-renew is turned off at least 24 hours before the period ends, and manage or cancel in সেটিংস > Apple অ্যাকাউন্ট > সাবস্ক্রিপশন. I couldn't verify Apple's exact bn Settings path labels; "সেটিংস" and "সাবস্ক্রিপশন" follow the Apple loanword pattern seen above.

## 6. Other

- No AI provider is named anywhere. "AI" stays as the Latin acronym (common in Bangla).
- Info.plist strings say "Remi", not "VoiceReminder".
- Plurals: one/other only. Both branches are identical, with `#` (Bangla nouns don't inflect for count after a numeral). Where English's `one` branch has no number (`paywall.term.*`), I mirrored English.

**Confidence: medium.** The grammar, register and loanword choices are solid and the validator passes. But Apple's own Bangla iOS terms couldn't be verified, and a native reviewer should check the reordered placeholder sentences and the "Weekdays" / trial-CTA phrasing.
