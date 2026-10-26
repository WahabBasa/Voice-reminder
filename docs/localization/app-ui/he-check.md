# Hebrew (he) UI translation: independent review

Reviewer pass on `he.json` against `en.json` and `strings-inventory.md`. Every string was back-translated to English and compared with the source. 10 strings changed (8 catalog keys plus the 2 Info.plist strings, which also live in the catalog as `infoPlist.*`). Validator: `[he] PASS: 430 keys (en 430), 0 errors; ICU AST args/tags match; plural cats one,two,other; copies identical: true`.

## Verdict: **SHIP WITH NOTES**

Clean, natural Apple-style Hebrew: verbal nouns on buttons, "יש ל…" for instructions, gender-free progress forms ("בטעינה…", "בשליחה…"), no gendered address to the user anywhere. Apple terms are right ("עדכונים" for Notifications, "שעון מעורר", "זמן מסך", "חשבון Apple", "מינויים"). The fixes are one grammar error (`reminders.next.none`), Remi's gender in the two permission prompts, a "Weekdays" mistranslation on the paywall, and a few wordings that read stiffly. Notes: the paywall disclosure is translated faithfully but has had no Israeli legal review, and the subscribe CTA may be tight with a ₪ price.

## Changes

| key | before | after | back-translation | why |
|---|---|---|---|---|
| `reminders.next.none` | לא נקבע צלצול הבא | לא נקבע הצלצול הבא | The next ring wasn't set | Grammar: indefinite noun with a definite adjective ("צלצול הבא") is wrong |
| `voice.regenFailed.message` | …יש לשמור שוב כדי לנסות שוב. | …יש לשמור מחדש כדי לנסות שוב. | …Save again to try again. | "שוב… שוב" twice in one clause |
| `feedback.notice.editSheet` | כולל את פרטי התזכורת השמורה. … | כולל את הפרטים השמורים של התזכורת. … | Includes the reminder's saved details. | "Saved" belongs to the details, not the reminder |
| `repeat.hint.everyNDays` | נספר מתאריך ההתחלה, באותן שעות בכל פעם. | הספירה מתחילה מתאריך ההתחלה, באותן שעות בכל פעם. | Counting starts from the start date, same times each time. | "נספר" with no subject is unclear (what is counted?) |
| `times.hint.window` | שקט מחוץ לטווח השעות. | אין צלצולים מחוץ לטווח השעות. | No rings outside the hours range. | "שקט" alone reads as "Quiet!" or a bare noun; the new line says what happens |
| `paywall.table.row.spokenAlarms` | שעונים מעוררים שאומרים למה הם | שעונים מעוררים שאומרים למה הם מצלצלים | Alarms that say why they're ringing | The old line stopped mid-phrase ("why they are") |
| `paywall.table.row.schedules` | ימי חול, תאריכים, כל כמה ימים | ימים בשבוע, תאריכים, כל כמה ימים | Days of the week, dates, every few days | "ימי חול" means Sunday–Thursday workdays; the feature is picked weekdays (same fix as de) |
| `paywall.legal.disclosure.priced` | …אלא אם החידוש האוטומטי כובה לפחות 24 שעות… | …אלא אם החידוש האוטומטי מושבת לפחות 24 שעות… | …unless auto-renew is turned off at least 24 hours… | "כובה" (was switched off) is past tense; "מושבת" (is disabled) is the standard present-tense wording of this clause |
| `NSMicrophoneUsageDescription` (ios + `infoPlist.*`) | האפליקציה Remi מקליטה את הקול שלך כדי שאפשר יהיה ליצור תזכורות בדיבור. … | כדי שאפשר יהיה ליצור תזכורות בדיבור, Remi מקליט את הקול שלך. … | So you can create reminders by speaking, Remi records your voice. … | Remi was feminine here ("האפליקציה… מקליטה") but masculine in the catalog ("ש-Remi יוכל", "מה Remi אומר", "כש-Remi פתוח"). Now masculine, and the sentence starts with Hebrew, so its direction is not ambiguous |
| `NSAlarmKitUsageDescription` (ios + `infoPlist.*`) | האפליקציה Remi משתמשת בשעונים מעוררים כדי שתזכורות מדוברות יצלצלו גם כשהטלפון מושתק. | כדי שתזכורות מדוברות יצלצלו גם כשהטלפון מושתק, Remi משתמש בשעונים מעוררים. | So spoken reminders ring even when the phone is silenced, Remi uses alarms. | Same gender fix; Hebrew-first word order |

## Orchestrator rules

- **Fragment keys (checked in code):**
  - `pending.thatTime` "שציינת" is used only as the `{time}` fallback in `pending.askPastTime` and `pending.detail.pastTime` (`lib/pendingCardContent.ts:71`, `:136`). Both Hebrew strings read "השעה {time} כבר עברה…", so the fallback gives "השעה שציינת כבר עברה היום" ("the time you said has already passed today"). It is grammatical in both uses. No change.
  - `pending.thisLanguage` "שפה זו" fills `{language}` only in `pending.detail.unsupportedLanguage` (`lib/pendingCardContent.ts:130`), giving "…תמיכה בשפה זו". Fine.
  - `pending.quickChoice.a11y` "להזכיר לי {choice}" gets only the three quick-choice labels (`lib/needsTime.ts:30-33`): "בעוד שעה", "הערב", "מחר בבוקר". The pick-time chip has its own label (`pending.pickTime.a11y`), so the translator's worry about "להזכיר לי בחירת שעה…" does not arise. No change.
- **`{language}` after ב:** `recording.listeningIn` and `pending.detail.unsupportedLanguage` get `languageName()` (`lib/languageNames.ts:58-77`), which returns `t("language.name.*")` (all Hebrew nouns: "בעברית", "באנגלית", "בבנגלית", "בהינדי") or, for codes outside the table, `Intl.DisplayNames([uiLocale])`, which also gives a Hebrew name under the Hebrew UI. A Latin endonym is never passed. Prefix attached directly is correct. `settings.row.voiceLanguage.subtitle` puts `{language}` after a middot, not after ב.
- **Remi's gender:** masculine throughout now (catalog and Info.plist).
- **Weekdays:** `paywall.table.row.schedules` fixed (see table). `repeat.mode.weekly` "שבועי" and `repeat.section.repeatOn` "חזרה בימים" are fine.
- **Plurals:** `Intl.PluralRules("he")` gives `one,two,other` (1→one, 2→two, 3/10/20/0→other). All 20 plural messages use only those categories, all have `other`. `two` appears only with real duals (שעתיים, יומיים, שבועיים, חודשיים, שנתיים); minutes and reminders have no dual and correctly fall to `other` ("2 דקות", "2 תזכורות"). `one` branches without `#` ("בעוד שעה", "כל יום") are safe because `one` matches only 1. `paywall.term.*` keeps the "day" vs "# days" meaning.
- **Brand / providers / legal:** "Remi", "Pro", "PRO", "App Store", "iPhone", "חשבון Apple" stay Latin. No AI provider is named; AI is "שירותי בינה מלאכותית מאובטחים (של צדדים שלישיים)". Both disclosures keep price and term, the charge to the Apple Account at confirmation, auto-renew, the 24-hours-before cut-off (priced), and the path "הגדרות" > [השם שלך] > "מינויים".
- **RTL:** no bidi control characters. No string starts with a Latin word; strings that start with a placeholder (`{subject}`, `{first}`, `{times}`, `{date}`, `{start}`, `{kicker}`) mirror the English structure and have no more natural Hebrew order. `pending.moreReminders` "+{count} נוספות" starts with a neutral sign and a digit, then Hebrew, so it resolves RTL.

## Everyday word vs Apple term

- **עדכונים** (Apple) for Notifications, kept. It is the label in iOS Settings, which the diagnostics row opens. "התראה" is kept only for the verb "alert" and for "Heads-up" ("התראה מוקדמת").
- **שעון מעורר** (Apple, Clock app) for Alarm, kept.
- **אחר כך** for Remi's "Later" button rather than Apple's "נודניק" (Snooze): correct, since the button is not called Snooze in English either.
- **מינוי** for subscription and **שחזור רכישות** for Restore Purchases, kept.

## Length and open notes

- Tabs (תזכורות 7, ימים 4, הגדרות 6), hero lines (all ≤ 11), the badge "הכי משתלם" (9) and the mode chips (≤ 12) fit.
- `today.header.getPro` "שדרוג ל-Pro" is 11 against about 10. Hebrew glyphs are narrow, so it should fit; check on the device.
- `paywall.cta.subscribe` "הרשמה למינוי ב-{price} / {term}" is about 28 characters with a ₪ price against about 24. Check the sticky CTA on the device; a shorter fallback is "מינוי ב-{price} / {term}".
- `paywall.cta.trial` "ניסיון חינם של {length}" drops "Start" to stay in about 24 characters. It still reads as the action on a button.
- The paywall disclosures match Apple's standard meaning. Israeli consumer law (immediate cancellation with a pro-rated refund) has not been reviewed by a lawyer.
- `he-notes.md` still says the Info.plist strings use feminine "האפליקציה Remi"; that note is now outdated.

## Length pass (2026-10-26)

- times.picker.am | לפנה״צ → unchanged | 6 > 5 allowed, but there is no shorter standard Hebrew AM (CLDR abbreviated and narrow are both לפנה״צ; "בוקר" is wrong for 00:00-05:59). Needs a limit bump for he (pickerAmPm 4 → 5) rather than a rewrite.
