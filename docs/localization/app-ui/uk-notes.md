# uk (Ukrainian) in-app UI: notes (2026-10-10)

Translation of `strings-en.json` (426 keys) into `uk.json`. Built with the same approach as the pt-BR and es-MX style guides. Validator: `[uk] PASS: 426 keys (en 426), 0 errors, 16 warnings` (all 16 are false positives: "Remi" matched inside the English word "Reminder", and 5 placeholder-only joins like `{date} · {time}` that are rightly identical).

## 1. Mini style sheet

1. **Address the user as "ви" (lowercase), never "ти".** Apple's uk-UA iOS support copy uses ви throughout: "Відкрийте програму «Параметри»", "Торкніться [ваше ім’я]" [Apple 102484, 118428]. Lowercase "ви/ваш" as Apple writes it (no courtesy capital "Ви").
   - Bonus: ви takes plural past-tense forms ("ви досягли", "ви намагалися"), which carry no gender. Still, past tense addressed to the user is kept rare; "Ліміт: …" replaces "You've reached…".
2. **Buttons use the infinitive**, as iOS does: Скасувати, Видалити, Дозволити, Увімкнути, Надіслати, Відновити покупки. Exception: "Готово" (Apple's Done button, an adverb, verified).
3. **Instructions use the ви imperative**: "Торкніться, щоб…", "Перевірте з’єднання і спробуйте ще раз." Apple uses both "Торкніть" and "Торкніться"; I chose "Торкніться" everywhere.
4. **Progress states:** verbal nouns ("Надсилання…", "Відновлення…", "Обробка…"). Remi's own voice uses 1st person present ("Слухаю…", "Створюю нагадування…", "Читаю…").
5. **Remi is masculine** in agreement ("Remi почув", "Remi нагадував"). "Remi" and "Remi Pro" stay in Latin script and are not declined. Product name {product} is treated as feminine via "підписка" context ("{product} знову активна") — see uncertain list.
6. **Quotes «…», apostrophe ’ (U+2019)** — never ASCII `'`, which is an ICU quote character.
7. **App = "програма"** (Apple uk-UA: "програма «Нагадування»"), not "застосунок"/"додаток".
8. **No Russianisms**: Параметри (not "Настройки"), Видалити, вимкнути/увімкнути, з’єднання, сповіщення (not "уведомлення"), будильник, "щонайменше" (not "як мінімум"), "доки" (not "поки не" calques), "Щось пішло не так".
9. **Plurals**: every plural block has one/few/many/other; `other` (fractions) uses the genitive singular ("1,5 години"). Where English singular has no number (`paywall.term.*`) or Ukrainian has a better word for 1 (Щодня, Щогодини, Щохвилини), an extra `=1` case is added so 21/31 still get "# день".
10. **Case after numbers is solved by framing**: billing terms always follow "за" / "раз на" (accusative), so one set of forms works in CTA, disclosure and "Billed every": "за місяць / за 3 місяці / за 6 місяців", "раз на 2 тижні".
11. **No provider names.** "сервіси ШІ" only.

## 2. Apple terms (verified vs inferred)

Sources: [102484] https://support.apple.com/uk-ua/102484 (Reminders), [118444] https://support.apple.com/uk-ua/118444 (alarms), [118428] https://support.apple.com/uk-ua/118428 (cancel subscription), [iph2909] https://support.apple.com/uk-ua/guide/iphone/iph2909d3a74/ios (Clock alarm). All fetched 2026-10-10. applelocalization.com was not used.

| English | uk | Status |
|---|---|---|
| Reminders (app) | Нагадування | **verified** [102484] "програма «Нагадування»" |
| Alarm | Будильник (tab "Будильники") | **verified** [118444] |
| Snooze | Відкласти (setting "Відкладати", "На скільки відкладати") | **verified** [118444, iph2909] |
| Repeat | Повторення | **verified** [118444] |
| Settings | Параметри | **verified** [102484, 118428] |
| Delete | Видалити | **verified** [102484] "натисніть «Видалити»" |
| Done | Готово | **verified** [118444, iph2909] "кнопку «Готово»" |
| Subscriptions / Cancel Subscription | Підписки / Скасувати підписку | **verified** [118428] |
| Apple Account | обліковий запис Apple | **verified** [118428, 102484] |
| Free trial | пробний період; Apple writes "пробну підписку безкоштовно" | **verified** [118428] ("не менш як за 24 години до завершення пробного періоду") |
| Renew | поновлювати / поновлення | **verified** [118428] "не хочете її поновлювати" |
| Silent mode | режим тиші | **verified** [118444] |
| Stop | Зупинити | inferred (standard iOS uk; not seen on a fetched page) |
| Later | Пізніше | inferred |
| Allow / Don't Allow | Дозволити / Не дозволяти | inferred (iOS system prompt; not on a fetched page) |
| Restore Purchases | Відновити покупки | inferred (universal uk App Store wording) |
| Every day | Щодня | inferred (Clock repeat summary) |
| Weekdays | Будні (paywall row) | inferred; Clock summary may read "Робочі дні" |
| slide to stop | посуньте, щоб зупинити | inferred by analogy with Apple's classic "посуньте, щоб розблокувати"; iOS 26.1 string not found. Not used in the catalog. |
| Listening… | Слухаю… | inferred (Siri-style 1st person) |
| Screen Time | Екранний час | inferred |

Note on "безкоштовно" vs "безплатно": normative dictionaries prefer "безплатно/безоплатно", but Apple uk-UA uses "безкоштовно", so the catalog follows Apple.

## 3. Glossary (house terms)

| EN | uk |
|---|---|
| reminder | нагадування (n., same in nom. pl.; gen. pl. нагадувань) |
| alarm | будильник |
| recording / take | запис |
| heads-up (pre-alert) | попередження |
| spoken line | що скаже будильник |
| voice note | голосова нотатка |
| interval | інтервал |
| upgrade / Get Pro | перейти на Pro / Отримати Pro (pill) / Купити Pro (small button) |
| Free (plan) | безкоштовний план; column head БЕЗКОШТ. |
| Best value | НАЙВИГІДНІШЕ |
| Monthly / Annual (card) | Щомісяця / Щороку |
| feedback | відгук |
| Message from Remi | Повідомлення від Remi |
| Privacy Policy / Terms of Use | Політика конфіденційності / Умови використання |
| Restore purchase(s) | Відновити покупку / покупки |
| am / pm | дп / пп (CLDR uk) — uk normally uses 24-hour time; let Intl format it |
| weekdays short / narrow | Пн Вт Ср Чт Пт Сб Нд / П В С Ч П С Н (CLDR) |

## 4. Paywall legal block

Wording follows Apple's uk-UA cancellation page (поновлення, пробний період, "щонайменше за 24 години до завершення") and the standard App Store disclosure points. Path: "«Параметри» > [ваше ім’я] > «Підписки»" — matches Apple's own uk steps ("У меню «Параметри» натисніть своє ім’я → «Підписки»"), same choice as the pt-BR guide. English says "Settings > Apple Account > Subscriptions"; the row is labelled with the user's name on device. If a literal match is required, use "«Параметри» > «Обліковий запис Apple» > «Підписки»".

- generic: "{product} — це підписка з автоматичним поновленням. Оплата стягується з вашого облікового запису Apple після підтвердження покупки, а підписка поновлюється автоматично, доки ви її не скасуєте. …"
- priced: "{product} коштує {price} за {term}. … автоматично поновлюється з оплатою {price} за {term}, і кошти списуються … протягом 24 годин до кожного поновлення, якщо автоматичне поновлення не вимкнено щонайменше за 24 години до завершення поточного періоду. …"

## 5. Uncertain strings

- `recording.listeningIn` = "Слухаю. Говоріть {language}" and `pending.detail.unsupportedLanguage` = "Remi поки не розмовляє {language}". Both need the **instrumental adverb form** ("англійською"), so all 35 `language.name.*` are in that form ("арабською", "івритом", "норвезькою (букмол)"); indeclinable ones stay bare (гінді, урду, суахілі). If the code ever reuses `language.name.*` in a nominative slot (a list or picker), it will read wrong. `settings.voiceLanguage.en` is nominative ("Англійська") because it's a picker value.
- `{product}` agreement: "{product} знову активна" assumes the reader parses "Remi Pro" as the subscription (feminine). Neutral alternative: "Підписка {product} знову активна…".
- `time.ringsAgain` = "Повтор: {time}" — I don't know whether {time} arrives as "8:00" or "at 8:00"; the colon form works for both.
- `notification.preAlert.fallbackSubject` capitalised ("Ваше нагадування") because it opens the notification body; it is never mid-sentence.
- `reminders.pattern.everyDays` = "Щотижня: {days}" (e.g. "Щотижня: Пн, Чт") rather than "Кожен/кожну…", whose gender depends on the day.
- `schedule.everyDuration` / `intervalSubtitle` use "Інтервал: {duration}" because "кожні 2 год" vs "кожну 1 год" would need case agreement with an unknown duration.
- `diagnostics.status.provisional` = "Тимчасово" — Apple's uk term for provisional authorization not verified.
- `time.dueNow` = "Саме час" (idiomatic "it's time"); literal "Настав час" also works.

## 6. Length / overflow risks

| key | limit | uk | chars |
|---|---|---|---|
| `today.header.getPro` | ~10 | Отримати Pro | 12 (fallback "Купити Pro", 10) |
| `tabs.reminders` | ~10 | Нагадування | 11 (no shorter Apple-consistent word) |
| `feedback.list.fromRemi` | ~20 | Повідомлення від Remi | 21 (fallback "Від Remi", 8) |
| `paywall.card.badge` | ~12 | НАЙВИГІДНІШЕ | 12, upper-case Cyrillic is wide |
| `paywall.cta.trial` | ~24 | "Спробувати 7 днів безкоштовно" | 29 (fallback "{length} безкоштовно", 17) |
| `paywall.cta.subscribe` | one line | "Підписатися: 99,99 грн / 3 місяці" | ~33 |
| `paywall.table.col.free` | ~6 | БЕЗКОШТ. | 8 (narrow column) |
| `paywall.hero.*` lines | ~12 | "Забувайте менше." 16, "Повторюйте," 11, "доки не буде" 12 | serif display font, check wrap |
| `take.created.action` | ~12 | Щось не так? | 12 |
| `edit.row.repeat` | ~12 | Повторення | 10 |
| `quickChoice.thisEvening` | ~16 | Сьогодні ввечері | 16 |
| `recording.gate.upgrade` | ~10 | Купити Pro | 10 |
| `common.cancel` / `aiConsent.allow` / `feedback.sheet.send` | ~10 | Скасувати / Дозволити / Надіслати | 9 each |
| `alarm.button.later` | ~8 | Пізніше | 7 (OK) |

Ukrainian runs roughly 15-30% longer than English in sentences; error/toast bodies should wrap to 2-3 lines without trouble.
