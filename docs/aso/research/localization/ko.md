# Korean (ko) localization research: Remi

Researched 2026-10-08. Research only; nothing was created in App Store Connect. Every quote below comes from a page that was actually fetched or returned in search excerpts. URLs are listed under Sources. Gaps are listed at the end.

## 1. Top picks

| Field | Limit | Top pick | Chars | Why |
|---|---|---|---|---|
| Subscription group display name | not published (see 4.1) | **Remi 프로** | 7 | Korean apps keep the brand and write the tier in Korean: 알라미 sells "알라미 프로". Short enough for the Manage Subscriptions screen. |
| Subscription display name (monthly) | 30 | **프로 월간** | 5 | Local listings label the period in Korean: "월간 멤버십", "연간 멤버십". Two plans both named "프로" can't be told apart in the purchase sheet. |
| Subscription display name (annual) | 30 | **프로 연간** | 5 | Same reason. |
| Subscription description (both) | 45 | **리마인더 무제한 + 간격 반복 알림 (예: 2시간마다)** | 30 | "무제한" and "간격 반복" are the words a Korean competitor already uses for these exact features ("알림 무제한", "간격 반복 일정"). The example makes "interval" concrete. |
| Subtitle (later app update) | 30 | **말하는 알람 · 음성 리마인더** | 16 | 말하는 알람 is the category name in KR store titles (Sleeply's KR title, 말하는 알람 시계, 말하는 목소리 알람). Puts both search phrases in an indexed field. |
| Keyword field (later app update) | 100 (bytes or chars, see 4.3) | see 5.4, set A | 82 | Pills, appointments, bills and birthdays in the words people type, plus "깜빡" and "무음". |

Character counts include spaces and punctuation; each Hangul syllable counts as 1.

## 2. Vocabulary, with evidence

### 2.1 알람 vs 알림 vs 리마인더 vs 미리 알림

- **알람** means the ringing alarm (Clock app). Apple KR: "iPhone에서 알람을 설정하고 변경하는 방법" and the Clock app's "'알람' 탭".
- **알림** means a notification or alert, and loosely any reminder. A Korean PM on Threads: 알람 is an urgent warning sound, 알림 (notification) is a general information message, and IT uses "알림" more. In everyday use people write "약먹기 알람" and "복약 알림" for the same thing (Clien thread; Naver blog title "약 먹는 시간 알림 어플, 약 복용 알람 앱").
- **미리 알림** is Apple's Reminders app: "iPhone, iPad 또는 iPod touch에서 미리 알림 사용하기", "'+ 새로운 미리 알림'". Users write it without the space. Clien: "기본엡 미리알림에 등록해놓고 먹으면 체크해서 없애는 방식", "그냥 미리알림에 매일,알림시간,반복 이렇게 해놓는게 젤 편하더군요".
- **리마인더** is the loanword indie apps use in titles: "리마인더 - 할 일 위젯 & 알림", "말하는 목소리 알람 - 주부, 학생, 직장인 리마인더", "Due - 리마인더 + 타이머", "음성 리마인더 알람 시계". Review: "정말 많은 리마인더류 앱 깔고 지우고 반복해봤는데".
- **알리미** means "notifier" and is a friendly suffix: "반복 알림이 앱은 이런 반복적인 일을 잊지 않게 도와주는 알리미 앱" (blog quoting the listing); subtitle "시간 알리미 · 집중 타이머 · 음성 알람".

**What wins for Remi:** use **알람** for the ringing (Remi rings like an alarm, which is the point), **리마인더** for the thing you create, and **미리 알림** only as a keyword, because it's Apple's name and what iPhone users already know. **알림** alone is ambiguous with push notifications. That matters because Remi's pitch is that it is *not* just a notification.

Competitive note: Apple KR says iOS 26.2 lets you mark a Reminder as urgent ("긴급"), which sets an alarm that "기기가 무음이거나 집중 모드가 켜져 있어도 활성화됩니다". So "무음에서도 울림" alone no longer sets Remi apart from the built-in app. The voice saying *what for* still does.

### 2.2 "Talking alarm" / voice reminder

- **말하는 알람**: Sleeply's KR title is "말하는 알람" (our report.md). App Store KR titles: "말하는 알람 시계 - 음성안내", "말하는 목소리 알람", "말하는 시계: 정각 알림".
- **음성 알람 / 음성 리마인더 / 음성 알림**: "음성 리마인더 알람 시계", subtitle "내 목소리로 알림"; "울리기 원하는 시간에 음성 알람을 등록해요".
- **목소리 알람**: "말하는 목소리 알람"; "목소리로 깨워주는 알람을 찾고 있나요?".

### 2.3 "It tells me what the alarm is for" (the #1 praise)

People use the verbs **말해주다** (tells) and **읽어주다** (reads out):
- 「알람을 맞춰둔 이유도 말해주니 아주 좋습니다」 (Google Play, Sentry; report.md)
- 「시간은 말하고 메모내용은 왜 안읽어주는지…」 (Google Play complaint; report.md)
- 「알람을 시간과 내용을 읽어줘서 좋은데」 (App Store KR review, 말하는 목소리 알람)
- 「지금 울리는 알람이 무엇을 Remind 하려는지를 내 목소리로 녹음해 놓으면 아주 빠른 대응을 하는데 도움이 됩니다」 (App Store KR review, title "이 알람의 목적")
- 「메모후 음성지원기능 체크하면 알람을 끌때 메모를 읽어주어서 내가 어떤일을 지금 해야하는지 한번더 인식시켜주는 느낌이라 좋습니다」 (review quoted on a Tistory roundup)
- Feature names in listings: "메모 읽어주기", "알람에 메시지를 추가하면 메시지를 읽어줘요".

Copy implication: "**무엇 때문에 울리는지 말해주는 알람**" and "**할 일을 말해주는 알람**" echo how users praise this. "메모를 읽어주는" is the feature-label version.

### 2.4 Forgetting

- **깜빡하다 / 깜빡깜빡**: "깜빡해서 약 챙겨먹는걸 잊어버린 경험", "나이 들어서 깜빡깜빡하는 경우" (Naver blog); "약 먹는 것 자체를 깜박할 수도 있고요" (Naver blog).
- **까먹다** (casual): "왠만하면 안까먹어요" (Clien); "약 먹는걸 까먹을 수가 없겠죠?" (Naver blog).
- **잊다 / 잊어버리다** (neutral, fits store copy): "잊지 않고 챙기는 것도 건강관리" (news headline); "할 일을 잊지 않도록 도와드립니다" (리마인더 app).
- **놓치다** (to miss): Galarm KR subtitle "어떤 것도 놓치지 마세요!"; complaint "중요한 알람을 연속으로 두번을 놓침".
- **챙기다** (to remember to take care of something): "꾸준히 챙겨먹어야 하는 약"; "중요한 일을 챙기세요". This is the natural verb for pills and for parents ("부모님 챙기기").
- **헷갈리다**: "약을 먹었는지 안먹었는데 헷갈릴때가 너무 많아서요" (Clien).

### 2.5 Snooze, to-do, theme words

- Snooze: iOS UI says **다시 알림**, explained as "알람이 울릴 때 이를 잠시 미루는 기능" (extrememanual). Users also say **스누즈** ("스누즈 버튼만 누르고 다시 잠드는").
- To-do: **할 일** ("할 일 위젯", "할 일 목록"). Apple: "가장 중요한 해야 할 일 목록".
- Pills: **약 알림 / 복약 알림 / 약 먹을 시간**. Take app notification: "약 먹을 시간이에요!" Listing title "Medicine Time - 약 먹는 알림".
- Appointments: **병원 예약** ("약 복용 시간, 병원 예약, 건강 측정값을 기록하는").
- Bills: Galarm KR "매월 1일 집세 납부". The usual Korean words for utility bills are 공과금 / 관리비; I found no fetched source with them in reminder context, so they're unverified.
- Interval: "**간격 반복**" ("매일, 매주, 간격 반복 일정"); "일정시간 간격으로 반복해서 해야 할 일".

## 3. Register

- **Descriptions use 해요체** (friendly polite): "알람에 메시지를 추가하면 메시지를 읽어줘요", "쉽게 알람을 등록할 수 있어요" (말하는 목소리 알람); "확실히 깨워드려요" (알라미); "더 부드럽고 믿음직해졌어요" (음성 리마인더 알람 시계).
- **합니다체 for definitions, legal and billing**: "'말하는 목소리 알람'은 … 앱입니다"; 알라미's auto-renew text: "결제는 애플 ID 계정에 청구됩니다 … 자동으로 갱신됩니다".
- **Titles and subtitles are noun phrases**, with no verb ending: "무조건 깨워주는 알람 시계", "미션을 완료할 때까지 절대 안꺼지는 지옥의 알람 앱", "시간 알리미 · 집중 타이머 · 음성 알람". A middle dot ( · ) is the common separator.
- **반말 only inside quoted voice lines**: "\"약 먹었어?\", \"스트레칭할 시간이야\", \"엄마한테 전화해\"" (음성 리마인더 알람 시계). Good model for showing what Remi says out loud in screenshots.
- Recommendation for Remi: noun-phrase subtitle, 해요체 description, 합니다체 for the subscription legal block.

## 4. Subscription conventions

### 4.1 Apple limits (verified)

- In-App Purchase display name: "at least two characters and no more than 30 characters". Description: "must be no more than 45 characters" (Apple, In-App Purchase information).
- Auto-renewable subscription display name and group display name: Apple's subscription reference page defines them (no control characters, markup, emoji or special characters) but **states no character limit** for the group display name. I found no Apple page that gives one. Keep it short. The 30/45 limits apply to the subscription display name and description, which use the same localization form.
- App name 30, subtitle 30 (Apple, App information).
- Keywords: "up to 100 bytes of content", "each greater than two characters" (Apple, Platform version information). See 4.3.

### 4.2 How KR listings phrase tiers and terms

- **Pro / Premium**: 알라미 sells "알라미 프로 ￦7,900", "알라미 프리미엄 스탠다드 ￦6,900", "알라미 프로 라이트 ￦33,000". 음성 리마인더 알람 시계 (KO description): "프리미엄(주간 구독 또는 평생 이용권)". Both 프로 and 프리미엄 are normal; keep 프로 to match the brand.
- **Monthly / annual**: "월간 멤버십 ￦2,200", "연간 멤버십 ₩9,900", "평생 멤버십 ￦12,000" (리마인더 app, Korean developer). Galarm leaves its IAPs in English ("Monthly Premium Subscription").
- **Unlimited**: "알림 무제한", "• 알림 무제한" (KO description); App Store KR also shows "Full Version: Unlimited Reminders" untranslated in some listings.
- **Free trial**: "무료 체험 7일로 모두 경험해보실 수 있어요" (알라미, as quoted on a Tistory roundup). Apple KR support uses "체험 구독" and "체험 기간이 종료되기 최소 24시간 전에 구독을 취소합니다". Store CTA style: "지금 무료로 사용해 보세요!".
- **Free plan**: "무료 플랜: • 음성 알림 2개 …".
- **Price context** (not asked, but relevant): Korean indie reminder apps charge ₩2,200/month and ₩9,900/year. 알라미, the category leader, charges ₩5,900 to ₩8,500. Remi's $6.99/month sits at the top of that range.

### 4.3 Keyword field: bytes or characters?

Apple's own help page says "100 bytes". Korean ASO guides (AppTweak KO) say "키워드 필드는 100자로 제한". In UTF-8 a Hangul syllable is 3 bytes, so a strict byte limit would allow only about 33 syllables. This is **unresolved**. The App Store Connect field counter will settle it on the first paste. Set A below is 82 characters. Set B is a fallback of about 33 bytes-safe characters. Apple's "each greater than two characters" rule would also rule out 2-syllable words like 할일 if it were applied per character; from practice, 2-syllable Korean keywords are accepted, but this is not verified. KR practice: separate with commas, no spaces after commas.

## 5. Drafts

### 5.1 Subscription group display name

| # | Text | Chars | Note |
|---|---|---|---|
| **A (pick)** | Remi 프로 | 7 | Same pattern as "알라미 프로"; the Latin brand matches the App Store icon/name |
| B | Remi Pro | 8 | No change; fine, but reads as untranslated |
| C | 레미 프로 | 5 | Only if the app name is also written 레미 in KR; otherwise inconsistent |

### 5.2 Subscription display names (≤30)

| # | Monthly | Annual | Chars | Note |
|---|---|---|---|---|
| **A (pick)** | 프로 월간 | 프로 연간 | 5 / 5 | Period visible in the purchase sheet; mirrors "월간/연간 멤버십" |
| B | 월간 멤버십 | 연간 멤버십 | 6 / 6 | Most local-sounding, but drops the Pro brand |
| C | 프로 | 프로 | 2 / 2 | Matches English exactly; the two plans look identical |

### 5.3 Subscription description (≤45)

| # | Text | Chars | Note |
|---|---|---|---|
| **A (pick)** | 리마인더 무제한 + 간격 반복 알림 (예: 2시간마다) | 30 | Uses the terms competitors already use; the example explains "interval" |
| B | 리마인더 개수 제한 없이, 시간 간격 반복 알림까지 | 27 | Softer, more spoken |
| C | 활성 리마인더 무제한 + 간격 반복 알림 | 22 | Closest to the English "active"; 활성 is a bit technical |

The English "active" nuance (no limit on how many are live at once) is lost in A/B; "무제한" is what Korean listings use ("알림 무제한").

### 5.4 Subtitle candidates (≤30, for a later app update)

| # | Text | Chars | Note |
|---|---|---|---|
| **A (pick)** | 말하는 알람 · 음성 리마인더 | 16 | Two search phrases, category convention |
| B | 할 일을 말해주는 알람 | 12 | Echoes the top praise ("이유도 말해주니"); better for conversion than for search |
| C | 무엇 때문에 울리는지 말해주는 알람 | 18 | Most literal "tells you what it's for" |
| D | 약·병원·공과금, 말로 알려주는 알람 | 19 | Screenshot themes up front; 공과금 is unverified in sources |

### 5.5 Keyword field (no spaces, commas only; avoid words already in name/subtitle)

Assumes subtitle A, so 말하는, 알람, 음성, 리마인더 are left out.

- **Set A (82 chars)**: `미리알림,할일,약알림,복약알림,병원예약,공과금,생일,깜빡,건망증,까먹,무음,반복알림,간격알림,목소리,메모,일정,알리미,약먹기,부모님,TTS`
- **Set B (bytes-safe fallback, about 33 syllables)**: `미리알림,약알림,병원예약,깜빡,반복,무음,할일,생일`

Do not add other app names (Apple forbids it). Never add a provider name.

## 6. Sources (all fetched or returned with excerpts on 2026-10-08)

- Our review mining: `C:\Dev\VR\docs\aso\competitors\talking-alarm\report.md` (Korean quotes, Sleeply KR title "말하는 알람")
- Apple, In-App Purchase information (30 / 45 limits): https://developer.apple.com/help/app-store-connect/reference/in-app-purchases-and-subscriptions/in-app-purchase-information/
- Apple, Auto-renewable subscription information (group display name rules, no limit stated): https://developer.apple.com/help/app-store-connect/reference/in-app-purchases-and-subscriptions/auto-renewable-subscription-information/
- Apple, App information (name/subtitle 30): https://developer.apple.com/help/app-store-connect/reference/app-information
- Apple, Platform version information (keywords 100 bytes): https://developer.apple.com/help/app-store-connect/reference/app-information/platform-version-information
- Apple KR, 미리 알림 사용하기 (incl. iOS 26.2 긴급): https://support.apple.com/ko-kr/102484
- Apple KR, 알람 설정: https://support.apple.com/ko-kr/118444
- Apple KR, 구독 취소 (체험 구독): https://support.apple.com/ko-kr/118428
- App Store KR, 말하는 목소리 알람: https://apps.apple.com/kr/app/%EB%A7%90%ED%95%98%EB%8A%94-%EB%AA%A9%EC%86%8C%EB%A6%AC-%EC%95%8C%EB%9E%8C-%EC%A3%BC%EB%B6%80-%ED%95%99%EC%83%9D-%EC%A7%81%EC%9E%A5%EC%9D%B8-%EB%A6%AC%EB%A7%88%EC%9D%B8%EB%8D%94/id6445911723
- App Store (KO), 음성 리마인더 알람 시계: https://apps.apple.com/us/app/%EC%9D%8C%EC%84%B1-%EB%A6%AC%EB%A7%88%EC%9D%B8%EB%8D%94-%EC%95%8C%EB%9E%8C-%EC%8B%9C%EA%B3%84/id6763273012?l=ko
- App Store KR, 리마인더 - 할 일 위젯 & 알림: https://apps.apple.com/kr/app/%EB%A6%AC%EB%A7%88%EC%9D%B8%EB%8D%94-%ED%95%A0-%EC%9D%BC-%EC%9C%84%EC%A0%AF-%EC%95%8C%EB%A6%BC/id6444939279
- App Store KR, Reminder with Voice Reminders (review "이 알람의 목적"): https://apps.apple.com/kr/app/reminder-with-voice-reminders/id469454389
- App Store KR, 알라미: https://apps.apple.com/kr/app/%EC%95%8C%EB%9D%BC%EB%AF%B8-%EB%AC%B4%EC%A1%B0%EA%B1%B4-%EA%B9%A8%EC%9B%8C%EC%A3%BC%EB%8A%94-%EC%95%8C%EB%9E%8C-%EC%8B%9C%EA%B3%84/id1163786766
- App Store KR, Galarm - 알람 및 미리 알림: https://apps.apple.com/kr/app/galarm-%EC%95%8C%EB%9E%8C-%EB%B0%8F-%EB%AF%B8%EB%A6%AC-%EC%95%8C%EB%A6%BC/id1187849174
- App Store KR, 말하는 시계 (id6739522220): https://apps.apple.com/kr/app/id6739522220
- Clien, 약먹기 앱 추천: https://www.clien.net/service/board/cm_iphonien/16051695
- Naver blog, 약 복용 알람 앱 (테이크 vs 태양이): https://m.blog.naver.com/jeje2005/222627687913
- Naver blog, 복약 알림 앱 추천: https://m.blog.naver.com/bonamy/223552006665
- Naver blog, 메디알람 후기: https://m.blog.naver.com/farbemaria/220904167892
- 브라보마이라이프 (news), 건강앱: https://m.bravo.etoday.co.kr/view/atc_view.php?varAtcId=19317
- Tistory, 알람 어플 추천 TOP 11 (메모 읽어주기, 무료 체험 7일, 반복알림이): https://mockingwalking.tistory.com/126
- Tistory, 무료 vs 유료 알람 앱 (스누즈): https://appslog.tistory.com/entry/%EB%AC%B4%EB%A3%8C-vs-%EC%9C%A0%EB%A3%8C-%EC%95%8C%EB%9E%8C-%EC%95%B1-%EC%96%B4%EB%94%94%EA%B9%8C%EC%A7%80-%EC%8D%A8%EB%B4%A4%EB%8B%88-%E2%8F%B0%F0%9F%93%B1
- extrememanual, 아이폰 '다시 알림': https://extrememanual.net/51906
- Threads, 알람과 알림 차이: https://www.threads.com/@pm_anyway/post/DB6q5d7y63Y?hl=ko
- AppTweak KO, iOS ASO checklist (100자): https://www.apptweak.com/ko/aso-blog/app-store-optimization-aso-checklist-for-ios?format=md

## 7. Gaps and caveats

- **Not reached:** DC Inside, theqoo, Ruliweb, Reddit r/korea and Naver 지식iN. A theqoo-style search returned nothing relevant, and the Parallel Search MCP hit its free-tier rate limit mid-run. Community evidence comes from Clien, Naver blogs and Tistory only.
- **No search-volume data.** "Which word people type" is inferred from titles and reviews, not measured. Check Apple Search Ads keyword popularity for 말하는 알람, 음성 알람, 리마인더, 미리알림, 약알림 before locking the keywords.
- **Unresolved limits:** the subscription group display name limit is unpublished, and the keyword field may count bytes or characters (4.3).
- 공과금 / 관리비 (bills) are standard Korean but didn't appear in a fetched reminder context.
- A native speaker should read the final strings before submission.
