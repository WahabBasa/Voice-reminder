# fa (Persian, Iran) — translator notes for `fa.json` (2026-10-26)

## Style sheet

- **Register: شما**, polite standard written Persian. Instructions use the polite imperative (ضربه بزنید، بررسی کنید، انتخاب کنید). Row labels and buttons use verbal nouns (لغو، حذف، ارسال، پخش، انتخاب زمان، اجازه دادن).
- **Remi's own questions** use first person singular, as in English: «کی به شما یادآوری کنم؟», «متوجه نشدم». Error lines that say "we" keep "we" (نتوانستیم…، نشنیدیم…).
- **Buttons:** لغو، حذف، تمام (Done)، اجازه دادن / حالا نه، فعال کردن، ادامه، بعداً (Later). "Done" is تمام everywhere (edit sheet, repeat sheet, alarm buttons). Alt «انجام شد» is longer.
- **Progress states:** «در حال …» + Persian ellipsis (در حال بارگیری…، در حال پردازش…). English `...` became `…`.
- **Punctuation:** Persian comma ، , question mark ؟ , guillemets «…» for quotes and for UI names in running text («خودکار»، «بازیابی خرید»، «زمان استفاده از صفحه»). The `paywall.card.a11y` join uses ، .
- **ZWNJ (U+200C)** used where orthography needs it: می‌، ‌ها، ‌ای، ‌ترین، به‌موقع، به‌روز، سه‌شنبه، کره‌ای، عیب‌یابی. Ezafe on ه written as ۀ-style «هٔ» (جملهٔ، نسخهٔ، دورهٔ). No bidi controls anywhere.
- **Letters:** Persian ی (U+06CC) and ک (U+06A9) only; validator checks for Arabic ي/ك/ى.
- **Digits:** none hard-coded except the legal «۲۴ ساعت», written in Persian digits (same choice as bn `২৪`). All other numbers come from `{count}` / `#` via Intl.
- **Latin-first lines avoided:** strings whose English starts with "Remi"/"Pro"/"{product}"/"App Store" were reordered so a Persian word comes first: «آنچه Remi شنید: …», «فعلاً Remi به … صحبت نمی‌کند», «گفتهٔ Remi», «نسخهٔ Remi: …», «با Pro، …», «اکنون {product} دوباره…», «اشتراک {product} به‌طور خودکار…», «در حال حاضر App Store…», «فعال‌سازی Pro انجام شد!», Info.plist strings start with «برای اینکه…». Remaining Latin-first: `paywall.table.col.pro` "PRO" (single word); `pending.quickChoice.a11y`, `notification.preAlert.body`, `schedule.*` and `time.dateAndTime` start with a placeholder by design.
- **Plurals (CLDR fa): one / other.** Nouns after numbers stay singular, so both branches are usually identical («# روز»). `take.multiCreated` (English: other only) got one + other. `paywall.term.*` keep the English meaning: one = bare noun (روز، هفته، ماه، سال) so «پرداخت هر ماه», other = «# ماه» («هر ۲ ماه»).
- **Gender:** Persian has none; nothing to do.
- **No provider names**; «سرویس‌های امن هوش مصنوعی (شخص ثالث)».
- **Voice output:** Remi can show Persian UI but cannot speak Persian yet. `pending.detail.unsupportedLanguage` = «فعلاً Remi به {language} صحبت نمی‌کند» reads naturally with both a language name («فارسی») and the fallback «این زبان».

## Apple terms

Persian is **not an iOS system language** (Apple's iOS feature-availability page lists Persian for keyboards only, not under System Language; Apple Community threads confirm). So there is no official Apple iOS fa terminology, and every term below is **Inferred** from common Persian tech usage (Android/Google fa, Persian app conventions). A Persian user's iOS will be in another language (usually English), so Settings paths name screens they will see in English; see Paywall legal.

| EN | fa | Status |
|---|---|---|
| Reminders | یادآوری‌ها | Inferred |
| Alarm | هشدار | Inferred (Clock "alarm" is often زنگ هشدار; short form used) |
| Later | بعداً | Inferred |
| Settings | تنظیمات | Inferred (universal) |
| Notifications | اعلان‌ها | Inferred (Android fa, universal) |
| Delete / Cancel / Done | حذف / لغو / تمام | Inferred |
| Allow / Not now | اجازه دادن / حالا نه | Inferred |
| Subscription(s) | اشتراک / اشتراک‌ها | Inferred |
| Restore Purchases | بازیابی خریدها | Inferred |
| Free Trial | آزمایش رایگان / دورهٔ آزمایشی | Inferred |
| Apple Account | حساب Apple | Inferred (brand kept Latin) |
| App Store | App Store | Brand, untranslated |
| Screen Time | زمان استفاده از صفحه | Inferred (literal; no Apple fa term) |
| Privacy Policy / Terms of Use | سیاست حفظ حریم خصوصی / شرایط استفاده | Inferred (standard) |
| Permissions | مجوزها | Inferred |
| am / pm | ق.ظ. / ب.ظ. | CLDR fa day periods (قبل‌ازظهر / بعدازظهر); fallbacks only, use Intl |

## Paywall legal

- Full meaning kept: price per term, charged to Apple Account at confirmation of purchase, auto-renews for the same price, account charged within 24 hours before each renewal, unless auto-renew is turned off at least 24 hours before the current period ends, manage or cancel anytime in Settings › Apple Account › Subscriptions.
- `generic` opens «اشتراک {product} به‌طور خودکار تمدید می‌شود» (= "is an auto-renewing subscription") to avoid a Latin-first line; meaning unchanged.
- Path written in Persian: «تنظیمات > حساب Apple > اشتراک‌ها». Since iOS has no Persian UI, the user's screen will say "Settings > [name] > Subscriptions" in their system language. Persian readers map these easily; alt is to add English in parentheses if testers stumble.
- Legal review out of scope (no Iranian App Store; Persian users are elsewhere, e.g. diaspora / Afghanistan uses Dari).

## Uncertain strings

- `paywall.hero.default.*` «کمتر فراموش کنید. / به‌موقع / یادتان بماند.» — line 1 is long (~17 chars) for a ~12-char display line; alt «کمتر یادتان برود.».
- `pending.quickChoice.a11y` «{choice} به من یادآوری کن» — works with the chip labels («یک ساعت دیگر»، «امروز عصر»، «فردا صبح»); lower-casing in code is harmless for Persian. Imperative addressed to the app (informal کن), which reads like a voice command.
- `today.timeDraft.confirm` «تنظیم یادآوری» (Set reminder) instead of literal «به من یادآوری کن» (15 chars, over the ~14 limit).
- `quickChoice.thisEvening` «امروز عصر» (this afternoon/evening). «امشب» means tonight; pick depends on what time the chip schedules (if ≥ 19:00, «امشب» is better).
- `recording.listeningIn` «در حال گوش دادن به {language}» (lit. "listening to Persian"). Alt «زبان شنیدن: {language}».
- `time.dueNow` «زمانش رسیده», `reminders.next.overdue` «عقب‌افتاده · …» — colloquial-leaning; alt «سررسید گذشته».
- `settings.row.voiceLanguage` «زبان گفتار» (speech language). It is the transcription language.
- `times.mode.interval` «بازه‌ای», `repeat.mode.everyNDays` «هر چند روز» (no Latin N).
- `paywall.card.badge` «به‌صرفه‌ترین» (most economical) rather than literal «بهترین ارزش».
- `weekday.short.*` are full day names (Persian has no standard abbreviations; CLDR fa abbreviated = full). Narrow: ی د س چ پ ج ش.

## Overflow risks

| Key | fa | Chars / limit |
|---|---|---|
| `tabs.reminders` | یادآوری‌ها | 10 / ~10 OK |
| `tabs.settings` | تنظیمات | 7 OK |
| `today.header.getPro` | دریافت Pro | 10 / ~10 OK |
| `composer.speak` | صحبت | 4 / ~8 OK |
| `aiConsent.allow` | اجازه دادن | 10 / ~10 OK |
| `permission.enable` | فعال کردن | 9 / ~10 OK |
| `common.cancel` / `common.done` | لغو / تمام | OK |
| `paywall.table.col.free` | رایگان | 6 / ~6 OK |
| `paywall.card.badge` | به‌صرفه‌ترین | 12 / ~12 OK |
| `paywall.hero.default.line1` | کمتر فراموش کنید. | 17 / ~12 — risk; Persian glyphs are narrow, check on device |
| `paywall.hero.interval.line1` | تکرارش کنید | 11 / ~12 OK |
| `weekday.short.wed` etc. | چهارشنبه | 8 — wider than "Wed"; check "Every Mon, Thu" lines and any day chips |
| `quickChoice.*` | یک ساعت دیگر / فردا صبح / انتخاب زمان… | ≤ 12 OK |
| `paywall.cta.trial` | شروع ۷ روز آزمایش رایگان | ~24 / ~24 borderline |
| `alarm.button.later` | بعداً | 5 / ~8 OK |
