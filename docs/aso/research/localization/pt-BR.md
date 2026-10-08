# pt-BR localization research: Remi (2026-10-08)

Research only. Nothing created in App Store Connect. Every source below was fetched or seen in a search excerpt on 2026-10-08. Reddit could not be fetched (both tools blocked reddit.com), so Brazilian forum voice comes from Google Play reviews (local CSV), App Store reviews, Apple Communities (pt) threads and Brazilian tech press instead.

## 1. Top picks

| Field | Limit | Top pick | Chars | Why |
|---|---|---|---|---|
| Subscription group display name | not published in the Apple pages I fetched (see §4) | **Remi Pro** | 8 | Brand + "Pro" is what BR listings already use (Alarmy Pro, Todoist Pro). No diacritics, which Apple bans in this field |
| Subscription display name (monthly) | 2-30 | **Pro Mensal** | 10 | Todoist "Todoist Pro – Mensal", Seven "Assinatura Clube 7 - Mensal" |
| Subscription display name (annual) | 2-30 | **Pro Anual** | 9 | Todoist "Todoist Pro – Anual", Seven "... - Anual" |
| Subscription description (both) | 45 | **Lembretes ilimitados e de 2 em 2 horas.** | 39 | "Ilimitados" is plain and neutral. "de X em X" is how Brazilians actually say "every X" ("de 5 em 5 minutos" in a review) |
| Subtitle (later app update) | 30 | **O despertador falante** | 21 | "despertador falante" is the term Brazilians use for this app type: Play titles plus 31 review lines |
| App name (later update) | 30 | **Remi: Lembretes por Voz** | 23 | Apple's own app is "Lembretes". Reviewers say "lembretes por voz" / "lembrete falado" |
| Keyword field (later update) | 100 | `remédio,alarme,lembrar,agenda,compromisso,consulta,contas,aniversário,soneca,medicamento,TDAH` | 93 chars / 95 bytes | Words from the four screenshot themes plus native terms, with no repeats of name or subtitle words |

### Alternatives

**Subscription group display name**
- A. `Remi Pro` (8): top pick.
- B. `Remi Pro: Lembretes` (19): explains the product in the Manage Subscriptions list. Contains no diacritics.
- C. `Assinatura Remi Pro` (19): matches Seven's "Assinatura Clube 7" pattern, but redundant because the screen already says "Assinaturas".

**Subscription display names** (Apple bans diacritics here, so avoid é/ã/ç)
- A. `Pro Mensal` (10) / `Pro Anual` (9): top pick.
- B. `Remi Pro - Mensal` (17) / `Remi Pro - Anual` (16): the Todoist and Seven pattern, using a plain hyphen. Todoist uses an en dash, but that may count as a "special character", so avoid it.
- C. `Pro` (3) for both, as in English. Works, but BR users can't tell the two plans apart in Settings > Assinaturas.

**Subscription description** (45 max; Apple's IAP page lists no diacritic rule for this field)
- A. `Lembretes ilimitados e de 2 em 2 horas.` (39): top pick. Natural spoken Portuguese, but it names only the 2-hour example.
- B. `Lembretes ativos ilimitados e por intervalo.` (44): the most literal version of the English. Correct but stiff ("por intervalo" is textbook).
- C. `Lembretes sem limite e de hora em hora.` (39): idiomatic, but "de hora em hora" means "every hour", which undersells custom intervals.

**Subtitle** (30 max)
- A. `O despertador falante` (21): top pick, a direct equivalent of "The talking alarm clock".
- B. `Alarme que fala o lembrete` (26): explains the benefit. Reviews say "fala o que escrevi" and "fala o motivo do lembrete".
- C. `Alarme e despertador falante` (28): packs in both search words (alarme + despertador falante).

**Keyword field notes**
- Apple's Connect reference measures this field in bytes (AppDrift reference). Each accented letter (é, á) costs 2 bytes in UTF-8, so the top pick is 93 characters but 95 bytes.
- Not verified: whether App Store search treats "remedio" and "remédio" as the same word. Don't spend bytes on accent-less duplicates until that is checked.
- Other candidates if room frees up: `boleto`, `pílula`, `tarefas`, `ponto` (from "bater o ponto", a recurring review use case), `água`.
- "TDAH" (ADHD) is a real BR search term, but keep health claims out of the visible copy.

## 2. Vocabulary with evidence

Counts come from the Sentry "Talking Alarm Clock Beyond" Play reviews in `docs/aso/competitors/talking-alarm/reviews.csv`, filtered to rows tagged `pt_br` (6,790 rows). They count lines containing the term.

**Caveat:** Sentry's Brazilian Play title is literally "Despertador Falante Mais", so reviewers partly echo the app name.

| English | pt-BR in practice | Evidence |
|---|---|---|
| alarm clock (waking) | **despertador**: dominant (432 pt_br lines) | "não sei o que seria de mim sem este despertador" (Play review). Apple Communities pt: "Meu despertador não funciona sempre" |
| alarm (generic / the thing that rings) | **alarme** (313 lines) | "os alarmes não funcionam as vezes" (review). Apple's own UI label is "Alarmes" (MacMagazine) |
| reminder | **lembrete** (49 lines) | Apple app "Lembretes", subtitle "Não se esqueça. Use o Lembretes". MyTherapy "Lembrete de Remédios" |
| talking alarm | **despertador falante** (31 lines); also alarme falante (6), relógio falante / alarme falado (8) | Play titles: Sentry "Despertador Falante Mais", ZipoApps "Alarmes - Despertador falante" |
| voice reminder | **lembrete por voz / lembrete falado / lembretes de voz** (9 lines) | "o melhor de tudo é o lembrete por voz". "Eu gostei muito por causa do lembrete falado." "lembretes falados" |
| "it tells me what the alarm is for" | **fala o motivo / fala o compromisso / fala o que eu escrevi** | "vc escreve e ele fala o motivo do despertar". "Gosto do despertador falar qual é o compromisso". "não preciso ... me lembrar para quê que coloquei para despertar, pois no momento de tocar, esse despertador fala!" "possui uma função de voz que relembra o motivo do alarme" |
| appointment / thing to do | **compromisso** (77 lines); consulta for a doctor visit | "horários e dia das minhas consultas". "compromissos médicos". "não nos deixa esquecer de nenhum compromisso, do horário dos remédios" |
| pills / meds | **remédio** (everyday), medicamento / medicação (formal); 39 lines combined | "tomar remédio" appears constantly. "sou cuidadora de idosos, medicações e lanches programado". "com ele nunca esqueço de tomar os meus remédios" |
| bills | **contas** (conta de luz/água), **boleto**, **vencimento** | Olhar Digital: "6 apps para você não se esquecer de pagar as contas de casa", "data de vencimento". Serasa: "esqueci de pagar fatura" |
| birthday | aniversário | Standard word. No native "forgot my mom's birthday" quote found. Not researched further |
| snooze | **soneca** (colloquial, 26 lines); Apple's UI uses **Adiar / Adiável** | MacMagazine: "Como alterar o tempo de soneca (snooze) do alarme", "Ative 'Adiar' ou 'Adiável'". Alarmy BR: "Anti-Soneca". Review: "trava no soneca e fica perturbando de 5 em 5 minutos" |
| "I forgot" / don't forget | **esqueci / esquecia / não esqueço / não se esqueça** | "sempre esquecia de bater o ponto kkkkkk". "Minha filha esquecia de bater o ponto quase todos os dias. Ele nos salvou". "não esqueço nenhum" |
| be late / oversleep | **perder a hora** (38 lines) | "não tem como perder hora com o despertador falando". "Cris acorda! ... Vai perder a hora rs" |
| every X hours | **de X em X horas / de hora em hora** | "fica perturbando de 5 em 5 minutos" (review) |
| to-do | **tarefas / lista de tarefas**; English "to do list" is also used | Todoist BR title "Todoist: To do list–Calendário", subtitle "Gestão de tarefas & Lembretes" |
| silent mode | **modo silencioso / no silencioso** | Apple Communities: "a maioria do tempo meu celular fica no silencioso". Review: "ele não se sobrepõe ao modo silencioso do celular, despertadores devem ter essa função" |

**Which word wins?**
- **Despertador** is the everyday noun for the ringing thing.
- **Alarme** is the system or UI noun.
- **Lembrete** is the "task" noun, but Brazilians feel a lembrete is weak: it's silent and easy to miss. That gap is exactly Remi's pitch:
  - Instagram (Daniel Barros, Sept 2025), titled "Alarme não é Lembrete!". Comments in the search excerpt: "O alarme é o melhor lembrete para algo que vc realmente não pode esquecer" and "o alarme não tem como não ver, pois toca ... em ALTO E BOM SOM! Coisa que o lembrete fica devendo!"
  - Apple Communities pt thread "Tocar som dos lembretes no modo silencioso?": the asker wants reminders to sound the way alarms do.
  - iOS 26.2 added "Urgente" reminders with an alarm (MacMagazine), so Apple is moving into the same space.
- **Copy angle:** "lembrete que toca como despertador e fala o que é" (a reminder that rings like an alarm clock and says what it's for).

**Slang vs neutral**
- Reviews are casual: vc, tbm, kkkkk, rs, "top", "show", "chow de bola", "fala me dá esporro kkkk" (it nags me).
- Store copy stays neutral and casual: você, no slang.

## 3. Register and subscription conventions

**Register**
- Every BR listing checked addresses the user as **você**, neutral and informal:
  - Apple Lembretes: "torna mais fácil do que nunca se lembrar do que você precisa fazer"
  - MyTherapy: "Cuide da sua medicação"
  - Alarmy: "Aumente sua motivação"
  - Olhar Digital: "para você não esquecer"
- Avoid "o senhor / a senhora" and Portugal forms.
- Galarm's BR-visible description is European Portuguese ("utilizar", "contactos", "planeador", "aluguer"). That's a counter-example: it reads foreign to Brazilians.

**Subscription wording seen on BR pages**
- Monthly / annual: **Mensal / Anual**
  - "Todoist Pro – Mensal" R$ 24,90 / "Todoist Pro – Anual" R$ 199,90
  - "Assinatura Clube 7 - Mensal" / "- Anual" (Seven)
  - A Galarm reviewer: "Paguei a versão anual"
- "Pro" stays as **Pro**: Todoist Pro, Alarmy Pro.
- Many apps leave IAP names in English: Due "Annual Upgrade Pass", Galarm "Monthly Premium Subscription", MyTherapy "Ad-free Subscription". Localizing (Mensal/Anual) is the cleaner option.
- Free trial:
  - Press and users say **teste grátis**. Fast Company Brasil: "Os aplicativos concedem testes grátis de 7 a 14 dias". Seven's page also shows "Teste grátis".
  - Apple support pt-BR says **período de teste**: "cancele-o pelo menos 24 horas antes do término do período de teste".
  - Use "7 dias grátis" or "teste grátis de 7 dias" in marketing copy. Apple renders the trial line itself.
- Unlimited: **ilimitado(s)**. Standard word, and seen in a BR subtitle ("Jogos Ilimitados", Sergio Licea). "Sem limite" is the casual alternative.
- Subscription: **assinatura**. Apple pt-BR and the Fast Company Brasil article both use it.

## 4. Apple field limits (cited)

- **IAP / subscription display name:** 2-30 characters. **Description:** at most 45 characters. Source: Apple, "In-App Purchase information".
- **Subscription display name and subscription group display name:**
  - Both "must not contain control characters ... or markup language (for example, HTML tags, or Unicode characters, such as emoticons, diacritics, or special characters)". Source: Apple, "Auto-renewable subscription information".
  - So keep both names accent-free: Mensal and Anual are fine; avoid "Básico" etc.
  - Practice contradicts the rule in places (Todoist uses "–"), but don't test it.
- **Group display name length:** not stated on the Apple pages I fetched ("Auto-renewable subscription information", "Offer auto-renewable subscriptions"). Not verified. The ASC form will enforce it. "Remi Pro" is short enough either way.
- **App name and subtitle:** 30 characters each. Source: Apple, "App information".
- **Keywords:** 100. AppDrift notes Apple's Connect reference says 100 bytes.

## 5. Sources

Local:
- `C:\Dev\VR\docs\aso\competitors\talking-alarm\reviews.csv`: pt_br rows, counted and quoted above.

Fetched or seen on 2026-10-08:
- https://developer.apple.com/help/app-store-connect/reference/in-app-purchases-and-subscriptions/in-app-purchase-information/
- https://developer.apple.com/help/app-store-connect/reference/in-app-purchases-and-subscriptions/auto-renewable-subscription-information/
- https://developer.apple.com/help/app-store-connect/reference/app-information/app-information (search excerpt)
- https://developer.apple.com/help/app-store-connect/manage-subscriptions/offer-auto-renewable-subscriptions (no limits stated)
- https://appdrift.co/blog/app-store-character-limits-complete-reference (search excerpt)
- https://apps.apple.com/br/app/lembretes/id1108187841
- https://apps.apple.com/br/app/id390017969 (Due)
- https://apps.apple.com/br/app/id1163786766 (Alarmy)
- https://apps.apple.com/br/app/lembrete-de-rem%C3%A9dios-mytherapy/id662170995
- https://apps.apple.com/br/app/galarm-alarmes-e-lembretes/id1187849174
- https://apps.apple.com/br/app/lembretes-calend%C3%A1rio-e-alarme/id469454389
- https://apps.apple.com/br/app/todoist-agenda-e-planner/id572688855
- https://apps.apple.com/BR/app/id650276551 (Seven)
- https://apps.apple.com/br/app/pillping-lembrete-de-rem%C3%A9dios/id6759600027 (search excerpt)
- https://play.google.com/store/apps/details?id=com.sentryapplications.alarmclock&hl=pt_BR&gl=BR
- https://play.google.com/store/apps/details?id=alarm.clock.night.watch.talking&hl=pt_BR&gl=BR
- https://macmagazine.com.br/?p=1105545 (soneca / Adiar)
- https://macmagazine.com.br/post/2025/12/18/como-colocar-um-alarme-em-um-lembrete-importante-iphone-ipad-e-mac/
- https://communities.apple.com/pt/thread/254077182
- https://communities.apple.com/pt/thread/250335088
- https://www.instagram.com/reel/DOwsdxmkVsC?hl=pt (caption fetched; comment quotes from the search excerpt)
- https://support.apple.com/pt-br/HT202039
- https://fastcompanybrasil.com/tech/esqueceu-de-cancelar-a-assinatura-do-teste-gratis-de-um-aplicativo-veja-o-que-fazer/
- https://olhardigital.com.br/2026/01/19/dicas-e-tutoriais/6-apps-para-voce-nao-se-esquecer-de-pagar-as-contas-de-casa/
- https://olhardigital.com.br/2025/10/30/dicas-e-tutoriais/5-apps-para-voce-nao-esquecer-de-tomar-remedios (search excerpt)

Not reached:
- Reddit (r/brasil, r/desabafos, r/TDAHBrasil): blocked for both fetch and search tools.
- Reclame Aqui: not attempted.
- A native quote about forgetting a parent's birthday: none found.
