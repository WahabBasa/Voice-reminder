# Arabic (ar) UI translation: independent review

Reviewer pass on `ar.json` against `locales/en.json` (430 keys) and `strings-inventory.md`. Every string was back-translated to English and compared with the source, and the code was grepped for the keys whose wording depends on context. 6 strings changed. Validator: `[ar] PASS: 430 keys (en 430), 430/430 AST ok, plural cats=few,many,one,other,two,zero, 0 errors` (ICU parsed with `@formatjs/icu-messageformat-parser`, argument and tag names compared on the AST, every plural has `other` and all six CLDR ar categories, no bidi control characters, no provider names, docs and locales copies byte-identical, `locales/ios/ar.json` equal to the `infoPlist.*` keys).

## Verdict: **SHIP WITH NOTES**

Clean, natural Modern Standard Arabic with no dialect words. Terms are consistent (منبه for alarm, تذكير for reminder, تعذّر + verbal noun for errors, جارٍ … for progress), Apple terms match Saudi Apple Support, and all 20 plural messages use correct case forms (genitive dual after بعد/كل/من أصل/لمدة, nominative dual after a colon, accusative singular for 11–99). The paywall disclosures keep their full legal meaning. The fixes were the non-plural minute/hour strings, which were ungrammatical for 2–10, and a notification body that started with the user's (possibly Latin) title.

## Changes

| key | before | after | back-translation | why |
|---|---|---|---|---|
| `time.nextIn.minutes` | التالي بعد {count} دقيقة | التالي بعد {count} د | Next in N min | Not a plural in en.json; 2–10 gave "5 دقيقة" (should be دقائق). "د" is CLDR ar's short minute unit (`Intl` ar short = "٥ د"), number-neutral, and mirrors English "min" |
| `duration.minutes` | {count} دقيقة | {count} د | N min | Same reason; feeds "كل 45 د" / "كل 5 د" |
| `duration.hours` | {count} ساعة | {count} س | N hr | Same; CLDR ar short hour = "س". "2 ساعة" was wrong (dual), "3 ساعة" wrong (plural) |
| `duration.hoursMinutes` | {hours} ساعة و{minutes} دقيقة | {hours} س و{minutes} د | N hr and N min | Same, consistent with the two above ("1 س و30 د") |
| `edit.headsUp.minutesBefore` | قبل {minutes} دقيقة | قبل {minutes} د | N min before | Values are 5/10/15/30; "قبل 5 دقيقة" and "قبل 10 دقيقة" were wrong |
| `notification.preAlert.body` | {subject} بعد {count, plural, …} | بعد {count, plural, …}: {subject} | In N minutes: {subject} | `subject` is the user's reminder title; a Latin title made the whole notification LTR. Arabic-first order works for any title, including imperatives ("بعد 5 دقائق: اتصل بأمي") and the fallback ("بعد دقيقتين: تذكيرك"). Plural branches unchanged |

### Call on the non-plural minute/hour keys

`duration.*` (interval stepper, card and row subtitles via `formatEveryMinutes`, `scheduleDraft.ts:339-346`), `time.nextIn.minutes` (`lib/time.ts:553`, values 1–59) and `edit.headsUp.minutesBefore` (`EditReminderSheet.tsx:247`, values 5/10/15/30) get a bare `{count}`, so one Arabic noun must serve every number. The full word is only right for 1 and 11+; 2–10 (most of the heads-up values and the common short intervals) were ungrammatical. No full-word construction is correct for all numbers without plural branches, so I used the CLDR Arabic short units **د** (minute) and **س** (hour). These are what `Intl.NumberFormat('ar', {style:'unit', unitDisplay:'short'})` itself prints, so they read as standard UI shorthand, the same register as English "min"/"hr". The clean fix is still to make these keys plurals in en.json; then Arabic can spell out دقيقة/دقيقتين/دقائق.

## Rules checked

- **Plurals:** `Intl.PluralRules('ar')` = zero, one, two, few, many, other; all 20 plural messages carry all six. Spot-rendered with `intl-messageformat`: "بعد دقيقتين"، "بعد ٥ دقائق"، "بعد ١٥ دقيقة"، "التالي بعد ١٥ يومًا"، "التالي بعد ١٠٠ يوم". `gate.limit.*` nominative dual (تذكيران نشطان) after a colon; `take.partial.cap` genitive after حتى; `paywall.term.*` one/two without `#` so "كل شهر" / "كل شهرين" read right; `paywall.trial.*` use واحد/واحدة after لمدة. All correct.
- **Paywall legal:** price/term, charged to حساب Apple at confirmation, renews until canceled (generic) / for {price} every {term} with the charge within 24 h before renewal (priced), auto-renew off at least 24 h before the period ends ("قبل 24 ساعة على الأقل", Apple's own Saudi wording), manage/cancel path الإعدادات > [اسمك] > الاشتراكات. Both complete. Both start with Arabic ("اشتراك {product}…", "سعر {product} هو…").
- **RTL / base direction:** Only pure placeholder joins (`{date} · {time}`, `{first} +{count}`, `{start} – {end}`, `paywall.card.a11y`) and `paywall.table.col.pro` "PRO" start without an Arabic letter; none has a natural Arabic-first alternative. `duration.*` start with a digit (neutral) and then an Arabic letter, so they resolve RTL. `>` and `›` in the Settings paths are bidi-mirrored.
- **Remi as "I":** `pending.ask`, `askPastTime`, `detail.noTime` keep the first person (متى أذكّرك؟). Fine.
- **Language names / {language}:** "لغة الاستماع: {language}", "لا يتحدث Remi {language} بعد" (fallback هذه اللغة) and the voice-language subtitle all read with an ال-form name. Fine.
- **Weekdays:** `reminders.pattern.everyDays` "أيام {days}" ("أيام الإثنين، الخميس") is natural; "كل الإثنين" would be wrong. Short weekday names = full names (CLDR ar abbreviated = wide).
- **Brands / providers:** Remi, Pro, App Store, iPhone, حساب Apple untranslated; no AI provider named (Info.plist says "خدمات ذكاء اصطناعي آمنة").
- **Gender:** masculine-default imperatives as iOS Arabic does; past second-person forms unvowelled so they read for both genders.

## Everyday word vs Apple term

- **اضغط** (tap), **الإعدادات**, **الاشتراكات**, **إلغاء الاشتراك**, **حساب Apple**, **مدة استخدام الجهاز** (Screen Time): Apple's Saudi terms, kept.
- **منبه** (the thing that rings) vs **تنبيه** (being alerted, heads-up تنبيه مسبق) vs **تذكير**: consistent across all keys.
- **لاحقًا** for the Later button rather than Apple's غفوة: the button says Later, not Snooze. Kept.
- **الإشعارات** (iOS Settings label). Kept.
- **د / س** short units (see the call above): CLDR's own short forms, not invented abbreviations.

## Length and open notes

- `today.header.getPro` "احصل على Pro" is 12 characters against ~10, but the pill uses `adjustsFontSizeToFit` (min scale 0.75) and Arabic glyphs are narrower than Latin. Kept; check on device. Fallback "ترقية".
- `repeat.mode.everyNDays` "كل بضعة أيام" (12) is at the ~12 limit. Tabs (9 each) fit.
- **Digit mix (open):** `#` inside plurals is formatted by Intl (Arabic-Indic ٥ under `ar`), but bare `{count}`/`{hours}`/`{minutes}` arguments come out as Latin digits. One screen can show "التالي بعد 5 د" next to "التالي بعد ٥ ساعات". Not changed here, because it is an app-wide choice (fa/ur/he hit it too). Two ways to fix it: `{count, number}` in the RTL catalogs, or one forced numbering system in `lib/i18n.ts`.
- `components/ReminderCard.tsx:130` hard-codes the English `{n} min early` tag. It is not in the catalog, so Arabic users see English there.
- Native-speaker copy check still worth it for the paywall hero lines ("انسَ أقل. / وتذكّر / في وقته."). They read fine but are marketing rewrites.
- `diagnostics.status.provisional` "مؤقت" (temporary) is a fair literal rendering of iOS provisional authorization. Inferred; no Apple string verified.

## Length pass (2026-10-26)

- today.header.getPro | احصل على Pro → ترقية Pro | 12 > 11 allowed; "ترقية" is the upgrade CTA verb already used in proCard.free.title (الترقية إلى Pro).
- edit.emoji.remove | إزالة الرمز التعبيري → إزالة الإيموجي | 20 > 16; iOS Arabic calls it "إيموجي" (keyboard name), shorter and familiar.
- edit.emoji.title | اختر رمزًا تعبيريًا → اختر إيموجي | not overflowing; changed so the emoji sheet uses one term (إيموجي) in title and button.
