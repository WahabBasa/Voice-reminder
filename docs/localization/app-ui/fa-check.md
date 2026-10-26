# Persian (fa) UI translation: independent review

Reviewer pass on `fa.json` against `strings-en.json` and `strings-inventory.md`. Every string was back-translated to English and compared with the source. 11 strings changed. Validator: PASS (430 keys, parsed ICU ASTs match English argument and tag names, plurals use fa's one/other with `other` always present, no bidi controls, no Arabic ي/ك/ى, no provider names, docs and locales copies byte-identical). `locales/ios/fa.json` checked, no change.

## Verdict: **SHIP WITH NOTES**

Clean, natural polite (شما) Persian with correct ZWNJ use (می‌، ‌ها، به‌موقع، سه‌شنبه) and Persian ی/ک throughout. The main fixes: an informal کن in the quick-choice VoiceOver label, the "listening to Persian" overlay line, "Weekdays" read as working days on the paywall, a 17-character hero line, and the generic disclosure where "the amount" was the subject of "renews". The notes are about Apple terms: iOS has no Persian system language, so every Apple term here is inferred.

## Changes

| key | before | after | back-translation | why |
|---|---|---|---|---|
| `paywall.hero.default.line1` | کمتر فراموش کنید. | فراموشی کمتر. | Less forgetting. | 17 chars against a ~12-char display line; a noun phrase is the natural slogan form and stays at 13. Lines 2-3 (به‌موقع / یادتان بماند.) still read on from it |
| `pending.quickChoice.a11y` | {choice} به من یادآوری کن | یادآوری: {choice} | Reminder: {choice} | کن is the informal imperative in a شما catalog; the colon pattern (as in de) also takes the chip label as-is and no longer starts with a placeholder |
| `recording.listeningIn` | در حال گوش دادن به {language} | زبان گفتار: {language} | Speech language: Persian | "در حال گوش دادن به فارسی" means "listening to Persian" (as if Persian were the thing being heard). The label shows the on-device recognition language; now it uses the same term as `settings.row.voiceLanguage` |
| `reminders.next.overdue` | عقب‌افتاده · {when} | زمانش گذشته · {when} | Its time has passed · {when} | عقب‌افتاده reads as "backlog / lagging behind" (and "backward"); now pairs with `time.dueNow` «زمانش رسیده» |
| `gate.limit.status` | … برای نامحدود شدن، ارتقا دهید. | … برای یادآوری‌های نامحدود، ارتقا دهید. | …Upgrade for unlimited reminders. | "to become unlimited" was a calque with no subject |
| `gate.limit.toastMessage` | برای ارتقا به نامحدود ضربه بزنید. | برای ارتقا و یادآوری‌های نامحدود ضربه بزنید. | Tap to upgrade and get unlimited reminders. | "upgrade to unlimited" had no noun |
| `voice.regenFailed.message` | … برای تلاش دوباره، دوباره ذخیره کنید. | … برای امتحان مجدد، دوباره ذخیره کنید. | …Save again to retry. | Two دوباره back to back |
| `edit.headsUp.none` | هیچ | هیچ‌کدام | None | Bare هیچ ("no/nothing") is incomplete as a settings value |
| `paywall.table.row.schedules` | روزهای کاری، تاریخ‌ها، هر چند روز | روزهای هفته، تاریخ‌ها، هر چند روز | Days of the week, dates, every few days | روزهای کاری = Mon-Fri working days; the feature is picked weekdays (same fix as de) |
| `paywall.legal.disclosure.generic` | … کسر می‌شود و تا زمانی که آن را لغو نکنید، به‌طور خودکار تمدید می‌شود. … | … کسر می‌شود و اشتراک تا زمانی که آن را لغو نکنید، به‌طور خودکار تمدید می‌شود. … | Payment is charged to your Apple Account at confirmation of purchase, and the subscription renews automatically until you cancel it. | The subject of "renews" was the amount (مبلغ); now it is the subscription. Legal meaning exact |
| `paywall.error.notAllowed` | … محدودیت‌های «زمان استفاده از صفحه» را بررسی کنید. | … محدودیت‌های «زمان استفاده از صفحه» (Screen Time) را بررسی کنید. | …Check Screen Time restrictions. | No Apple fa term exists, and the user's iPhone shows "Screen Time" in its own system language; the English name in brackets lets them find it |

## Rules checked

- **Plurals:** `Intl.PluralRules('fa')` gives one, other. Every plural has both, with the noun singular after the number (Persian rule), so branches are mostly identical. `take.multiCreated` (English: other only) has one + other, which is fine. `paywall.term.*` keep the English split: one = bare noun («پرداخت هر ماه»), other = «# ماه».
- **Placeholders / tags:** ASTs match English for all 430 keys; `<link>` and `<b>` kept.
- **RTL:** no bidi control characters. Placeholder-first strings left as they are (`{time} امروز گذشته است`, `{created} از …`, `+{count} مورد دیگر`, `schedule.*`): the values are Persian-digit numbers or Persian words, so the first strong character is still RTL. `askPastTime` cannot become «ساعت {time}» because its fallback value is «آن زمان». Remaining Latin-first string: `paywall.table.col.pro` "PRO" (one word).
- **Providers:** none named; «سرویس‌های امن هوش مصنوعی شخص ثالث».
- **Paywall legal:** both disclosures keep the price per term, the charge to the Apple Account at confirmation, auto-renew, the charge within 24 hours before renewal (priced), the opt-out at least 24 hours before the period ends (priced), and manage/cancel at «تنظیمات > حساب Apple > اشتراک‌ها». «۲۴» is in Persian digits.
- **Quick choice "This evening":** `lib/needsTime.ts` schedules 18:00 today, or one hour from now once 18:00 has passed. 18:00 is عصر in Persian, so «امروز عصر» stays. «امشب» (tonight) would suggest 20:00 or later.
- **Remi as "I":** «کی به شما یادآوری کنم؟», «متوجه نشدم» keep the first person. «فعلاً Remi به {language} صحبت نمی‌کند» works with «فارسی» and with the fallback «این زبان».
- **Info.plist:** both strings keep the full meaning (recording leaves the device, processed by secure AI services, transcribed and spoken back; alarms ring when silenced). They start with «برای اینکه…», not with Remi.

## Everyday word vs Apple term

Persian is not an iOS system language, so no Apple fa glossary exists. All terms are inferred from common Persian app usage (Android fa and Persian apps), which is what Persian iPhone users read in third-party apps:

- **اعلان‌ها** (Notifications), **تنظیمات** (Settings), **اشتراک‌ها** (Subscriptions), **بازیابی خرید(ها)** (Restore Purchases): the universal Persian app terms. Kept.
- **هشدار** for Alarm (short for زنگ هشدار). Kept: it is clear, and it fits the rows.
- **حساب Apple** for Apple Account: brand in Latin, the usual Persian pattern. Kept.
- **Screen Time**: Persian gloss plus the English name in brackets (see Changes), because the user sees the English label in iOS.
- **ذخیره** (save), **لغو** (cancel), **تمام** (Done): everyday terms, used the same way in every key.

## Length and open notes

- Labels at or near their limits: `tabs.reminders` یادآوری‌ها (10 / ~10), `today.header.getPro` دریافت Pro (10 / ~10), `aiConsent.allow` اجازه دادن (10 / ~10), `paywall.card.badge` به‌صرفه‌ترین (12 / ~12), `paywall.cta.trial` «شروع ۷ روز آزمایش رایگان» (~22 / ~24). Persian glyphs are narrow, so these should fit; check them on the device.
- `weekday.short.*` are full day names (چهارشنبه, 8 chars), because Persian has no short forms and CLDR fa abbreviated = full. Check the "Every Mon, Thu" subtitles for truncation.
- `repeat.mode.everyNDays` «هر چند روز» and the paywall's "every few days" use the same words. Persian has no neat "every N days" without a Latin N. The stepper right below shows the number, so the label holds.
- `paywall.closing.headline` still says «کمتر فراموش کنید.» (imperative) while the hero now says «فراموشی کمتر.». Both are natural; this is a style mismatch only.
- Settings paths are written in Persian («تنظیمات > حساب Apple > اشتراک‌ها»), but the user's iOS will show them in English or another language. Persian readers map these easily. Revisit only if testers stumble.
- No legal review in scope: there is no Iranian App Store, and the audience is the diaspora.
