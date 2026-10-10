# pt-BR UI translation notes: Remi (2026-10-10)

Catalog: `pt-BR.json`, 426 keys, same keys and order as `strings-en.json`. Built from `pt-BR-style-guide.md` (binding) and the 1.0.1 store draft.

**Validation:** I wrote a small ICU checker in plain Node, because `intl-messageformat` / `@formatjs` aren't in `node_modules`. It checks:
- the same key set and order;
- the same argument names per key;
- every plural keeps its argument and has an `other` branch with valid CLDR categories;
- balanced braces and no stray ICU apostrophe escapes;
- `<b>` and `<link>` tags are kept;
- no empty strings and no mojibake.

Result: 0 problems. A test with deliberately broken strings was caught, so the checker works. Run a real `intl-messageformat` parse when the i18n runtime lands.

---

## 1. Decisions

- **Register:** você, sentence case, infinitive buttons (Salvar, Apagar, Assinar, Concluir), imperative hints (Toque…, Confira…, Escolha…). Remi's own first-person lines use "te" ("Quando quer que eu te lembre?"). UI chrome and permission copy use "você" ("para que o Remi avise você").
- **Errors:**
  - System failures use "Não foi possível + infinitivo".
  - Remi's own voice uses first person: "Não entendi", "Não consegui transformar isso em um lembrete".
  - "Please try again" → "Tente de novo." Polite fillers ("Please") are dropped, as is natural in pt-BR.
- **Done:**
  - Sheet confirm buttons (`common.done`, `repeat.done`) → **OK**, the Apple pt-BR "Done".
  - The alarm "Done" (`alarm.button.done`, `alarmOverlay.done`) → **Concluir** (mark as done). It is not "Parar", because the action completes the reminder.
- **Ellipsis:** the English mixes `...` and `…`. pt-BR uses `…` everywhere.
- **Quotes:** Brazilian curly quotes “ ” in `pending.heard` and `edit.delete.message`, so there are no JSON escapes.
- **Times:**
  - Durations use `{count} min`, `{count} h`, `{hours} h {minutes} min`.
  - Countdowns ("Next in…") became **"Toca em {n} min/hora(s)/dia(s)"**. It's shorter than "Próximo em" and avoids a dangling masculine "próximo".
  - The notification heads-up uses **"daqui a"** (guide rule for hand-written future points).
- **Plurals:**
  - Every plural has `one` / `other`.
  - `take.multiCreated` gained a `one` branch. The English has only `other`, which is valid but leaves pt with no singular form.
  - **No `=0` cases were added.** None of the catalog's plural counts can be 0 by context: minutes/hours/days countdowns, active-reminder limits ≥1, created/total ≥1, billing terms, trial lengths, stepper min 1. The guide's "Nenhum lembrete" zero rule applies to list counts, and the catalog has no such key; `today.completed.header` is a plain `({count})`.
  - If any of these can reach 0, pt CLDR files 0 under `one` ("0 lembrete"), so add `=0`.
  - Where English `one` reads "Every 1 x", pt drops the number: "A cada hora", "A cada minuto", "Todos os dias".
- **Paywall legal:** follows guide §(d).
  - Uses "Conta Apple", "é renovada automaticamente", "a menos que … seja desativada pelo menos 24 horas antes do fim do período atual", and "Gerencie ou cancele quando quiser".
  - All the facts are kept: price, term, charged at confirmation, auto-renew, the 24 h renewal-charge window, the 24 h cutoff, and cancel in Settings.
  - **Path:** the guide's `Ajustes > [seu nome] > Assinaturas` (the real iOS path), not a literal "Ajustes > Conta Apple > Assinaturas". `settings.alert.manageFailed.message` uses the same path, with the › separator as in the English. Alternative if you want it literal to the source: "Ajustes > Conta Apple > Assinaturas".
- **Term composition:**
  - `paywall.term.*` gives "mês" / "3 meses", so "a cada {term}" reads "a cada mês" / "a cada 3 meses".
  - The CTA gives "Assinar por R$ 19,90/mês".
  - The caption gives "7 dias grátis, depois **R$ 99,90/ano**." "depois" is added per guide §(d); the English has none.
- **Brand:**
  - "Remi" and "Remi Pro" are kept. Remi takes the masculine article in prose ("O Remi ouviu", "O {product} está ativo").
  - **Check:** `{product}` = "Remi Pro", so "O Remi Pro está ativo" is fine. If the ASC display name ever changes to a feminine noun, these break.
  - No AI provider is named anywhere. The Info.plist strings say "Remi", not "VoiceReminder".
- **Gender-neutral user:**
  - "Boas-vindas ao {product}!", "Tudo pronto!", "Já assina?".
  - "Obrigado" in toasts is Remi/the developer speaking (masculine speaker), not a label for the user.

## 2. Language names

All 35 `language.name.*` values are **lowercase common nouns** ("inglês", "árabe"). Every current use is **mid-sentence**:
- `recording.listeningIn`: "Ouvindo em {language}"
- `pending.detail.unsupportedLanguage`: "O Remi ainda não fala {language}"

If any screen ever shows them standalone (a list or picker), capitalize the first letter in code. Don't change the catalog.

Standalone labels are separate keys and are capitalized:
- `settings.voiceLanguage.en` = "Inglês"
- `settings.voiceLanguage.auto` = "Automático"

`settings.row.voiceLanguage.subtitle` ("Transcrito neste iPhone · {language}") receives one of those standalone values, so it shows "· Inglês" / "· Automático", capitalized after the dot, which is fine.

`pending.thisLanguage` = "este idioma" (lowercase, mid-sentence).

Choices worth a glance: bn = "bengali" (CLDR pt), nl = "holandês" (alt "neerlandês"), hi = "híndi" (CLDR pt; "hindi" without the accent is also common), sw = "suaíli", tl = "tagalo".

## 3. Unsure strings (with alternatives)

| Key | Chosen | Alternatives / why unsure |
|---|---|---|
| `today.header.getPro` | Quero o Pro (11) | Limit ~10. **"Seja Pro"** (8) fits; "Assinar o Pro" (13) is too long |
| `paywall.card.badge` | MELHOR PREÇO (12) | Guide says "MAIS VANTAJOSO" (14), but the badge cap is ~12. I chose the shorter term per the brief. Revert if the pill can take 14 |
| `alarm.button.later`, `alarmOverlay.later` | Mais tarde (10) | Guide term. AlarmKit cap ~8 → **overflow risk**; fallback "Adiar" (5) |
| `alarm.button.done`, `alarmOverlay.done` | Concluir | "Feito" (shorter, but not infinitive); "Parar" if the button is perceived as stop |
| `paywall.hero.default.line1-3` | Esqueça menos. / Lembre na / hora certa. | Line 1 is 14 chars against a ~12 target. Alt: "Esqueça menos." / "Lembre de tudo" / "na hora." |
| `paywall.hero.interval.line1-3` | Repete / até você / fazer. | Mirrors the ASO "continua cobrando até você fazer". Alt: "Repita até" / "ficar" / "feito." (stiffer) |
| `reminders.pattern.everyDays` | Toda semana: {days} | "Toda {days}" breaks gender (toda seg. / todo sáb.). Alt "Às {days}" has the same problem with sáb./dom. ("aos") |
| `time.ringsAgain` | Toca de novo às {time} | Assumes `{time}` is a bare clock time. If it can carry a day ("amanhã 07:30"), use "Toca de novo: {time}" |
| `time.missedAt` | Perdido · {time} | Alt "Não atendido", "Ignorado" |
| `time.dueNow` | É agora | Alt "Para agora" |
| `common.setting` | Agendando… | English "Setting…" (busy chip). Alt "Salvando…" |
| `pending.settingUp` | Configurando… | Alt "Preparando…", "Criando…" |
| `pending.quickChoice.a11y` | Lembrar {choice} | Relies on the code lower-casing the chip label ("Lembrar em 1 hora", "Lembrar hoje à noite") |
| `today.timeDraft.confirm` | Me lembrar | Alt "Lembrar" (shorter, but vague) |
| `repeat.mode.everyDay` | Todo dia (8) | Chip cap ~12; "Todos os dias" (13) is used in subtitles (`schedule.everyDay`, `schedule.daily`) |
| `repeat.mode.everyNDays` | A cada N dias (13) | ~1 over a 12 cap if one applies; alt "Cada N dias" |
| `repeat.mode.date` | Em uma data | Alt "Uma vez" (matches the hint "Toca uma vez") |
| `times.addTime` | + Horário | "+ Adicionar horário" (19) is too long for a chip |
| `times.mode.setTimes` | Horários fixos | Alt "Horários" |
| `edit.row.headsUp` | Aviso prévio | Alt "Aviso antes", "Pré-aviso" |
| `edit.voiceNote.play` | Ouvir | "Reproduzir" is long and robotic |
| `take.created.action` | Algo errado? (12) | Cap ~12. "Não ficou certo?" (16) is too long |
| `quickChoice.pickTime` | Outro horário… (14) | Cap ~16. "Escolher horário…" (17) is over |
| `recording.processing.label` | Só um instante… | Glossary #24; `common.processing.a11y` keeps "Processando" for VoiceOver |
| `permission.enabled` | Ativadas | Agrees with "Notificações". If the pill is reused for something masculine, use "Ativado" |
| `paywall.table.cell.unlimited` | Sem limite | Gender-free and fits a narrow cell; alt "Ilimitados" |
| `paywall.table.row.schedules` | Dias da semana, datas, a cada poucos dias | "Weekdays" read as "chosen days of the week". If it means Mon-Fri, use "De segunda a sexta, datas…" |
| `notification.preAlert.fallbackSubject` | Seu lembrete | Capitalized because it starts the notification body; the English source is lowercase |
| `diagnostics.status.*` | Permitido / Provisório / Negado / Não solicitado / Desconhecido | Masculine generic. "Permitidas" etc. if it should agree with Notificações |
| `feedback.founder.defaultAbout` | Sua gravação não deu certo | Server-side string, stored per row. See the inventory recommendation to move it to the client |

## 4. Possible overflows (check on device)

- **Tabs:** Lembretes (9), Dias, Ajustes. These are fine.
- **AlarmKit buttons:** "Mais tarde" (10) and "Concluir" (8) against a ~8 cap.
- **Header pill:** "Quero o Pro" (11) against ~10.
- **Paywall:**
  - CTA "Começar 7 dias grátis" (21) is within the ~24 one-line cap.
  - "Assinar por R$ 99,90/ano" (~24) is at the limit.
  - "Assinar por R$ 199,90/3 meses" would overflow.
- **Paywall hero line 1:** "Esqueça menos." (14) against ~12.
- **Feature table:** column "GRÁTIS" (6) is at its cap; cell "Sem limite" (10) in a narrow column.
- **Chips:** "Amanhã de manhã" (15), "A cada N dias" (13).
- **Section/row labels** are mostly within +30%.

## 5. English source issues

- **`time.clock.am` / `time.clock.pm` and `times.picker.am` / `times.picker.pm`:** kept as am/pm/AM/PM. **pt-BR should be 24-hour (`HH:mm`), with no AM/PM.** The clock formatter must switch to `Intl` and the timer picker to 24 h mode. Translating these keys can't fix it.
- **Weekday narrow letters:** I used CLDR narrow S T Q Q S S D (what iOS Calendar shows). They're ambiguous (two Q, three S). The guide says pickers (`DaySelector.tsx`) should use the 3-letter forms (`weekday.short.*`) instead. Fine for calendar column headers (WeekStrip, MonthSheet).
- **Week start:** hard-coded to Monday. Brazil starts the week on Sunday (product call, see the inventory).
- **Plural code paths:**
  - `schedule.everyNDays` / `repeat.stepper.days`: the inventory says the code always prints "days" ("Every 1 days"). The catalog plural fixes this only once the code calls it with `count`.
  - `take.multiCreated` has only an `other` branch in English.
- **`settings.row.terms.subtitle`:** "licence" is British spelling, inconsistent with US "canceled" in the paywall.
- **`paywall.legal.disclosure.generic` / `priced`:** "Settings > Apple Account > Subscriptions" is not the real iOS path (it's Settings > [your name] > Subscriptions). The pt uses the real path; consider fixing the English too.
- **`paywall.restore` vs `settings.row.restore`:** "Restore purchase" (singular) vs "Restore purchases" (plural). `paywall.error.alreadyOwned` quotes the singular, and pt matches it ("Restaurar compra").
- **`infoPlist.NSAlarmKitUsageDescription`:** says "VoiceReminder"; pt uses "Remi" (also fix the English in `plugins/withAlarmKit.js:18`).
- **`aiConsent.body` / the mic prompt:** "secure third-party AI services" → "serviços de IA seguros, de terceiros". The comma avoids reading "seguros de terceiros" as "third-party insurance".
- **`reminders.pattern.everyDays` and `schedule.timesAndDays`:** concatenation. `patternLine` re-splits on " · ", which the pt strings keep, but it stays fragile.
- **`pending.quickChoice.a11y`:** built from the chip label lower-cased in code; it works for pt as long as the lower-casing stays.
