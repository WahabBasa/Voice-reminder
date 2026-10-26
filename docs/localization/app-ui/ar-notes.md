# ar (Arabic, MSA) — translator notes for `ar.json` (2026-10-26)

Catalog: `ar.json` (430 keys, same order as `locales/en.json`; the brief said 426, the source now has 430). Built by script with `json.dump(ensure_ascii=False, indent=2)`. Validator: `[ar] PASS: 430 keys (en 430), 0 errors`; ICU parse plus argument/tag names compared on the AST with `@formatjs/icu-messageformat-parser`: `430/430 ok`.

Source tags:
- **[AS-SA]**: support.apple.com/ar-sa/118428 (cancel a subscription), fetched 2026-10-26.
- **[R]**: `docs/aso/research/localization/ar-SA.md` (Apple Watch alarm guide, Apple Reminders listing, Arabic store reviews).
- **[J]**: my call. applelocalization.com returned empty results for every query this time (also for `ru`), so no iOS system string could be checked there.

## Style sheet

- **Register: Modern Standard Arabic**, no Gulf/Egyptian words (no الجوال, وش, عايز). "هاتف" for phone, "جهاز" for device.
- **Addressing the user:** masculine-default singular imperative, as iOS Arabic does: اضغط، اختر، تحقق، حاول [AS-SA uses "اضغط على"]. Where it was easy, gender-neutral verbal nouns or passives instead: قبل التسجيل، للمتابعة، تم بلوغ الحد المجاني، لديك اشتراك بالفعل؟. Second-person past forms (وصلت، أرسلته) are written without tashkeel, so they read for both genders.
- **Remi is masculine** (male name): سمع Remi، يتحدث Remi، يستخدم Remi، يسجّل Remi.
- **Buttons/rows: verbal nouns** like Apple Arabic: إلغاء، حذف، تم، سماح، ليس الآن، إعادة المحاولة، إرسال، تشغيل، إغلاق، متابعة، تفعيل، استعادة المشتريات.
- **Errors:** "تعذّر + verbal noun" (تعذّر حفظ…، تعذّر الوصول إلى الخادم). Retry: "حاول مرة أخرى" / "يُرجى المحاولة مرة أخرى" / "اضغط لإعادة المحاولة".
- **Progress:** "جارٍ + verbal noun + …" (جارٍ التحميل…، جارٍ الإنشاء…). English "..." became "…".
- **Punctuation:** Arabic comma ، , question mark ؟ , semicolon ؛ (not needed anywhere). Ellipsis …. Quotes: straight "…" as Apple's Saudi support pages do (اضغط على "الاشتراكات") [AS-SA]. Path separators `>` / `›` kept: they are bidi-mirrored, so they point left in RTL.
- **Tashkeel:** minimal, only where it disambiguates or is customary in UI: shadda in ذكّرني / تعذّر / مفعّلة / كرّره, tanween fath on adverbs/accusatives (مجددًا، يوميًا، تذكيرًا), جارٍ. None of these strings goes into an IAP display name (where Apple bans diacritics).
- **Vocabulary [R]:** منبه = the thing that rings (Alarm row, diagnostics title, alarms in settings); تذكير / تذكيرات = reminder(s) (Apple's app name التذكيرات); تنبيه = being alerted (permission title, heads-up = تنبيه مسبق). غفوة is Apple's Snooze, but the catalog's snooze button is "Later" → لاحقًا. No religious words (أذان، صلاة، ذكر). اشتراك for subscription [AS-SA].
- **Brand:** Remi, Pro, PRO, App Store, iPhone, حساب Apple stay as Apple writes them. Strings never start with a Latin word when an Arabic order exists: "إصدار Remi {version} ({build})", "اشتراك {product} يتجدد تلقائيًا", "سمع Remi: …", "تم تفعيل Pro! 🎉". The two exceptions are pure placeholder joins ({date} · {time}, {first} +{count}, {subject} بعد …) and `paywall.table.col.pro` "PRO".
- **Digits:** none written except the two "24 ساعة" in the priced legal text (English has "24"; Apple's Saudi page writes "قبل 24 ساعة على الأقل" with Latin digits [AS-SA]). "In 1 hour" → "بعد ساعة" (no digit needed). Everything else comes from `#` / placeholders, so Intl picks Latin vs Arabic-Indic digits.
- **Language names:** CLDR Arabic adjective forms with ال (العربية، الإنجليزية، الماليزية، الهنغارية، النرويجية (بوكمال)، الأردية، التاغالوغية). Sentences are built so a name or the fallback both fit: "لا يتحدث Remi {language} بعد" → "…هذه اللغة بعد"; "لغة الاستماع: {language}".
- **Weekdays:** short = full day names (CLDR ar abbreviated = wide: الأحد … السبت). Narrow = CLDR ar narrow letters: ح ن ث ر خ ج س.
- **AM/PM fallbacks:** `time.clock.am/pm` and `times.picker.am/pm` = ص / م (CLDR ar dayPeriods abbreviated). Fallbacks only; Intl should format times.

## Plurals (CLDR ar: zero, one, two, few, many, other)

Every plural message (20 of them) has all six branches. Noun forms follow grammar of the frame they sit in:

| Category | n | Form used | Example (hours, after بعد / كل) |
|---|---|---|---|
| zero | 0 | `# noun` (singular) or a natural negative sentence (gate.limit.*, take.partial.cap, take.multiCreated: "لا يمكنك إضافة تذكيرات نشطة", "لم يتم إنشاء أي تذكير") | بعد # ساعة |
| one | 1 | bare noun, no `#` (بعد ساعة، كل يوم), or noun + واحد where it stands alone (تذكير واحد، يوم واحد، سنة واحدة) | بعد ساعة |
| two | 2 | dual, no `#`. Genitive/accusative -ين after prepositions and كل (ساعتين، يومين، تذكيرين); nominative -ان only where the noun is a subject after a colon (تذكيران نشطان in gate.limit.*) | بعد ساعتين |
| few | 3–10 (n%100) | `# plural` (ساعات، أيام، دقائق، تذكيرات، أشهر، أسابيع، سنوات) | بعد # ساعات |
| many | 11–99 | `# singular accusative` (يومًا، تذكيرًا نشطًا، شهرًا، أسبوعًا; ساعة/دقيقة/سنة look the same) | بعد # ساعة |
| other | 100+, fractions | `# singular` (يوم، تذكير، ساعة) | بعد # ساعة |

- `paywall.term.*` keeps the English "one without #" meaning: one = "شهر" / "سنة" / "أسبوع" / "يوم" (so "كل شهر", "{price} / شهر"); two = "شهرين" (reads "كل شهرين"). These terms always follow كل or "/", so genitive dual is right.
- `paywall.trial.*` always follow "لمدة" (trialLabel, cta.trial, caption.trial): one = "يوم واحد" / "شهر واحد" / "سنة واحدة", two = genitive "يومين / شهرين / سنتين".
- `repeat.stepper.days` sits after the "التكرار كل" label, so it uses the same genitive set as كل: يوم / يومين / # أيام / # يومًا / # يوم.
- Non-plural `{count}` strings (duration.*, time.nextIn.minutes, edit.headsUp.minutesBefore) use the singular unit (دقيقة / ساعة) for every number. That's the usual short-label convention, but it's grammatically loose for 3–10 ("5 دقيقة" instead of "5 دقائق"). Making them plural in en.json would fix it.

## Apple terms

| EN | ar | Status |
|---|---|---|
| Reminders | التذكيرات | Verified [R] (Apple Reminders AE listing) |
| Alarm | منبه | Verified [R] (Apple Watch alarm guide ar-kw) |
| Snooze | غفوة | Verified [R]; not used (button is Later) |
| Later | لاحقًا | Inferred [J] |
| Settings | الإعدادات | Verified [AS-SA] ("في الإعدادات، اضغط على اسمك") |
| Tap | اضغط | Verified [AS-SA] |
| Subscriptions | الاشتراكات | Verified [AS-SA] |
| Cancel subscription | إلغاء الاشتراك | Verified [AS-SA] |
| Apple Account | حساب Apple | Verified [AS-SA] |
| Trial period | الفترة التجريبية; CTA "جرّب مجانًا" / "تجربة مجانية" | Verified for الفترة التجريبية [AS-SA]; CTA wording Inferred |
| Renewal | تجديد | Verified [R]/[AS-SA] |
| Done | تم | Inferred (iOS standard) |
| Cancel | إلغاء | Inferred (iOS standard) |
| Delete | حذف | Inferred |
| Allow / Don't Allow | سماح / عدم السماح | Inferred (iOS permission dialog); only سماح is used |
| Not Now | ليس الآن | Inferred |
| Try Again | إعادة المحاولة | Inferred |
| Notifications | الإشعارات | Inferred (iOS Settings) |
| Restore Purchases | استعادة المشتريات | Inferred |
| Screen Time | مدة استخدام الجهاز | Inferred (iOS Arabic name of Screen Time) |
| Lock Screen / Focus | شاشة القفل / التركيز | Inferred; not used in the catalog |
| Privacy Policy / Terms of Use | سياسة الخصوصية / شروط الاستخدام | Inferred |
| App Store | App Store | Verified (Apple keeps it Latin in Arabic text) [AS-SA] |

## Paywall legal

- Path: "الإعدادات > [اسمك] > الاشتراكات", from Apple's "في الإعدادات، اضغط على اسمك. اضغط على "الاشتراكات"" [AS-SA]. The English names "Apple Account" in the path; the Arabic follows Apple's own instruction (your name row), as de/ru did. `settings.alert.manageFailed.message` uses the same path with ›.
- Meaning kept in full: price per term; "يُخصم المبلغ من حساب Apple الخاص بك عند تأكيد الشراء"; auto-renews "إلى أن يتم إلغاؤه" (generic) / "مقابل {price} كل {term}" (priced); "يُخصم المبلغ من حسابك خلال 24 ساعة قبل كل تجديد"; "ما لم يتم إيقاف التجديد التلقائي قبل 24 ساعة على الأقل من نهاية الفترة الحالية" (Apple's own phrase "قبل 24 ساعة على الأقل" [AS-SA]); manage/cancel anytime.
- Sentence order puts Arabic first ("اشتراك {product}…", "سعر {product} هو…") so the paragraph never starts with the Latin product name.
- Legal review by a native speaker is out of scope.

## Uncertain strings

- `today.header.getPro` "احصل على Pro" (12 chars, limit ~10). Alt "ترقية" (5) drops "Pro".
- `paywall.hero.default.*` "انسَ أقل." / "وتذكّر" / "في وقته." and `paywall.hero.interval.*` "كرّره" / "حتى" / "تُنجزه.": marketing lines rewritten to split into three short lines; a native copy check is worth it.
- `pending.moreReminders` "و{count} غيرها: {titles}" ("and N others"): avoids starting with "+{count}". Alt "+{count} أخرى: {titles}".
- `settings.row.voiceLanguage` "لغة التسجيل" (it is the transcription language) and its subtitle "النسخ على جهاز iPhone هذا · {language}". "النسخ" = transcription (Apple uses it for voicemail transcription, Inferred). Alt "لغة الصوت".
- `reminders.pattern.everyDays` "أيام {days}" ("أيام الإثنين، الخميس" = on Mondays, Thursdays). Natural for lists; with one day "أيام الأحد" is still idiomatic. "كل {days}" would give "كل الأحد", which is wrong.
- `schedule.everyDuration` / `schedule.intervalSubtitle` "كل {duration}" with duration "2 ساعة": conventional but loose (see the non-plural note above).
- `duration.hoursMinutes` "{hours} ساعة و{minutes} دقيقة": the و attaches to the number; renders as "1 ساعة و30 دقيقة".
- `pending.quickChoice.a11y` "ذكّرني {choice}": code lower-cases the chip label (no effect in Arabic). Reads "ذكّرني بعد ساعة / هذا المساء / صباح الغد". With "اختر وقتًا…" it reads oddly, as the English does.
- `diagnostics.status.provisional` "مؤقت" (iOS "provisional" authorization; quiet delivery). Inferred.
- `time.missedAt` "فائت · {time}" (as in مكالمة فائتة). Alt "فاتك · {time}".

## Overflow risks

| Key | ar | Chars / limit |
|---|---|---|
| `today.header.getPro` | احصل على Pro | 12 / ~10 — likely tight; alt "ترقية" |
| `tabs.reminders` | التذكيرات | 9 / ~10 OK |
| `tabs.settings` | الإعدادات | 9 / ~10 OK |
| `common.cancel` / `common.done` | إلغاء / تم | OK |
| `composer.speak` | تحدّث | 5 / ~8 OK |
| `take.created.action` | ليس صحيحًا؟ | 11 / ~12 OK |
| `repeat.mode.everyDay` / `repeat.mode.everyNDays` | كل يوم / كل بضعة أيام | 6 / 12 — second is 12 / ~12, at the limit |
| `quickChoice.tomorrowMorning` | صباح الغد | 9 / ~18 OK |
| `paywall.card.badge` | أفضل قيمة | 9 / ~12 OK (no upper-case in Arabic) |
| `paywall.table.col.free` | مجاني | 5 / ~6 OK |
| `paywall.cta.trial` | جرّب مجانًا لمدة {length} | ~16 + length ("7 أيام") ≈ 23 / ~24 — tight with "شهر واحد"/"سنة واحدة" |
| `paywall.hero.*` lines | ≤ 9 chars each | OK (~12) |
| `alarm.button.later` | لاحقًا | 6 / ~8 OK |
| `feedback.list.fromRemi` | رسالة من Remi | 13 / ~20 OK |

Arabic glyphs are generally narrower than Latin at the same point size, but the serif hero font must have Arabic coverage, or iOS falls back to the system Arabic font. That is a wiring question, not a text one.
