# es-MX localization research: Remi (2026-10-08)

Research only. Nothing created in App Store Connect. Every quote below comes from a page or file that was actually fetched or read; pages that would not load are listed at the end.

## 1. Top picks

| Field | Limit | Top pick | Chars | Why |
|---|---|---|---:|---|
| Subscription group display name | not documented (see §4) | **Remi Pro** | 8 | Brand stays in English. MX listings keep "Pro" untranslated (the "Alarma con Voz y Despertador" IAP is just "Pro"). No accents, so it clears Apple's "no diacritics" wording. |
| Display name, monthly | 30 | **Pro mensual** | 11 | "plan mensual, anual" is Apple MX's own wording; Memory AI (MX) sells "Plan mensual". No accents. |
| Display name, annual | 30 | **Pro anual** | 9 | Same reasoning ("Plan anual" on Memory AI MX). |
| Description (both) | 45 | **Recordatorios ilimitados y repetir por horas** | 44 | "Recordatorios" is the category word in MX. "Repetir cada X horas" is how a MX medication-reminder app describes the same interval feature. |
| App name (optional, for a later update) | 30 | **Remi: Recordatorios de voz** | 26 | Gets "recordatorios" and "voz" into the most heavily weighted field. |
| Subtitle (optional, for a later update) | 30 | **La alarma que te dice para qué** | 30 | Uses the reviewers' own words ("me diga para qué es", "para q suena la alarma"). Brings in "alarma" without repeating the name. |

If you would rather keep the display name as the English "Pro" for both plans, that also matches MX practice (see §4). "Pro mensual" / "Pro anual" just make the two plans easier to tell apart under Configuración > Suscripciones.

### Alternatives

**Group display name**
- Remi Pro (8): top pick
- Remi Pro: recordatorios (23): longer, and the group name doesn't need keywords.

**Display name (monthly / annual)**
- A. Pro mensual (11) / Pro anual (9): **top**
- B. Pro (3) / Pro (3): matches the EN listing and the MX competitor "Alarma con Voz" ("Pro $299.00")
- C. Remi Pro mensual (16) / Remi Pro anual (14)

**Description (45 max; character counts verified by hand)**
- A. `Recordatorios ilimitados y repetir por horas` (44): **top**, plain and natural.
- B. `Recordatorios ilimitados, repite cada X horas` (45, right at the limit): closest to competitor wording ("Repetir cada X horas"), slightly telegraphic.
- C. `Recordatorios ilimitados y por intervalos` (41): literal translation of "interval schedules", more technical.
- These did not fit: "...y avisos cada X horas" (46), "...y repetir cada X horas" (47), "...y repetición por horas" (47).

**Subtitle (30 max)**
- `La alarma que te dice para qué` (30): **top**, the benefit in reviewers' words
- `Alarma que habla y te recuerda` (30): more keywords (alarma, habla, recuerda)
- `El despertador que habla` (24): mirrors the EN "The talking alarm clock", but the same phrase is already a competitor's title and slogan in MX (§3), and "despertador" signals wake-up only
- `Recordatorios con alarma y voz` (30): pure keyword line, use if the name stays English
- `Recordatorios que te hablan` (27)

**Keyword field (100 BYTES, not characters: `ñ` and accented vowels cost 2 bytes each in UTF-8; no spaces after commas)**
- With name "Remi: Recordatorios de voz" + subtitle "La alarma que te dice para qué" (avoids repeating those words):
  `despertador,habla,pastillas,medicinas,citas,pagos,cumpleaños,pendientes,avisos,olvido,parlante` = **95 bytes**
- If the name stays English ("Remi: Voice Reminders"):
  `recordatorio,despertador,habla,pastillas,medicamento,cita,recibo,pago,cumpleaños,tareas,pendientes` = **99 bytes**
- `parlante` is optional. Mexicans say "bocina" for a speaker, but the market-leading Android app sells itself in MX as "Despertador Parlante Plus", and Spanish reviewers repeat the phrase (§3). I can't tell whether iOS users in MX type it.
- The es-MX localization is also indexed on the **US** storefront (AppTweak table), so these keywords also reach Spanish-speaking iPhone users in the US.

## 2. Vocabulary with evidence

### Which noun wins: recordatorio vs alarma vs despertador
- **Recordatorio(s)** is the category noun for reminder and to-do apps in the MX App Store. Titles and subtitles seen in the MX "También te podría interesar" rails (apps.apple.com/mx):
  - Apple's own app: "Recordatorios"
  - "Recordatorios con Despertador", subtitle "Recordatorio, Alarma y Agenda"
  - "TickTick: Listas de tareas", subtitle "calendario,agenda,recordatorio"
  - "To Do List: Recordatorios", subtitle "Organizador de tareas, Agenda"
  - "Todoist: To do list–Calendario", subtitle "Gestor de tareas–recordatorios"
  - "Structured - Daily Planner", subtitle "Calendario y Recordatorios"
  - MyTherapy: "Recordatorios de Medicamentos", subtitle "MyTherapy: Alarmas de Medicina"
- **Alarma** is the word for the thing that rings. Apple's es-MX iPhone alarm guide uses "alarma", "app Reloj", "Posponer", "Etiqueta", "Repetir", "Sonido", "app Configuración". In the Spanish reviews of Sentry's talking alarm (Google Play, es_es/es_mx/es_us bucket), lines mentioning each word: alarma 644, despertador 295, recordatorio 45. Sentry is a wake-up app, so this skews toward alarm words.
- **Despertador** means wake-up / alarm clock. Useful as a keyword, but as the lead noun it tells people "wake-up app", not "reminders".
- **Takeaway:** lead with *recordatorios* (name) and attach *alarma* (subtitle). That matches what the medication apps already do: "Recordatorios de Medicamentos" + "Alarmas de Medicina".

### "Talking alarm" / voice reminder
- **"despertador que habla"**:
  - ZipoApps' MX Play title is "Despertador que habla - Alarma"
  - The iOS competitor "Alarma con Voz y Despertador" (MX store, subtitle "Temporizador y recordatorios") says "Alarma con Voz: el despertador que habla" and "Crea alarmas y temporizadores que hablan"
- **"alarma con voz"**:
  - "la alarma con voz es buenísima... con la voz, aumenta la importancia de tomar mis pastillas" (Sentry review, 2025-09-03)
  - "excelente app para despertar o poner alarmas con voz" (ZipoApps review, 2026-07-23)
- **"despertador parlante"**:
  - Sentry's MX Play title is "Despertador Parlante Plus"
  - Reviews echo it: "La mejor de todas las aplicaciones para despertador parlante" (2025-01-19), "Es muy buena como Despertador Parlante" (2025-04-02)
  - Caveat: in Mexico a speaker is a "bocina". A Mexican outlet covering Profeco writes "las mejores bocinas portátiles" and never uses "parlante" or "altavoz" (sdpnoticias.com). "Parlante" reads South American. Keyword only, never in copy.
- **"recordatorios con voz"**: "Tiene recordatorios con voz, tonos de música..." (Sentry review, 2026-06-07). The writer uses "coges el tranquillo", which is Spain usage, so this may not be Mexican.

### "It tells me what the alarm is for": the core benefit, in users' words
- "me encanta que la voz me diga para que es." (Sentry, 2025-05-12, about appointments: "recordarme citas")
- "El que se pueda elegir la música y que te recuerde hablando para que es la alarma es fabuloso" (Sentry, 2024-12-13)
- "me recuerda para q suena la alarma... así no olvido lo q debo hacer a esa hora" (ZipoApps, 2026-04-03)
- "Me encanta que habla porque así no se me olvida porque puse la alarma" (ZipoApps, 2025-01-08)
- "se me olvidan cosas y necesitaba una alarma que me hablara y dijera lo que tenía que hacer" (Sentry, 2025-07-03)
- "no tengo que ver el cel para saber para que pise esa alarma" (Sentry, 2026-05-16; "cel" is short for celular)
- "todos los días me dice el nombre de las pastillas que tengo que tomar ahora ya no padezco de olvido" (Sentry, 2025-06-13)
- Most common patterns: **"me dice / me diga para qué es"**, **"me recuerda..."**, **"(una alarma) que me hable"**.

### Forgetting
- **"se me olvida / se me olvidan cosas"**, **"se me olvidaba"**, **"no se me olvida"**, **"así no olvido"** (reviews above; ZipoApps 2026-03-11: "se me hace mas facil recordarme de lo que se me olvidaba")
- **"olvidadizo/a(s)"**: "Nosotros, las personas olvidadizas necesitamos un recordatorio eficaz." (MX App Store review of Recordatorios con Despertador); "los olvidadisos como yo" (Sentry, 2025-06-18)
- **"no se me pasan los horarios"**: "desde q lo tengo no sé me pasan los horarios de los medicamentos" (ZipoApps, 2023-01-19)

### Snooze, to-do and the screenshot themes
- **Snooze = "Posponer"**: the iOS button name in Apple's es-MX alarm guide. Reviewers use the same verb: "posponerla un rato", "si pospones, no suena más". Some write the English "snooze" (2 lines). MX competitor feature list: "Auto-Posponer", "Posponer", "Reprogramar".
- **To-do = "pendientes"**:
  - Apple's MX Recordatorios listing: "Puedes usarla para todos tus pendientes"
  - Imagen Radio (MX) headline: "la app que te ayuda a recordar tus pendientes"
  - "Tareas" is used too: "Organizador de tareas", "Gestor de tareas"
- **Pills**: "pastillas" is the everyday word ("hora de tomar pastillas", "Se la puse un buen a mi ama pa las pastillas", where "un buen" is a Mexican colloquialism). Also "medicamentos" and "medicinas". MyTherapy MX uses "medicamentos, pastillas y píldoras".
- **Doctor appointment**: "citas" / "recordarme citas" (Sentry review). The MX medication-reminder app says "Recordatorios de citas con el médico". "Cita con el doctor" is also common in Mexico, but I found no fetched source to quote, so it is not confirmed.
- **Bills**:
  - "recibo" is the Mexican word for utility bills: Expansión MX headline "7 recibos de servicios que puedes descargar de internet" (CFE, agua, teléfono, gas, predial...)
  - Payment talk: "Muy buena para estar a pendiente de los pagos" (MX App Store review, title "Tarjetas de crédito"); "programar mensualmente las alarmas como para pagar cuentas" (Sentry, 2025-10-27)
- **Phone = "celular" / "cel"**: 160 review lines say celular vs 29 móvil across both Spanish review files. Lines with "móvil" carry Spain markers ("menudo timo", "20e"). Use **celular** in screenshots and description.
- **Interval schedules**: MX medication-reminder app: "Repetir cada X horas (por ejemplo, de las 8 AM a las 8 PM, cada 4 horas)". Recordatorios con Despertador: "Repetir cada X minutos (Cada 20 mins, Cada 90 mins)". This is the template for "every 2 hours between 9 and 5" → **"cada 2 horas, de 9 a 5"**.

### Mexican markers in the review corpus (evidence that MX voices are present)
"chida/chido", "neta", "ahorita", "un buen", "está padre", "cel". Examples: "si te despiertas con voz esta chida la app" (2026-07-29); "la neta si ha logrado despertarme" (2023-10-28); "Hasta ahorita es la que mejor me ha funcionado" (2023-01-21).

## 3. Register and tone
- **Use tú.** Everything relevant in MX uses tú:
  - Apple MX support ("toca", "Puedes cancelar")
  - Apple's MX Recordatorios listing ("todos tus pendientes")
  - Recordatorios con Despertador ("te permite crear")
  - Alarma con Voz ("tu alarma dice justo lo que tú quieres")
  - Memory AI ("Dile a Memory AI qué es importante para ti")
  - BBVA México's money tips ("Descarga una aplicación de recordatorio para tu teléfono inteligente")
- **Exception:** MyTherapy MX uses usted ("Organice su medicación y cuide su salud"). That fits a clinical, older-patient brand, not Remi's voice.
- **Tone:** short, warm, practical. Promise reliability ("funciona al 1000", "muy puntual sin retrazos") and voice ("me dice"). Avoid Spain-isms: móvil, coger, vale, "periodo de prueba".

## 4. Subscription conventions and Apple limits

**Apple limits (cited):**
- IAP / subscription **Display Name**: 2-30 characters. **Description**: max 45 characters (Apple, "In-App Purchase information").
- **Subscription Group Display Name**: Apple's reference gives **no character limit**. It does say group and subscription display names "must not contain control characters ... or markup language (for example, HTML tags, or Unicode characters, such as emoticons, diacritics, or special characters)." The wording is ambiguous, and live MX listings show accented IAP names (Memory AI "Promoción anual"). Still, the top-pick display names avoid accents entirely. The rule is not stated for the description, which carries no accent in pick A anyway.
- **Keywords**: "up to 100 bytes". **Promotional text**: 170 characters.

**How MX listings and Apple phrase subscriptions:**
- "Pro" stays in English:
  - Alarma con Voz y Despertador (MX): "Pro $299.00", "Nivel 1", "Nivel 2"
  - Alarmy: "Alarmy Pro" / "Alarmy Premium" (as seen on other storefronts)
- Durations:
  - Memory AI (MX): "Plan mensual $199.00", "Plan anual $599.00", "Promoción mensual", "Promoción anual"
  - Apple MX: "Cambia a otra suscripción de Apple, como un plan mensual, anual o para estudiantes"
- Some apps don't localize IAP names at all (TickTick MX: "Annual TickTick Premium", "Monthly TickTick Premium"; MyTherapy: "MyTherapy Ad-free Subscription").
- **Free trial**: Apple MX says "suscripción de prueba gratis" / "prueba gratuita". Apple Spain (es-ES) says "versión de prueba" / "periodo de prueba". A reviewer wrote "dice prueba gratis". Suggested copy: **"7 días gratis"** or **"prueba gratis de 7 días"**.
- **Unlimited**: "Recordatorios Ilimitados" is the exact IAP description of the MX competitor Recordatorios con Despertador (one-time purchase "Versión Completa $69.00").
- **Price sensitivity is real:**
  - That competitor pitches "Pago único. No hay pagos mensuales o anuales"
  - "Más de $619.00 mes ... se me quitaron las ganas de usarla" (ZipoApps review, 50 thumbs up)
  - "Todo muy bien pero hay que pagar, entonces chao"
  - Lead with the free tier and the trial, and show the annual price per month.

## 5. Copy notes for later
- Never name AI providers. Nothing above does.
- Silent-mode line (iOS 26+): "Suena aunque tengas el celular en silencio." Apple's exact es-MX UI term for the Silent mode switch was not verified.
- Screenshot captions in reviewers' words: "Te dice para qué es la alarma", "¿Ya te tomaste la pastilla?", "Que no se te pase el recibo de la luz", "La cita con el doctor, a tiempo", "El cumpleaños de tu mamá". These are drafts; only "pastillas", "recibo", "citas", "se me pasa" and "mamá/ama" have direct evidence above.

## 6. Sources

**Fetched and seen:**
- Apple, In-App Purchase information (limits): https://developer.apple.com/help/app-store-connect/reference/in-app-purchases-and-subscriptions/in-app-purchase-information/
- Apple, Auto-renewable subscription information: https://developer.apple.com/help/app-store-connect/reference/in-app-purchases-and-subscriptions/auto-renewable-subscription-information
- Apple, Platform version information (keywords 100 bytes, promo text 170): https://developer.apple.com/help/app-store-connect/reference/app-information/platform-version-information
- Apple MX, iPhone alarms (tú, Posponer, Etiqueta, app Configuración): https://support.apple.com/es-mx/118444
- Apple MX, cancel a subscription ("suscripción de prueba gratis"): https://support.apple.com/es-mx/118428 and https://support.apple.com/es-mx/118428?device-type=android
- Apple MX, change plan ("plan mensual, anual"): https://support.apple.com/es-mx/118448
- Apple MX, Apple One ("prueba gratuita"): https://support.apple.com/es-mx/111766
- Apple ES, cancel a subscription ("versión de prueba", "periodo de prueba"): https://support.apple.com/es-es/118428 (search excerpt)
- App Store MX, Recordatorios con Despertador: https://apps.apple.com/mx/app/recordatorios-con-despertador/id1071899483
- App Store MX, Recordatorios (Apple): https://apps.apple.com/mx/app/recordatorios/id1108187841
- App Store MX, MyTherapy: https://apps.apple.com/mx/app/recordatorios-de-medicamentos/id662170995
- App Store MX, Alarma con Voz y Despertador: https://apps.apple.com/mx/app/alarma-con-voz-y-despertador/id6757168797
- App Store MX, Memory AI: https://apps.apple.com/mx/app/memory-ai-reminders/id6752990554
- App Store MX, TickTick: https://apps.apple.com/mx/app/ticktick-listas-de-tareas/id626144601
- App Store MX, Alarma (Despertador Inteligente): https://apps.apple.com/mx/app/alarma/id6471868880
- Recordatorio de Medicamentos (same developer, Spanish text; "Repetir cada X horas"): https://apps.apple.com/us/app/lembrete-de-medicamentos/id816347839?l=pt-BR&platform=ipad (search excerpt)
- Google Play MX, Sentry "Despertador Parlante Plus": https://play.google.com/store/apps/details?id=com.sentryapplications.alarmclock&hl=es_MX&gl=MX
- Google Play MX, ZipoApps "Despertador que habla - Alarma": https://play.google.com/store/apps/details?id=alarm.clock.night.watch.talking&hl=es_MX&gl=MX
- Imagen Radio (MX), Unforgetful article: https://www.imagenradio.com.mx/finanzas/unforgetful-esto-ofrece-app-que-ayuda-recordar-pendientes
- BBVA México, payment date tips: https://www.bbva.mx/educacion-financiera/blog/fecha-de-pago.html
- SDP Noticias (MX), Profeco "bocinas portátiles": https://www.sdpnoticias.com/tecnologia/profeco-dio-buena-calificacion-a-estas-bocinas-portatiles-en-un-estudio-suenan-mejor-que-las-mas-caras/
- Expansión MX, "7 recibos de servicios": https://politica.expansion.mx/cdmx/2022/02/21/7-recibos-de-servicios-que-puedes-descargar-de-internet
- AppTweak, localizations indexed per storefront (US indexes es-MX): https://www.apptweak.com/en/aso-blog/how-to-benefit-from-cross-localization-on-the-app-store
- Local review files (Google Play, es_es/es_mx/es_us bucket, which cannot be split by country): `C:\Dev\VR\docs\aso\competitors\talking-alarm\reviews.csv`, `reviews_zipoapps.csv`

**Could not fetch / thin:**
- Reddit: old.reddit.com is blocked for the fetch tool. Searches for r/mexico, r/MexicoFinanciero and Spanish ADHD/TDAH threads returned only English r/ADHD posts, so **no Mexican Reddit quotes are included**.
- dle.rae.es/parlante returned 403. The diyaudio.com "Spanish speakers" thread showed only a browser check. So "parlante = South America" rests on general knowledge plus the MX "bocina" evidence, not on a fetched dictionary.
- Profeco's own site was not fetched; its usage is cited through SDP Noticias.
