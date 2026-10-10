# ru (Russian) in-app UI: translator notes for Remi (2026-10-10)

Catalog: `ru.json` (426 keys, same order as `strings-en.json`). Built by script with `json.dump(ensure_ascii=False, indent=2)`. Validator: `[ru] PASS: 426 keys (en 426), 0 errors, 16 warnings`. All 16 warnings are expected: 12 are false "'Remi' missing" hits (the English has "Reminder", which contains "Remi"), 4 are pure-placeholder strings identical to English.

Source tags:
- **[AL]**: applelocalization.com API, iOS 26.7.1, locale `ru` (Apple's own system strings), queried 2026-10-10 by English source text.
- **[AS-RU]**: support.apple.com/ru-ru/118428 (cancel a subscription).
- **[J]**: my call, no direct source.

---

## 1. Style sheet

1. **Register: formal "Вы", capitalized (Вы, Вас, Вам, Ваш).** iOS system strings do this throughout: "отправку Вам уведомлений", "Ваш iPhone ожидает…", "сколько времени Вы проводите за экраном" [AL]. Apple's support site has moved to lowercase "вы" ("нажмите свое имя", "вам придется") [AS-RU], but the brief says to follow iOS, so the app uses capital Вы. If the team prefers the modern lowercase "вы" used by most Russian apps, change it with one find-and-replace (Вы/Вас/Вам/Ваш/Вашей/Вашу → lowercase; check sentence starts).
2. **Buttons, menu items and toggles use the infinitive:** Отложить, Остановить, Удалить, Разрешить, Не разрешать, Повторить, Открыть Настройки [AL]. So: Отменить, Удалить, Записать снова, Выбрать время, Восстановить покупки.
3. **Instructions and hints use the Вы-imperative:** "Коснитесь, чтобы…" (Apple's verb for tap on iOS is "коснуться": "коснитесь значка и удерживайте его" [AL]), "Выберите хотя бы один день", "Проверьте подключение".
4. **Errors:** "Не удалось + infinitive" for failed actions, "Нет связи с…" for connectivity, "Повторите попытку" for "try again". Short, blame-free. Apple's own retry button is "Повторить" [AL].
5. **Sentence case** everywhere, as Apple does. Weekdays and months are lowercase. The two English ALL-CAPS strings (COMPLETE, CANCEL/DONE in the repeat modal) stay upper-case by design.
6. **Quotes: «ёлочки».** Used for `{quote}`, `{title}` and iOS UI names in instructions («Настройки», «Подписки»).
7. **No "ё".** Apple's Russian UI writes "е" (учетную, сохраненные, ее) [AL]. The catalog follows that: еще, ее, истек, расчетный, все.
8. **Gender:**
   - The user: with formal Вы, past-tense verbs and short adjectives are plural and gender-neutral (Вы отправили, Вы уверены), so nothing in the catalog marks the user's gender. "Добро пожаловать" is neutral too.
   - Remi: treated as masculine (a male name, like "Реми"): "Remi услышал", "Remi мог напоминать", "Remi будет открыт". If the team wants Remi genderless, rephrase those 3 strings (`pending.heard`, `permission.subtitle`, `feedback.toast.queued.message`).
   - Remi's first-person questions avoid gendered past tense: "Когда Вам напомнить?", "Не удалось разобрать" (not "Не расслышал").
9. **Brand names untouched:** Remi, Remi Pro, Pro, App Store, iPhone, Аккаунт Apple. Info.plist strings say "Remi" (the English AlarmKit text says "VoiceReminder"; Russian uses "Remi", as briefed).
10. **No provider names.** AI is "сервисы ИИ" / "сторонние сервисы ИИ".
11. **Device:** "iPhone" in instructions (as Apple does); "устройство" where the English says "device".

## 2. Apple terms (verified vs inferred)

| English | Russian | Status / source |
|---|---|---|
| Reminders | Напоминания | verified [AL] RemindersUICore ("Все напоминания") |
| Alarm | Будильник | verified [AL] MobileTimer `ALARM_DEFAULT_TITLE` |
| Snooze | Отложить | verified [AL] SpringBoard `ALARM_SNOOZE`, ClockAngel |
| Stop | Остановить (button), Стоп (short) | verified [AL] SpringBoard `ALARM_STOP`, ClockAngel `stop.button` |
| Later | Позже | verified [AL] SpringBoard `DATA_PLAN_LATER` |
| Settings | Настройки | verified [AL] SpringBoard (`Открыть Настройки`) |
| Delete | Удалить | verified [AL] RemindersUICore |
| Done | Готово | verified [AL] RemindersUICore |
| Allow / Don't Allow | Разрешить / Не разрешать | verified [AL] UserNotificationsServer `PERMISSION_ALERT_ALLOW/DENY` |
| Not Now | Не сейчас | verified [AL] SpringBoard |
| Notifications | Уведомления | verified [AL] Preferences |
| Subscription | Подписка | verified [AL] StoreKit SwiftUI |
| Restore Purchases | Восстановить покупки | **inferred**: Apple's own labels are "Восстановить отсутствующие покупки" / "Восстановить подписку" [AL]; the short form is the third-party convention [J] |
| Free Trial | Бесплатный пробный период; CTA "Попробовать бесплатно"; "%@ бесплатно, затем %@/%@" | verified [AL] StoreKit `MODE_FREE`, `ACTION_FREE_TRIAL`, `SUBSCRIPTION_PRICE_…_FREE_TRIAL_THEN` |
| Auto-renew wording | "Подписка будет продлеваться автоматически за %@/%@, пока не будет отменена." | verified [AL] StoreKit |
| Privacy Policy | Политика конфиденциальности | verified [AL] StoreKit `PRIVACY_POLICY_LABEL` |
| Terms of Use | Условия использования | **inferred**: Apple's StoreKit label is "Условия предоставления сервиса" (Terms of Service); "Условия использования" is the usual name of an app's Terms of Use [J] |
| Every day | Каждый день | verified [AL] MobileTimer `ALARM_EVERY_DAY`, ReminderKit `Daily` |
| Weekdays | Будние дни | verified [AL] MobileTimer `ALARM_WEEKDAYS` (catalog uses the shorter "Будни" in one paywall row) |
| Weekends | Выходные | verified [AL] (not used in the catalog) |
| Weekly | Каждую неделю / По неделям | verified [AL] ReminderKit |
| slide to stop | смахнуть и остановить | verified [AL] ClockAngel `SLIDE_TO_STOP` (not in the catalog; for reference) |
| Listening… | Слушаю… | verified [AL] MusicRecognition `RECOGNIZE_MUSIC_LISTENING_VIEW`; Siri uses "я слушаю…" |
| Apple Account | Аккаунт Apple | verified [AL] Preferences |
| Settings > [name] > Subscriptions | «Настройки» > [Ваше имя] > «Подписки» | verified [AS-RU] "В настройках нажмите свое имя. Нажмите «Подписки»." |
| Silent mode | бесшумный режим | verified [AL] SpringBoard `RINGER_SILENT` |
| Screen Time | Экранное время | verified [AL] ScreenTimeSettingsUI |
| Time Sensitive | Неотложные | verified [AL] (not used in the catalog) |
| Try again (button) | Повторить | verified [AL] SpringBoard |

## 3. Glossary (Remi-specific)

| English | Russian | Note |
|---|---|---|
| reminder | напоминание (n.) | |
| alarm (AlarmKit ring) | будильник (m.) | Apple's word. "Сигнал" was considered for "ring" (`reminders.next.none` uses "сигнал") |
| ring / rings | звонит / сигнал | |
| heads-up | Заранее (row), "За 10 мин" (value) | |
| spoken line | "Что скажет Remi" | label rephrased; literal "Произносимая фраза" is stiff |
| voice note | голосовая заметка | |
| Upgrade / Get Pro | Купить Pro (button), Перейти на Pro (title/hint) | "Улучшить" reads odd in Russian |
| Unlimited | Без лимита / безлимитные | |
| plan (pricing) | тариф | |
| Free (table column) | БЕСПЛ. | abbreviation to fit the ~6-char column |
| Best value | ВЫГОДНЕЕ | |
| feedback | отзыв / отзывы | |
| Every {duration} | Раз в {duration} | "Каждые 1 ч" is ungrammatical; "раз в" takes any duration |
| Interval | Интервал | |
| Between (window) | Период | |

## 4. Grammar decisions

- **Plurals:** every plural block has `one`, `few`, `many`, `other` (CLDR ru). `other` is the fractional form (genitive singular). Where English uses a word without a number at 1 ("Every day", "month"), the catalog uses an explicit `=1 {…}` *in addition* to `one`, because Russian `one` also covers 21, 31, 101… ("Каждый 21 день"). Applies to `time.every.*`, `schedule.everyNDays`, `paywall.term.*`.
- **`take.multiCreated`:** English has only `other`; Russian has all four categories.
- **`take.partial.title`:** "Создано {created} из {total…}": after "из" the noun is genitive (из 1 напоминания, из 3/5 напоминаний).
- **`paywall.term.*` forms are ACCUSATIVE** (неделю, not неделя), because every place that uses `{term}` puts it after "за" or "раз в": "Оплата раз в {term}", "Подписаться: {price} за {term}", "{product} стоит {price} за {term}". If a dev reuses `{term}` after another preposition or in the nominative, it breaks for weeks.
- **`paywall.trial.*`** are nominative ("7 дней"), used as "{length} бесплатно" (Apple's StoreKit pattern).
- **Language names (`language.name.*`) are in the PREPOSITIONAL case, lowercase** ("арабском", "иврите", "хинди"), because both sentences that use them are built "на {language}": "Слушаю на {language}" and "Remi пока не говорит на {language}". `pending.thisLanguage` = "этом языке" to match. **Do not reuse these keys anywhere that needs a standalone language name** (a picker, a list): it would show "арабском". The Settings voice-language button `settings.voiceLanguage.en` is the separate nominative "Английский".
- **Weekdays:** short = CLDR ru `пн вт ср чт пт сб вс` (lowercase, no period); narrow = `П В С Ч П С В`. Russia starts the week on Monday, which matches the app's hard-coded Monday start. `reminders.pattern.everyDays` = "По дням: {days}" because "Каждый" would have to agree with each weekday's gender (каждый пн / каждую ср).
- **Clock:** Russia uses the 24-hour clock. `time.clock.am/pm` and `times.picker.am/pm` are "AM"/"PM" (CLDR ru); they should only appear if the user forces 12-hour time. Prefer `Intl.DateTimeFormat('ru')`.

## 5. Paywall legal block

Built from Apple's StoreKit Russian ("Подписка будет продлеваться автоматически…, пока не будет отменена") and the wording Russian App Store subscription apps use ("Оплата списывается с Вашего Аккаунта Apple при подтверждении покупки… если автопродление не отключено как минимум за 24 часа до окончания текущего периода"). Every element of the English is kept: price and term, charge at confirmation, auto-renew at the same price, charge within 24 h before renewal, the 24-h opt-out window, where to manage or cancel.

- The English path "Settings > Apple Account > Subscriptions" is rendered as Apple's own Russian path, «Настройки» > [Ваше имя] > «Подписки» [AS-RU]. On iOS the top Settings row shows the user's name (subtitle "Аккаунт Apple, iCloud и другое" [AL]), so that is what the user taps. Same path in `settings.alert.manageFailed.message`.
- "Отмена в любой момент" in `paywall.caption.commitment` is a noun phrase, so it works without a gendered verb.
- `paywall.error.alreadyOwned` quotes «Восстановить покупку», which matches `paywall.restore` exactly, as the inventory requires.

## 6. Length / overflow risks (check on the smallest iPhone)

| key | limit | ru | note |
|---|---|---|---|
| `tabs.reminders` | ~10 | Напоминания (11) | Apple's own app name; can't be shortened. Allow the tab label to shrink |
| `paywall.cta.subscribe` | ~24 | "Подписаться: 299 ₽ за месяц" (~27 rendered) | same rendered length as the English; with "3 месяца" ~29. Fallback "{price} за {term}" |
| `paywall.cta.trial` | ~24 | "{length} бесплатно" → "7 дней бесплатно" (16) | the verb is dropped to fit. Fuller "Попробовать {length} бесплатно" = 28 rendered; use it if the button can take 2 lines |
| `paywall.hero.default.line2` | ~12 | "реже, помните" (13) | 1 over. Hero reads "Забывайте / реже, помните / вовремя." |
| `paywall.noTrial` | card line | "(Без пробного периода)" (22 vs 10) | likely wraps on the plan card |
| `paywall.table.col.free` | ~6 | БЕСПЛ. (6) | at the limit |
| `today.header.getPro`, `recording.gate.upgrade` | ~10 | Купить Pro (10) | at the limit |
| `repeat.mode.everyNDays` | ~12 | Раз в N дней (12) | at the limit |
| `quickChoice.thisEvening` | ~16 | Сегодня вечером (15) | OK |
| `layout.toast.alarmsMayNotFire.title` | toast | Будильники могут не сработать (29 vs 19) | toast title may wrap |
| `notificationsOff.title` | toast | 44 chars vs 38 | may wrap to 2 lines |
| `recording.status.upgradeToContinue` | status line | "Перейдите на Pro, чтобы продолжить" (34 vs 19) | status line allows 2 lines |
| `settings.row.notifications.subtitle` | row subtitle | 61 vs 47 | wraps to 2 lines |
| `paywall.table.row.*` | feature rows | +20–40% | rows should wrap |
| `alarm.button.later/done` | ~8 | Позже (5) / Готово (6) | fit |

General: Russian runs about 15–30% longer than English in sentences and up to 2x in short labels. Words are long and can't break mid-word without hyphenation, so give labels room to shrink or wrap.

## 7. Uncertain strings (review with a native speaker)

- `time.dueNow` = "Пора" ("it's time"): idiomatic for a just-passed reminder; literal "Наступило время" is stiff.
- `time.nextIn.*` = "Через …" (drops "Next"): row subtitle; "Следующее через 3 ч" felt heavy.
- `reminders.pattern.everyDays` = "По дням: пн, чт": alternatives "пн, чт" alone, or "По пн, чт".
- `times.between` = "Период": the label sits left of the start/end pills; "С … до …" can't be split around pills.
- `edit.spokenLine.label` = "Что скажет Remi": a rephrase, not literal.
- `repeat.mode.date` = "В дату" (chip "On a date"): short but slightly terse; "Один раз" is an alternative if the chip means a one-off.
- `paywall.card.monthly/annual` = "Месяц" / "Год" as plan-card kickers (vs "Ежемесячно"/"Ежегодно").
- `paywall.hero.*`: Russian marketing lines, re-cut across 3 lines rather than translated line for line.
- `diagnostics.status.provisional` = "Временно": Apple's term for provisional authorization in Russian wasn't found in the API; "Временное" or "Без звука" are possible.
- `composer.status.reading` = "Читаю…": Remi's first-person progress (matches "Слушаю…").
- The Вы-vs-вы capitalization choice (see style sheet rule 1).
