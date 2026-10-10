# Vietnamese (vi) UI translation: independent review

Reviewer pass on `vi.json` against `strings-en.json` and `strings-inventory.md`. I back-translated every string to English myself and compared it with the source before reading the translator's notes. 44 strings changed. Validator: PASS (430 keys, 0 errors; the warnings are "Remi" inside "Reminder", and strings that match English on purpose).

## Verdict: **SHIP**

Natural Vietnamese with Apple's terms (Cài đặt, Tài khoản Apple, Thời gian sử dụng, SA/CH). The fixes: 'ngày thường' (working days), language names capitalised as if standalone even though they go into sentences, a literal word order in Remi's question, and a few incomplete upgrade phrases.

## Changes

| key | before | after | back-translation | why |
|---|---|---|---|---|
| `paywall.table.row.schedules` | Ngày thường, ngày cụ thể, cách vài ngày | Thứ trong tuần, ngày cụ thể, cách vài ngày | Days of the week, specific dates, every few days | 'Weekdays' here means days of the week the user picks (Weekly mode), not Monday-Friday working days ('ngày thường' = working days) |
| `repeat.section.repeatOn` | Lặp lại vào | Lặp lại vào các thứ | Repeat on the weekdays | Label sits above the weekday chips; old text was a stiff/dangling preposition ('Lặp lại vào' ended on a preposition) |
| `pending.ask` | Khi nào tôi nên nhắc bạn? | Tôi nên nhắc bạn lúc nào? | When should I remind you? | More natural word order; keeps Remi's 'I' |
| `pending.askPastTime` | Hôm nay đã qua {time}. Khi nào tôi nên nhắc bạn? | Hôm nay đã qua {time}. Tôi nên nhắc bạn lúc nào? | {time} has already passed today. When should I remind you? | Same question as pending.ask, kept consistent |
| `pending.detail.noTime` | Khi nào tôi nên nhắc bạn? Chạm để ghi âm lại kèm thời gian | Tôi nên nhắc bạn lúc nào? Chạm để ghi âm lại kèm thời gian | When should I remind you? Tap to record again with a time | Same |
| `pending.detail.pastTime` | Hôm nay đã qua {time}. Khi nào tôi nên nhắc bạn? Chạm để ghi âm lại. | Hôm nay đã qua {time}. Tôi nên nhắc bạn lúc nào? Chạm để ghi âm lại. | {time} has already passed today. When should I remind you? Tap to record again. | Same |
| `gate.limit.status` | {limit, plural, other {Bạn đã đạt giới hạn # lời nhắc đang hoạt động. Nâng cấp để không giới hạn.}} | {limit, plural, other {Bạn đã đạt giới hạn # lời nhắc đang hoạt động. Nâng cấp để dùng không giới hạn.}} | You've reached the limit of # active reminders. Upgrade to use without limits. | 'để không giới hạn' was incomplete |
| `gate.limit.toastMessage` | Chạm để nâng cấp, không giới hạn. | Chạm để nâng cấp và dùng không giới hạn. | Tap to upgrade and use without limits. | Old comma splice read as two fragments |
| `paywall.cta.unavailable` | Chưa có gói nào | Hiện không có gói | No plans available right now | 'Chưa có gói nào' ('no plans yet') suggested plans never existed |
| `language.name.ar` | Tiếng Ả Rập | tiếng Ả Rập | (same name, lower-case) | Plain form for insertion mid-sentence ('Đang nghe bằng tiếng Anh', 'Remi chưa hỗ trợ tiếng Anh'); Vietnamese writes 'tiếng' lower-case in running text |
| `language.name.bn` | Tiếng Bangla | tiếng Bangla | (same name, lower-case) | Plain form for insertion mid-sentence ('Đang nghe bằng tiếng Anh', 'Remi chưa hỗ trợ tiếng Anh'); Vietnamese writes 'tiếng' lower-case in running text |
| `language.name.cs` | Tiếng Séc | tiếng Séc | (same name, lower-case) | Plain form for insertion mid-sentence ('Đang nghe bằng tiếng Anh', 'Remi chưa hỗ trợ tiếng Anh'); Vietnamese writes 'tiếng' lower-case in running text |
| `language.name.da` | Tiếng Đan Mạch | tiếng Đan Mạch | (same name, lower-case) | Plain form for insertion mid-sentence ('Đang nghe bằng tiếng Anh', 'Remi chưa hỗ trợ tiếng Anh'); Vietnamese writes 'tiếng' lower-case in running text |
| `language.name.de` | Tiếng Đức | tiếng Đức | (same name, lower-case) | Plain form for insertion mid-sentence ('Đang nghe bằng tiếng Anh', 'Remi chưa hỗ trợ tiếng Anh'); Vietnamese writes 'tiếng' lower-case in running text |
| `language.name.el` | Tiếng Hy Lạp | tiếng Hy Lạp | (same name, lower-case) | Plain form for insertion mid-sentence ('Đang nghe bằng tiếng Anh', 'Remi chưa hỗ trợ tiếng Anh'); Vietnamese writes 'tiếng' lower-case in running text |
| `language.name.en` | Tiếng Anh | tiếng Anh | (same name, lower-case) | Plain form for insertion mid-sentence ('Đang nghe bằng tiếng Anh', 'Remi chưa hỗ trợ tiếng Anh'); Vietnamese writes 'tiếng' lower-case in running text |
| `language.name.es` | Tiếng Tây Ban Nha | tiếng Tây Ban Nha | (same name, lower-case) | Plain form for insertion mid-sentence ('Đang nghe bằng tiếng Anh', 'Remi chưa hỗ trợ tiếng Anh'); Vietnamese writes 'tiếng' lower-case in running text |
| `language.name.fa` | Tiếng Ba Tư | tiếng Ba Tư | (same name, lower-case) | Plain form for insertion mid-sentence ('Đang nghe bằng tiếng Anh', 'Remi chưa hỗ trợ tiếng Anh'); Vietnamese writes 'tiếng' lower-case in running text |
| `language.name.fi` | Tiếng Phần Lan | tiếng Phần Lan | (same name, lower-case) | Plain form for insertion mid-sentence ('Đang nghe bằng tiếng Anh', 'Remi chưa hỗ trợ tiếng Anh'); Vietnamese writes 'tiếng' lower-case in running text |
| `language.name.fr` | Tiếng Pháp | tiếng Pháp | (same name, lower-case) | Plain form for insertion mid-sentence ('Đang nghe bằng tiếng Anh', 'Remi chưa hỗ trợ tiếng Anh'); Vietnamese writes 'tiếng' lower-case in running text |
| `language.name.he` | Tiếng Do Thái | tiếng Do Thái | (same name, lower-case) | Plain form for insertion mid-sentence ('Đang nghe bằng tiếng Anh', 'Remi chưa hỗ trợ tiếng Anh'); Vietnamese writes 'tiếng' lower-case in running text |
| `language.name.hi` | Tiếng Hindi | tiếng Hindi | (same name, lower-case) | Plain form for insertion mid-sentence ('Đang nghe bằng tiếng Anh', 'Remi chưa hỗ trợ tiếng Anh'); Vietnamese writes 'tiếng' lower-case in running text |
| `language.name.hu` | Tiếng Hungary | tiếng Hungary | (same name, lower-case) | Plain form for insertion mid-sentence ('Đang nghe bằng tiếng Anh', 'Remi chưa hỗ trợ tiếng Anh'); Vietnamese writes 'tiếng' lower-case in running text |
| `language.name.id` | Tiếng Indonesia | tiếng Indonesia | (same name, lower-case) | Plain form for insertion mid-sentence ('Đang nghe bằng tiếng Anh', 'Remi chưa hỗ trợ tiếng Anh'); Vietnamese writes 'tiếng' lower-case in running text |
| `language.name.it` | Tiếng Ý | tiếng Ý | (same name, lower-case) | Plain form for insertion mid-sentence ('Đang nghe bằng tiếng Anh', 'Remi chưa hỗ trợ tiếng Anh'); Vietnamese writes 'tiếng' lower-case in running text |
| `language.name.ja` | Tiếng Nhật | tiếng Nhật | (same name, lower-case) | Plain form for insertion mid-sentence ('Đang nghe bằng tiếng Anh', 'Remi chưa hỗ trợ tiếng Anh'); Vietnamese writes 'tiếng' lower-case in running text |
| `language.name.ko` | Tiếng Hàn | tiếng Hàn | (same name, lower-case) | Plain form for insertion mid-sentence ('Đang nghe bằng tiếng Anh', 'Remi chưa hỗ trợ tiếng Anh'); Vietnamese writes 'tiếng' lower-case in running text |
| `language.name.ms` | Tiếng Mã Lai | tiếng Mã Lai | (same name, lower-case) | Plain form for insertion mid-sentence ('Đang nghe bằng tiếng Anh', 'Remi chưa hỗ trợ tiếng Anh'); Vietnamese writes 'tiếng' lower-case in running text |
| `language.name.nb` | Tiếng Na Uy (Bokmål) | tiếng Na Uy (Bokmål) | (same name, lower-case) | Plain form for insertion mid-sentence ('Đang nghe bằng tiếng Anh', 'Remi chưa hỗ trợ tiếng Anh'); Vietnamese writes 'tiếng' lower-case in running text |
| `language.name.nl` | Tiếng Hà Lan | tiếng Hà Lan | (same name, lower-case) | Plain form for insertion mid-sentence ('Đang nghe bằng tiếng Anh', 'Remi chưa hỗ trợ tiếng Anh'); Vietnamese writes 'tiếng' lower-case in running text |
| `language.name.no` | Tiếng Na Uy | tiếng Na Uy | (same name, lower-case) | Plain form for insertion mid-sentence ('Đang nghe bằng tiếng Anh', 'Remi chưa hỗ trợ tiếng Anh'); Vietnamese writes 'tiếng' lower-case in running text |
| `language.name.pl` | Tiếng Ba Lan | tiếng Ba Lan | (same name, lower-case) | Plain form for insertion mid-sentence ('Đang nghe bằng tiếng Anh', 'Remi chưa hỗ trợ tiếng Anh'); Vietnamese writes 'tiếng' lower-case in running text |
| `language.name.pt` | Tiếng Bồ Đào Nha | tiếng Bồ Đào Nha | (same name, lower-case) | Plain form for insertion mid-sentence ('Đang nghe bằng tiếng Anh', 'Remi chưa hỗ trợ tiếng Anh'); Vietnamese writes 'tiếng' lower-case in running text |
| `language.name.ro` | Tiếng Romania | tiếng Romania | (same name, lower-case) | Plain form for insertion mid-sentence ('Đang nghe bằng tiếng Anh', 'Remi chưa hỗ trợ tiếng Anh'); Vietnamese writes 'tiếng' lower-case in running text |
| `language.name.ru` | Tiếng Nga | tiếng Nga | (same name, lower-case) | Plain form for insertion mid-sentence ('Đang nghe bằng tiếng Anh', 'Remi chưa hỗ trợ tiếng Anh'); Vietnamese writes 'tiếng' lower-case in running text |
| `language.name.sv` | Tiếng Thụy Điển | tiếng Thụy Điển | (same name, lower-case) | Plain form for insertion mid-sentence ('Đang nghe bằng tiếng Anh', 'Remi chưa hỗ trợ tiếng Anh'); Vietnamese writes 'tiếng' lower-case in running text |
| `language.name.sw` | Tiếng Swahili | tiếng Swahili | (same name, lower-case) | Plain form for insertion mid-sentence ('Đang nghe bằng tiếng Anh', 'Remi chưa hỗ trợ tiếng Anh'); Vietnamese writes 'tiếng' lower-case in running text |
| `language.name.th` | Tiếng Thái | tiếng Thái | (same name, lower-case) | Plain form for insertion mid-sentence ('Đang nghe bằng tiếng Anh', 'Remi chưa hỗ trợ tiếng Anh'); Vietnamese writes 'tiếng' lower-case in running text |
| `language.name.tl` | Tiếng Tagalog | tiếng Tagalog | (same name, lower-case) | Plain form for insertion mid-sentence ('Đang nghe bằng tiếng Anh', 'Remi chưa hỗ trợ tiếng Anh'); Vietnamese writes 'tiếng' lower-case in running text |
| `language.name.tr` | Tiếng Thổ Nhĩ Kỳ | tiếng Thổ Nhĩ Kỳ | (same name, lower-case) | Plain form for insertion mid-sentence ('Đang nghe bằng tiếng Anh', 'Remi chưa hỗ trợ tiếng Anh'); Vietnamese writes 'tiếng' lower-case in running text |
| `language.name.uk` | Tiếng Ukraina | tiếng Ukraina | (same name, lower-case) | Plain form for insertion mid-sentence ('Đang nghe bằng tiếng Anh', 'Remi chưa hỗ trợ tiếng Anh'); Vietnamese writes 'tiếng' lower-case in running text |
| `language.name.ur` | Tiếng Urdu | tiếng Urdu | (same name, lower-case) | Plain form for insertion mid-sentence ('Đang nghe bằng tiếng Anh', 'Remi chưa hỗ trợ tiếng Anh'); Vietnamese writes 'tiếng' lower-case in running text |
| `language.name.vi` | Tiếng Việt | tiếng Việt | (same name, lower-case) | Plain form for insertion mid-sentence ('Đang nghe bằng tiếng Anh', 'Remi chưa hỗ trợ tiếng Anh'); Vietnamese writes 'tiếng' lower-case in running text |
| `language.name.zh` | Tiếng Trung | tiếng Trung | (same name, lower-case) | Plain form for insertion mid-sentence ('Đang nghe bằng tiếng Anh', 'Remi chưa hỗ trợ tiếng Anh'); Vietnamese writes 'tiếng' lower-case in running text |

## Orchestrator rules

- **Weekdays:** `paywall.table.row.schedules` ngày thường -> Thứ trong tuần. `repeat.section.repeatOn` -> Lặp lại vào các thứ. `schedule.pickDays` (Chọn ngày trong tuần) was already right.
- **Language names:** all 35 `language.name.*` are now lower-case 'tiếng X', so 'Đang nghe bằng tiếng Anh' and 'Remi chưa hỗ trợ tiếng Anh' are correct. `settings.voiceLanguage.en` stays 'Tiếng Anh' because it is a standalone option label.
- **Everyday words:** lời nhắc, báo thức, thông báo. No change needed.
- **Remi as "I":** pending.* now ask 'Tôi nên nhắc bạn lúc nào?' (first person, natural word order).
- **Brand / providers / legal:** "Remi" and {product} are left untranslated. No AI provider is named. Both disclosures keep the auto-renewal, the charge to the Apple Account at confirmation, the renewal charge within 24 hours, the opt-out at least 24 hours before the period ends, and the path to Subscriptions.

## Length and open notes

- No string is over its inventory limit.
