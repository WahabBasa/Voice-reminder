# zh-Hans (Simplified Chinese, mainland) notes: Remi UI (2026-10-10)

Catalog: `zh-Hans.json`, 426 keys, validated (same key set and order, ICU parses, placeholders kept, plurals other-only).

Source tags: **[AL]** = verified on applelocalization.com (iOS 26.7.1 strings, zh_CN), **[inf]** = inferred, not found as an exact Apple string.

## (a) Style sheet

1. **Address the user as 你**, never 您. Apple's zh_CN UI uses 你 ("你的iPhone正在听取…" [AL]).
2. **Buttons and labels are short verb or noun phrases** with no ending punctuation: 完成, 删除, 升级, 重新录制.
3. **Full sentences end with 。; questions with ？.** Use full-width punctuation (，。：？！（）) everywhere in Chinese text.
4. **No spaces between Chinese and Latin text or digits.** Apple writes "Apple账户", not "Apple 账户" (7 exact hits vs 0 [AL]). So: "Remi听到", "升级到Pro", "{count}分钟", "1小时后".
5. **Quotes are “ ”** (curly double quotes), for example “{title}” and when naming a Settings item: “设置”>“Apple账户”>“订阅”.
6. **Ellipsis is "…"** (U+2026), as Apple zh_CN uses it in progress states (正在载入…).
7. **Tap = 轻点** (Apple zh_CN's word). Progress states use 正在…: 正在聆听…, 正在处理….
8. **Save = 存储** in edit-flow messages (Apple's Simplified Chinese verb for Save), and 保存 in a few casual toasts. Both are acceptable; 存储 matches iOS.
9. **AM/PM = 上午/下午.** In Chinese they go *before* the time ("下午3:00"). The app appends `time.clock.am/pm` after the time today, so the code should switch to `Intl.DateTimeFormat` (see Uncertain).
10. **No AI provider names.** "安全的第三方AI服务" only.

## (b) Apple iOS terms

| English | zh-Hans | Source |
|---|---|---|
| Reminders (app) | 提醒事项 | [AL] app.reminders |
| Alarm | 闹钟 | [AL] ClockAngel "Alarm" |
| Snooze | 稍后提醒 | [AL] MobileTimerSupport / ClockAngel "Snooze" |
| Stop | 停止 | [AL] ClockAngel "stop" |
| Later | 稍后 | [AL] Setup "BUTTON_LATER" (one hit) |
| Not Now | 以后 | [AL] NOT_NOW (194 hits) |
| Settings | 设置 | [AL] |
| Delete | 删除 | [AL] |
| Done | 完成 | [AL] |
| Allow / Don't Allow | 允许 / 不允许 | [AL] |
| Subscription(s) | 订阅 | [AL] AppleAccountIntents "Subscriptions" |
| Restore Purchases | 恢复购买 | [inf] (no system string; standard in CN apps) |
| Free Trial | 免费试用 | [AL] StoreKit ACTION_FREE_TRIAL |
| Every day | 每天 | [AL] |
| Weekdays | 工作日 | [AL] WEEKDAYS |
| slide to stop | 滑动以停止 | [AL] ClockAngel SLIDE_TO_STOP |
| Listening… | 正在聆听… | [inf] (正在聆听 exists in MusicUI; Siri string not found) |
| Apple Account | Apple账户 | [AL] Preferences "Apple Account" |
| Screen Time | 屏幕使用时间 | [inf] |

Verified 17 of 19 above; Restore Purchases and Screen Time are inferred.

## (c) Remi glossary

| English | zh-Hans | Note |
|---|---|---|
| reminder | 提醒 (counter 个) | Tab is "提醒", not Apple's "提醒事项", so Remi isn't confused with Apple's app |
| recording / take | 录音 | |
| record again | 重新录制 | |
| alarm | 闹钟 | |
| spoken line | 播报内容 | |
| heads-up (pre-alert) | 提前提醒 | |
| active reminders | 进行中的提醒 | |
| interval | 间隔 | |
| window (quiet outside) | 时段 | |
| Free / Pro | 免费版 / Pro | "PRO" column kept in Latin |
| plan | 方案 | |
| feedback | 反馈 | |
| transcribe | 转写 | |

## (d) Plurals and the paywall

- All plural blocks are `other` only. Where the English singular has no number ("month", "day"), an `=1` branch is used so the CTA and legal text read naturally:
  - `paywall.term.month` = `{count, plural, =1 {月} other {#个月}}`. Then "每{term}" gives 每月 or 每3个月, and "{price}/{term}" gives ¥28/月.
  - `time.every.days` and `schedule.everyNDays` use `=1 {每天}`.
- **Legal block** (`paywall.legal.disclosure.*`) follows the standard CN wording: 自动续期订阅, 确认购买后将从你的Apple账户扣款, 在当前订阅期结束前至少24小时关闭自动续期, and the path “设置”>“Apple账户”>“订阅”. Nothing added or dropped.
- `paywall.caption.trial` adds 之后 ("then") to make the order explicit: 免费试用7天，之后¥28/月. Same meaning as English.

## (e) Uncertain strings

- `tabs.days` = 日程 ("schedule"). A literal 天/日 reads oddly as a tab name. Confirm it fits the day-by-day screen.
- `time.clock.am/pm`: the position is wrong if the code appends them. Use `Intl` for times.
- `schedule.pickDays` = 选择哪几天, `schedule.pickDate` = 选择日期. They're kept distinct on purpose.
- `pending.quickChoice.a11y` = 提醒我：{choice}. The chip label is inserted as is (for example 提醒我：今晚).
- `paywall.term.fallback` = 计费周期: "每计费周期" is understandable but stiff (rare path).
- `edit.row.voiceNote` = 语音提醒, not Apple's 语音备忘录, to avoid suggesting the Voice Memos app.

## (f) Overflow

None. Every capped key is shorter than English. `weekday.narrow.*` is one full-width glyph (一…日), as the 1-character column expects.
