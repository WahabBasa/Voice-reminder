# zh-Hant (Traditional Chinese, Taiwan) notes: Remi UI (2026-10-10)

Catalog: `zh-Hant.json`, 426 keys, validated (same key set and order, ICU parses, placeholders kept, plurals other-only). Taiwan conventions throughout, not Hong Kong.

Source tags: **[AL]** = verified on applelocalization.com (iOS 26.7.1, zh_TW), **[inf]** = inferred.

## (a) Style sheet

1. **Address the user as 你**, as Apple TW does ("你的iPhone正在聆聽…" [AL]). Never 您.
2. **Taiwan vocabulary, not a converted zh-Hans:**

   | Concept | Taiwan | (not) |
   |---|---|---|
   | Settings | 設定 | 設置 |
   | network | 網路 | 網絡 |
   | account | 帳號 | 賬戶 |
   | message | 訊息 | 信息 |
   | save | 儲存 | 保存 |
   | create | 建立 | 創建 |
   | support | 支援 | 支持 |
   | tap | 點一下 | 輕點 |
   | load | 載入 | 加載 |
   | discard | 捨棄 | 放棄 |
   | feedback | 意見回饋 | 反饋 |
   | privacy policy | 隱私權政策 | 隱私政策 |
   | Screen Time | 螢幕使用時間 | 屏幕使用時間 |

3. **Full-width punctuation**, with 「」 as quote marks: 「{title}」, 「設定」>「Apple帳號」>「訂閱項目」.
4. **Ellipsis is "⋯"** (U+22EF, midline), which Apple TW uses ("我正在聆聽⋯" [AL]). This departs from the brief's "…" on purpose to match iOS in Taiwan. Swap for "…" if one glyph across locales is preferred.
5. **No spaces between Chinese and Latin text or digits:** Apple TW writes "Apple帳號" (7 exact hits vs 0 with a space [AL]).
6. **Week = 週** (每週, 週一), not 周.
7. **AM/PM = 上午/下午**, placed before the time (needs Intl, as in zh-Hans).
8. **No AI provider names.**

## (b) Apple iOS terms

| English | zh-Hant (TW) | Source |
|---|---|---|
| Reminders (app) | 提醒事項 | [AL] |
| Alarm | 鬧鐘 | [AL] ClockAngel |
| Snooze | 稍後提醒 | [AL] |
| Stop | 停止 | [AL] |
| Later | 稍後 | [AL] Setup BUTTON_LATER |
| Not Now | 稍後再說 | [AL] NOT_NOW (200 hits) |
| Settings | 設定 | [AL] |
| Delete | 刪除 | [AL] |
| Done | 完成 | [AL] |
| Allow / Don't Allow | 允許 / 不允許 | [AL] |
| Subscriptions | 訂閱項目 | [AL] AppleAccountIntents "Subscriptions" |
| Restore Purchases | 恢復購買項目 | [inf] |
| Free Trial | 免費試用 | [AL] StoreKit |
| Every day | 每天 | [AL] |
| Weekdays | 平日 | [AL] |
| slide to stop | 滑動來停止 | [AL] ClockAngel SLIDE_TO_STOP |
| Listening… | 正在聆聽⋯ | [AL] partial ("我正在聆聽⋯") |
| Apple Account | Apple帳號 | [AL] |

Verified 17 of 18; Restore Purchases is inferred.

## (c) Remi glossary

- reminder: 提醒 (counter 則, the TW counter for notices/messages)
- recording: 錄音; record again: 重新錄製
- alarm: 鬧鐘; spoken line: 播報內容; heads-up: 提前提醒
- active reminders: 進行中的提醒; interval: 間隔; window: 時段
- Free / Pro: 免費版 / Pro; plan: 方案
- feedback: 意見回饋; transcribe: 轉寫

## (d) Plurals and the paywall

- All plural blocks are other-only. `paywall.term.*` uses `=1` (月/週/年/天) so "每{term}" reads 每月, and "{price}/{term}" reads NT$90/月. With count > 1: 每3個月.
- **Legal block:** 自動續訂的訂閱項目, 確認購買後，費用將從你的Apple帳號扣款, 除非你在目前週期結束前至少24小時關閉自動續訂, and 「設定」>「Apple帳號」>「訂閱項目」. This is the standard TW App Store disclosure wording. Meaning is unchanged.
- `paywall.caption.commitment` = 沒有綁約，可隨時取消 (綁約 is the everyday TW word for a contract lock-in).

## (e) Uncertain strings

- `tabs.days` = 日程: same call as zh-Hans; confirm.
- `paywall.card.monthly/annual` = 月方案/年方案 (card kickers). 每月/每年 would clash with the "billed" line beneath them.
- Ellipsis choice "⋯" (see a4).
- `language.name.nb` = 巴克摩挪威文 is the CLDR/Apple TW form. It's correct but unfamiliar; 挪威文 alone may be friendlier.

## (f) Overflow

None. Every capped key is shorter than English. The narrow weekdays are one glyph each.
