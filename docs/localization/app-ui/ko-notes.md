# Korean (ko) in-app UI notes: Remi (2026-10-10)

Companion to `ko.json` (426 keys, same order as `strings-en.json`). Vocabulary follows `docs/aso/research/localization/ko.md` (리마인더 for what you create, 알람 for the ringing, 미리 알림 only as Apple's app name).

## (a) Mini style sheet

**Register**
- **Sentences, hints, toasts, errors: 해요체** (friendly polite), as Apple KR system UI and Korean indie apps do: "리마인더를 만들지 못했어요.", "응답할 때까지 계속 울려요".
- **Requests to the user:** "…해 주세요" for polite asks ("다시 시도해 주세요."), and "…하세요" for short imperative hints ("탭하여 다시 시도하세요"). Apple KR uses "탭하여 …" for tap instructions.
- **Remi's own voice** (ask card): honorific to the user, "언제 알려 드릴까요?".
- **Legal/billing and Info.plist permission prompts: 합니다체** ("…청구됩니다", "…녹음합니다"). This matches Korean subscription disclosures (알라미: "결제는 … 청구됩니다 … 자동으로 갱신됩니다").
- **Buttons, tabs, row labels, chips and statuses: bare nouns or noun phrases**, with no verb ending: 완료, 취소, 삭제, 다시 녹음, 시간 선택, 구입 항목 복원, 전송 대기 중, 생성됨. Status forms use …됨 / … 중.
- **No 반말** anywhere in the UI.
- **No second-person pronoun.** Korean drops it, so 당신 never appears.

**Brand**
- "Remi" and "Remi Pro" stay in Latin letters, and "Pro" stays Latin when it stands alone (Pro 받기, Pro로 업그레이드).
- The paywall column head stays "PRO" to match the design. The research suggested "Remi 프로" for the ASC group name only. That's a store field, not this file.

**Particles after placeholders**
- Korean particles change with the final consonant (은/는, 이/가, 을/를). Where a placeholder comes before a particle, I rewrote the string so the noun ends in a known sound:
  - "{language} 음성을"
  - "‘{title}’ 리마인더를"
  - "{product} 구독이"
- Three strings use the standard fallback form 은(는): `pending.askPastTime`, `pending.detail.pastTime` and `paywall.legal.disclosure.generic`.

**Punctuation**
- Half-width , . ? ! with no space before them, and a normal space after.
- Ellipsis is "…" (U+2026), including where the English source used "...".
- The em dash in English error cards became a period plus a new clause. Korean UI rarely uses "—".
- Curly quotes:
  - “ ” around the heard transcript.
  - ‘ ’ around a title or a button name. This is Apple KR's own style ("‘다시 알림’으로"), and it also avoids ICU apostrophe quoting.
- The middle dot " · " is kept as the separator.

**Numbers and time**
- Counters are attached with no space: 5분, 2시간, 3일, 2개, 1개월, 1년.
- Durations: "1시간 30분".
- Intervals use the suffix 마다: "2시간마다".
- Relative times use 후 / 전: "15분 후", "10분 전".
- 오전/오후 go **before** the time in Korean ("오전 8:00"). `time.clock.am/pm` is appended after the time by `formatClockTime`, so it needs Intl (`ko-KR` gives "오전 8:00"), as the inventory already recommends.
- Weekdays are single syllables: 월 화 수 목 금 토 일. The short and narrow forms are identical.
- The week starts on Sunday in Korea (product call; the app hard-codes Monday).
- Prices come from StoreKit as "₩9,900". The suffix forms are "/월" and "/년".

## (b) Apple iOS terms (Korean)

Source: applelocalization.com API, iOS 26.7.1 strings, locale `ko`, queried 2026-10-10. Each query looks like `https://applelocalization.com/api/ios/26/search?q=<term>&locale=ko`. Two API calls covered all 16 terms.

| English | ko | Status |
|---|---|---|
| Reminders (app) | 미리 알림 | [verified: applelocalization.com, Reminders.app CFBundleDisplayName] |
| Alarm | 알람 | [verified: applelocalization.com, ClockAngel.app "Alarm"] |
| Snooze | 다시 알림 | [verified: applelocalization.com, ClockAngel.app "Snooze", SpringBoard ALARM_SNOOZE] |
| Stop | 중단 | [verified: applelocalization.com, ClockAngel.app "stop.button"] |
| Later | 나중에 | [verified: applelocalization.com, "나중에 설정" / Not Now pattern; standalone "Later" button = 나중에 is common iOS usage, so partly inferred] |
| Settings | 설정 | [verified: applelocalization.com, CarPlaySettings CONTROL_SETTINGS / Settings app] |
| Delete | 삭제 | [verified: applelocalization.com, "DELETE"→삭제] |
| Done | 완료 | [verified: applelocalization.com, AccessorySetupUI "Done"→완료] |
| Allow / Don't Allow | 허용 / 허용 안 함 | [verified: applelocalization.com, FamilyControls ALLOW, SafetyMonitor "Don’t Allow"] |
| Subscription(s) | 구독 | [verified: applelocalization.com, SupportFlow PURCHASES_SUBSCRIPTION_ISSUE_TITLE; Apple KR support 118428 path "설정 > [사용자 이름] > 구독"] |
| Restore Purchases | 구입 항목 복원 | [inferred: StoreKit has "유실된 구입 항목 복원" (RESTORE_PURCHASES_LABEL); the short form drops 유실된] |
| Free Trial | 무료 체험 | [verified: applelocalization.com, StoreKit ACTION_FREE_TRIAL / INTRO_PRICE_OFFER_FREE_TRIAL] |
| Every day | 매일 | [verified: applelocalization.com, MapKit "Every Day"→매일] |
| Weekdays | 주중 | [verified: applelocalization.com, MobileTimer ALARM_WEEKDAYS→주중] |
| Slide to stop | 밀어서 중단 | [verified: applelocalization.com, ClockAngel SLIDE_TO_STOP] |
| Listening… | 듣는 중… | [verified: applelocalization.com, MusicRecognition / ShazamKit] |
| Notifications | 알림 | [verified: applelocalization.com, Preferences "Notifications"] |
| Apple Account | Apple 계정 | [verified: applelocalization.com, Preferences "Apple Account"] |
| Screen Time | 스크린 타임 | [verified: applelocalization.com, Preferences "Screen Time"] |
| Auto-renewable subscription | 자동 갱신형 구독 | [verified: applelocalization.com, StoreKit AUTO_RENEWABLE] |
| Try Again | 다시 시도 | [verified: applelocalization.com, AccessorySetupUI "Try Again"] |
| Privacy Policy / Terms of Use | 개인정보 처리방침 / 이용 약관 | [inferred: standard KR App Store wording, not queried] |
| Silent mode | 무음 모드 | [inferred: not queried] |

Tally: 19 verified (Later only partly), 4 inferred.

## (c) Remi glossary

| English | ko | Note |
|---|---|---|
| reminder | 리마인더 | Per ko.md: Remi's object. Not 미리 알림 (Apple's app), and not 알림 (that means push notification). |
| Reminders (tab/header) | 리마인더 | |
| alarm / rings | 알람 / 울려요 | |
| notification(s) | 알림 | Apple term |
| recording / take | 녹음 | "failed take" = 실패한 녹음 |
| spoken line | 음성 문구 | The text the alarm says out loud |
| voice note | 음성 메모 | Same as Apple's Voice Memos app name. See (d). |
| heads-up (pre-alert) | 사전 알림 | |
| Later (alarm button) | 나중에 | Snooze-like action. Apple's word is 다시 알림, but English says Later. |
| Done (alarm button) | 완료 | |
| Repeat | 반복 | |
| Every N days | N일마다 | |
| interval | 간격 | Mode chip and the label next to the stepper |
| window ("Between") | 시간 범위 | The quiet-outside window |
| Weekly | 매주 | |
| Pro | Pro | Kept Latin |
| Free (plan / column) | 무료 / 무료 플랜 | |
| Unlimited | 무제한 | |
| active reminders | 활성 리마인더 | |
| Upgrade | 업그레이드 | |
| plan (pricing) | 요금제 | |
| Monthly / Annual | 월간 / 연간 | |
| Billed monthly / yearly | 매월 청구 / 매년 청구 | |
| trial | 무료 체험 | |
| Restore purchase(s) | 구입 항목 복원 | `paywall.error.alreadyOwned` quotes it as ‘구입 항목 복원’, matching `paywall.restore` |
| feedback | 피드백 | "Your feedback" = 내 피드백 |
| transcribe | 받아쓰기 | |

## (d) Uncertain strings, overflow, open items

**Uncertain**
- `paywall.card.badge` "최고 혜택": the "BEST VALUE" equivalent. "가성비 최고" is more colloquial. 할인 is avoided because it would claim a discount.
- `paywall.cta.subscribe` "{price}/{term} 구독하기":
  - {term} renders "1개월" at count 1, which gives "₩9,900/1개월 구독하기". That reads stiffly; "₩9,900/월" is nicer.
  - It would read better if the code passed `termShort` here, or if `paywall.term.*` had an `=1` branch (e.g. `=1 {월}`). That's a code/catalog-shape decision, so it's left open.
  - The same affects `paywall.legal.disclosure.priced` ("1개월마다"). That one is fine in legal text.
- `paywall.hero.*` lines: Korean word order forces a re-split across the three lines.
  - default = "덜 잊고," / "제때" / "기억하세요."
  - interval = "끝날 때까지" / "계속" / "알려 줘요."
  - These are creative choices.
- `edit.row.voiceNote` 음성 메모 is identical to Apple's Voice Memos app name. Alternative: 음성 미리 듣기 if that confuses.
- `edit.row.times` and `edit.row.time` are both 시간 (Korean has no plural). Fine unless both labels show at once.
- `tabs.days` "날짜별" (by date). 일별 or 캘린더 are alternatives.
- `notification.preAlert.body` was reordered to "{count}분 후 {subject}" ("15분 후 엄마에게 전화"). The fallback subject is 리마인더.
- `recording.listeningIn` "듣는 언어: {language}": restructured to avoid the (으)로 particle.
- `diagnostics.status.provisional` 임시 허용: Apple's Korean for provisional authorization wasn't checked.
- `today.timeDraft.confirm` "리마인더 설정": the English "Remind me" has no clean button equivalent.
- `take.created.action` "잘못됐나요?" (Not right?).

**Overflow** (a Hangul syllable is about 1.7–2x the width of a Latin letter)

| key | en | ko | limit | risk |
|---|---|---|---|---|
| `recording.gate.upgrade` | Upgrade (7) | 업그레이드 (5 syl ≈ 9–10 Latin) | ~10 | borderline |
| `today.timeDraft.confirm` | Remind me (9) | 리마인더 설정 (6 syl + space ≈ 12) | ~14 | low |
| `today.header.getPro` | Get Pro (7) | Pro 받기 (≈ 7–8) | ~10 | low |
| `paywall.card.badge` | BEST VALUE (10) | 최고 혜택 (≈ 8) | ~12 | low |
| `paywall.cta.trial` | Start 7 day free trial (~22) | 7일 무료 체험 시작 (≈ 18) | ~24 | low |
| `quickChoice.*`, `alarm.button.*`, `composer.speak`, `aiConsent.*`, `permission.enable(d)` | | 2–5 syllables | | none |

**Open**
- The Settings path in `settings.alert.manageFailed.message` and the legal disclosures is written "설정 › Apple 계정 › 구독", mirroring the English. On a Korean device the middle row shows the user's name; Apple KR support writes "설정 > [사용자 이름] > 구독".
- `infoPlist.NSAlarmKitUsageDescription` uses "Remi" (the English source says "VoiceReminder") and "iPhone이 무음 모드일 때에도" for "phone is silenced".
- Validator (`validate_asia.py`) reports 11 false positives:
  - Its "Remi kept" check matches "Remi" as a substring, so it fires on Reminder/Remind keys.
  - All 10 keys with a standalone "Remi" do keep it in ko.json.
  - No other validator errors.
- A native Korean speaker should read the file before shipping. That matters most for the hero lines and the legal block.
