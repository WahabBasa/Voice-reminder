# pt-BR in-app UI style guide: Remi (2026-10-10)

Research only. This is the brief for whoever translates Remi's UI strings into Brazilian Portuguese. It builds on the store-listing work in `docs/aso/research/localization/pt-BR.md` and `pt-BR-1.0.1-draft.md`. Where in-app usage differs from those files, that's flagged below.

Source tags in the tables:
- **[Apple]**: Apple pt-BR support pages, opened this session.
- **[CLDR]**: Unicode CLDR data, which drives iOS formatters.
- **[MS]**: Microsoft pt-BR Localization Style Guide.
- **[ASO]**: the two store-listing research files.
- **[judgment]**: my call, not backed by a source.

---

## (a) Rules

1. **Address the user as você, always.** Never use "o senhor / a senhora" or tu-forms. Microsoft says to address the user as "você" and avoid impersonal third person [MS]. Every BR store listing checked uses você [ASO]. Nubank "trata o cliente por você" and is "amigável, porém séria" (NuControle voice guide).
2. **Buttons, menu items and toggles use the infinitive.** Apple's own pt-BR UI does this: Adiar, Parar, Repetir, Permitir, Não Permitir, Cancelar Assinatura, Renovar, Restaurar [Apple]. Write "Salvar", not "Salve"; "Apagar", not "Apague".
3. **Instructions, hints and coaching lines use the imperative (você form).** Apple's support copy is built this way: "Toque em Alarmes", "ative para ver o botão Adiar" [Apple]. Microsoft gives imperative as a preferred neutral structure: "Envie o pedido até sábado" [MS]. For Remi: "Toque e fale o lembrete", "Fale de novo".
4. **Errors use sentence case and a short, plain, blame-free form.** Microsoft: "sentence case should be used in error messages"; "Cannot…" becomes "Não é possível + infinitivo" [MS]. Use that pattern for system errors. For Remi's own voice, a warmer first-person line is better ("Não entendi o horário").
5. **Use sentence case for Remi's own strings** [judgment]. Example: "Novo lembrete", not "Novo Lembrete".
   - Apple's pt-BR UI uses Title Case for its own named elements (Tela Bloqueada, Permitir Notificações, Duração do Adiamento) [Apple]. Copy those names exactly when you point the user to an iOS setting.
   - Weekdays and months are always lowercase in Portuguese ("segunda-feira", "outubro") [CLDR] (Elon.io).
6. **Write "para" in UI chrome. Keep "pra" for Remi's chatty cards only.** "Pra" is everywhere in forum speech [ASO], and it reads friendly in a "Recado do Remi" card. Never use it in buttons, settings, the paywall, legal text or permission prompts [judgment].
7. **Clitics: use the spoken Brazilian placement.**
   - Write "me lembra", "te aviso", not "lembra-me" or "avisá-lo".
   - The ASO draft already rejected "lembre-me" as formal or European [ASO].
   - Brazilian proclisis ("Me diga") contrasts with European enclisis ("Diga-me") (Settemila Lingue).
   - Use "te" with você in conversational lines, which is how Brazilians talk [judgment]. Never use "lhe": it reads stiff or European.
8. **Use the gerund for progress states.** Write "Ouvindo…", "Salvando…", never "A ouvir…". Brazilian Portuguese uses "estou fazendo", European Portuguese "estou a fazer" (Loclint, OpenL, Settemila).
9. **Keep the user's gender out of the copy.** Portuguese adjectives inflect, and Remi doesn't know the user's gender.
   - Avoid "Bem-vindo", "Você está pronto", "obrigado/a" as a label for the user.
   - Use "Boas-vindas", "Tudo pronto", "Tudo certo", or restructure the sentence.
   - Microsoft asks for gender-neutral structures and gives imperative or infinitive rewrites as the tools [MS].
   - Gender agreement with *things* is fine: "lembrete salvo", "consulta marcada".
10. **Remi is masculine: "o Remi", "ele".** This matches the listing draft ("O Remi guarda… Depois ele fala") [ASO].
11. **Use everyday words, not formal ones.**
    - Microsoft lists formal forms to avoid: "ser capaz de" (use "poder"), "visualizar" (use "ver"), "modificar" (use "mudar"), "quaisquer" (omit) [MS].
    - Use "remédio", not "medicamento" [ASO].
12. **Don't translate word for word.** Rewrite for intent, and cut descriptors and possessives English overuses. Microsoft: "Do not transfer to the localized version the extensive use in English of possessive adjectives" [MS]. Write "Apagar lembrete", not "Apagar seu lembrete".
13. **Emoji: none in buttons, tabs, the paywall, legal or permission text.** In "Recado do Remi" cards and toasts, mirror the English: if the English line has one, keep it; never add one [judgment]. Nubank's in-app voice is described as friendly but "sem brincadeiras ou piadas" (NuControle guide).
14. **No provider names in user-facing strings** (house rule, see memory). Write "nossa IA" or nothing.
15. **Never hardcode formats.** Times, dates, relative times, prices and plurals go through `Intl` / `DateFormatter` / StoreKit `displayPrice` / `.stringsdict` with the `pt-BR` locale. The rules in (c) say what the output should look like, so a reviewer can catch hand-built strings.

---

## (b) Glossary (95 terms)

Apple calls the alarm "snooze" control **Adiar** in Clock [Apple]. The listing research found "soneca" is what people *say* [ASO], but the ASO draft already uses Adiar/Adiou in copy. In the UI, use **Adiar** everywhere a button or setting is involved, and keep "soneca" out of the UI.

| # | English (Remi UI) | pt-BR | Source / why |
|---|---|---|---|
| 1 | reminder | **lembrete** (m.) | Apple app "Lembretes" [Apple]; ASO core noun |
| 2 | Reminders (screen/list) | **Lembretes** | Apple app name [Apple] |
| 3 | alarm | **alarme** (m.) | Apple Clock tab "Alarmes" [Apple] |
| 4 | alarm clock (marketing only) | **despertador** | ASO category term; Apple "alarme despertador" [Apple]. In the UI, prefer "alarme" |
| 5 | talking alarm | **despertador falante** (store) / **alarme falado** (UI) | ASO |
| 6 | Today | **Hoje** | Apple Reminders date chips [Apple]; CLDR day 0 [CLDR] |
| 7 | Tomorrow | **Amanhã** | Apple [Apple]; CLDR [CLDR] |
| 8 | Yesterday | **Ontem** | CLDR [CLDR] |
| 9 | This weekend | **Este fim de semana** | Apple "Este Fim de Semana" [Apple], in sentence case |
| 10 | Upcoming | **Próximos** | [judgment]; short enough for a header |
| 11 | Overdue | **Atrasado** | [judgment]; standard BR word for late |
| 12 | Mark as done | **Concluir** | Apple "Marque itens como concluídos" [Apple] |
| 13 | Done (state) | **Concluído** | Apple [Apple] |
| 14 | Done (closes a sheet) | **OK** | Apple: "Toque no botão OK" in Clock [Apple] |
| 15 | Save | **Salvar** | BR standard (VTEX list Save→Salvar). EP uses "Guardar" |
| 16 | Cancel | **Cancelar** | Apple [Apple] |
| 17 | Delete | **Apagar** | Apple pt-BR: "Apague e recupere lembretes", "Apagar eSIM" [Apple]. Google uses "Excluir"; follow Apple on iOS. Never "deletar" |
| 18 | Edit | **Editar** | Apple [Apple] |
| 19 | Undo | **Desfazer** | Google Tasks pt-BR "Desfazer" |
| 20 | New reminder | **Novo lembrete** | Apple "+ Novo Lembrete" [Apple], in sentence case |
| 21 | Record | **Gravar** | Apple Voice Memos "botão Gravar" [Apple] |
| 22 | Tap to speak | **Toque para falar** | Apple's verb for tap is "tocar" [Apple] |
| 23 | Listening… | **Ouvindo…** | Gerund, BR form (rule 8) |
| 24 | Working on it… / Thinking… | **Só um instante…** | [judgment]. "Processando…" is correct but robotic |
| 25 | Try again | **Tentar de novo** (button) / **Tente de novo.** (sentence) | MS "Tente novamente"; "de novo" is more spoken [judgment] |
| 26 | Time (field label) | **Horário** | Apple "Defina um horário para o alarme" [Apple] |
| 27 | Date | **Data** | Apple "Data e Hora" [Apple]. False friend: *data* = date |
| 28 | Repeat | **Repetir** | Apple Clock [Apple] |
| 29 | Never (repeat) | **Nunca** | Apple Reminders "defina a opção Repetir como Nunca" [Apple] |
| 30 | Daily / Every day | **Todos os dias** | Common BR; Apple Mac Reminders uses "Diariamente" in custom repeat [Apple]. "Todos os dias" is friendlier for a chip |
| 31 | Weekdays | **De segunda a sexta** (chip: **Seg. a sex.**) | Avoid "dias úteis": it implies holidays are skipped, and Remi doesn't skip them [judgment] |
| 32 | Weekends | **Fins de semana** | Apple "Este Fim de Semana" (singular) [Apple] |
| 33 | Every hour | **A cada hora** | Apple Mac Reminders "A cada hora" [Apple]. Spoken: "de hora em hora" [ASO] |
| 34 | Every N hours | **A cada N horas** | Apple "a cada 6 horas" [Apple]. Spoken alt: "de N em N horas" [ASO] |
| 35 | Every N days | **A cada N dias** | Same pattern [Apple] |
| 36 | Every other day | **Dia sim, dia não** | Apple Mac Reminders "dia sim, dia não" [Apple] |
| 37 | Until {date} | **Até {data}** | e.g. "Até 12 de out." [judgment + CLDR] |
| 38 | Ends | **Termina** | [judgment] |
| 39 | Label (reminder text) | **Lembrete** (field) / **Etiqueta** only if it's a tag | Apple uses "Etiqueta" for alarm labels [Apple], but for Remi the field *is* the reminder |
| 40 | Snooze | **Adiar** | Apple Clock button and toggle [Apple]; ASO |
| 41 | Snooze duration | **Duração do adiamento** | Apple "Duração do Adiamento" [Apple] |
| 42 | Snoozed until 7:40 | **Adiado até 7h40** | Rule (c) time-in-prose |
| 43 | Snooze 10 min | **Adiar 10 min** | "min" without a period [judgment, SI style] |
| 44 | Later | **Mais tarde** | Apple Mac Reminders notification "clique em Mais Tarde" [Apple]. Never "Tarde" alone (= afternoon) |
| 45 | Stop | **Parar** | Apple Clock and Watch "Adiar e Parar" [Apple] |
| 46 | slide to stop | **deslize para parar** | iOS 26.1 added "Slide to stop" (MacRumors/9to5Mac). **The exact Apple pt-BR string wasn't found.** "Deslize para…" follows the classic "deslize para desbloquear" pattern |
| 47 | (alarm) goes off / rings | **tocar** ("o alarme vai tocar às 7h") | Apple "quando o alarme tocar" [Apple]; ASO |
| 48 | Sound | **Som** | Apple [Apple] |
| 49 | Silent mode | **Modo Silencioso** (setting) / **no silencioso** (copy) | Apple "Ignorar o Modo Silencioso" [Apple]; ASO |
| 50 | Lock Screen | **Tela Bloqueada** | Apple [Apple]. EP uses "ecrã bloqueado": avoid it |
| 51 | Notifications | **Notificações** | Apple Ajustes > Notificações [Apple] |
| 52 | Allow Notifications | **Permitir Notificações** (iOS setting name) | Apple [Apple] |
| 53 | Allow / Don't Allow | **Permitir / Não Permitir** | Apple system dialog [Apple] (iOS draws these; listed for coaching copy) |
| 54 | Microphone | **Microfone** | Apple Ajustes > Privacidade e Segurança > Microfone [Apple] |
| 55 | Privacy & Security | **Privacidade e Segurança** | Apple [Apple] |
| 56 | Settings (iOS app) | **Ajustes** | Apple [Apple]. Android and EP say Configurações / Definições |
| 57 | Settings (Remi's own screen) | **Ajustes** | Matches iOS [judgment]; "Configurações" is acceptable but inconsistent |
| 58 | Open Settings | **Abrir Ajustes** | [judgment, Apple naming] |
| 59 | Turn on / Turn off | **Ativar / Desativar** | Apple "ative Permitir Notificações" [Apple] |
| 60 | Focus / Do Not Disturb | **Foco / Não Perturbe** | Apple [Apple] |
| 61 | Subscription | **assinatura** | Apple "Assinaturas" [Apple]; ASO |
| 62 | Subscribe | **Assinar** | Apple-consistent verb; Seven/Todoist BR [ASO] |
| 63 | Get Pro / Upgrade | **Assinar o Pro** or **Quero o Pro** | Avoid "Fazer upgrade" [judgment] |
| 64 | Remi Pro | **Remi Pro** | ASO (no diacritics in IAP names) |
| 65 | Monthly | **Mensal** | ASO (Todoist, Seven) |
| 66 | Annual / Yearly | **Anual** | ASO |
| 67 | free trial | **teste grátis** | Fast Company Brasil, Seven [ASO]; Apple prose says "período de teste" [Apple] |
| 68 | 7-day free trial | **7 dias grátis** / **teste grátis de 7 dias** | ASO; Brotari "Começar 7 dias grátis" |
| 69 | Start free trial | **Começar teste grátis** or **Começar 7 dias grátis** | Brotari CTA |
| 70 | Restore purchases | **Restaurar compras** | Apple uses "Restaurar" for subscriptions and backups [Apple]; universal BR wording |
| 71 | Cancel anytime | **Cancele quando quiser** | Brotari, Tandli, CollaborAI pages |
| 72 | auto-renews | **renova automaticamente** / **é renovada automaticamente** | Tandli, Sardines, PopJoy terms |
| 73 | billed / charged | **cobrado(a)** | Same terms pages; Apple "cobranças" |
| 74 | Apple Account / Apple ID | **Conta Apple** | Apple: "Agora, o ID Apple é a Conta Apple" [Apple]. Many 3rd-party texts still say "ID Apple": don't copy them |
| 75 | per month / per year | **por mês / por ano** (compact: **/mês**, **/ano**) | Brotari "R$ 29,90/mês" |
| 76 | Best value | **Mais vantajoso** | [judgment]. "Melhor custo-benefício" is good but long (24 chars) |
| 77 | Save 50% | **Economize 50%** | [judgment]; standard retail phrasing |
| 78 | Unlimited reminders | **Lembretes ilimitados** / **sem limite** | ASO |
| 79 | 5 active reminders | **5 lembretes ativos** | Masculine plural agreement |
| 80 | Terms of Use | **Termos de Uso** | Matches the listing's legal links [ASO] |
| 81 | Privacy Policy | **Política de Privacidade** | Same [ASO] |
| 82 | Send feedback | **Enviar feedback** | "feedback" is a naturalized anglicism in BR [judgment]; alt "Fale com a gente" |
| 83 | Send | **Enviar** | Apple [Apple] |
| 84 | Message from Remi | **Recado do Remi** | "Recado" = a note left for someone; warmer than "Mensagem do Remi" [judgment] |
| 85 | Got it | **Entendi** | [judgment] |
| 86 | Continue | **Continuar** | Standard |
| 87 | Skip | **Pular** | BR (EP: "Saltar") |
| 88 | Not now | **Agora não** | Standard iOS pattern |
| 89 | Close | **Fechar** | Standard |
| 90 | Something went wrong | **Algo deu errado.** | [judgment]; idiomatic BR |
| 91 | No internet connection | **Sem conexão com a internet** | MS "…não disponível" pattern; lowercase "internet" |
| 92 | Didn't catch a time — when should I remind you? | **Não entendi o horário. Quando quer que eu te lembre?** | Rule 7 ("te"); breaks the em dash into two sentences |
| 93 | Search | **Buscar** | Apple "campo de busca", "Busque lembretes" [Apple]. EP: "Pesquisar" |
| 94 | medicine / pills | **remédio** | ASO (103 vs 68 hits) |
| 95 | bill / appointment / birthday | **boleto (conta)** / **consulta (compromisso)** / **aniversário** | ASO |

---

## (c) Formatting

**Time**
- In list rows, pickers, the alarm screen and widgets, use **24-hour `HH:mm`: 07:30, 14:30**.
  - CLDR pt short time and `Hm` are both `HH:mm` [CLDR]. Localechord shows "15:09".
  - Brazilian guides list "14:30" as the norm for "Relógio digital / interface" (Cidesp, Alça da Bota).
- In running prose (toasts, Remi cards, confirmations), use **7h30, 14h, 14h30**:
  - Apple pt-BR does this in its Siri examples: "todos os dias às 7h30", "amanhã às 15h" [Apple].
  - Whole hours take no zeros: "10h", not "10h00" (VEJA).
  - Never "14:30h", "14hs", "14H" (Português sem Mistério, VEJA).
- Write the crase before a specific time: **às 7h**, **das 9h às 11h** (Cidesp).
- Durations are written out: "por 2 horas", "10 minutos" (Português sem Mistério). In tight chips, "10 min".
- Midnight and noon: "meia-noite", "meio-dia" (Elon.io), or "00:00" / "12:00" in time fields.

**Dates**
- Weekday + day + month (CLDR `MMMEd` = `E, d 'de' MMM`): **seg., 12 de out.** [CLDR]
- Full date: **segunda-feira, 12 de outubro de 2026**. Long: **12 de outubro de 2026**. Short: **12/10/2026** (day first) [CLDR]
- Date + time: `{data}, {hora}` in medium/short, `{data} às {hora}` in long → "amanhã às 7h30", "seg., 12 de out., 07:30" [CLDR]
- Weekday abbreviations: **dom., seg., ter., qua., qui., sex., sáb.** Months: **jan., fev., mar., abr., mai., jun., jul., ago., set., out., nov., dez.** Both lowercase with a period [CLDR].
- Weekday picker chips: use the 3-letter forms, not single letters. CLDR narrow is D S T Q Q S S (date-fns issue #2152), so two Q's and two S's are ambiguous.
- Ordinals: only the 1st takes one: "1º de maio", "2 de maio" (Elon.io).

**Relative time**
- iOS and `Intl` output **em 15 minutos / em 2 horas / em 3 dias**, **há 5 minutos**, plus **hoje / amanhã / ontem** [CLDR]. Accept these as-is from formatters.
- In hand-written Remi sentences, prefer **daqui a 15 minutos** for a future point in time. "Em 2 horas" can also read as "within 2 hours" [judgment]. Example: "Vou te lembrar daqui a 15 minutos."

**Numbers and currency**
- Formats: **1.234,56**, **84,5%**, and **R$ 19,90** with the symbol first and a no-break space (Localechord; Microsoft asks for no-break spaces between currency and number [MS]).
- Prices must come from StoreKit `displayPrice` / RevenueCat `priceString`. Never hand-format them.
- Per-period: "R$ 19,90/mês", "R$ 99,90/ano", "só R$ 8,33 por mês".

**Plurals**
- CLDR `pt` puts **0 and 1 in "one"** (`i = 0..1`). `pt-PT` puts only 1 there [CLDR]. A `.stringsdict` for pt-BR therefore renders 0 with the singular form ("0 lembrete").
  - Always add an explicit zero case: **"Nenhum lembrete"**, **"Nenhum lembrete para hoje"**.
- Patterns:
  - **1 lembrete / 2 lembretes**
  - **1 lembrete ativo / 3 lembretes ativos**
  - **A cada hora / A cada 2 horas**
  - **1 dia / 3 dias**
- Avoid "lembrete(s)" style hedges; use real plural rules.
- Gender agreement follows the noun: lembrete, alarme and horário are masculine ("salvo", "ativo", "apagado"); consulta and assinatura are feminine ("marcada", "ativa", "cancelada").

**Text expansion**
- Portuguese runs **10-20% longer** than English on average. Short strings (buttons, tabs) can grow **50-100%** (SimpleLocalize).
- Remi strings to check at render:

| EN | chars | pt-BR | chars | Risk |
|---|---|---|---|---|
| Later | 5 | Mais tarde | 10 | alarm button |
| Get Pro | 7 | Assinar o Pro | 13 | CTA; fallback "Quero o Pro" (11) |
| Weekdays | 8 | Seg. a sex. / De segunda a sexta | 11 / 18 | repeat chip |
| slide to stop | 13 | deslize para parar | 18 | slider track |
| Start free trial | 16 | Começar 7 dias grátis | 21 | paywall CTA |
| Every 2 hours | 13 | A cada 2 horas | 14 | fine |
| Snooze | 6 | Adiar | 5 | fine |
| Settings | 8 | Ajustes | 7 | fine |
| Listening… | 10 | Ouvindo… | 8 | fine |
| Best value | 10 | Mais vantajoso | 14 | badge |

- Tab bars and badges are the breaking points. Give buttons a min-width rather than a fixed width, and allow two lines on the paywall CTA subtitle.

---

## (d) Paywall legal block (pt-BR)

These pages agree on the wording: Tandli pt-BR pricing, the Sardines and PopJoy terms, and Apple's own "cancele-o pelo menos 24 horas antes do término do período de teste" [Apple]. It's updated to **Conta Apple** (Apple renamed "ID Apple") and Apple's path **Ajustes > [seu nome] > Assinaturas** [Apple].

The price placeholders must be filled from StoreKit.

**With trial (annual example):**

> **7 dias grátis, depois {preço}/ano.** A assinatura do Remi Pro é renovada automaticamente, a menos que seja cancelada pelo menos 24 horas antes do fim do período atual. O valor é cobrado na sua Conta Apple ao fim do teste grátis, e cada renovação é cobrada nas 24 horas anteriores ao fim do período. Gerencie ou cancele quando quiser em Ajustes > [seu nome] > Assinaturas. Se você assinar outro plano durante o teste, o tempo restante do teste é perdido.
>
> [Termos de Uso] · [Política de Privacidade] · [Restaurar compras]

**Without trial (monthly example):**

> **{preço}/mês.** O pagamento é cobrado na sua Conta Apple na confirmação da compra. A assinatura é renovada automaticamente pelo mesmo valor, a menos que seja cancelada pelo menos 24 horas antes do fim do período atual. Gerencie ou cancele em Ajustes > [seu nome] > Assinaturas.

Notes:
- Keep the plan name, period length and price visible next to the CTA, along with working Terms and Privacy links. App Review checks for these under Guideline 3.1.2. I didn't re-open the guideline this session; see `docs/appstore-rejection-research.md`.
- Don't write "ID Apple", "iTunes" or "Configurações da App Store". Several third-party BR terms pages still do, and they're outdated.
- "Cancele quando quiser" is the standard short reassurance under a CTA (Brotari, Tandli).

---

## (e) Pitfalls

**European Portuguese forms that mark the app as foreign** (Stepes, OpenL, Cethos, Loclint, Settemila; Apple's pt-PT pages, seen side by side):

| Avoid (pt-PT) | Use (pt-BR) |
|---|---|
| telemóvel | celular |
| ecrã (bloqueado) | tela (Tela Bloqueada) |
| utilizador | usuário (better: rephrase with você) |
| registar | registrar |
| ficheiro | arquivo |
| Definições | Ajustes |
| guardar (save) | salvar |
| aplicação | app (Apple pt-BR says "o app") |
| contactos | contatos |
| premir / carregar em | tocar em / pressionar |
| Pesquisar | Buscar (Apple pt-BR) |
| estou a ouvir | ouvindo |
| lembra-me / diga-me | me lembra / me diga |
| temporizador | timer (Apple pt-BR "Defina timers") |
| cronómetro | cronômetro (BR accents: ô, not ó) |
| pequeno-almoço | café da manhã |
| planeador | planejador |

**False friends (English to Portuguese)**
- *data* = date, not data (use "dados").
- *push* ≠ puxar: puxar means *pull*.
- *later* ≠ "tarde" alone: tarde means afternoon or late. Use "Mais tarde".
- *resume* = retomar (resumir means summarize).
- *actually* ≠ atualmente (= currently).
- *eventually* ≠ eventualmente (= occasionally).
- *pretend* ≠ pretender (= intend).
- *realize* ≠ realizar (= carry out).
- *schedule* = agendar / programar, not "escalar".
- *due* (bill) = vencimento / vence.
- *remind* = lembrar alguém de algo. Write "Vou te lembrar de tomar o remédio", not "Vou lembrar você tomar".

**Anglicisms**
- Accepted: app, Pro, premium, feedback, online, e-mail, widget, timer, link.
- Avoid in UI: snooze (Adiar), upgrade (Assinar o Pro), trial (teste grátis), deletar (Apagar), settings, "dar um refresh", "startar".

**"Dias úteis" for weekdays**
- It means business days, which implies holidays are skipped. Use "De segunda a sexta" unless Remi actually skips holidays.

**Store-listing vs in-app differences**
- **Adiar vs soneca.** The ASO files note that users *say* "soneca". In the UI, use **Adiar** only, to match Apple's Clock button.
- **Notificação.** The listing avoided it as a hero noun (rarely said in forums). In the UI it's unavoidable for permission prompts and Settings paths. Use it there, and keep marketing-style lines on "lembrete" / "alarme".
- **Despertador vs alarme.** In the listing, "despertador falante" is the category term. In the UI, the object is an **alarme** ("o alarme vai tocar às 7h"). "Despertador" belongs to wake-up contexts and marketing.
- **"Os menus do app ainda estão em inglês."** The listing description has this line. Remove it from the store copy once this localization ships.

**Plural zero**
- pt-BR CLDR puts 0 in "one" (see c), so you get "0 lembrete" unless a zero case is added.

**Gendered user address**
- Watch "Bem-vindo", "obrigado", "pronto", "cansado", "esquecido". Restructure, or use "Boas-vindas" / "Tudo pronto".

**Hand-built times**
- Never "14:30h", "14hs", "às 14:30hs", or 12-hour "2:30 PM". Leave AM/PM entirely to the system formatter.

---

## (f) Sources

Opened or fetched this session (2026-10-10):
- Apple, Como definir e alterar alarmes no iPhone (pt-BR): https://support.apple.com/pt-br/118444
- Apple, Defina um alarme no Relógio do iPhone: https://support.apple.com/pt-br/guide/iphone/iph2909d3a74/ios
- Apple, Usar Lembretes no iPhone: https://support.apple.com/pt-br/102484
- Apple, Cancelar uma assinatura da Apple: https://support.apple.com/pt-br/118428
- Apple, Veja suas compras e assinaturas: https://support.apple.com/pt-br/guide/iphone/iph4e3e7324f/ios
- Microsoft, Portuguese (Brazil) Localization Style Guide (PDF): https://download.microsoft.com/download/8/e/3/8e349e32-9eb9-4b63-9909-7586b94a24dd/por-bra-StyleGuide.pdf
- Unicode CLDR JSON, pt dateFields: https://raw.githubusercontent.com/unicode-org/cldr-json/main/cldr-json/cldr-dates-full/main/pt/dateFields.json
- Unicode CLDR JSON, pt ca-gregorian: https://raw.githubusercontent.com/unicode-org/cldr-json/main/cldr-json/cldr-dates-full/main/pt/ca-gregorian.json
- Unicode CLDR JSON, plurals: https://raw.githubusercontent.com/unicode-org/cldr-json/main/cldr-json/cldr-core/supplemental/plurals.json
- Localechord pt-BR formats: https://localechord.app/pt-br
- SimpleLocalize, text expansion: https://simplelocalize.io/blog/posts/text-expansion-ui-localization
- Nubank UX writing case study: https://brasil.uxdesign.cc/nubank-um-estudo-de-caso-de-ux-writing-7ffb0ce7c195
- Guia de voz do NuControle: https://medium.com/@d.janny.fr/guia-de-voz-do-nucontrole-6472bda67319
- applelocalization.com: opened, but the search UI didn't return pt_BR strings through the fetch tool. **Not used.**

Seen in search excerpts (not opened in full):
- Apple Watch alarms pt-BR (Adiar / Parar / Duração do adiamento): https://support.apple.com/pt-br/guide/watch/apd27ce65478/watchos
- Apple Mac Reminders pt-BR (A cada hora, Diariamente, dia sim dia não, Mais Tarde): https://support.apple.com/pt-br/guide/reminders/remnd4b206fb/mac
- Apple Conta Apple rename: https://support.apple.com/pt-br/105023
- Apple microphone permission (Permitir / Não Permitir): https://support.apple.com/pt-br/guide/mac-help/mchl7fa8e3cc/mac and https://support.apple.com/pt-br/101600
- Apple Timers pt-BR (Tela Bloqueada, Parar): https://support.apple.com/pt-br/guide/iphone/iph8241d6b2a/ios
- Apple Messages notifications (Permitir Notificações): https://support.apple.com/pt-br/guide/iphone/iph62faab6a4/ios
- Apple Reminders/iCloud (Apague, Busque): https://support.apple.com/pt-br/guide/icloud/mmc0cd794a/icloud
- Google Tasks pt-BR (Excluir, Desfazer): https://support.google.com/tasks/answer/7675690?hl=pt-br
- VTEX UX writing buttons (Salvar / Excluir): https://uxwriting.vtex.com/docs/text-patterns/buttons
- VEJA, grafia de horas: https://veja.abril.com.br/coluna/na-ponta-da-lingua/como-abreviar-horas-minutos-e-segundos-do-jeito-certo
- Português sem Mistério, 14h30: https://portuguessemmisterio.com.br/2015/08/17/grafia-de-horas-1530-1530h-ou-15h30
- Cidesp, como escrever horário: https://cidesp.com.br/conteudo/como-escrever-horario-guia-pratico-e-correto
- Alça da Bota, 14h30 vs 14:30: https://getbootstrap.com.br/tutoriais/como-escrever-horario-guia
- Wikipedia, Date and time notation in Brazil: https://en.wikipedia.org/wiki/Date_and_time_notation_in_Brazil
- Elon.io, dates and time (pt-BR): https://elon.io/grammar/portuguese-brazil/numbers/dates-and-time
- date-fns pt-BR weekday issue: https://github.com/date-fns/date-fns/issues/2152
- Tandli pt-BR pricing / legal: https://tandli.app/pt-br/pricing
- Sardines Fasting terms: https://sardinesfasting.com/pt-br/legal/terms
- PopJoy terms: https://zelonai.com/pt/app/popjoy/terms-of-service
- Brotari (7 dias grátis CTA): https://brotari.app/
- BR vs PT vocabulary: https://www.stepes.com/resources/localization-guides/brazilian-portuguese-vs-european-portuguese , https://blog.openl.io/brazilian-vs-european-portuguese , https://loclint.com/blog/brazilian-portuguese-notes , https://www.settemilalingue.com/en/languages/pt/grammar/brazilian-vs-european-portuguese , https://www.cethos.com/blog/portuguese-localization-brazil-vs-portugal-differences
- iOS 26.1 "Slide to stop": https://www.macrumors.com/2025/10/06/apple-fixes-alarms-in-ios-26-1 , https://9to5mac.com/2025/12/11/ios-26-1-makes-alarms-use-a-slider-heres-how-to-get-stop-button-back

Local:
- `C:\Dev\VR\docs\aso\research\localization\pt-BR.md`
- `C:\Dev\VR\docs\aso\research\localization\pt-BR-1.0.1-draft.md`

**Not verified:**
- Apple's exact pt-BR strings for "Slide to stop", the Clock repeat summary ("Dias de Semana" or otherwise), and the AlarmKit permission prompt.
- iFood and Todoist in-app pt-BR microcopy: not reached.
- Device screenshots would settle the Apple strings.
