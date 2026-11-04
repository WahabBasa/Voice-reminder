# Remi 1.0.5: App Store review packet

Prepared 2026-11-03 in App Store Connect. **Nothing has been submitted and no build is attached.** Every string below was read back from ASC after writing.

## Version

- Version `1.0.5`, id `56f77821-be8f-45b0-b957-7e53be492bba`, state **PREPARE_FOR_SUBMISSION**
- Release option: **AFTER_APPROVAL** (same as 1.0.4)
- Copyright: `2026 Oldowan Tech` (unchanged)
- Age rating: FOUR_PLUS (carried over to the new editable app info `026f6cc3-9173-4e80-a2ea-487d0f10d643`)
- Build: **none attached**
- Support URL `https://wahabbasa.github.io/voicereminder-legal` and privacy policy URL `https://wahabbasa.github.io/voicereminder-legal/privacy.html` on every locale. Marketing URL: none, as on 1.0.4.

## App Review information

- Contact: Abdul Wahab Basalirwa, +971506918114, **athea.hab@gmail.com** (unchanged, deliberate)
- Sign-in required: no (unchanged)
- Notes (CHANGED, user-approved wording; 1.0.4's notes described the 1.0.4 listing change and had no testing instructions):

```text
Store listing update only: new screenshots, keywords and three new languages. No app changes.
```

1.0.4 was:

```text
This update refreshes the App Store listing: a new English title, new German and Arabic store pages, updated screenshots and search images. The app's features are unchanged.
```

"No functional changes" is confirmed: build 13 differs from 1.0.4 only in the version and build number in `app.json`.

## Summary

| Locale | Name | Subtitle | Keywords | Promo | Description | What's New | Screenshots | Creatives |
|---|---|---|---|---|---|---|---|---|
| en-US | unchanged | unchanged | CHANGED | unchanged | unchanged | CHANGED | NEW: 7 (6.7") | header + search (woman alarm) |
| en-GB | NEW | NEW | NEW | NEW | NEW | NEW | NEW: 7 (6.7") | header + search (woman alarm) |
| pt-BR | unchanged | CHANGED | CHANGED | unchanged | unchanged | CHANGED | NEW: 7 (6.7") | header + search (woman alarm) |
| es-MX | unchanged | CHANGED | CHANGED | unchanged | unchanged | CHANGED | NEW: 7 (6.7") | header + search (woman alarm) |
| de-DE | unchanged | CHANGED | CHANGED | unchanged | unchanged | CHANGED | NEW: 7 (6.7") | header + search (woman alarm) |
| ar-SA | unchanged | unchanged | CHANGED | unchanged | unchanged | CHANGED | NEW: 7 (6.7") | header + search (woman alarm) |
| sv | NEW | NEW | NEW | NEW | NEW | NEW | NEW: 7 (6.7") | **none** |
| fr-FR | NEW | NEW | NEW | NEW | NEW | NEW | NEW: 7 (6.7") | **none** |

Promo text and What's New show as CHANGED/unchanged against 1.0.4's live values. Apple does not copy promo text to a new version; it was re-written with 1.0.4's text.

## Native checks needed

- **pt-BR:** subtitle `Despertador falante e alarme`; What's New
- **es-MX:** subtitle `Alarma y despertador que habla` (proposal §3: "habla" vs "hablan"; fallback `Despertador y alarma que habla`); What's New
- **de-DE:** subtitle `Spracherinnerung & Zeitansage`; What's New
- **ar-SA:** keyword `يتكلم` (unverified Gulf usage); What's New
- **sv:** name, subtitle, keywords (`glömsk`, `väckare`, `uppläsning`); description; promo text; What's New
- **fr-FR:** name `Remi: Réveil et rappel vocal`, subtitle and keywords (written by Claude from the FR head terms, not in the proposal); description (casual "tu"); promo text; What's New

## Per locale

### en-US: English (US)

**Name** (unchanged, 25/30)

```text
Remi: Talking Alarm Clock
```

**Subtitle** (unchanged, 30/30)

```text
Voice reminders, said out loud
```

**Keywords** (CHANGED, 97/100)

```text
speaking,spoken,announcer,time,forgetful,hourly,chime,adhd,med,nag,alert,memo,senior,elderly,wake
```

1.0.4 was:

```text
speaking,announce,announcer,time,timer,chime,hourly,med,forgetful,adhd,talk,ring,wake,remember,water
```

**Promotional text** (unchanged, 99/170)

```text
"Drink your water." An alarm that says your reminder out loud — on time, and again until it's done.
```

**Description** (unchanged, 1050/4000)

```text
You don't forget because you don't care. You forget because your day is loud.

Remi is the talking alarm clock for people who forget a lot. Speak a reminder once and Remi remembers it — then says it back to you, out loud, at exactly the right time. Not a silent banner you swipe away without reading. A voice that tells you what to do, when it's time to do it.

HOW IT WORKS
• Say it once: "remind me to drink water every hour" — done
• Remi turns your words into a spoken alarm on the schedule you asked for
• When it's time, your phone speaks the reminder out loud — even from the lock screen
• Snooze it, and Remi keeps nagging until it's actually done

BUILT FOR REAL SCHEDULES
• Exact times, multiple times a day, intervals, every-N-days
• Meds, water, wake-ups, errands — anything you keep missing


Reminders you hear get done. Reminders you glance at get forgotten. That's the whole idea.

Terms of Use: https://wahabbasa.github.io/voicereminder-legal/terms.html
Privacy Policy: https://wahabbasa.github.io/voicereminder-legal/privacy.html
```

**What's New** (CHANGED, 48/4000)

```text
Now available in Swedish, French and UK English.
```

1.0.4 was:

```text
Small improvements and fixes.
```

**Screenshots** (NEW, APP_IPHONE_67, 7 on 1.0.5, uploaded 2026-11-03, all COMPLETE, order verified; the carried-over 1.0.4 set was removed from 1.0.5 only):

1. `marketing/out/asc_v4/en-US/asc/6.7/01-voice_1290x2796.png`
2. `marketing/out/asc_v4/en-US/asc/6.7/02-bill_1290x2796.png`
3. `marketing/out/asc_v4/en-US/asc/6.7/03-today_1290x2796.png`
4. `marketing/out/asc_v4/en-US/asc/6.7/04-rings_1290x2796.png`
5. `marketing/out/asc_v4/en-US/asc/6.7/05-birthday_1290x2796.png`
6. `marketing/out/asc_v4/en-US/asc/6.7/06-schedule_1290x2796.png`
7. `marketing/out/asc_v4/en-US/asc/6.7/07-interval_1290x2796.png`

**Creatives** (on 1.0.5, carried over from 1.0.4 by Apple, verified ACTIVE):

- PRODUCT_PAGE_HEADER_ASSET: Remi alarm header en-US (woman v1) (`b3400019-56b3-8298-8030-55c56ee32a4c`), ACTIVE
- APP_STORE_SEARCH_RESULTS_ASSET: Remi alarm search en-US (woman v1) (`cdc00019-56b3-8298-8005-a57033556e31`), ACTIVE

### en-GB: English (UK) (NEW localization)

**Name** (NEW, 25/30)

```text
Remi: Talking Alarm Clock
```

**Subtitle** (NEW, 30/30)

```text
Voice reminders, said out loud
```

**Keywords** (NEW, 98/100)

```text
speaking,spoken,announcer,time,forgetful,hourly,chime,adhd,med,nag,alert,senior,elderly,wake,nudge
```

**Promotional text** (NEW, 99/170)

```text
"Drink your water." An alarm that says your reminder out loud — on time, and again until it's done.
```

**Description** (NEW, 1050/4000) — identical to en-US: it has no US-only spellings, and "Mom" does not appear in it

```text
You don't forget because you don't care. You forget because your day is loud.

Remi is the talking alarm clock for people who forget a lot. Speak a reminder once and Remi remembers it — then says it back to you, out loud, at exactly the right time. Not a silent banner you swipe away without reading. A voice that tells you what to do, when it's time to do it.

HOW IT WORKS
• Say it once: "remind me to drink water every hour" — done
• Remi turns your words into a spoken alarm on the schedule you asked for
• When it's time, your phone speaks the reminder out loud — even from the lock screen
• Snooze it, and Remi keeps nagging until it's actually done

BUILT FOR REAL SCHEDULES
• Exact times, multiple times a day, intervals, every-N-days
• Meds, water, wake-ups, errands — anything you keep missing


Reminders you hear get done. Reminders you glance at get forgotten. That's the whole idea.

Terms of Use: https://wahabbasa.github.io/voicereminder-legal/terms.html
Privacy Policy: https://wahabbasa.github.io/voicereminder-legal/privacy.html
```

**What's New** (NEW, 48/4000)

```text
Now available in Swedish, French and UK English.
```

**Screenshots** (NEW, APP_IPHONE_67, 7 on 1.0.5, uploaded 2026-11-03, all COMPLETE, order verified; the carried-over 1.0.4 set was removed from 1.0.5 only):

1. `marketing/out/asc_v4/en-GB/asc/6.7/01-voice_1290x2796.png`
2. `marketing/out/asc_v4/en-GB/asc/6.7/02-bill_1290x2796.png`
3. `marketing/out/asc_v4/en-GB/asc/6.7/03-today_1290x2796.png`
4. `marketing/out/asc_v4/en-GB/asc/6.7/04-rings_1290x2796.png`
5. `marketing/out/asc_v4/en-GB/asc/6.7/05-birthday_1290x2796.png`
6. `marketing/out/asc_v4/en-GB/asc/6.7/06-schedule_1290x2796.png`
7. `marketing/out/asc_v4/en-GB/asc/6.7/07-interval_1290x2796.png`

**Creatives** (NEW: the approved en-US assets reused from the Asset Library and placed on en-GB on 2026-11-03; no new upload or review; verified ACTIVE):

- PRODUCT_PAGE_HEADER_ASSET: Remi alarm header en-US (woman v1) (`b3400019-56b3-8298-8030-55c56ee32a4c`), ACTIVE
- APP_STORE_SEARCH_RESULTS_ASSET: Remi alarm search en-US (woman v1) (`cdc00019-56b3-8298-8005-a57033556e31`), ACTIVE

### pt-BR: Portuguese (Brazil)

**Native check needed:** subtitle `Despertador falante e alarme`; What's New

**Name** (unchanged, 23/30)

```text
Remi: Lembretes por Voz
```

**Subtitle** (CHANGED, 28/30)

```text
Despertador falante e alarme
```

1.0.4 was:

```text
O despertador falante
```

**Keywords** (CHANGED, 98/100)

```text
fala,falado,relógio,remédio,boleto,consulta,compromisso,aniversário,esquecido,tdah,hora,idoso,água
```

1.0.4 was:

```text
relógio,alarme,fala,falar,hora,remédio,boleto,consulta,aniversário,esquecido,TDAH,lembrar,água
```

**Promotional text** (unchanged, 141/170)

```text
“Tomar o remédio.” Um alarme que fala o seu lembrete em voz alta, na hora certa, e continua cobrando até você fazer. É só falar em português.
```

**Description** (unchanged, 1146/4000)

```text
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
O Remi entende o que você fala em português e fala o lembrete em português.

Lembrete que você ouve, você faz. Lembrete que você só vê, você esquece. A ideia é essa.

Termos de Uso: https://wahabbasa.github.io/voicereminder-legal/terms.html
Política de Privacidade: https://wahabbasa.github.io/voicereminder-legal/privacy.html
```

**What's New** (CHANGED, 55/4000)

```text
Agora também em sueco, francês e inglês do Reino Unido.
```

1.0.4 was:

```text
Pequenas melhorias e correções.
```

**Screenshots** (NEW, APP_IPHONE_67, 7 on 1.0.5, uploaded 2026-11-03, all COMPLETE, order verified; the carried-over 1.0.4 set was removed from 1.0.5 only):

1. `marketing/out/asc_v4/pt-BR/asc/6.7/01-voice_1290x2796.png`
2. `marketing/out/asc_v4/pt-BR/asc/6.7/02-bill_1290x2796.png`
3. `marketing/out/asc_v4/pt-BR/asc/6.7/03-today_1290x2796.png`
4. `marketing/out/asc_v4/pt-BR/asc/6.7/04-rings_1290x2796.png`
5. `marketing/out/asc_v4/pt-BR/asc/6.7/05-birthday_1290x2796.png`
6. `marketing/out/asc_v4/pt-BR/asc/6.7/06-schedule_1290x2796.png`
7. `marketing/out/asc_v4/pt-BR/asc/6.7/07-interval_1290x2796.png`

**Creatives** (on 1.0.5, carried over from 1.0.4 by Apple, verified ACTIVE):

- APP_STORE_SEARCH_RESULTS_ASSET: Remi alarm search pt-BR (woman v1) (`de400019-56b3-8298-8016-eba4057ee2a3`), ACTIVE
- PRODUCT_PAGE_HEADER_ASSET: Remi alarm header pt-BR (woman v1) (`7e000019-56b3-8298-803b-402d3014ebc2`), ACTIVE

### es-MX: Spanish (Mexico)

**Native check needed:** subtitle `Alarma y despertador que habla` (proposal §3: "habla" vs "hablan"; fallback `Despertador y alarma que habla`); What's New

**Name** (unchanged, 27/30)

```text
Remi: Recordatorios con voz
```

**Subtitle** (CHANGED, 30/30)

```text
Alarma y despertador que habla
```

1.0.4 was:

```text
La alarma que te dice para qué
```

**Keywords** (CHANGED, 99/100)

```text
reloj,parlante,pastillas,medicina,cita,pago,tarjeta,cumpleaños,pendientes,tdah,olvidadizo,hora,agua
```

1.0.4 was:

```text
reloj,despertador,habla,hablar,hora,pastillas,medicina,cita,recibo,cumpleaños,pendientes,tdah,agua
```

**Promotional text** (unchanged, 125/170)

```text
“Hora de tomar agua.” Una alarma que te dice en voz alta qué tienes que hacer, a tiempo, y vuelve a sonar hasta que lo hagas.
```

**Description** (unchanged, 1104/4000)

```text
No se te olvida porque no te importe. Se te olvida porque tu día es un caos.

Remi es la alarma que habla, hecha para olvidadizos. Dile un recordatorio una vez y Remi se acuerda por ti; luego te lo dice en voz alta, justo a la hora. No es una notificación que quitas sin leer. Es una voz que te dice qué hacer, cuando toca hacerlo.

CÓMO FUNCIONA
• Dilo una vez: “recuérdame tomar agua cada hora”, y listo
• Remi convierte lo que dices en una alarma que habla, con el horario que pediste
• A la hora, tu celular te dice el recordatorio en voz alta, aunque esté bloqueado
• Si la pospones, Remi te sigue insistiendo hasta que de verdad lo hagas

HECHA PARA HORARIOS REALES
• A una hora exacta, varias veces al día, cada ciertas horas o cada tantos días
• Pastillas, agua, despertarte, pagos, pendientes: todo lo que se te pasa

Remi te entiende y te habla en español.

Lo que escuchas, lo haces. Lo que solo ves, se te olvida. De eso se trata.

Términos de uso: https://wahabbasa.github.io/voicereminder-legal/terms.html
Política de privacidad: https://wahabbasa.github.io/voicereminder-legal/privacy.html
```

**What's New** (CHANGED, 51/4000)

```text
Ahora también en sueco, francés e inglés británico.
```

1.0.4 was:

```text
Pequeñas mejoras y correcciones.
```

**Screenshots** (NEW, APP_IPHONE_67, 7 on 1.0.5, uploaded 2026-11-03, all COMPLETE, order verified; the carried-over 1.0.4 set was removed from 1.0.5 only):

1. `marketing/out/asc_v4/es-MX/asc/6.7/01-voice_1290x2796.png`
2. `marketing/out/asc_v4/es-MX/asc/6.7/02-bill_1290x2796.png`
3. `marketing/out/asc_v4/es-MX/asc/6.7/03-today_1290x2796.png`
4. `marketing/out/asc_v4/es-MX/asc/6.7/04-rings_1290x2796.png`
5. `marketing/out/asc_v4/es-MX/asc/6.7/05-birthday_1290x2796.png`
6. `marketing/out/asc_v4/es-MX/asc/6.7/06-schedule_1290x2796.png`
7. `marketing/out/asc_v4/es-MX/asc/6.7/07-interval_1290x2796.png`

**Creatives** (on 1.0.5, carried over from 1.0.4 by Apple, verified ACTIVE):

- APP_STORE_SEARCH_RESULTS_ASSET: Remi alarm search es-MX (woman v1) (`9a000019-56b3-8298-802f-79851b49b93d`), ACTIVE
- PRODUCT_PAGE_HEADER_ASSET: Remi alarm header es-MX (woman v1) (`f0800019-56b3-8298-801f-93d59b08e94f`), ACTIVE

### de-DE: German

**Native check needed:** subtitle `Spracherinnerung & Zeitansage`; What's New

**Name** (unchanged, 24/30)

```text
Remi: Sprechender Wecker
```

**Subtitle** (CHANGED, 29/30)

```text
Spracherinnerung & Zeitansage
```

1.0.4 was:

```text
Sagt dir laut, was ansteht
```

**Keywords** (CHANGED, 100/100)

```text
ansage,ansagen,sprachansage,termine,erinnerung,medikamentenwecker,uhrzeit,uhr,sprachausgabe,senioren
```

1.0.4 was:

```text
zeitansage,ansage,ansagen,sprachansage,termine,erinnerung,medikamentenwecker,pillenwecker,tabletten
```

**Promotional text** (unchanged, 135/170)

```text
„Wasser trinken.“ Ein Wecker mit Ansage: Er sagt dir deine Erinnerung laut an, pünktlich, und meldet sich wieder, bis sie erledigt ist.
```

**Description** (unchanged, 1218/4000)

```text
Du vergisst nicht, weil es dir egal ist. Du vergisst, weil dein Tag voll ist.

Remi ist der sprechende Wecker für alle, die viel vergessen. Sag eine Erinnerung einmal, und Remi merkt sie sich. Zur richtigen Zeit klingelt dein iPhone wie ein Wecker und sagt dir laut, was ansteht. Kein stummes Banner, das du ungelesen wegwischst, sondern ein Wecker mit Ansage.

SO FUNKTIONIERT ES
• Einmal sagen: „Erinnere mich jede Stunde ans Wassertrinken“ – fertig
• Remi macht daraus einen Alarm mit Sprachansage, genau zu den Zeiten, die du willst
• Wenn es so weit ist, sagt dein iPhone die Erinnerung laut an, auch auf dem Sperrbildschirm
• Auf später verschoben? Remi meldet sich wieder, bis es wirklich erledigt ist

FÜR ECHTE TAGESABLÄUFE
• Feste Uhrzeiten, mehrmals am Tag, alle paar Stunden, alle paar Tage
• Termine, Tabletten, Wasser, Aufstehen, Erledigungen: alles, was dir sonst durchrutscht

AUF DEUTSCH
Remi versteht dich auf Deutsch und sagt dir deine Termine auf Deutsch an.

Was du hörst, erledigst du. Was du nur siehst, vergisst du. Darum geht es.

Nutzungsbedingungen: https://wahabbasa.github.io/voicereminder-legal/terms.html
Datenschutzerklärung: https://wahabbasa.github.io/voicereminder-legal/privacy.html
```

**What's New** (CHANGED, 63/4000)

```text
Jetzt auch auf Schwedisch, Französisch und britischem Englisch.
```

1.0.4 was:

```text
Kleine Verbesserungen und Fehlerbehebungen.
```

**Screenshots** (NEW, APP_IPHONE_67, 7 on 1.0.5, uploaded 2026-11-03, all COMPLETE, order verified; the carried-over 1.0.4 set was removed from 1.0.5 only):

1. `marketing/out/asc_v4/de-DE/asc/6.7/01-voice_1290x2796.png`
2. `marketing/out/asc_v4/de-DE/asc/6.7/02-bill_1290x2796.png`
3. `marketing/out/asc_v4/de-DE/asc/6.7/03-today_1290x2796.png`
4. `marketing/out/asc_v4/de-DE/asc/6.7/04-rings_1290x2796.png`
5. `marketing/out/asc_v4/de-DE/asc/6.7/05-birthday_1290x2796.png`
6. `marketing/out/asc_v4/de-DE/asc/6.7/06-schedule_1290x2796.png`
7. `marketing/out/asc_v4/de-DE/asc/6.7/07-interval_1290x2796.png`

**Creatives** (on 1.0.5, carried over from 1.0.4 by Apple, verified ACTIVE):

- PRODUCT_PAGE_HEADER_ASSET: Remi alarm header de-DE (woman v1) (`33400019-56b3-8298-801b-65cb7cf1452c`), ACTIVE
- APP_STORE_SEARCH_RESULTS_ASSET: Remi alarm search de-DE (woman v1) (`68400019-56b3-8298-802c-d8250c05eb6e`), ACTIVE

### ar-SA: Arabic

**Native check needed:** keyword `يتكلم` (unverified Gulf usage); What's New

**Name** (unchanged, 23/30)

```text
Remi: منبه ناطق بالعربي
```

**Subtitle** (unchanged, 27/30)

```text
ذكرني بالصوت ويرن حتى تنتبه
```

**Keywords** (CHANGED, 97/100)

```text
الساعة,الناطقة,ساعة,الساعه,الناطقه,ناطقه,ناطقة,الناطق,نطق,الوقت,يتكلم,صوتي,بصوت,عالي,تذكير,الدواء
```

1.0.4 was:

```text
الساعة,الناطقة,ساعة,ناطقة,الساعه,الناطقه,ساعه,ناطقه,نطق,الوقت,الناطق,تذكير,الدواء,دواء,مواعيد
```

**Promotional text** (unchanged, 87/170)

```text
«اشرب الماء». منبه يقول لك تذكيرك بصوت مسموع في وقته، ويعود حتى تُنجزه. ويتكلم العربية.
```

**Description** (unchanged, 913/4000)

```text
نسيانك ليس لأنك لا تهتم، بل لأن يومك مزدحم.

Remi منبه ناطق لمن ينسون كثيرًا. قل التذكير مرة واحدة، ويحفظه Remi. وفي الوقت المحدد يرن هاتفك مثل المنبه ويقول لك التذكير بصوت مسموع. ليس إشعارًا صامتًا تزيحه دون أن تقرأه، بل منبه يقول لك ما عليك فعله في وقته.

كيف يعمل
• قلها مرة واحدة: «ذكّرني بشرب الماء كل ساعة» وانتهى
• يحوّل Remi التذكير إلى منبه ناطق في المواعيد التي طلبتها
• عندما يحين الوقت، يقول هاتفك التذكير بصوت مسموع، حتى وهو مقفل
• إذا أجّلته، يعود Remi ليذكّرك حتى تُنجزه

مصمَّم لجدولك الحقيقي
• أوقات محددة، عدة مرات في اليوم، كل بضع ساعات، أو كل بضعة أيام
• المواعيد، الماء، الاستيقاظ، الدواء، المشاوير: كل ما يفوتك عادةً

يتكلم العربية
يفهمك Remi بالعربية، ويقول لك تذكيراتك بالعربية.

ما تسمعه تُنجزه، وما تراه فقط تنساه. هذه هي الفكرة كلها.

شروط الاستخدام: https://wahabbasa.github.io/voicereminder-legal/terms.html
سياسة الخصوصية: https://wahabbasa.github.io/voicereminder-legal/privacy.html
```

**What's New** (CHANGED, 54/4000)

```text
متوفر الآن بالسويدية والفرنسية والإنجليزية البريطانية.
```

1.0.4 was:

```text
تحسينات وإصلاحات بسيطة.
```

**Screenshots** (NEW, APP_IPHONE_67, 7 on 1.0.5, uploaded 2026-11-03, all COMPLETE, order verified; the carried-over 1.0.4 set was removed from 1.0.5 only):

1. `marketing/out/asc_v4/ar-SA/asc/6.7/01-voice_1290x2796.png`
2. `marketing/out/asc_v4/ar-SA/asc/6.7/02-bill_1290x2796.png`
3. `marketing/out/asc_v4/ar-SA/asc/6.7/03-today_1290x2796.png`
4. `marketing/out/asc_v4/ar-SA/asc/6.7/04-rings_1290x2796.png`
5. `marketing/out/asc_v4/ar-SA/asc/6.7/05-birthday_1290x2796.png`
6. `marketing/out/asc_v4/ar-SA/asc/6.7/06-schedule_1290x2796.png`
7. `marketing/out/asc_v4/ar-SA/asc/6.7/07-interval_1290x2796.png`

**Creatives** (on 1.0.5, carried over from 1.0.4 by Apple, verified ACTIVE):

- APP_STORE_SEARCH_RESULTS_ASSET: Remi alarm search ar-SA (woman v1) (`a2800019-56b3-8298-8022-de529e044b51`), ACTIVE
- PRODUCT_PAGE_HEADER_ASSET: Remi alarm header ar-SA (woman v1) (`9b000019-56b3-8298-8023-e3e74291232b`), ACTIVE

### sv: Swedish (NEW localization)

**Native check needed:** name, subtitle, keywords (`glömsk`, `väckare`, `uppläsning`); description; promo text; What's New

**Name** (NEW, 26/30)

```text
Remi: Talande väckarklocka
```

**Subtitle** (NEW, 27/30)

```text
Röstpåminnelse och röstlarm
```

**Keywords** (NEW, 100/100)

```text
klocka,alarm,larm,röst,påminnelse,glömsk,adhd,tid,senior,väckare,uppläsning,medicinpåminnelse,piller
```

**Promotional text** (NEW, 97/170)

```text
”Drick ditt vatten.” Ett larm som säger din påminnelse högt – i tid, och igen tills den är gjord.
```

**Description** (NEW, 1075/4000)

```text
Du glömmer inte för att du inte bryr dig. Du glömmer för att din dag är full.

Remi är den talande väckarklockan för dig som glömmer mycket. Säg en påminnelse en gång så kommer Remi ihåg den – och säger den sedan till dig, högt, precis när det är dags. Ingen tyst notis som du sveper bort utan att läsa. En röst som säger vad du ska göra, när det är dags att göra det.

SÅ FUNGERAR DET
• Säg det en gång: ”påminn mig att dricka vatten varje timme” – klart
• Remi gör om dina ord till ett talat larm, enligt schemat du bad om
• När det är dags läser telefonen upp påminnelsen högt – även från låsskärmen
• Snooza, så fortsätter Remi att tjata tills det faktiskt är gjort

BYGGD FÖR RIKTIGA SCHEMAN
• Exakta tider, flera gånger om dagen, med jämna mellanrum, var N:e dag
• Mediciner, vatten, väckning, ärenden – allt du brukar missa

Påminnelser du hör blir gjorda. Påminnelser du bara ser blir glömda. Det är hela idén.

Användarvillkor: https://wahabbasa.github.io/voicereminder-legal/terms.html
Integritetspolicy: https://wahabbasa.github.io/voicereminder-legal/privacy.html
```

**What's New** (NEW, 19/4000)

```text
Nu även på svenska.
```

**Screenshots** (NEW, APP_IPHONE_67, 7 on 1.0.5, uploaded 2026-11-03, all COMPLETE, order verified; the carried-over 1.0.4 set was removed from 1.0.5 only):

1. `marketing/out/asc_v4/sv/asc/6.7/01-voice_1290x2796.png`
2. `marketing/out/asc_v4/sv/asc/6.7/02-bill_1290x2796.png`
3. `marketing/out/asc_v4/sv/asc/6.7/03-today_1290x2796.png`
4. `marketing/out/asc_v4/sv/asc/6.7/04-rings_1290x2796.png`
5. `marketing/out/asc_v4/sv/asc/6.7/05-birthday_1290x2796.png`
6. `marketing/out/asc_v4/sv/asc/6.7/06-schedule_1290x2796.png`
7. `marketing/out/asc_v4/sv/asc/6.7/07-interval_1290x2796.png`

**Creatives:** none. No approved search-card or header asset exists for this locale, so it shows the default search result.

### fr-FR: French (NEW localization)

**Native check needed:** name `Remi: Réveil et rappel vocal`, subtitle and keywords (written by Claude from the FR head terms, not in the proposal); description (casual "tu"); promo text; What's New

**Name** (NEW, 28/30)

```text
Remi: Réveil et rappel vocal
```

**Subtitle** (NEW, 29/30)

```text
Alarme qui parle à voix haute
```

**Keywords** (NEW, 94/100)

```text
parlant,vocale,heure,annonce,horaire,oubli,tdah,médicament,pilule,rendez-vous,eau,senior,matin
```

**Promotional text** (NEW, 114/170)

```text
« Bois ton eau. » Une alarme qui te dit ton rappel à voix haute, à l’heure, et encore jusqu’à ce que ce soit fait.
```

**Description** (NEW, 1196/4000)

```text
Tu n’oublies pas parce que tu t’en fiches. Tu oublies parce que ta journée est bruyante.

Remi est le réveil parlant pour ceux qui oublient souvent. Dis ton rappel une fois et Remi s’en souvient, puis il te le dit à voix haute, pile au bon moment. Pas une notification silencieuse que tu balaies sans la lire. Une voix qui te dit quoi faire, au moment de le faire.

COMMENT ÇA MARCHE
• Dis-le une fois : « rappelle-moi de boire de l’eau toutes les heures », et c’est fait
• Remi transforme tes mots en alarme parlée, selon l’horaire que tu as demandé
• Le moment venu, ton téléphone lit le rappel à voix haute, même depuis l’écran verrouillé
• Tu le reportes ? Remi continue de te relancer jusqu’à ce que ce soit vraiment fait

CONÇU POUR LA VRAIE VIE
• Heures précises, plusieurs fois par jour, à intervalles réguliers, tous les N jours
• Médicaments, eau, réveil, courses : tout ce que tu oublies d’habitude

Les rappels que tu entends, tu les fais. Ceux que tu ne fais que voir, tu les oublies. C’est toute l’idée.

Conditions d’utilisation : https://wahabbasa.github.io/voicereminder-legal/terms.html
Politique de confidentialité : https://wahabbasa.github.io/voicereminder-legal/privacy.html
```

**What's New** (NEW, 34/4000)

```text
Maintenant disponible en français.
```

**Screenshots** (NEW, APP_IPHONE_67, 7 on 1.0.5, uploaded 2026-11-03, all COMPLETE, order verified; the carried-over 1.0.4 set was removed from 1.0.5 only):

1. `marketing/out/asc_v4/fr-FR/asc/6.7/01-voice_1290x2796.png`
2. `marketing/out/asc_v4/fr-FR/asc/6.7/02-bill_1290x2796.png`
3. `marketing/out/asc_v4/fr-FR/asc/6.7/03-today_1290x2796.png`
4. `marketing/out/asc_v4/fr-FR/asc/6.7/04-rings_1290x2796.png`
5. `marketing/out/asc_v4/fr-FR/asc/6.7/05-birthday_1290x2796.png`
6. `marketing/out/asc_v4/fr-FR/asc/6.7/06-schedule_1290x2796.png`
7. `marketing/out/asc_v4/fr-FR/asc/6.7/07-interval_1290x2796.png`

**Creatives:** none. No approved search-card or header asset exists for this locale, so it shows the default search result.

## Decisions taken while applying the proposal

- **de-DE medicine words:** applied the proposal as written. `medikamentenwecker` stays (ranks #3); `pillenwecker` and `tabletten` are gone. Restoring `tabletten` in place of `senioren` was considered but would make the field 101/100; the user closed it on 2026-11-03: keep `senioren`.
- **sv keywords:** used the proposal's with-medicine variant (`medicinpåminnelse,piller`), per "keep the medicine keywords".
- **fr-FR:** the proposal had no French set. Title carries two head terms (réveil, rappel), subtitle the third (alarme) plus "qui parle"/"voix haute"; keywords add `parlant` for "réveil parlant" and the medicine word `médicament`. The unaccented `reveil` (the higher-popularity spelling) is not in the keyword field: Apple search normally folds accents, so it would duplicate the title word. Unverified.
- **en-GB:** title, subtitle, promo and description identical to en-US; keywords as the proposal (`nudge` instead of `memo`).
- **sv/fr descriptions:** faithful translations of en-US. No "speaks Swedish/French" section was added, even though the app UI ships sv and fr.

## Screenshots

All 8 locales: 7 shots each (01 voice, 02 bill, 03 today, 04 rings, 05 birthday, 06 schedule, 07 interval) under APP_IPHONE_67 at 1290x2796. No 6.5" set was uploaded: 1.0.5 had none, and ASC scales the 6.7" set down.

## Left for the user's go

Status 2026-11-03: screenshots done. Step 1 was blocked by Claude Code's auto-mode classifier ("production deploy"); the user needs to run it, or allow it.

1. Upload build 13 to ASC (`eas submit` of build `c2669b63-9499-4653-8a58-af7ccb900c67`).
2. Attach it to 1.0.5.
3. Submit for review.
