# es-MX listing draft for 1.0.1: Remi (2026-10-08)

Research and drafting only. Nothing was created or changed in App Store Connect. This round adds what `es-MX.md` was missing: **forum and community language** (Reddit, via Apify), plus Apple's own storefront table. Every quote below comes from a page or dataset row I actually retrieved; the URL is the comment's permalink.

**Apify spend: about $0.75 of the $2 cap (estimate).** Six runs, about 270 result rows in total:
- 4 runs of `trudax/reddit-scraper-lite` (post search, slow): 21 rows. One run timed out at the 300 s cap.
- 4 runs of `harshmaur/reddit-scraper` (comment search): 248 rows.

The MCP tool doesn't report the USD cost of a run, so the figure comes from the actors' published per-row and per-start prices.

---

## 1. Storefront coverage of Spanish (Mexico)

Source: Apple, "App Store localizations" reference table, https://developer.apple.com/help/app-store-connect/reference/app-store-localizations (fetched 2026-10-08).

| Role of es-MX | Storefronts |
|---|---|
| **Default language** (17) | Argentina, Bolivia, Chile, Colombia, Costa Rica, Dominican Republic, Ecuador, El Salvador, Guatemala, Honduras, **Mexico**, Nicaragua, Panama, Paraguay, Peru, Uruguay, Venezuela |
| **Additional supported language** (2) | **United States** (default English US; the others are Arabic, Chinese S/T, French, Korean, Portuguese BR, Russian, **Spanish (Mexico)**, Vietnamese), Belize |
| Spain | uses **Spanish (Spain)**, a separate localization. es-MX does not reach Spain. |

**US indexing answer: yes, with one caveat.**
- **Apple's part:** the table lists Spanish (Mexico) as a supported language of the US storefront. Apple says the language a customer sees depends on "the App Store language for their location, their device's language settings, languages you've added, and your primary language". Apple's search page says search uses "text relevance (matches for your app's title, subtitle, keywords, and primary category)" (https://developer.apple.com/app-store/search/). Neither page states in so many words that the US storefront *indexes* es-MX keywords.
- **Third-party evidence:** AppTweak states it outright: "in the United States, the Apple algorithm will consider the keywords added to the English (US) and Spanish (MX) app metadata when indexing your app". It adds a caveat: "Keywords are not combined across localizations" (https://www.apptweak.com/en/aso-blog/how-to-benefit-from-cross-localization-on-the-app-store).

**What this means for us:**
1. The es-MX keywords will also work on the US store, so US Spanish speakers are covered for free.
2. A phrase only ranks if all its words sit in the same localization. "alarma que habla" needs "alarma" and "habla" both in the es-MX fields, which this draft does.
3. es-MX is the default text for **all of Spanish-speaking Latin America**, not just Mexico. So the name, subtitle, keywords and screenshot headlines must travel across those countries. Mexican flavor is fine in the description. Mexico-only slang ("se me va el avión", "neta", "un buen") stays out of the indexed fields.

---

## 2. Intent map: how people actually say it

Counts are hits in the Apify comment and post datasets. "MX" means a Mexican subreddit (r/mexico, r/MexicoFinanciero, r/Monterrey, r/tijuana, r/aguascalientes, r/ayudamexico, r/AskMexico, r/TDAH_Mexico, r/taquerosprogramadores, r/soyculero and similar).

| # | Intent | Top native phrasings (hits) | Quoted examples |
|---|---|---|---|
| 1 | "I'm forgetful, not careless; my day is chaos" (incl. ADHD) | **soy muy olvidadiza/o** (15, pan-LatAm); **soy muy despistada** (13, skews Chile/Spain); **soy bien despistado / bien olvidadiza** (10, Mexico and Central America, where "bien" means "very"); **se me olvida todo** (posts in r/ayudamexico, r/guatemala, r/chile); **TDAH** is the acronym used (r/TDAH_Mexico), never "ADHD"; MX slang **se me va el avión** (3) | "Me pasa que me están enseñando algo… a los 5 minutos se me olvida por completo… **No es por flojera, de verdad intento** concentrarme" ([r/ayudamexico](https://www.reddit.com/r/ayudamexico/comments/1wznadh/se_me_olvida_todo_a_los_5_minutos_aunque_ponga/)) · "soy muy olvidadiza… **Que me olvidé de la fecha de sus cumpleaños no significa que no los quiera**… hay días caóticos dónde literalmente sobrevives" ([r/FriendshipAdvice](https://www.reddit.com/r/FriendshipAdvice/comments/1nvx2ta/title_my_friends_didnt_post_or_wish_me_on_my/nrrg7hn/)) · "tengo déficit de atención y la neta **se me va el avión** en TODO" ([r/QuePedoConLaGente](https://www.reddit.com/r/QuePedoConLaGente/comments/1rn0mpn/qu%C3%A9_pedo_con_la_gente_que_ve_un_mensaje_y/o9908q3/)) |
| 2 | Notifications get dismissed; I need to *hear* it | Verb is **quitar la notificación** (3), not "deslizar" (0 hits); **no veo las notificaciones** (5, AR/CL); calendar reminders that fire and get dropped | "como **quité la notificación se me olvida** hasta días después" ([r/RedditPregunta](https://www.reddit.com/r/RedditPregunta/comments/13251gt/cu%C3%A1nto_tiempo_tardan_en_responder_un_mensaje/ji3hsnk/)) · "recordatorios en el calendario del celular que dices 'cierto, hoy tengo que cancelar Amazon Prime' pero no lo haces en ese momento… y entonces **ya nunca lo hiciste**" ([r/TDAH_Mexico](https://www.reddit.com/r/TDAH_Mexico/comments/1j6xe8f/las_parejas_de_personas_con_tda_tambi%C3%A9n_necesitan/mgxwl88/)) · "cuando me llega la notificación **no la quito** para recordar que tengo ese pendiente" ([r/TDAH_Mexico](https://www.reddit.com/r/TDAH_Mexico/comments/1i4ptnn/costumbres_habitos_y_herramientas/m86sups/)) |
| 3 | Forgetting to pay a bill | **se me olvidó pagar** (14, 9 MX); **se me pasó la fecha (de pago)** (10, 7 MX); **se me pasó pagar** (6, 5 MX); also "se me fue la fecha de pago". What was forgotten: **tarjeta** (most, about 8), **la luz / recibo / CFE** (5, and it ends in "me cortaron la luz"), phone or internet (Telcel, Totalplay, Telmex: 4), SAT taxes (3), water (1) | "**El otro día se me olvidó pagar la luz** y la cortaron de manera remota" ([r/mexico](https://www.reddit.com/r/mexico/comments/1sx79g5/trabajo_en_cfe_pregunta_lo_que_quieras/oil2sew/)) · "**Se me pasó pagar la AMEX** por un día y me están cobrando 12k" ([r/MexicoFinanciero](https://www.reddit.com/r/MexicoFinanciero/comments/19ead03/se_me_pas%C3%B3_pagar_la_amex_por_un_d%C3%ADa_y_me_est%C3%A1n/)) · "**se me pasó la fecha de pago** y me di cuenta hasta que se juntaron dos facturas" ([r/aguascalientes](https://www.reddit.com/r/aguascalientes/comments/1smb66w/alg%C3%BAn_internet_que_recomienden_aguascalientes/ogei8jl/)) · "Mi recomendación es que tengas una **app de recordatorios**… fechas de cortes, fechas de límite de pago… **no se me pasa nada**" ([r/MexicoFinanciero](https://www.reddit.com/r/MexicoFinanciero/comments/1hsusbg/mi_fecha_de_pago_de_la_tdc_cambio_y_se_me_pas%C3%B3/m5eb9l1/)) |
| 4 | Missing a doctor's appointment | **cita con el doctor** (6 MX of 14) vs **cita con el médico** (1 MX of 14; the rest Spain, Colombia, Argentina). Verbs: "llegué tarde a mi cita", "se me pasó la cita" (1, Bogotá) | "terminé **llegando 30 minutos tarde a mi cita con el doctor**" ([r/Monterrey](https://www.reddit.com/r/Monterrey/comments/1lemei3/mi%C3%A9rcoles_de_rant/myjgctd/)) · "Seria tu responsabilidad hacer cita y **ir a la cita con el doctor**" ([r/tijuana](https://www.reddit.com/r/tijuana/comments/1e13nvd/cu%C3%ADdense_mucho_raza_y_m%C3%A1s_si_son_mujeres/lcs79jz/)) |
| 5 | Forgetting to take pills or medicine | **se me olvida tomar (mi) pastilla(s)** (4); **se me olvida tomarlo/tomarla** about a medicine (3, r/TDAH_Mexico); **se me olvidan las pastillas** (1); nouns: pastilla(s) > medicamento > medicina | "realmente se nota **cuando se me olvida tomar mi pastilla**" ([r/chile](https://www.reddit.com/r/chile/comments/11q3moa/discusi%C3%B3n_random_semanal/jccwd32/)) · "Aún hay días que **se me olvida hasta tomarla**" ([r/TDAH_Mexico](https://www.reddit.com/r/TDAH_Mexico/comments/1r8o193/c%C3%B3mo_saber_cuando_el_metilfenidato_ya_hizo_efecto/o6v9a0w/)) |
| 6 | Forgetting Mom's birthday | **se me olvidó el cumpleaños de…** (3); **mamá** everywhere (never "madre" in this sense); **acordarse** is the counter-verb ("para acordarme", "me vine a acordar") | "**se me olvidó el cumpleaños de mi hijo, me vine a acordar como a las 10 de la noche**… pidiendo disculpas por ser la peor mamá" ([r/AskRedditespanol](https://www.reddit.com/r/AskRedditespanol/comments/1t06zuu/hola_amigos_mi_novia_olvid%C3%B3_mi_cumplea%C3%B1os_que_hago/ojcchtd/)) · "como persona con TDHA… **Tengo en el calendario a mi papá y mi mamá para acordarme**" ([r/Ticos](https://www.reddit.com/r/Ticos/comments/1epvvwe/mi_pareja_olvid%C3%B3_mi_cumplea%C3%B1os/lho9t5d/)) |
| 7 | Setting a reminder by speaking | The command people actually say is **"recuérdame…"** (2); the verb for setting one is **poner** ("pongo alarmas", "me pongo alarma", "ponte alarmas": 6+ in r/TDAH_Mexico). No hits for "comandos de voz" in forum speech. | "En corto aplico la de: **Siri, recuérdame la reunión de la 1 pm.**" ([r/mexico](https://www.reddit.com/r/mexico/comments/1dfzah5/es_normal_esto_en_los_bancos/l8ni2hq/)) · "**Pongo alarmas**, escribo lo que se me puede olvidar." ([r/TDAH_Mexico](https://www.reddit.com/r/TDAH_Mexico/comments/zi857m/tengan_cuidado_con_doctoralia/izquaua/)) |
| 8 | Rings even on silent, keeps going until you turn it off | Apple es-MX says **"modo Silencio"** and "el interruptor Sonar/Silencio"; forums say **"en silencio"** / **"modo silencio"** (7). To stop it: **apagar la alarma**; snooze: **posponer** ("pospongo la alarma", 2) | Apple: "No molestar, el interruptor Sonar/Silencio y **el modo Silencio no afectan el sonido de la alarma**." ([support.apple.com/es-mx/118444](https://support.apple.com/es-mx/118444)) · "estas alarmas son **independientes del modo silencio**" ([r/mexico](https://www.reddit.com/r/mexico/comments/1nlareu/a_quien_mas_le_aparecio_esto/nf5gkwa/)) |
| 9 | The alarm tells you what it's for | People cope by **naming alarms** and giving them distinct tones; they pile up alarms that tell them nothing (**"las 30 alarmas"**, **"mil alarmas"**) | "**Ponte alarmas en el celular con nombres de las tareas** y tonos distintos para distinguir." ([r/TDAH_Mexico](https://www.reddit.com/r/TDAH_Mexico/comments/1oi0vin/tdah_metil_en_el_trabajo_ok_en_casa_fail_qu%C3%A9_tipo/nly8xqb/)) · "Cuando **las 30 alarmas no funcionan**…" ([r/TDAH_Mexico](https://www.reddit.com/r/TDAH_Mexico/comments/1pdwkrb/como_salir/ns8z5d8/)) · "En el teléfono **me pongo mil alarmas**" ([r/Honduras](https://www.reddit.com/r/Honduras/comments/1ww8xsc/exiten_personas_con_tdah_diagn%C3%B3sticado_en/pdo1ova/)). The prior round's reviews already showed the payoff phrase **"me dice para qué es"** (`es-MX.md` §2). |
| 10 | Any schedule (every hour, several times a day, every N days) | **tomar agua** (not "beber"); **cada hora**, **cada 30 min**, "que se repitan". Mexican trap: **cada tercer día** means *every other day* in Mexico but reads as every third day elsewhere | "puse recordatorios para que **me recuerden tomar agua cada hora**" ([r/conversaciones](https://www.reddit.com/r/conversaciones/comments/1dcdkep/c%C3%B3mo_gestionar_el_tiempo_para_obtener_un_nuevo/l80sd4q/)) · "**crea alarmas cada 30min** para que te acuerdes de lo que debes hacer" ([r/TDAH_Mexico](https://www.reddit.com/r/TDAH_Mexico/comments/1nlgpjo/que_puedo_hacer/nf6md57/)) · RAE DPD on "cada tercer día" = "un día sí y otro no" in Mexico (https://rae.es/dpd/día, search excerpt) |

### The three findings that matter most
1. **"Pasar" beats "olvidar" for anything with a deadline.** Mexicans say *se me pasó* (pagar, la fecha, la cita), not only *se me olvidó*. "Que no se te pase" sounds native; "Nunca olvides…" sounds translated.
2. **The bill Mexicans forget is the card, and the bill that hurts is the light.** *Tarjeta* is the most-mentioned forgotten payment, but *se me olvidó pagar la luz* comes with a consequence everyone recognizes: CFE cuts the power. Water came up once. That's why screenshot 1 switches from water to **"el recibo de la luz"**, which is also the everyday phrase in Colombia and Honduras.
3. **"Cita con el doctor", not "con el médico".** Mexican subs used *doctor* 6 to 1. *Médico* clustered in Spain threads, next to "móvil".

---

## 3. Draft listing

### App name (30 chars)
**`Remi: Recordatorios con voz`**: 27 chars
- Intents 7 and 9. "Recordatorios" is the category noun in the MX store (`es-MX.md` §2). "con voz" follows how reviewers name the product, "alarma con voz", and means the reminder has a voice, which is the differentiator. "de voz" was avoided because it reads as voice memos ("notas de voz").
- Alt: `Remi: Alarma con voz` (20). Use it if we'd rather put "alarma" in the name and "recordatorios" in the subtitle.

### Subtitle (30 chars)
**`La alarma que te dice para qué`**: 30 chars (31 bytes, which doesn't matter here: the limit is in characters)
- Intent 9, the real differentiator. Reviewers' own words: "me encanta que la voz me diga para qué es" (`es-MX.md`). It answers the r/TDAH_Mexico pain of "30 alarmas" that don't say what they're for. It doesn't repeat any word from the name.
- Alts: `Alarma que habla y te recuerda` (30), `Recordatorios que te hablan` (27; repeats a name word).

### Keywords (100 bytes)
**`despertador,pastillas,medicina,cita,doctor,recibo,luz,tarjeta,cumpleaños,pendientes,tdah,agua,habla`**: 99 chars, **100 bytes** (the ñ in cumpleaños costs 2)

| Word | Intent | Why |
|---|---|---|
| despertador | 8 | Competitors' head term ("Despertador que habla") |
| pastillas, medicina | 5 | Forum noun #1 and #3; "medicamentos" costs 12 bytes, "medicina" 8 |
| cita, doctor | 4 | "cita con el doctor" (MX 6:1 over médico) |
| recibo, luz, tarjeta | 3 | The three forgotten bills from §2 |
| cumpleaños | 6 | 11 bytes, worth it |
| pendientes | 1, 7 | The MX word for to-dos (Apple MX Recordatorios listing) |
| tdah | 1 | The Spanish acronym; r/TDAH_Mexico |
| agua | 10 | "tomar agua cada hora" |
| habla | 9 | Combines with "alarma" in the subtitle to make "alarma que habla" |

Not repeated: remi, recordatorios, con, voz, alarma, que, te, dice, para (already in name or subtitle). Trade-off: if "recordatorio de pagos" matters more than "alarma que habla", swap `habla` → `pagos` (same 5 letters, still 100 bytes).

### Promotional text (170 chars)
**`“Hora de tomar agua.” Una alarma que te dice en voz alta qué tienes que hacer, a tiempo, y vuelve a sonar hasta que lo hagas.`**: 125 chars
- Same shape as the EN line: a spoken quote, then the promise. "Tomar agua" is the MX verb (intent 10). "Vuelve a sonar hasta que lo hagas" carries "again until it's done".
- Alt (intent 9 hook in forum words): `¿Tienes mil alarmas y no sabes para qué es cada una? Remi te dice en voz alta qué hacer, a tiempo, y vuelve a sonar hasta que lo hagas.`: 135 chars

### Description (tú register, 1,152 chars; limit 4,000)
```
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

Remi te entiende y te habla en español. Por ahora, los menús de la app están en inglés.

Lo que escuchas, lo haces. Lo que solo ves, se te olvida. De eso se trata.

Términos de uso: https://wahabbasa.github.io/voicereminder-legal/terms.html
Política de privacidad: https://wahabbasa.github.io/voicereminder-legal/privacy.html
```

Notes, line by line:
- **Opening (intent 1):** keeps the EN two-beat structure. "No es por flojera" (r/ayudamexico) and "no significa que no los quiera… días caóticos" show this is how people defend themselves. "un caos" replaces "loud", which doesn't carry over ("ruidoso" would be literal and wrong).
- **"hecha para olvidadizos" (intent 1):** "olvidadiza/o" is the top self-label (15 hits), and the prior round had "los olvidadizos como yo".
- **"una notificación que quitas sin leer" (intent 2):** *quitar la notificación* is the forum verb ("como quité la notificación se me olvida").
- **"se acuerda por ti" (intent 6/7):** *acordarse* is the everyday verb ("para acordarme", "me vine a acordar").
- **"cuando toca hacerlo":** MX/LatAm "te toca" ("me tocó pagar intereses", r/MexicoFinanciero).
- **"recuérdame tomar agua cada hora" (intents 7 and 10):** the literal command form people use with Siri ("Siri, recuérdame…") plus "tomar agua cada hora" (r/conversaciones).
- **"tu celular":** "celular" won 160 to 29 over "móvil" in the prior round's review corpus. The forum hits here say the same ("en el celular", "cel").
- **"Si la pospones" (intent 8):** "Posponer" is Apple's es-MX button name. "Te sigue insistiendo" carries "nagging" without slang.
- **"cada ciertas horas o cada tantos días" (intent 10):** avoids "cada tercer día" (see §5).
- **"todo lo que se te pasa" (intent 3):** finding #1, the *pasar* verb.
- **Language line (truth constraint):** says the voice works in Spanish and that the menus are English. This is optional, but recommended: it heads off "no está en español" one-star reviews, and the store page is otherwise fully Spanish.
- **Closing:** mirrors "Reminders you hear get done. Reminders you glance at get forgotten." as a native-sounding aphorism, and ends on "se te olvida", the forum verb.
- **"Política de privacidad":** understood across LatAm. Mexico's legal term is "Aviso de privacidad", but the linked page is a generic policy, so I kept the pan-LatAm wording.
- No clock-time claim and no provider names. "Even on silent" stays out of the description, as in EN.

### Screenshot headlines (two lines; **[blue]** marks the blue phrase)

| # | Line 1 (navy) | Line 2 | Intent and evidence |
|---|---|---|---|
| 1 | Que no se te pase | **[el recibo de la luz]** | Intent 3. *Pasar* is the deadline verb (finding #1); luz/CFE is the bill with the familiar consequence (finding #2). 17/19 chars. **Needs a regenerated in-phone label:** the generator shows "Pay Water Bill" 💧. Change it to "Pay Electric Bill" ⚡ (the UI stays English), or keep water and use "el recibo del agua". Alt for a finance angle: "Que no se te pase / **[pagar la tarjeta]**". |
| 2 | Que no se te olvide | **[la cita con el doctor]** | Intent 4. "doctor" over "médico" (finding #3). Uses *olvidar* to vary from #1. 19/21 chars. |
| 3 | Pon recordatorios | **[con tu voz]** | Intent 7. *Poner* is the MX verb for setting alarms/reminders; "comandos de voz" reads like a manual and never appeared in forum speech. 17/10 chars. Optional bubble: "Recuérdame el 15 pagar el recibo de la luz". |
| 4 | Siempre suena. | **[Aunque esté en silencio.]** | Intent 8. "en silencio" is how people say it; Apple's term is "modo Silencio". **Subtitle:** "Sigue sonando hasta que la apagues" (34). *Apagar la alarma* is standard. 14/24 chars. |
| 5 | Este año sí te acuerdas | **[del cumpleaños de tu mamá]** | Intent 6. *Acordarse* plus "mamá". "Este año sí" is a warm, very Mexican turn that keeps "never forget" positive. 23/25 chars. Shorter alt: "Que no se te olvide / **[el cumpleaños de tu mamá]**". |
| 6 | **[Cualquier]** horario | (one line) | Intent 10. 17 chars. Optional chips: "Todos los días", "Entre semana", "Cada 2 horas". |

If the bubbles outside the phone get localized later: #1 "Paga el recibo de la luz." · #2 "Tu cita con el doctor es en 15 minutos." · #5 "Háblale a tu mamá. Hoy es su cumpleaños." ("Háblale" = call her, which is MX usage; "llámale" works across LatAm too.)

### Subscriptions
| Field | Value | Count |
|---|---|---|
| Group display name | **Remi Pro** | 8 |
| Monthly display name | **Pro mensual** | 11 (no diacritics) |
| Annual display name | **Pro anual** | 9 (no diacritics) |
| Description (both, 45) | **Recordatorios ilimitados y repetir por horas** | 44 |

- These carry over the picks from the prior round. "Plan mensual / anual" is Apple MX's own wording, and the competitor's interval feature reads "Repetir cada X horas".
- Alt description: `Recordatorios sin límite y alarmas con voz` (42). It has one accent, so use it only if accents are confirmed fine in descriptions.

---

## 4. Words we avoided and why

| Avoided | Use instead | Why |
|---|---|---|
| móvil | celular | Spain marker; MX says celular/cel |
| médico (in headline) | doctor | MX forums 6:1 for "cita con el doctor"; médico clustered in Spain threads |
| Nunca olvides… / No vuelvas a olvidar… | Que no se te pase / Que no se te olvide | The imperative "olvidar" sounds translated; the *se me* construction is how forgetting is described in all 10 intents |
| deslizar / descartar la notificación | quitar la notificación | Zero forum hits for deslizar; "quité la notificación" is attested |
| comandos de voz | con tu voz / "recuérdame…" | Manual-speak; people say "Siri, recuérdame…" and *poner* alarmas |
| beber agua | tomar agua | "beber" is Spain-formal; MX "tomar agua" |
| madre | mamá | "madre" carries vulgar senses in Mexico ("una madre", "a toda madre", "me vale madre") |
| cada tercer día | cada 2 días / cada tantos días | In Mexico it means every other day; elsewhere it reads as every third day (RAE DPD) |
| despertador as lead noun | alarma / recordatorios | Signals wake-up only (`es-MX.md`) |
| parlante, altavoz | (none) | South American / Spain; Mexico says bocina. Not needed in copy |
| se me va el avión, neta, un buen, chido | (none in indexed fields) | Real MX slang, but es-MX also serves 16 other countries and the US. Fine as an A/B idea for an MX-only promo, not for the name/subtitle/keywords |
| ADHD | TDAH | The Spanish acronym, used in r/TDAH_Mexico |
| "dice la hora" or anything about speaking the time | (none) | Truth constraint: Remi doesn't say the clock time |
| "la app en español" | "te entiende y te habla en español" | The menus are English; only the voice is Spanish |
| periodo de prueba, vale, coger | prueba gratis | Spain markers (`es-MX.md` §4) |
| Leading with "suena en silencio" | Lead with "te dice para qué" | Apple's own alarm also ignores the silent switch (support.apple.com/es-mx/118444), so it isn't a differentiator |

---

## 5. Sources

**Apple (fetched)**
- App Store localizations table: https://developer.apple.com/help/app-store-connect/reference/app-store-localizations
- App Store search / keywords: https://developer.apple.com/app-store/search/
- iPhone alarms, es-MX ("modo Silencio", "Posponer"): https://support.apple.com/es-mx/118444

**Third party (fetched)**
- AppTweak cross-localization (US indexes en-US + es-MX; no cross-locale combos): https://www.apptweak.com/en/aso-blog/how-to-benefit-from-cross-localization-on-the-app-store
- RAE Diccionario panhispánico de dudas, "día" ("cada tercer día", search excerpt only): https://rae.es/dpd/día

**Reddit (via Apify; every quote above links to its comment or post)**
- Actors: `trudax/reddit-scraper-lite` (post search) and `harshmaur/reddit-scraper` (comment search, plus one run restricted to r/TDAH_Mexico).
- Datasets: QYWHcSrXMkDHTIapu, HEamTUIe3s3eggxRu, Q4YjHBZME5xcsb1RM, VyHNLnfwgrzTDNdm9, u9gmEde7NJkeEpcgV, T0Q1O7qySgh0BDh6l, 63MuXqcQAvHH8Sary, ovrx8q7hNXGWDTlnr.

**Limits of this evidence**
- Reddit's search is fuzzy: many rows matched only loosely and were ignored. The hit counts are directional, not a frequency study.
- Spanish-language Reddit skews young, urban, and toward Chile and Argentina. Mexican subs are well represented for money topics (r/MexicoFinanciero), thinner for health and family.
- Searches for "ignoro las notificaciones", "le doy deslizar", "no les hago caso" and "alarma con voz" returned almost nothing in forums. For "alarma con voz" the app-review evidence from `es-MX.md` still stands.
- Parallel Search hit its free-tier rate limit on the first call, so the web lookups used the built-in WebSearch/WebFetch instead.
