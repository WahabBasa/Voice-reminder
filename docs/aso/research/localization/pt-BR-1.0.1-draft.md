# pt-BR listing draft for 1.0.1: Remi (2026-10-08)

Research plus drafting only. Nothing was created or changed in App Store Connect.

This round adds **forum and community language** to the first pass (`pt-BR.md`, which used store pages and Play reviews because Reddit was blocked). Reddit was reached through Apify this time.

## 0. Method and spend

- **Scraper:** `automation-lab/reddit-scraper` (Reddit search, posts plus up to 8-12 top-level comments per post). One early run on `trudax/reddit-scraper-lite` returned noisy, partly European Portuguese results and was aborted after about 30 items.
- **Searches:**
  - `TDAH esqueço`
  - `esqueci de pagar conta`
  - `esqueci boleto venceu`
  - `esqueço de tomar remédio`
  - `esqueci consulta médico`
  - `esqueci aniversario`
  - `lembrete celular notificação esqueço` (in r/TDAH_Brasil)
  - `celular no silencioso não ouço`
  - `Siri lembrete por voz`
  - `alarme modo silencioso iphone` and `lembrete beber água app`: these two returned English or app-promo threads and were not used.
- **Corpus:**
  - About 1,100 posts and comments in total.
  - Frequency counts below come from 929 BR-Portuguese documents across the 9 saved datasets.
  - Excluded from the counts: r/portugal, r/portugueses, r/literaciafinanceira and r/CasualPT (all European Portuguese), plus English-language subs.
  - The Alexa thread (r/TDAH_Brasil) was read in full but isn't in the counted set.
- **Subreddits that produced the useful material:** r/TDAH_Brasil (the Brazilian ADHD sub; "r/TDAH" returned nothing), r/desabafos, r/desabafosdavida, r/conversas, r/relacionamentos, r/transtornobipolar, r/brasil, r/ConselhosLegais, r/tiodopave, r/antitrampo, r/conselhosbacanas.
- **Other tools:**
  - Parallel Search was rate-limited (free tier) for the whole session.
  - WebSearch found no usable forum quote for the birthday or bill intents.
  - Reclame Aqui was not reached.
- **Apify spend:** about **$0.90**, estimated from per-event prices: 16 runs, about 1,250 stored items at $0.00115 per post and $0.000575 per comment, plus the aborted lite run at about $0.14. The MCP tool doesn't report the billed amount. This is under the $2 cap.

All quotes below are verbatim from the URLs given, which were retrieved on 2026-10-08. Typos are the authors'.

---

## 1. Intent map

"Counts" give hits / documents in the 929-doc BR corpus. They show relative weight, not market size.

| # | Intent | Top native phrasings (counts) | Quoted evidence |
|---|---|---|---|
| 1 | Forgetful, not careless; chaotic day (incl. ADHD) | **esqueço / esqueci / esquecer** (179 / 117), the dominant verb by far. **"esqueço tudo"** is the stock self-description. **esquecido** (9 / 8) is the identity adjective ("sou mt esquecido"). The accusation people push back on is **"esquece porque quer"**, and the defence is **"não é por querer"** (6 / 4). **TDAH** (149 / 76) is the everyday word for ADHD. The chaos word is **caos** ("o caos da vida", "É um caos..."). Slang: **memória de peixe** (1). "Lembrar de lembrar" (1). | "Ela diz que esqueço por que quero [...] Muitas vezes eu esqueço algo [...] mas não é por querer" ([r/desabafosdavida](https://www.reddit.com/r/desabafosdavida/comments/1vyoods/estou_realmente_cansado_de_tudo_na_minha_vida/)). "Memória muito ruim Esqueço nomes, compromissos, tarefas, coisas importantes e até informações simples." ([r/TDAH_Brasil](https://www.reddit.com/r/TDAH_Brasil/comments/1wrnl6p/concerta_metilfenidato_funcionou_muito_melhor_que/)). "Eu sou mt esquecido kkkkk" ([r/conversas](https://www.reddit.com/r/conversas/comments/1i1j4ot/esquecer_de_aniversários/m76lqgk/)). "Tu vai vivendo anos e anos pra organizar o caos da vida." (r/Conquistas, in the `esqueci aniversario` dataset) |
| 2 | Notifications get ignored; I need something I *hear* | Notifications and reminders get **ignorados / burlados** (ignor-: 13 / 10). What works is something that **cobra** (me cobrar / cobrando: 14 / 13) and that **não para de tocar** until you act. Reminder apps that nag **"enchem o saco"** (4 / 4). "Lembrete no celular" is described as **ineficaz**. **Notificação** itself is rare (2): people say "lembrete" or "alarme". | "Mesmo colocando coisas (lembrete pra estudar ou até beber água rs) na agenda ou lembretes, acabo burlando e ignorando. [...] talvez ouvindo a Alexa (e não só olhando uma notificação no pc ou celular sem vê-la de fato) [...] Seria como ter algo \"me cobrando\"" ([r/TDAH_Brasil](https://www.reddit.com/r/TDAH_Brasil/comments/1c7kpvq/usar_alexa_para_lembrar_ou_cobrar_coisas/)). Reply: "ela é muito insistente em alarmes e lembretes, não vai parar de tocar e falar até vc pedir. Chega a ser irritante kkkk." ([comment](https://www.reddit.com/r/TDAH_Brasil/comments/1c7kpvq/usar_alexa_para_lembrar_ou_cobrar_coisas/l08lzen/)) |
| 3 | Forgetting to pay a bill | **boleto** (18 / 12) beats **fatura** (6 / 6), "pagar conta" (10 / 9) and **conta de água** (3, one thread). **Conta de luz** had 0 hits. The natural verb is **o boleto venceu / deixar vencer** (venceu / vencimento: 19 / 13), with **juros** (13 / 11), **multa**, "perdi o prazo" and "SPC / sujar o nome". "O boleto venceu" is a national in-joke (r/tiodopave puns). | "Fui burro e esqueci de pagar uma conta que venceu no mês passado, paguei agora com juros e tudo mais" ([r/brasil](https://www.reddit.com/r/brasil/comments/boia3c/fui_burro_e_esqueci_de_pagar_uma_conta_que_venceu/)). "Eu acabei esquecendo de olhar meu e-mail no dia 14/15 e perdi o prazo e tive que pagar essa multa." ([r/ConselhosLegais](https://www.reddit.com/r/ConselhosLegais/comments/190c5lg/paguei_juros_pq_o_boleto_venceu_mas_enviaram/)). "Nem precisa torcer, o boleto sempre vence." ([r/tiodopave](https://www.reddit.com/r/tiodopave/comments/1r5mn0y/o_banco_me_ligou_avisando_que_o_boleto_venceu/o6z2y2t/)). Alexa user: "Eu coloco para contas, pq as vezes tu nao paga na hora" ([comment](https://www.reddit.com/r/TDAH_Brasil/comments/1c7kpvq/usar_alexa_para_lembrar_ou_cobrar_coisas/l0ah3u2/)) |
| 4 | Missing a doctor's appointment | **consulta** (23 / 14) is the noun. People say **"marcar a consulta"** (book it) and **"perder a consulta"** (miss it). **"Ir ao/no médico"** is the outing. The `esqueci consulta médico` search returned mostly work-absence threads (r/antitrampo), so first-person "esqueci a consulta" is thin. | "Widget de agenda na tela inicial/tela de bloqueio, sempre salva de não perder aquela consulta importante que você marcou há 1 mês, ou aniversário da sua mãe" ([r/TDAH_Brasil](https://www.reddit.com/r/TDAH_Brasil/comments/1g4983t/como_vocês_se_organizam_no_celular/ls26y5m/)). "Marcar a consulta fora do horário (7 da manhã ou 7 da noite)" ([r/antitrampo](https://www.reddit.com/r/antitrampo/comments/1wa7juc/pessoal_clt_com_plano_de_saúde_com_qual/p8g4pur/)) |
| 5 | Forgetting pills | **remédio(s)** (103 / 55) is the everyday word. **medicação / medicamento** (68 / 49) skews clinical and is used by people giving advice. The collocation is **"esqueço de tomar (o) remédio"** ("tomar o remédio": 25 / 23). The fix people name is **"despertador no celular"**. | "sempre me esqueço de tomar a lamotrigina" ([r/transtornobipolar](https://www.reddit.com/r/transtornobipolar/comments/1ntcfew/esqueci_de_tomar_lamotrigina_e_estou_num_ciclo/)). "Por vezes também esquecia de alguns remédios, com uma solução simples resolvi tudo o problema: despertador no celular. Quando toca, para tudo o que estou fazendo e tomo meus remédios." ([comment](https://www.reddit.com/r/transtornobipolar/comments/1ntcfew/esqueci_de_tomar_lamotrigina_e_estou_num_ciclo/ngy584y/)). "Parece que simplesmente esqueço que o remédio existe." ([r/TDAH_Brasil](https://www.reddit.com/r/TDAH_Brasil/comments/1wjyfni/o_problema_da_consequência_imediata/)) |
| 6 | Forgetting Mom's birthday | **aniversário** (61 / 34) plus **dar parabéns** (17 / 13) for the act of greeting. People say **"aniversário da minha mãe" / "da sua mãe"**. The panic line is **"É HOJE, ESQUECI"**. People lean on Facebook, Instagram and the agenda to remember. | "Esquecer de aniversários A melhor função do facebook era a de lembrar do aniversário das pessoas." [...] "daí acontece muito da pessoa postar o story e eu \"AAAA É HOJEEEE ESQUECI\"." ([r/conversas](https://www.reddit.com/r/conversas/comments/1i1j4ot/esquecer_de_aniversários/)). The r/TDAH_Brasil widget quote in row 4 pairs "consulta" and "aniversário da sua mãe". |
| 7 | Setting a reminder just by speaking | **comandos de voz** (seen for Alexa and Siri), **entrada por voz**, and **"é só pedir / é só falar"**. The first pass also found **lembrete por voz / lembrete falado** (Play reviews). | "a partir de comandos de voz" ([r/conselhosbacanas](https://www.reddit.com/r/conselhosbacanas/comments/ojfdk9/use_a_alexa_para_idosos_e_deficientes/)). "Eu aciono o atalho e faço a entrada por voz ou texto." ([r/shortcuts](https://www.reddit.com/r/shortcuts/comments/1vizb42/como_enviar_mensagem_pelo_whatsapp/)). "A Alexa me ajuda muito nesse aspecto pq é só pedir pra ela que ela vai te lembrar." ([comment](https://www.reddit.com/r/TDAH_Brasil/comments/1c7kpvq/usar_alexa_para_lembrar_ou_cobrar_coisas/l08lzen/)) |
| 8 | Rings on silent, keeps going until you turn it off | **no silencioso / tirar do silencioso** (5 / 5). **"não para de tocar até..."** (Alexa reply in row 2). Plain **tocar** is the verb for an alarm ringing. | "Sou babaca por não tirar meu celular do silencioso?" ([r/EuSouOBabaca](https://www.reddit.com/r/EuSouOBabaca/comments/1tyg5tp/sou_babaca_por_não_tirar_meu_celular_do/)). The first pass found the Apple Communities line "meu celular fica no silencioso" (see `pt-BR.md`). |
| 9 | The alarm says what it's for | Reddit had nothing new. The first pass's Play reviews still carry this intent: **"fala o motivo"**, **"fala o que eu escrevi"**, **"lembrete falado"**. Reddit adds that people want it **dito em voz alta** rather than shown: "ouvindo [...] e não só olhando uma notificação" (row 2). | Row 2 Alexa post. See also `pt-BR.md` §2 ("vc escreve e ele fala o motivo do despertar"). |
| 10 | Any schedule (every hour, several a day, every N days) | **toda hora** (8 / 8), **várias vezes por dia**, **todo dia**, **de hora em hora**, and **de X em X** (first pass: "de 5 em 5 minutos"). People also talk about building a **rotina** ("criar uma rotina"). | "Tem uma opção que tu configura também que toca várias vezes por dia, ou todo dia, ou todo hora até tu nao colocar que concluiu. Isso é bom se o lembrete normal não funcionar." ([r/TDAH_Brasil](https://www.reddit.com/r/TDAH_Brasil/comments/1c7kpvq/usar_alexa_para_lembrar_ou_cobrar_coisas/l0ah3u2/)). "Eu preciso literalmente colocar alarme pra escovar os dentes pra não esquecer." ([r/TDAH_Brasil](https://www.reddit.com/r/TDAH_Brasil/comments/1wckjf4/tdah_vai_toma_no_c/)) |

**Extra finding: alarme beats lembrete for people who forget.**
- Brazilians with ADHD say plain lembretes fail. The fix they name is **colocar alarme** (put an alarm on it).
  - Supporting quote: "Use seu celular com alarmes e lembretes [...] É um saco, mas muito pior é esquecer de tudo." ([r/TDAH_Brasil](https://www.reddit.com/r/TDAH_Brasil/comments/1vxdpmx/puta_que_pariu_kralho/p5sze8a/))
- This matches the first pass's "Alarme não é Lembrete!" finding, so copy should present Remi as an **alarme** that **fala** (speaks).

---

## 2. Draft listing

### App name (30)
**`Remi: Lembretes por Voz`**: 23 chars
- Intent 7. "Lembretes" matches Apple's own app name and the search noun. "por voz" is what Play reviewers wrote (first pass: "lembrete por voz", "lembretes de voz").
- Alt: `Remi: Lembrete que Fala` (23). It carries intent 9, but is a weaker search phrase.

### Subtitle (30)
**`O despertador falante`**: 21 chars
- This is a direct carry of "The talking alarm clock". "Despertador falante" is the category term Brazilians use (Play titles plus 31 review lines, first pass), and it indexes a second search phrase.
- Alt B: `O alarme que fala o lembrete` (28). It leads with the real differentiator (intent 9) and uses the "alarme > lembrete" framing from the forums. **Consider this if an A/B test is possible.**
- Alt C: `Alarme falante que te cobra` (27). It carries intent 2 through the forum verb "cobrar", but it's a little pushy.

### Keywords (100 bytes)
**`alarme,remédio,boleto,consulta,aniversário,esquecido,TDAH,lembrar,água,rotina,conta,agenda,fatura`**: 97 chars / **100 bytes**
- é, á and á each cost 2 bytes.
- No word repeats the name or subtitle (Remi, Lembretes, por, Voz, O, despertador, falante).
- Each word maps to an intent: alarme (8), remédio (5), boleto / conta / fatura (3), consulta (4), aniversário (6), esquecido / TDAH (1), lembrar (core verb), água / rotina (10), agenda (4/6).
- If you use Alt B as the subtitle, "alarme" moves out of keywords. Use the freed 7 bytes for `despertador` (12 with comma) by also dropping `agenda`.

### Promotional text (170)
**`“Tomar o remédio.” Um alarme que fala o seu lembrete em voz alta, na hora certa, e continua cobrando até você fazer. É só falar em português.`**: 141 chars
- Intents 9, 2 and 7, plus the Portuguese voice.
- The English opens with "Drink your water." I swapped the opening line for medicine: remédio has 103 hits against 3 for "beber água" in the corpus.
- "continua cobrando" is the native nag verb (row 2).
- "É só falar" echoes "é só pedir" (row 7).

### Description (4000), "você" register
1,185 chars. Same structure as the English: hook, pitch, HOW IT WORKS, BUILT FOR REAL SCHEDULES, closer, legal links. One section is added to state the language truthfully.

```
Você não esquece porque não liga. Esquece porque o seu dia é um caos.

O Remi é o despertador falante para quem vive esquecendo as coisas. Fale o lembrete uma vez e o Remi guarda. Depois ele fala de volta, em voz alta, na hora certa. Nada de notificação que você arrasta para o lado sem ler. É uma voz que diz o que fazer, na hora de fazer.

COMO FUNCIONA
• Fale uma vez: "me lembra de beber água de hora em hora" e pronto
• O Remi transforma o que você disse em um alarme falado, no horário que você pediu
• Na hora, o celular fala o lembrete em voz alta, mesmo com a tela bloqueada
• Adiou? O Remi continua cobrando até você fazer

FEITO PARA A VIDA REAL
• Horário fixo, várias vezes ao dia, de 2 em 2 horas, a cada 3 dias
• Remédio, água, acordar, boleto, consulta: tudo o que você vive esquecendo

FALE EM PORTUGUÊS
O Remi entende o que você fala em português e fala o lembrete em português. Os menus do app ainda estão em inglês.

Lembrete que você ouve, você faz. Lembrete que você só vê, você esquece. A ideia é essa.

Termos de Uso: https://wahabbasa.github.io/voicereminder-legal/terms.html
Política de Privacidade: https://wahabbasa.github.io/voicereminder-legal/privacy.html
```

Line notes:

| Line | Intent | Evidence behind the wording |
|---|---|---|
| "Você não esquece porque não liga. Esquece porque o seu dia é um caos." | 1 | Answers the accusation forum users report ("esqueço por que quero", "desinteressadas"). "Não ligar" is the colloquial "not care". "Caos" appears in "o caos da vida" and "É um caos...". English "loud" has no idiomatic match, so this keeps the intent rather than the word. |
| "para quem vive esquecendo as coisas" | 1 | "vive esquecendo" is the habitual form; "esquece as coisas" appears in r/desabafosdavida. "Esquecido" is kept for keywords: as an on-page label it can read as self-deprecating. |
| "Nada de notificação que você arrasta para o lado sem ler" | 2 | "olhando uma notificação [...] sem vê-la de fato" (Alexa post). |
| "me lembra de beber água de hora em hora" | 7, 10 | Spoken imperative "me lembra", not the formal "lembre-me". "de hora em hora" is the spoken interval form. Keeps the English example. |
| "mesmo com a tela bloqueada" | 8 | Apple pt-BR uses "Tela Bloqueada". It avoids a "rings on silent" claim in the body. |
| "Adiou? O Remi continua cobrando até você fazer" | 2, 8 | "Adiar" is Apple's snooze label (first pass). "cobrar" comes from row 2 ("me cobrando"). |
| "de 2 em 2 horas, a cada 3 dias" | 10 | "de X em X" (first-pass review). "a cada N dias" is the neutral form. |
| "Remédio, água, acordar, boleto, consulta" | 3, 4, 5 | Swaps "errands" for boleto and consulta, the two forum-native nouns. |
| FALE EM PORTUGUÊS section | truth | The voice works in Portuguese and the menus are English (constraint). It heads off 1-star reviews from people who expect a translated UI. |
| Closer | 9 | Mirrors the English. "Ouve / só vê" carries the Alexa poster's hear-vs-glance point. |

### Screenshot headlines (two short lines; **[blue]** marks the blue phrase)

| # | English | pt-BR | Intent and evidence |
|---|---|---|---|
| 1 | Never forget / the water bill again | **Nunca mais deixe / [o boleto vencer]** | Intent 3. The water bill becomes **boleto**: 18 hits against 3 for conta de água and 0 for conta de luz. "O boleto venceu" is the native complaint and a running joke, so "deixar o boleto vencer" is what people actually say. Alt: `Nunca mais esqueça / [a conta de luz]` (Olhar Digital's "contas de casa", first pass). |
| 2 | Never miss / the doctor again | **Nunca mais perca / [a consulta médica]** | Intent 4. "perder a consulta" ("não perder aquela consulta importante"). "Consulta" is the noun; "médica" makes it the doctor at a glance. Alt: `Nunca mais perca / [a consulta]`. |
| 3 | Set reminders / with voice commands | **Crie lembretes / [por comando de voz]** | Intent 7. "comandos de voz" (r/conselhosbacanas, Siri threads). Alt, more casual: `Crie lembretes / [é só falar]` (from "é só pedir"). |
| 4 | Always rings. / Even on silent. + "Keeps going until you turn it off" | **Sempre toca. / [Até no silencioso.]** + subtitle **"Não para até você desligar"** | Intent 8. "no silencioso" (r/EuSouOBabaca, Apple Communities). "não vai parar de tocar [...] até vc pedir" (Alexa reply). Per the truth constraints, this is not the lead claim anywhere else in the copy. |
| 5 | Never forget / Mom's birthday | **Nunca mais esqueça / [o aniversário da mãe]** | Intent 6. "aniversário da sua mãe" (r/TDAH_Brasil) and "aniversario da minha mae" (r/RabiscosBr). "da mãe" is the warm, generic form Brazilians use without a possessive. |
| 6 | Any schedule ("Any" blue) | **[Qualquer] rotina** | Intent 10. "rotina" is how forum users frame repeating alarms ("criar uma rotina"). Alt: `[Toda hora,] todo dia`, echoing "várias vezes por dia, ou todo dia, ou toda hora". It's more native and punchier, but "toda hora" can also read as "constantly". |

Line lengths: line 1s are 12-18 chars; line 2s are 15-20 chars (the longest is "o aniversário da mãe" at 20). The English line 2s run 12-19, so the existing layout should fit. Check line 5 at render.

### Subscription

| Field | Draft | Chars | Note |
|---|---|---|---|
| Group display name | `Remi Pro` | 8 | No diacritics (Apple rule, see `pt-BR.md` §4) |
| Monthly display name | `Pro Mensal` | 10 | Todoist and Seven pattern |
| Annual display name | `Pro Anual` | 9 | Same |
| Description (45) | `Sem limite de lembretes ativos.` | 31 | Says only what Pro is documented to unlock (unlimited active reminders; free = 5, per `docs/appstore-rejection-research.md`). If Pro also gates intervals, use `Lembretes ativos sem limite e de hora em hora.` (46, **1 over**) or `Lembretes sem limite e de hora em hora.` (39). |

---

## 3. Words we avoided and why

| Avoided | Why | Used instead |
|---|---|---|
| **notificação** as the hero noun | Forum users rarely say it (2 hits). They talk about lembretes and alarmes. Used once, negatively, which matches the Alexa post. | lembrete, alarme |
| **lembre-me / lembrar-me** | Formal or European enclitic. Spoken BR is "me lembra". | me lembra de |
| **medicamento / medicação** in headlines | Clinical register, used by advisers and pharma. People say remédio (103 vs 68, and remédio dominates first-person lines). | remédio |
| **conta de água** (literal from the English) | 3 hits, all in one thread about a tenant, not about forgetting. | boleto (alt: conta de luz) |
| **fatura** as the headline bill | It's specific to credit cards; the boleto covers every bill type. | Kept in keywords only |
| **compromisso médico / consulta com o doutor** | Stiff. "Consulta" alone is the noun Brazilians use. | consulta médica |
| **esquecido(a)** in visible copy | Real word (9 hits), but self-labeling copy can sting. It mostly appears jokingly ("sou mt esquecido kkkkk"). | Keywords only; "quem vive esquecendo" in copy |
| **memória de peixe, cabeça de vento** | Real slang but rare (1 and 0 hits), and it mocks the user. | none |
| **correria** | Natural BR, but I found no corpus evidence this round. "Caos" did appear. | caos |
| **barulhento / seu dia é barulhento** (literal "loud") | A false friend in spirit: a "dia barulhento" is about noise, not busyness. | caos |
| **intervalo / frequência** | Textbook. People say "de X em X", "de hora em hora", "toda hora". | de 2 em 2 horas, de hora em hora |
| **"modo silencioso"** in headlines | Correct, but people say "no silencioso". | Até no silencioso |
| **"modo não perturbe"** | Not the same claim, and not verified for Remi. | none |
| **"diz a hora"** or any clock-time claim | Remi does not say the time (truth constraint). | "fala o lembrete" |
| **"app em português"** | Menus are in English (truth constraint). | "entende e fala português", plus "Os menus do app ainda estão em inglês." |
| AI provider names | House rule. | none |
| **lembrar** in the name | "Lembretes" is already the category and the Apple app name. | lembrar kept in keywords |

## 4. Open questions

1. Subtitle choice: `O despertador falante` (category search term) or `O alarme que fala o lembrete` (differentiator plus the forum's "alarme > lembrete" framing). This is the one decision to make.
2. Pro scope: confirm whether intervals are Pro-gated before finalizing the 45-char description. Separately, guideline 2.3.2 may want the free limit (5 active reminders) stated in the description; the English description doesn't state it today.
3. Not verified: whether App Store BR search folds accents ("remédio" vs "remedio"). Bytes were not spent on accent-less duplicates.
