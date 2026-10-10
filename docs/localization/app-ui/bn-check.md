# bn review (independent check, 2026-10-10)

Validator: `[bn] PASS: 426 keys (en 426), 0 errors, 17 warnings` (all pre-existing and intended).

## Changed strings

| key | before | after | back-translation | why |
|---|---|---|---|---|
| `layout.toast.alarmsMayNotFire.message` | সমস্যা দেখতে ট্যাপ করুন | বিস্তারিত দেখতে ট্যাপ করুন | Tap to see details | "See the problem" promised more than the screen (a permissions/status list) shows. |
| `settings.voiceLanguage.en` | English | ইংরেজি | English | Latin "English" stood out among Bangla UI. The pt-BR/es-MX references translate it. Only the Arabic endonym stays as is. |
| `times.mode.interval` | বিরতি | কিছুক্ষণ পরপর | Every little while | বিরতি alone reads as "break / pause". This chip is the repeat-every-N-minutes mode. |
| `times.between` | এর মধ্যে | সময়সীমা | Time window | "এর মধ্যে" is a postposition and can't start a label. |
| `paywall.hero.interval.line1-3` | রিপিট করুন / যতক্ষণ না / কাজ শেষ। | শেষ না হওয়া / পর্যন্ত / রিপিট করুন। | Until it's done / repeat. | The old lines were ungrammatical ("যতক্ষণ না কাজ শেষ" has no verb). Each line is still ≤12 chars. |
| `paywall.billed.yearly` | প্রতি বছরে বিল করা হয় | প্রতি বছর বিল করা হয় | Billed every year | More natural. |

## The "weekdays" question

`paywall.table.row.schedules` = "সপ্তাহের নির্দিষ্ট দিন, তারিখ, কয়েক দিন পরপর" (specific days of the week, dates, every few days). **Kept.** I checked the app: the catalog has no Mon–Fri "Weekdays" key. The `schedule`/`repeat` keys offer Every day / Weekly / Every N days / On a date, and Weekly lets the user pick any days (`components/RepeatTaskModal.tsx:19`, "specific weekdays"; `lib/usageGate.ts:126`). So "chosen days of the week" matches what the feature does, and it doesn't imply a Sun–Thu work week. The schedule keys themselves (সাপ্তাহিক, প্রতিদিন, যেসব দিনে রিপিট) were already right. Side note: the reviewed es-MX says "Entre semana" (Mon–Fri), which arguably undersells the feature.

## Verdict

**SHIP.** Confidence: medium. The grammar and register are solid. Apple's Bangla iOS terms couldn't be verified, so a native skim is still recommended.
