# tl review (independent check, 2026-10-10)

Validator: `[tl] PASS: 426 keys (en 426), 0 errors, 45 warnings`. The warnings are pre-existing: Taglish loanwords identical to English (Alarm, Error, Feedback, language names like Czech/Hindi), placeholders, and "Remi" false positives.

## Changed strings

| key | before | after | back-translation | why |
|---|---|---|---|---|
| `pending.ask` | Kailan kita dapat paalalahanan? | Kailan kita paaalalahanan? | When shall I remind you? | "dapat" (should) was a literal calque. The plain future is how a Filipino speaker asks, and it keeps Remi's "I" voice. |
| `pending.askPastTime` | …Kailan kita dapat paalalahanan? | …Kailan kita paaalalahanan? | …When shall I remind you? | Same. |
| `pending.detail.noTime` | Kailan kita dapat paalalahanan? I-tap… | Kailan kita paaalalahanan? I-tap… | When shall I remind you? Tap… | Same. |
| `pending.detail.pastTime` | …Kailan kita dapat paalalahanan? I-tap… | …Kailan kita paaalalahanan? I-tap… | Same | Same. |
| `pending.detail.unsupportedLanguage` | Hindi pa nakakaintindi si Remi ng {language} | Hindi pa marunong ng {language} si Remi | Remi doesn't know {language} yet | "Understand" narrowed the meaning. "Marunong ng [language]" is the everyday way to say someone speaks it. Works with the fallback "wikang ito". |
| `paywall.table.row.schedules` | Weekdays, mga petsa, kada ilang araw | Mga araw ng linggo, petsa, kada ilang araw | Days of the week, dates, every few days | In Taglish "weekdays" means Mon–Fri. The feature is Weekly mode with any days the user picks (`RepeatTaskModal`). Same choice as pt-BR "Dias da semana". |
| `paywall.trialLabel` | (Trial: {length}) | ({length} na trial) | ({length} trial) | Reads as a phrase ("7 araw na trial") instead of a form field. |
| `paywall.closing.headline` | Bawas-limot. Magawa ang mga bagay sa tamang oras. | Bawas-limot. Tapusin ang mga gawain sa oras. | Forget less. Finish your tasks on time. | "Magawa ang mga bagay" was a stiff calque of "get things done". |

## Hero lines (reviewed)

- Default: "Bawas-limot. / Maalala / sa oras." → "Less forgetting. / Remember / on time." Kept. "Bawas-limot" is a catchy coinage on the "bawas-taba" pattern, and every line stays ≤12 chars.
- Interval: "Ulitin ito / hanggang / matapos." → "Repeat it / until / it's done." Kept: exact and natural.

## Not changed, noted

- iOS paths (Settings › Apple Account › Subscriptions, Screen Time) are already in English. `notificationsOff.message` already says "Settings".
- Legal disclosures checked clause by clause: exact.
- `paywall.cta.trial` "Simulan ang libreng {length}" (Start your free {length}) leaves out the word "trial" to fit ~24 chars. Acceptable.

## Verdict

**SHIP.** Confidence: medium-high. The Taglish register matches what Filipino apps show. A native skim of the hero lines on the device is still nice to have.
