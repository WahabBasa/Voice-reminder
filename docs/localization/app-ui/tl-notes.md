# Filipino (tl) UI translation notes: Remi (2026-10-10)

File: `docs/localization/app-ui/tl.json` (426 keys, same order as `strings-en.json`). Validator: `[tl] PASS: 426 keys (en 426), 0 errors, 45 warnings`.

## 1. Mini style sheet

**Apple doesn't localize iOS into Filipino. [verified]** The applelocalization.com catalog for iOS 26.7.1 lists every system locale, and there's no `fil` or `tl` among them. A search for `locale=fil` returns 0 rows. This has two consequences:

- There are no Apple Filipino terms to copy. The house standard here is **Google's Filipino UI** (Android, Google Play, Google Account help). It's the most widely seen Filipino software localization and the closest thing to a norm.
- **A Filipino user's iPhone runs in English** (or another language). So every iOS Settings path stays in **English**: "Settings > Apple Account > Subscriptions", "Screen Time", "App Store". Translating those would send users looking for labels that don't exist on their phone.

**Register [inferred from Google usage]**
- Address the user with neutral-informal *ka / mo / iyo*, and **no "po"**. That's how Google's Filipino UI talks ("I-tap ang…", "Puwede mong…").
- Taglish verb forms are the norm for tech actions: I-tap, I-delete, I-save, I-on, I-play, I-restore, Mag-subscribe, Mag-upgrade, ma-verify, na-update.
- Sentence case. For screen and section names Google uses plural "Mga …" with a capital (Mga Setting, Mga Notification, Mga Pahintulot), and I follow that.
- **Buttons** use the imperative/infinitive verb form: Kanselahin, I-delete, Payagan, Ipadala, I-restore. Hints use the same imperative ("I-tap para…").
- **Remi is a person:** "si Remi / ni Remi / kay Remi" throughout, including the Info.plist prompts.

**Terms**

| English | Filipino used | Status |
|---|---|---|
| Reminders | Mga Paalala (header) / Paalala (tab) | inferred (Google Keep/Calendar "paalala") |
| Alarm | Alarm (loanword), Mga Alarm | inferred (common app usage) |
| Snooze | I-snooze (not used in this catalog) | inferred |
| Stop | Ihinto | inferred (Google pattern) |
| Later | Mamaya | inferred |
| Settings (Remi screen) | Mga Setting | verified (Google Android help "app na Mga Setting") |
| Settings (iOS app) | Settings (English) | iOS has no Filipino UI (verified above) |
| Delete | I-delete | inferred (Google "na-delete") |
| Done | Tapos na | inferred |
| Cancel | Kanselahin | verified (Google Play "I-tap ang Kanselahin ang subscription") |
| Allow / Don't Allow | Payagan / Huwag payagan | verified (Google Android permissions help, fil) |
| Not now | Hindi ngayon | inferred |
| Subscription | subscription (loanword) | verified (Google Play fil "Magkansela ng subscription", "Mag-subscribe Ulit") |
| billed / charged | sinisingil / sisingilin | verified (Google Play fil "sisingilin ka sa simula ng bawat yugto ng pagsingil") |
| billing period | yugto ng pagsingil | verified (same page) |
| Manage | Pamahalaan | verified (Google Play fil "Pamahalaan ang iyong mga subscription") |
| Restore Purchases | I-restore ang mga binili | inferred |
| Free Trial | libreng trial | inferred (common PH app/marketing usage) |
| Every day | Araw-araw | inferred (standard) |
| Weekdays | Weekdays (loanword) | inferred. Not in this catalog except the paywall row |
| slide to stop | i-slide para ihinto | inferred. Not in this catalog |
| Listening… | Nakikinig… | inferred |
| Privacy Policy | Patakaran sa Privacy | verified (Google footer, fil) |
| Terms of Use | Mga Tuntunin ng Paggamit | inferred. Google uses "Mga Tuntunin ng Serbisyo" |
| Send feedback | Magpadala ng feedback | verified (Google help footer, fil) |
| Notifications / Permissions / Microphone | Mga Notification / Mga Pahintulot / Mikropono | verified (Google Android permissions help, fil) |
| General | Pangkalahatan | verified (Google help "Pangkalahatang karanasan") |

**Formats**
- AM/PM: CLDR `fil` uses "AM" / "PM", so `time.clock.am/pm` are uppercase.
- Weekdays (CLDR fil): short Lin Lun Mar Miy Huw Biy Sab. Narrow L L M M H B S, so Sun and Mon are both "L", and Tue and Wed both "M". That's CLDR's own ambiguity; Intl output is preferred anyway.

**Plurals.** CLDR `fil` "one" is *not* singular: it covers i = 1, 2, 3, 5, 7, 8, 10… (every integer not ending in 4, 6 or 9). Filipino nouns don't inflect, so:
- Every `one` branch keeps `#` and is identical to `other`.
- Where English's `one` branch drops the number (`paywall.term.*`: "day" vs "# days"), I used an explicit `=1 {araw}` plus `one/other {# araw}`. Otherwise `count=2` would print "bawat araw".
- `time.every.*` and `schedule.everyNDays` also use `=1` for the natural "Bawat oras" / "Araw-araw".

## 2. Loanword choices (deliberate English, flagged "identical to English")

- **Error, Alarm, Feedback, Subscription, Interval, Voice note.** These are the forms Filipino users see in apps. The Tagalog alternatives (Mali, Pagitan, Puna) read stiff or ambiguous.
- **Language names.** CLDR `fil` itself keeps most names in English (Czech, Danish, Finnish, Dutch, Polish, Swedish, Thai, Urdu, Vietnamese, Hindi, Malay, Persian, Romanian, Ukrainian, Hungarian, Indonesian, Swahili, Bangla, Norwegian…). I translated only the names with an established Filipino form: Ingles, Espanyol, Pranses, Aleman, Italyano, Portuges, Ruso, Hapones, Koreano, Tsino, Arabe, Griyego, Hebreo, Turko.
- **Tagalog** stays "Tagalog" for `language.name.tl`, because it names the speech-recognition language. Some users would expect "Filipino". See uncertainties.
- **Pure-placeholder strings** (`{date} · {time}`, `{count} min`, `Remi v{version} ({build})`, `{kicker}, {price}…`) are identical by design.
- The validator's "'Remi' missing" warnings are false positives: it matches the "Remi" inside "Reminder".

## 3. Uncertain strings

- `pending.thatTime` = "oras na iyon" (lowercase). It's the fallback for `{time}` inside "Lumipas na ang {time} ngayong araw…", which gives "Lumipas na ang oras na iyon…". If it's ever shown standalone, it needs a capital.
- `pending.quickChoice.a11y` = "Ipaalala sa akin: {choice}". A colon join avoids the English lowercasing trick. Reads fine for VoiceOver.
- `time.ringsAgain` = "Tutunog ulit · {time}". I used a dot separator rather than a preposition, because "ng/sa/nang + time" depends on whether {time} is a clock time or relative text.
- `paywall.cta.trial` = "Simulan ang libreng {length}" (Start your free 7 days). This avoids the ligature problem ("7 araw na" vs "1 buwang"). `paywall.trialLabel` = "(Trial: {length})" for the same reason.
- `paywall.hero.default.*` = "Bawas-limot. / Maalala / sa oras." This is a creative rendering of "Forget less. Remember on time." A native copywriter should look at it.
- `today.header.getPro` = "Mag-Pro". Colloquial, chosen to fit ~10 chars. "Kunin ang Pro" (13) is more standard.
- `notificationsOff.message` says "Settings" in English, on the assumption that it means the iOS Settings app. If it means Remi's own screen, change it to "Mga Setting".
- `language.name.tl` "Tagalog" vs "Filipino".
- `edit.row.headsUp` = "Paunang abiso" (advance notice). Fine, but untested with users.

## 4. Length / overflow risks

| Key | Limit | Filipino | Chars |
|---|---|---|---|
| `quickChoice.in1Hour` | ~16 | Sa loob ng 1 oras | 17 (over by 1) |
| `paywall.cta.subscribe` | 1 line | Mag-subscribe sa {price} / {term} | ~30 with price; check |
| `paywall.cta.trial` | ~24 | Simulan ang libreng 7 araw | 26 (slightly over) |
| `times.addTime` | chip | + Magdagdag ng oras | 19, chip may wrap |
| `common.cancel` | ~10 | Kanselahin | 10 (at limit) |
| `repeat.mode.everyNDays` | ~12 | Kada N araw | 11, ok |
| `paywall.card.badge` | ~12 | PINAKASULIT | 11, ok |
| `paywall.hero.default.line1` | ~12 | Bawas-limot. | 12, ok |

- **Tabs** use the short forms "Paalala" (7), "Mga Araw" (8) and "Setting" (7) to stay within ~10. The headers use the full "Mga Paalala" / "Mga Setting".
- **Shortened to fit:** `composer.speak` = "Sabihin" (7, limit 8), `recording.gate.upgrade` = "I-upgrade" (9), `feedback.list.fromRemi` = "Mensahe ni Remi" (15), `repeat.mode.date` = "Sa petsa".
- **Paywall legal text** is about 25% longer than the English. It's small print, so no clipping risk, but check scroll height.

## 5. Paywall legal

Both disclosures carry every element of the English text: auto-renewing, charged to the Apple Account at purchase confirmation, renews at {price} every {term}, charged within 24 hours before each renewal unless auto-renew is turned off at least 24 hours before the current period ends, and manage/cancel anytime. Terms follow the Google Play fil wording (sisingilin, Pamahalaan, kanselahin). "nang hindi bababa sa 24 na oras" = "at least 24 hours". The iOS path stays in English.

## 6. No provider names

None anywhere. `aiConsent.body` and the mic prompt say "mga secure na (third-party) AI service". Both Info.plist strings say "Remi", not "VoiceReminder".

## Confidence: medium

The meaning is solid and the terms match Google's Filipino UI where I could verify them. With no Apple Filipino iOS to anchor against, the Taglish balance and the paywall hero copy still need a native reviewer.
