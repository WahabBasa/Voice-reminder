# he (Hebrew, Israel) — translator notes for `he.json` (2026-10-26)

Catalog: `he.json` (430 keys, same order as `en.json`; `locales/he.json` is a byte-identical copy). Native prompts in `locales/ios/he.json`. RTL: no bidi control characters anywhere; the app mirrors the layout.

Validator: `[he] PASS: 430 keys (en 430), 0 errors`. All 430 messages parse with `@formatjs/icu-messageformat-parser`, and an AST comparison against English finds 0 argument/tag mismatches.

## Style sheet

- **Register: Apple iOS Hebrew.** Buttons and row labels are verbal nouns: ביטול, סיום, מחיקה, שליחה, השמעה, הפעלה, שחזור רכישות, בחירת שעה. The two consent buttons and one retry button use the infinitive (לאפשר, לנסות שוב), the way iOS dialogs do. Instructions use **"יש ל…" + infinitive** (יש להקיש, יש לבדוק, יש לבחור), the same as Apple's iPhone guide ("יש להקיש על ״עדכונים״"). Optional actions use "אפשר ל…" (אפשר להפעיל, אפשר לבטל בכל עת). No niqqud.
- **Progress states** use a gender-free "ב + verbal noun" form common in Israeli apps: בטעינה…, בעיבוד…, בהגדרה…, בשליחה…, בשחזור…, בהשמעה…, בהאזנה…. Where a subject reads more naturally, a passive form is used: התזכורת נוצרת…, התזכורות נטענות…, הקול מתעדכן….
- **Errors:** "לא ניתן היה ל…" for a failed action, "…נכשל/ה" for short alerts ("שמירת התזכורת נכשלה"), "יש לנסות שוב" for try again.
- **Quotes:** plain ASCII "…" in JSON (escaped), around `{quote}`, `{title}` and iOS UI names ("הגדרות", "מינויים", "זמן מסך"). Apple's guide uses ״…״ (gershayim); swap globally if the team wants the typographic form.
- **Abbreviations:** geresh ׳ (U+05F3) in דק׳ (min), שע׳ (hr), and the weekday letters (יום ב׳). Gershayim ״ appears only in the standard day-period abbreviations לפנה״צ / אחה״צ.
- **Ellipsis:** the single character "…" everywhere (English "..." normalized).
- **Plural categories used: `one`, `two`, `other`** (modern CLDR 42+). The installed `Intl.PluralRules("he")` reports exactly `one,two,other`, with 1→one, 2→two, and 3/10/20→other. No `many` branch was added: on an older-CLDR runtime, 20/30… would fall back to `other`, which is the correct text anyway.
  - `two` is used only where Hebrew has a dual: שעתיים, יומיים, שבועיים, חודשיים, שנתיים. Minutes have no dual, so `two` is omitted there and `other` gives "2 דקות".
  - `one` drops `#` where Hebrew does ("בעוד שעה", "כל יום", "שבוע"). `one` matches only the integer 1 in Hebrew, so this is safe. `paywall.term.*` keeps the English "day" vs "# days" meaning (יום / יומיים / # ימים). `take.multiCreated` gained a `one` branch ("נוצרה תזכורת אחת"); English has only `other`.
- **Numbers are digits**, so numeral gender agreement never comes up.
- **No AI provider names.** AI is "שירותי בינה מלאכותית מאובטחים (של צדדים שלישיים)".
- **Brand:** Remi, Pro, PRO, App Store, iPhone, "חשבון Apple" stay Latin. No string *starts* with a Latin word except via a placeholder (`{subject}`, `{first}`, `{times}`, `{date}`, `{start}`, `{kicker}`). Sentences that start with Remi/Pro in English were reordered: "גרסת Remi …", "המינוי {product} …", "ה-Pro הופעל", "עם Pro, …", "מה ש-Remi שמע", "עדיין אין ל-Remi תמיכה ב…". A Hebrew prefix letter before a Latin word takes a maqaf-style hyphen (ל-Pro, ב-App Store, מ-Remi). Before a Hebrew placeholder value it attaches directly (ב{language} → "בעברית" / "בשפה זו").

### Gender
- **The user:** the catalog uses noun, infinitive and impersonal forms throughout. Second-person singular **past tense and possessive/object suffixes are spelled the same for both genders without niqqud** (הגעת, ניסית, ששלחת, שבחרת, שציינת, הצטרפת, לך, שלך, אותך), so they are used freely. No imperative, future, present-tense verb or adjective addresses the user. **Masculine-default keys: none.** "Welcome to {product}" (ברוך הבא, gendered) was rewritten as "שמחים שהצטרפת ל-{product}!". "Are you sure…?" became "למחוק את "{title}"?".
- **Generic third person:** `paywall.affinity` "מי ששוכח הרבה" uses the standard generic masculine of "מי ש…". This is the only generic-masculine form.
- **Remi is masculine** (a name): "ש-Remi יוכל", "מה Remi אומר", "Remi … פתוח". The two Info.plist strings say "האפליקציה Remi" (feminine, agreeing with האפליקציה). Rephrase those two if the team wants one gender for Remi throughout.
- **A reminder (תזכורת) is feminine:** מצלצלת, הוחמצה, +{count} נוספות. An alarm (שעון מעורר) is masculine: "ממשיך לצלצל עד לתגובה".

## Apple terms

| EN | he | Status |
|---|---|---|
| Notifications | עדכונים | **Verified** (iPhone guide "שינוי הגדרות עדכונים", "הגדרות > עדכונים", support 108781). Note: iOS Hebrew does *not* say "התראות" for Notifications; the catalog keeps "התראה/להתריע" only for the verb "alert" |
| Alarm (Clock) | שעון מעורר / שעונים מעוררים | **Verified** (iPhone guide "הגדרת שעון מעורר ב״שעון״") |
| Snooze | נודניק | **Verified** (same page, "הפעלת נודניק"); not used: Remi's button is "Later" → אחר כך |
| Settings | הגדרות | **Verified** (support 118428 "ב'הגדרות', הקישו על שמכם") |
| Subscriptions | מינויים; subscription מינוי | **Verified** (118428 "הקישו על 'מינויים'", "ביטול מינוי") |
| Apple Account | חשבון Apple | **Verified** (118428, 118283) |
| Screen Time | זמן מסך | **Verified** (iPhone guide "התחלת השימוש ב״זמן מסך״") |
| Focus | ריכוז | **Verified** (guide "הגדרת מצב ריכוז"); not used in the catalog |
| Lock Screen | מסך נעילה | **Verified** (guide "יצירת מסך נעילה מותאם אישית"); not used |
| Cancel / Done / Delete | ביטול / סיום / מחיקה | Inferred (iOS Hebrew button style; Apple's guide shows "הקישו על הכפתור 'מחיקה'" → Verified for Delete) |
| Allow / Don't Allow | לאפשר / לא לאפשר | Inferred (iOS permission dialog) |
| Not Now | לא עכשיו | Inferred |
| Restore Purchases | שחזור רכישות | Inferred |
| Free Trial | ניסיון חינם / תקופת ניסיון | Inferred |
| Privacy Policy / Terms of Use | מדיניות הפרטיות / תנאי השימוש | Inferred (standard) |
| Every day / Weekly | כל יום / שבועי | Inferred |
| Weekdays | ימי חול | Inferred |
| AM / PM | לפנה״צ / אחה״צ | Inferred (CLDR he day periods). **Fallback only**: Israel uses the 24-hour clock; `Intl` should format times |
| Weekday short / narrow | יום א׳…יום ו׳, שבת / א׳…ו׳, ש׳ | Inferred (CLDR he). Better generated by `Intl` |

## Paywall legal

- Path: `"הגדרות" > [השם שלך] > "מינויים"` (Apple he: "ב'הגדרות', הקישו על שמכם. הקישו על 'מינויים'"). This follows the brief, which says to use [your name] instead of the English "Apple Account". The same path is used in `settings.alert.manageFailed.message`.
- The meaning is complete: price and term ("עולה {price} כל {term}"), charged to the Apple Account when the purchase is confirmed ("התשלום יחויב בחשבון Apple שלך עם אישור הרכישה"), renews automatically ("מתחדש אוטומטית"), charged within the 24 hours before each renewal ("יחויב בתוך 24 השעות שלפני כל חידוש"), unless auto-renew is turned off at least 24 hours before the current period ends ("אלא אם החידוש האוטומטי כובה לפחות 24 שעות לפני סיום התקופה הנוכחית"), and manage or cancel at any time.
- Israel has a statutory right to cancel immediately with a pro-rated refund (Apple he 108098). The disclosure still matches Apple's standard wording. Legal review is out of scope.
- `{term}` comes from `paywall.term.*`, so "כל {term}" reads "כל חודש", "כל שבועיים", "כל 3 חודשים". `{product}` follows "המינוי", so a Hebrew product name from ASC would still read fine.

## Uncertain strings

- `pending.thatTime` = "שציינת" ("that you said"). It only fills `{time}` in "השעה {time} כבר עברה היום…", which gives "השעה שציינת כבר עברה היום". It is not a standalone phrase. If the code ever shows it alone, change it to "השעה הזו".
- `pending.quickChoice.a11y` "להזכיר לי {choice}": the code lower-cases the chip label, which does nothing to Hebrew. "להזכיר לי בחירת שעה…" (the pick-time chip) reads oddly, as it does in English.
- `recording.listeningIn` "האזנה ב{language}" and `pending.detail.unsupportedLanguage` "…תמיכה ב{language}" attach the prefix ב directly to the language name ("בעברית"; fallback "בשפה זו"). This works for every `language.name.*` value and for `pending.thisLanguage`. It would break only if the code passed a Latin endonym.
- `paywall.hero.*` rewritten: "לשכוח פחות. / לזכור / בזמן." and "שוב ושוב, / עד שזה / נעשה." (literal "Repeat it until it's done" does not split into three short lines).
- `edit.spokenLine.label` "המשפט המושמע" (the line that gets played). Alternative: "מה יושמע".
- `time.dueNow` "הגיע הזמן" ("it's time") rather than a literal "due now".
- `today.header.getPro` "שדרוג ל-Pro" (Upgrade to Pro). "Get" has no neat neutral noun.
- `paywall.caption.trial` adds "ואחר כך" (then) between the trial length and the price, for clarity.
- `settings.row.voiceLanguage` "שפת הדיבור" (it is the transcription language). Alternative: "שפת התמלול".

## Overflow risks

| Key | he | Chars / limit |
|---|---|---|
| `today.header.getPro` | שדרוג ל-Pro | 11 / ~10. Hebrew glyphs are narrow, so it probably fits. Alternative: "ל-Pro" alone is unclear |
| `feedback.list.fromRemi` | הודעה מ-Remi | 12 / ~20 OK |
| `paywall.table.cell.unlimited` | ללא הגבלה | 9, narrow cell: check it wraps to 2 lines cleanly |
| `paywall.card.badge` | הכי משתלם | 9 / ~12 OK |
| `paywall.cta.trial` | ניסיון חינם של {length} | ~21 with "7 ימים" / ~24 OK |
| `paywall.cta.subscribe` | הרשמה למינוי ב-{price} / {term} | ~28 with a ₪ price: may be tight on one line |
| `paywall.hero.default.line1` | לשכוח פחות. | 11 / ~12 OK |
| tabs, buttons, chips | תזכורות 7, הגדרות 6, ימים 4, שדרוג 5, דיבור 5, הפעלה 5, אחר כך 6 | all within limits |
