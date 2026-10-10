# hi review (independent check, 2026-10-10)

Validator: `[hi] PASS: 426 keys (en 426), 0 errors, 17 warnings` (all warnings pre-existing and intended: placeholders, am/pm, PRO, "Remi" false positives).

## Changed strings

| key | before | after | back-translation | why |
|---|---|---|---|---|
| `feedback.sheet.placeholder` | क्या हुआ? आप क्या करना चाह रहे थे? | क्या हुआ? आपको क्या करना था? | What happened? What did you need to do? | "चाह रहे थे" assumes a male user. Dative construction is gender-neutral. |
| `permission.subtitle` | …आप इनके बिना भी रिमाइंडर बना सकते हैं। | …इनके बिना भी रिमाइंडर बनाए जा सकते हैं। | …Reminders can still be created without them. | "सकते हैं" is masculine. Passive is neutral, meaning unchanged. |
| `restore.expired.message` | …आप कभी भी फिर से सब्सक्राइब कर सकते हैं। | …कभी भी फिर से सब्सक्राइब किया जा सकता है। | …You can subscribe again any time. | Same gender fix (passive). |
| `paywall.toast.expired.message` | …आप नीचे फिर से सब्सक्राइब कर सकते हैं। | …फिर से सब्सक्राइब करने का विकल्प नीचे है। | …The option to subscribe again is below. | Same gender fix (noun-based). |
| `paywall.table.row.schedules` | कार्य दिवस, तारीख़ें, हर कुछ दिन में | सप्ताह के चुने दिन, तारीख़ें, हर कुछ दिन में | Chosen days of the week, dates, every few days | कार्य दिवस is Apple Clock's "Weekdays" = Mon–Fri only. The app feature this row sells is the Weekly mode, where the user picks any days of the week (`RepeatTaskModal` "specific weekdays"; no Mon–Fri key exists in the catalog). |

## Not changed, noted

- **Remi stays masculine** (Remi करता है / कहता है in `feedback.context.remiSays`, `feedback.context.play.a11y`, both `infoPlist.*`). Hindi verbs force a gender; masculine is the normal default for an app. Remi's first-person lines (मैं आपको कब याद दिलाऊँ?) are neutral.
- `paywall.closing.brand` (developer भूलता रहता था) is masculine: it describes the founder, not the user.
- Apple-verified terms kept even where a more casual word exists: पूर्ण (Done), सेटिंग, कोई प्रतिबद्धता नहीं, मौन मोड.
- Everything else back-translates faithfully. Legal disclosures checked clause by clause: exact.

## Verdict

**SHIP.** Confidence: medium-high. No native-speaker read yet. A device check of `paywall.card.badge` (सबसे फ़ायदेमंद, ~12-char pill) is still worth doing.
