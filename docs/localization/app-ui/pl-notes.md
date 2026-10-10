# pl (Polish) in-app UI: notes (2026-10-10)

Companion to `pl.json` (426 keys, same order as `strings-en.json`). Mirrors the approach of `pt-BR-style-guide.md` / `es-MX-style-guide.md`.

Source tags: **[Apple ✓]** = seen on an Apple pl-pl support page this session (URLs at the bottom). **[inferred]** = my call from iOS conventions, not confirmed on a page.

---

## 1. Mini style sheet

1. **Address: informal "Ty", 2nd person singular, as Apple's iOS does.** Apple PL writes "Stuknij", "Możesz…", "budzenia Cię", "Twoje imię i nazwisko" [Apple ✓]. Follow Apple and **capitalize the Ty-pronouns in UI copy**: Ty, Cię, Ci, Twój/Twoje. Never "Pan/Pani".
2. **Buttons use the imperative (2nd sg), as on iOS:** Anuluj, Usuń, Zachowaj, Edytuj, Gotowe, Anuluj subskrypcję [Apple ✓]. Toggles and settings use the imperfective imperative ("Pozwalaj", "Zmieniaj przyciskami") [Apple ✓]. Status labels and a11y labels use verbal nouns: "Przetwarzanie", "Odtwarzanie…", "Tworzenie przypomnienia".
3. **Remi's first-person lines use the present tense, so no gender shows:** "Słucham...", "Tworzę przypomnienie...", "Kiedy mam Ci przypomnieć?".
4. **Never use a gendered past tense for the user.** Use impersonal forms ("Osiągnięto limit…", "Utworzono…", "Nic jeszcze nie wysłano"), the present tense ("Co próbujesz zrobić?") or "Masz już…". Polish has no neutral 2nd-person past tense.
5. **Remi is grammatically masculine** ("Remi usłyszał", "Remi mógł", "Remi będzie otwarty", "{product} jest aktywny"). He is declined where Polish needs it: "od **Remiego**" (2 keys, see §3).
6. **Sentence case** for Remi's own strings. Weekdays and months are lowercase. Typographic quotes are „…”. Use a no-break space between a number and its unit ("15 min", "2 godz.").
7. **"Stuknij"** is Apple's verb for "tap" [Apple ✓]. Never "dotknij" or "kliknij".
8. **No provider names.** The copy says "usługi AI" / "usługi AI firm zewnętrznych" only.

### Apple terms

| EN | PL | Status |
|---|---|---|
| Reminders (app/list) | **Przypomnienia**; reminder = przypomnienie (n.) | [Apple ✓] support.apple.com/pl-pl/102484 |
| Alarm / Alarms tab | **Alarm / Alarmy** | [Apple ✓] /118444, iPhone guide iph2909d3a74 |
| Snooze | **Drzemka** (button "Drzemka", setting "Długość drzemki") | [Apple ✓] same pages. Remi has no Snooze key; its "Later" is not Snooze |
| Stop | **Zatrzymaj** | [inferred] (iOS alarm button; not on a fetched page) |
| Later | **Później** | [inferred] |
| Settings | **Ustawienia** (locative "w Ustawieniach") | [Apple ✓] |
| Delete | **Usuń** | [Apple ✓] |
| Done | **Gotowe** | [Apple ✓] ("Stuknij przycisk Gotowe") |
| Save | **Zachowaj** (Apple) / "Zapisz" also common | [Apple ✓] Zachowaj. Remi's EN has no Save key |
| Repeat (alarm row) | **Powtarzanie** / **Powtórz** | [Apple ✓] both appear |
| Today / Tomorrow | **Dziś / Jutro** | [Apple ✓] Reminders date chips |
| Mark done / Completed | **wykonane** | [Apple ✓] "Oznaczanie przypomnienia jako wykonane" |
| Allow / Don't Allow | **Pozwalaj / Nie pozwalaj** (settings) · dialog button **Pozwól** | toggles [Apple ✓] /102470, iph3ff83f3b1. Exact system-alert button "Pozwól" [inferred] |
| Subscription(s) | **subskrypcja / Subskrypcje** | [Apple ✓] /118428 |
| Cancel Subscription | **Anuluj subskrypcję** | [Apple ✓] |
| Settings path | **Ustawienia > [Twoje imię i nazwisko] > Subskrypcje** | [Apple ✓] "W Ustawieniach stuknij swoje imię i nazwisko. Stuknij pozycję Subskrypcje" |
| Apple Account | **konto Apple** (lowercase "konto") | [Apple ✓] |
| Restore Purchases | **Odtwórz zakupy** | [inferred], supported by Apple's verb "Odtwarzanie kupionych… rzeczy" [Apple ✓] |
| Free Trial | **bezpłatny okres próbny** | [Apple ✓] /118428 ("okres próbny"), /125029 ("bezpłatny … okres próbny") |
| Every day | **Codziennie** | [inferred] (Clock repeat summary not seen) |
| Weekdays | **Dni robocze** | [inferred]. Remi's paywall row means "days of the week", translated as "Dni tygodnia" |
| slide to stop | **Przesuń, aby zatrzymać** | [inferred]. Not in the catalog; for reference only |
| Listening… | **Słucham…** | [inferred] |
| Screen Time | **Czas przed ekranem** | [Apple ✓] /102470 |
| link | **łącze** | [Apple ✓] |

---

## 2. Glossary (Remi-specific)

| EN | PL |
|---|---|
| reminder / active reminder | przypomnienie / aktywne przypomnienie |
| recording / take | nagranie |
| spoken line | wypowiadany tekst |
| heads-up (pre-alert) | uprzedzenie (row label) |
| voice note | notatka głosowa |
| Upgrade / Get Pro | Kup Pro (short buttons) · Przejdź na Pro (titles, sentences) |
| Unlimited | bez limitu |
| Monthly / Annual (plan) | Miesięczny / Roczny (agrees with "plan") |
| Billed monthly / every {term} | Płatność co miesiąc / co {term} |
| free trial (CTA) | Wypróbuj {length} za darmo |
| Cancel anytime | Anuluj w dowolnym momencie |
| Send feedback / Your feedback | Wyślij opinię / Twoje opinie |
| Message from Remi | Wiadomość od Remiego |
| Privacy Policy / Terms of Use | Polityka prywatności / Warunki użytkowania |
| Done (alarm, task finished) | **Zrobione** (alarm.button.done, alarmOverlay.done). The sheet "Done" stays **Gotowe** |
| COMPLETE (section) | WYKONANE |

### Plurals and case

- Every plural block carries **one / few / many / other**. `one` = 1. `few` = 2-4, 22-24… (not 12-14). `many` = 0, 5-21, 25…. `other` = fractions, written with the genitive singular.
- The preposition sets the case:
  - "co" / "za" / "na" take the accusative: Co # minutę/minuty/minut, Następne za # godzinę/godziny/godzin, pozwala na # aktywne przypomnienie/aktywne przypomnienia/aktywnych przypomnień.
  - "z" and "limit" take the genitive: z # przypomnienia/przypomnień, limit # aktywnego przypomnienia/aktywnych przypomnień.
- Where Polish has a natural word for one, the `one` branch drops `#`: "Co minutę", "Co godzinę", "Codziennie", and term `one` "miesiąc/rok/tydzień/dzień" (as in English).
- `take.multiCreated` gets all four categories even though English has only `other`. "Utworzono" is invariant, so no gender issue.
- **Language names include their preposition.** The values are adverbial phrases: "po polsku", "po angielsku", "w hindi", "w suahili", "w urdu".
  - They fill "Słucham {language}" and "Remi nie mówi jeszcze {language}". Both need "po …"; the noun "polski" would be ungrammatical there.
  - `pending.thisLanguage` = "w tym języku" for the same reason.
  - **If code ever shows `language.name.*` standalone (a picker, a label), these values will be wrong.** Standalone nominatives would then be needed: polski, angielski… The Settings value uses the separate `settings.voiceLanguage.en` = "Angielski".

---

## 3. Uncertain strings (review on device)

- `pending.askPastTime` / `pending.detail.pastTime`: "{time} już dziś minęła." The feminine "minęła" agrees with the implied "godzina" and with the fallback "Ta godzina". "15:00 już dziś minęła" is correct but slightly elliptical. If code can pass a non-time phrase, rephrase.
- `time.ringsAgain` = "Ponownie: {time}". I used a colon because I don't know whether {time} is a bare clock time (needs "o 15:00") or a relative phrase.
- `reminders.pattern.everyDays` = "Co tydzień: {days}" (e.g. "Co tydzień: pon., czw."). A literal "Co {days}" is ungrammatical.
- `pending.quickChoice.a11y` = "Przypomnij: {choice}". The colon avoids the case and capitalization issues of the lower-cased chip label.
- `pending.moreReminders` = "Jeszcze +{count}: {titles}". This keeps the count out of plural agreement.
- `edit.row.headsUp` = "Uprzedzenie". It's correct but slightly formal. The alternative "Wcześniejszy alert" (18) is too long for a row label.
- `times.mode.setTimes` = "Stałe godziny"; `times.mode.interval` = "Interwał".
- `paywall.card.badge` = "NAJKORZYSTNIEJ" (14). Alternative: "NAJLEPSZA OFERTA" (16).
- `paywall.table.col.free` = "GRATIS". It fits ~6 chars. "ZA DARMO" (8) is more neutral if the column allows it.
- "Remiego" (genitive) in `feedback.list.fromRemi` and `feedback.banner.message.title`. This is natural Polish. If the brand must never inflect, use "Wiadomość: Remi" / "Masz nową wiadomość (Remi)".
- `aiConsent.allow` = "Pozwól", which matches the iOS system alert. Not verified on a page.
- `proCard.pro.subtitle` = "Aktywna · …" (feminine, implies "subskrypcja"). It sits under the product-name title "Remi Pro". If that reads oddly, use "Aktywne".
- `paywall.closing.brand` uses masculine "który … zapominał" for the solo developer (the founder).
- `time.clock.am/pm` and `times.picker.am/pm` = "AM"/"PM". Polish iOS defaults to the 24-hour clock, so `formatClockTime` should switch to `Intl.DateTimeFormat('pl', {hour:'2-digit', minute:'2-digit'})` ("15:42"). Otherwise Polish users see "3:42 PM".
- Weekday narrow letters are CLDR pl, Monday-first: P W Ś C P S N. P appears twice (pon./pt.) and S/N are distinct. CLDR has the same ambiguity, so `Intl` won't fix it. Poland starts the week on Monday, so the hard-coded Monday start is correct for pl.

## 4. Overflow risks

| key | EN → PL (chars) | limit | note |
|---|---|---|---|
| `tabs.reminders` | Reminders 9 → **Przypomnienia 13** | ~10 | **Overflow.** No shorter Apple-consistent word exists. Allow shrink-to-fit or 2 lines |
| `paywall.hero.default.line1` | Forget less. 12 → **Mniej zapominaj. 16** | ~12 | Serif display line. Fallback "Nie zapominaj." (14) |
| `paywall.card.badge` | BEST VALUE 10 → NAJKORZYSTNIEJ 14 | ~12 | Slight overflow |
| `edit.row.repeat` | Repeat 6 → Powtarzanie 11 | ~12 | OK |
| `today.timeDraft.confirm` | Remind me 9 → Przypomnij mi 13 | ~14 | OK |
| `quickChoice.pickTime` | Pick a time… 12 → Wybierz godzinę… 16 | ~16 | At the limit |
| `feedback.list.fromRemi` | 17 → 20 | ~20 | At the limit |
| `paywall.cta.trial` | "Wypróbuj 7 dni za darmo" 23; "Wypróbuj 1 miesiąc za darmo" 27 | ~24 | Month/year trials overflow |
| `paywall.cta.subscribe` | "Subskrybuj za 49,99 zł/miesiąc" ~30 | one line | Likely 2 lines; "/3 miesiące" is longer still |
| `alarm.button.done` / `alarmOverlay.done` | Done 4 → Zrobione 8 | ~8 | At the limit. "Gotowe" (6) is the fallback |
| `alarm.button.later` | Later 5 → Później 7 | ~8 | OK |
| `recording.gate.upgrade` / `today.header.getPro` | Kup Pro 7 | ~10 | OK |
| `tabs.settings` | Ustawienia 10 | ~10 | At the limit |
| `notificationsOff.title`, `feedback.banner.updated.title` | +30-40% | toast | May wrap to 2 lines |

## 5. Paywall legal block

Wording follows the standard Polish App Store disclosure, which appears near-verbatim across PL listings and terms pages:

- "Subskrypcja odnawia się automatycznie, chyba że automatyczne odnawianie zostanie wyłączone co najmniej 24 godziny przed końcem bieżącego okresu."
- "Płatność zostanie pobrana z … konta … po potwierdzeniu zakupu."

The account name is updated to **konto Apple** (many PL pages still say "konto iTunes" / "Apple ID": don't copy that). The path uses Apple's own instruction: "w Ustawieniach > [Twoje imię i nazwisko] > Subskrypcje".

`{term}` sits after "co", so the term plurals use accusative forms that match: co miesiąc / co 3 miesiące / co 6 miesięcy / co rok / co 2 lata. Prices must come from StoreKit (PL format "49,99 zł").

## 6. Validator

`python -I …\validate_l10n.py pl` gives `[pl] PASS: 426 keys (en 426), 0 errors, 17 warnings`. All 17 warnings are false positives:

- 11 × "'Remi' missing": the substring "Remi" matches inside "Reminder(s)".
- 5 × "identical to English": placeholder-only joins `{date} · {time}`, `{times} · {days}` (must keep " · ", which code re-splits), `{first} +{count}`, `{start} – {end}`, `{kicker}, …`.
- 1 × `edit.row.alarm` = "Alarm": the same word in Polish.

## Sources (opened this session)

- Apple PL, Ustawianie i modyfikowanie alarmów na iPhonie: https://support.apple.com/pl-pl/118444
- Apple PL, Ustawianie alarmu w aplikacji Zegar: https://support.apple.com/pl-pl/guide/iphone/iph2909d3a74/ios
- Apple PL, Używanie aplikacji Przypomnienia: https://support.apple.com/pl-pl/102484
- Apple PL, Anulowanie subskrypcji Apple: https://support.apple.com/pl-pl/118428
- Seen in search excerpts:
  - Apple PL Czas przed ekranem / "Nie pozwalaj": https://support.apple.com/pl-pl/102470
  - "Pozwalaj / Nie pozwalaj": https://support.apple.com/pl-pl/guide/iphone/iph3ff83f3b1/ios
  - Apple Creator Studio "bezpłatny … okres próbny": https://support.apple.com/pl-pl/125029
  - PL auto-renew wording: YNAB Google Play PL listing, Goals (App Store PL), Hanro terms (pl)
- Not reached: applelocalization.com (not tried; the pt-BR run found it unusable via fetch). The Clock repeat summaries ("Codziennie", "Dni robocze"), "Zatrzymaj", "Później", "Odtwórz zakupy" and the iOS 26 slider text weren't seen on an Apple page. Device screenshots would settle them.
