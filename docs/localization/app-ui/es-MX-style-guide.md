# es-MX in-app UI style guide: Remi (2026-10-10)

Research only, for whoever translates the Remi UI into Spanish (Mexico). The App Store copy is already done (`docs/aso/research/localization/es-MX.md` and `es-MX-1.0.1-draft.md`). This guide keeps the in-app wording consistent with it and with how iOS itself talks in Latin American Spanish.

**Scope reminder:** the es-MX localization is the default Spanish for 17 Latin American storefronts and a supported language in the US (see `es-MX-1.0.1-draft.md` §1). Write neutral Latin American Spanish with a Mexican lean. No Mexico-only slang in the UI.

**Source tags used below**
- **[AL]** applelocalization.com API, iOS 26.7.1, locale `es_419` (Apple's own Latin American Spanish system strings). Queried 2026-10-10. Example: `https://applelocalization.com/api/ios/26/search?q=Posponer&locale=es_419`
- **[AL-es]** same, locale `es` (Spain), used for contrast
- **[AS-MX]** Apple Support pages in es-MX
- **[MS]** Microsoft Spanish (Mexico) Localization Style Guide (PDF)
- **[CLDR]** Unicode CLDR locale data for `es_MX` / `es_419`
- **[Fundéu]** FundéuRAE / RAE spelling guidance
- **[ASO]** the two existing es-MX research files in this repo
- **[J]** my judgment; no direct source found. Treat as a recommendation, not a fact.

---

## (a) Rules

1. **Use tú, always.** Apple es-MX support ("Abre la app Reloj y, luego, toca…"), Apple system strings ("quiere enviarte notificaciones", "hasta que lo canceles"), Microsoft es-MX ("the informal second person singular pronoun 'tú' is recommended"), and the LatAm apps (Rappi "pide lo que necesites", Nu "Escríbenos", Mercado Libre "Compra online lo que necesites") all use tú. Never usted, never vos, never vosotros. Plural "you" (rare) = ustedes.
2. **Buttons and menu commands: infinitive.** Microsoft es-MX: "when the user is telling the program … what to do, the infinitive is used." Apple does the same: Posponer, Detener, Restaurar compras, Volver a intentar, Permitir, No permitir, Ir a Configuración [AL]. So `Save` = **Guardar**, not "Guarda".
3. **Instructions, hints, onboarding, empty states: tú imperative.** Apple: "Desliza para detener", "Mantén presionado para detener", "Toca dos veces para crear un nuevo recordatorio" [AL]. So the hint under the mic is **"Toca para hablar"**, the empty state says **"Dile a Remi qué quieres recordar"**.
4. **Sentence case everywhere.** Capitalize only the first word and proper nouns in titles, buttons, tabs and settings rows [MS: "capitalize only the first letter of the first word in commands, dialog box titles … buttons"]. `Restore Purchases` = **Restaurar compras**, not "Restaurar Compras". Weekdays and months are lowercase inside sentences ("el lunes 12 de octubre").
5. **Opening marks are required:** ¿…? and ¡…!. Never drop the opening sign.
6. **Remi talks like a helpful friend, not a bank.** Short, warm, concrete. One idea per string. No exclamation marks on errors (Microsoft: "There is no need to transfer those exclamation marks"). At most one exclamation in a success moment.
7. **Errors: say what happened, then what to do.** Prefer "No se pudo + infinitive" for generic failures [MS], or a plain human sentence from Remi in the voice-parsing errors ("No escuché la hora. ¿Cuándo te lo recuerdo?").
8. **Avoid gendering the user.** No "Bienvenido" / "listo" / "seguro" about the user. Rewrite: Apple itself says **"Te damos la bienvenida"** [AS-MX Clock for Mac guide]. "¿Estás seguro?" → **"¿Quieres eliminar este recordatorio?"** (Apple: "¿Quieres descartar este nuevo recordatorio?" [AL]).
9. **Agreement follows the noun:** *el recordatorio* (m.), *la alarma* (f.). "Recordatorio eliminado" / "Alarma eliminada". "Pospuesto" vs "Pospuesta" depends on which noun the string refers to; give translators the noun in a comment.
10. **Use Apple's names for iOS things**, verbatim: app Configuración, Notificaciones, modo Silencio, No molestar, Enfoque, Urgente, pantalla bloqueada, Cuenta de Apple. Users will look for those exact words in their phone.
11. **Device word:** "iPhone" when pointing at the device or its settings (Apple's practice); "celular" in casual copy and Remi's spoken lines [ASO: celular beat móvil 160 to 29].
12. **Never hard-code dates, times, prices or plurals.** Use the platform formatters (Intl / `DateFormatter`, StoreKit `displayPrice`) and plural-aware strings. es-MX serves storefronts with different currencies and decimal marks.
13. **No emoji in UI chrome** (buttons, titles, settings, legal) [J]. Apple's system strings use none; the LatAm store listings checked use almost none. A single emoji in a celebratory toast or a "Mensaje de Remi" card is acceptable.
14. **No provider names** (OpenAI, etc.) in any string (standing project rule).
15. **Keep ASO vocabulary** (recordatorio, alarma, pastillas, cita con el doctor, recibo de la luz, Posponer, celular, tú) except where an iOS convention differs; see "Where the UI differs from the store copy" below.
16. **Remove the store-description line "Por ahora, los menús de la app están en inglés"** in the same release that ships the Spanish UI (`es-MX-1.0.1-draft.md` §3).

### Where the UI differs from the store copy
| Store copy (ASO) | In-app UI | Why |
|---|---|---|
| "Pon recordatorios con tu voz" (verb *poner*) | Button/title: **Nuevo recordatorio**, **Crear**; casual onboarding may still say "Pon un recordatorio" | Apple's UI uses *crear* / *Nuevo recordatorio* [AL]; *poner* is fine in conversational lines |
| "despertador" (keyword) | **alarma** | Apple's Clock UI says alarma; despertador = wake-up only [ASO] |
| "celular" everywhere | **iPhone** in permission and settings instructions; celular in casual copy | Matches Apple's system text |
| "se me pasó", "que no se te pase" | OK in Remi's voice lines and marketing cards; **not** in buttons, titles or errors | Colloquial register |
| "Términos de uso / Política de privacidad" | same | Apple StoreKit uses "Política de privacidad" [AL] |

---

## (b) Glossary (English UI → es-MX)

| # | English | es-MX | Source / why |
|---|---|---|---|
| 1 | Today (list title) | Hoy | Standard [J] |
| 2 | Tomorrow | Mañana | Standard; "mañana a las 8:00 a.m." |
| 3 | Upcoming | Próximos | [J]; Apple Reminders uses "Programados" for scheduled |
| 4 | Scheduled | Programados / Recordatorios programados | [AL] RemindersUICore |
| 5 | reminder | recordatorio (m.) | [AL] ReminderKit; [ASO] |
| 6 | Reminders | Recordatorios | Apple app name [AS-MX] |
| 7 | New reminder | Nuevo recordatorio | [AL] ReminderKit, RemindersUICore |
| 8 | alarm | alarma (f.) | [AS-MX] 118444 |
| 9 | Snooze | Posponer | [AL] SpringBoard `ALARM_SNOOZE`; [ASO] |
| 10 | Snoozed until {time} | Pospuesto hasta las {time} (recordatorio) / Pospuesta… (alarma) | Agreement rule 9 [J] |
| 11 | Snooze duration | Duración de la posposición | [AS-MX] iPhone guide "Establecer una alarma" |
| 12 | Snooze for 1 hour | Posponer 1 hora | Apple: "Posponer por 1 hora" [AL]; drop "por" if tight |
| 13 | Stop (alarm) | Detener | [AL] SpringBoard `ALARM_STOP` |
| 14 | slide to stop | Desliza para detener | [AL] ClockAngel `SLIDE_TO_STOP` (exact) |
| 15 | Later (alarm screen) | Posponer if it snoozes; Más tarde if it reschedules differently | Apple's term for snooze is Posponer [AL]; "Más tarde" [J] |
| 16 | Skip | Omitir | [AL] NanoClockBridgeSettings ("posponerlos u omitirlos") |
| 17 | Dismiss / Close | Cerrar | [J]; users say "quitar la notificación" [ASO] but buttons say Cerrar |
| 18 | Repeat | Repetir | [AS-MX] |
| 19 | Every day | Todos los días | [AL] MobileTimer `ALARM_EVERY_DAY` |
| 20 | Daily (calendar-style summary) | Diariamente | [AL] CalendarUIKit, ReminderKit; prefer "Todos los días" in chips |
| 21 | Weekdays | Entre semana | [AL] MobileTimer `ALARM_WEEKDAYS`, ReminderKit |
| 22 | Weekends | Fines de semana | [J] |
| 23 | Every hour | Cada hora | [AL] ReminderKit plural `one` |
| 24 | Every N hours | Cada {n} horas | [AL] ReminderKit "Cada %u horas" |
| 25 | Every N days | Cada {n} días | [AL] ReminderKit "Cada %u días" |
| 26 | Every other day | Cada 2 días | Not "cada tercer día" (MX = every other day, elsewhere = every 3rd) [ASO] |
| 27 | Every week | Cada semana / Semanalmente | [AL] ReminderKit |
| 28 | Every 2 hours, 9 to 5 | Cada 2 horas, de 9 a 5 | [ASO] competitor pattern |
| 29 | Until {date} | Hasta el {date} | [J]; "hasta el 30 de octubre" |
| 30 | End repeat | Terminar repetición | [AL] EventKitUI |
| 31 | Never | Nunca | Standard |
| 32 | Once / Doesn't repeat | Una vez / No se repite | [J] |
| 33 | Time | Hora | Clock time = hora, never "tiempo" |
| 34 | Date | Fecha | Standard |
| 35 | Label / Name | Etiqueta / Nombre | [AS-MX] "Etiqueta: da un nombre a una alarma" |
| 36 | Sound | Sonido | [AS-MX] |
| 37 | Edit | Editar | [AS-MX] |
| 38 | Done | Listo | [AS-MX] "Toca el botón Listo" |
| 39 | Save | Guardar | Infinitive rule [MS] |
| 40 | Cancel | Cancelar | Standard |
| 41 | Delete | Eliminar | [AS-MX] "Eliminar una alarma" |
| 42 | Undo | Deshacer | Standard |
| 43 | Add | Agregar | Apple LatAm uses Agregar ("Agregar un nuevo recordatorio" [AL]); Spain uses "Añadir" [AS-ES TOC] |
| 44 | Try again | Volver a intentar | [AL]; "Reintentar" not used by Apple es_419 |
| 45 | Listening… | Escuchando… | [AL] (single ellipsis character …) |
| 46 | Tap to talk / Tap to record | Toca para hablar / Toca para grabar | Imperative-hint pattern [AL "Toca dos veces para…"] |
| 47 | Hold to talk | Mantén presionado para hablar | [AL] "Mantén presionado para detener" |
| 48 | Record | Grabar | Standard |
| 49 | Microphone permission (system title, for reference) | "%@ solicita acceso al micrófono" | [AL] TCC `REQUEST_ACCESS_SERVICE_kTCCServiceMicrophone` |
| 50 | NSMicrophoneUsageDescription (our text) | "Remi usa el micrófono para escuchar tus recordatorios." | [J], matches Apple's "Tu ubicación se usa para…" style [AL] |
| 51 | Notifications permission (system) | "%@ quiere enviarte notificaciones" | [AL] UserNotificationsServer |
| 52 | Allow / Don't Allow | Permitir / No permitir | [AL] |
| 53 | Not now | Ahora no | [J] (common Apple pattern, not verified this round) |
| 54 | Alarms permission (AlarmKit, system) | "¿Permitir que %@ programe alarmas y temporizadores?" | [AL] AlarmKitCore |
| 55 | Settings (iOS app) | Configuración | [AL] "Ir a Configuración" (es_419) vs "Ir a Ajustes" (es, Spain) [AL-es]; [AS-MX] |
| 56 | Open Settings | Ir a Configuración / Abrir Configuración | [AL] |
| 57 | Settings (Remi's own screen) | Configuración | Same word as iOS [J] |
| 58 | Time Sensitive | Urgente | [AL] UserNotificationsUIKit `TIME_SENSITIVE_TEXT` |
| 59 | Critical alerts | alertas críticas | [AL] |
| 60 | Silent mode | modo Silencio | [AS-MX] 118444 |
| 61 | Do Not Disturb / Focus | No molestar / Enfoque | [AS-MX] |
| 62 | Lock Screen | pantalla bloqueada | [AS-US] notifications guide |
| 63 | phone | iPhone (instructions) / celular (casual) | Rule 11; [ASO] |
| 64 | speaker | bocina | [AS-MX] "bocinas integrados"; avoid altavoz (Spain), parlante (S. America) |
| 65 | headphones | audífonos | [AS-MX]; Spain says auriculares |
| 66 | Trash (icon) | Basurero | [AS-MX] "toca el botón Basurero"; Spain says papelera |
| 67 | Subscription | Suscripción | [AS-MX] 118428 |
| 68 | Free trial (CTA) | Prueba gratis | [AL] StoreKit `ACTION_FREE_TRIAL` |
| 69 | 7-day free trial | 7 días gratis / Prueba gratis de 7 días | [AL] "%@ gratis"; Spain says "periodo de prueba" [ASO] |
| 70 | 7 days free, then $X/year | 7 días gratis, luego {price}/año | [AL] "%@ gratis, luego %@/%@" |
| 71 | Get Pro | Obtener Remi Pro | Infinitive rule [MS]; Pro stays English [ASO] |
| 72 | Upgrade | Mejorar a Pro | [J] |
| 73 | Monthly / Annual | Mensual / Anual (Pro mensual / Pro anual) | [ASO], Apple "plan mensual, anual" |
| 74 | per month / per year | al mes / al año (or /mes, /año) | [AL] uses "%@/%@" |
| 75 | Best value | Mejor precio | [J] |
| 76 | Unlimited reminders | Recordatorios ilimitados | [ASO] |
| 77 | Auto-renews | Se renueva automáticamente | [AL] StoreKit |
| 78 | Cancel anytime | Cancela cuando quieras | [J]; Apple's phrasing "hasta que lo canceles" [AL] |
| 79 | Restore purchases | Restaurar compras | [AL] Apple's own label is "Restaurar compras faltantes" / "Restaurar suscripción"; the short form is the convention in third-party paywalls [J] |
| 80 | Manage subscription | Administrar suscripción | [AS-US] "Administrar tus suscripciones" |
| 81 | Cancel subscription | Cancelar suscripción | [AS-MX] 118428 |
| 82 | Terms of Use | Términos de uso | [ASO] description |
| 83 | Privacy Policy | Política de privacidad | [AL] StoreKit `PRIVACY_POLICY_LABEL` |
| 84 | Apple Account | Cuenta de Apple | apple.com/mx "Administra tu Cuenta de Apple" |
| 85 | Feedback | Comentarios | [AS-MX] "Gracias por tus comentarios" |
| 86 | Send feedback | Enviar comentarios | [AS-MX] |
| 87 | Send | Enviar | [AS-MX] |
| 88 | Message from Remi | Mensaje de Remi | [J] |
| 89 | Mark as done | Marcar como terminado | [AS-MX] "Marcar elementos como terminados" |
| 90 | Completed | Terminados | [AS-MX] same |
| 91 | Missed / Overdue | Atrasado / Vencido (for payments) | [J] |
| 92 | Welcome | Te damos la bienvenida | [AS-MX] Clock guide; gender-neutral |
| 93 | pills | pastillas | [ASO] |
| 94 | doctor's appointment | cita con el doctor | [ASO] |
| 95 | electric bill | recibo de la luz | [ASO] |
| 96 | to-dos | pendientes | [ASO], Apple MX Recordatorios listing |
| 97 | drink water | tomar agua | [ASO] |
| 98 | Something went wrong | Algo salió mal | [J] |
| 99 | No internet connection | Sin conexión a internet | [J], verbless error style [MS] |
| 100 | Didn't catch a time — when should I remind you? | No escuché la hora. ¿Cuándo te lo recuerdo? | [J], tú + *recordar* |
| 101 | Reminder deleted (toast) | Recordatorio eliminado | Agreement rule 9 |
| 102 | Saved (toast) | Listo, guardado | [J] |

---

## (c) Formatting

**Let the formatter do it.** Times, dates, relative times, prices and plurals should come from `Intl` / iOS formatters with the device locale, never from string concatenation. The rules below are what the output should look like and what to write in hand-written copy.

### Time
- **Mexico uses the 12-hour clock by default.** CLDR `es_419` short time is `h:mm a` [CLDR]. Localechord (built on CLDR 48) shows es-MX time as "3:09 p.m." [localechord.app/es-mx]. Respect the user's 24-hour setting if it's on.
- **What the formatter produces:** `es_419` abbreviated day periods are "a.m." / "p.m." (no inner space). `es_MX` overrides the narrow and stand-alone forms to "a. m." / "p. m." [CLDR raw files]. So the output can vary by width, OS and engine. Check what the app actually renders on a device (Hermes `Intl` in React Native may not match `DateFormatter`).
- **RAE/Fundéu norm:** "a. m." / "p. m.", lowercase, with a space after the first period. Fundéu advises against "a.m.", "am" and "AM" [Fundéu].
- **Rule for Remi:** never type a time by hand. If a hand-written example is unavoidable (onboarding copy), write it the way the formatter renders it on the test device so the screen is consistent. Never "8 AM".
- Articles: "a las 8:00 a.m.", but "a la 1:00 p.m." (singular). "de 9 a 5" for ranges in schedule copy.
- Spoken lines (TTS) should use words, not abbreviations: "a las ocho de la mañana", "a las tres de la tarde", "a las nueve de la noche". Fundéu: don't mix models ("las 9 a. m." or "las nueve de la mañana", not "las 9 de la mañana") [Fundéu].

### Dates
- Short numeric: `dd/MM/yy` → 12/10/26 (day first) [CLDR es_MX short date]. Never MM/DD.
- Long: "12 de octubre de 2026"; full: "lunes, 12 de octubre de 2026" (lowercase weekday and month) [localechord / CLDR].
- Abbreviated, as in a list row: "lun, 12 oct" style. Weekday abbreviations: lun, mar, mié, jue, vie, sáb, dom. `es_MX` uses "sep" (not "sept") for September [CLDR es_MX override]. Whether the formatter adds a period after the abbreviations depends on the CLDR version, so take whatever it outputs and don't hand-type.
- Single-letter weekday picker: D L M M J V S (Sunday first is common in Mexico; follow the device's first weekday).
- Today / Tomorrow / Yesterday: Hoy / Mañana / Ayer. "Hoy, 8:00 a.m."; "Mañana a las 8:00 a.m.".

### Relative time
- Future: **"en 15 minutos"**, "en 2 horas", "en 3 días". `es_MX` overrides CLDR's Spanish pattern to "en {0} …" (e.g. "en {0} meses") [CLDR es_MX]. Base `es` (Spain) uses "dentro de {0} …". Prefer "en" in LatAm copy.
- Past: "hace 5 minutos".
- Countdown chip: "En 15 min". `min` and `h` are symbols, with no period [MS: "Don't treat words as 'metro'… as abbreviations… symbols … should not end in a period"; example "h hora"].

### Numbers and currency
- es-MX: decimal point, comma grouping: 1,234.50; MXN shows as "$1,234.50" [localechord; CLDR es_419 `¤#,##0.00`, decimal ".", group ","].
- **Never hard-code "$" or the number format.** es-MX text is also shown in Argentina, Chile, Colombia and other countries whose currencies and separators differ (several use a decimal comma). Always print StoreKit/RevenueCat's localized price string (e.g. `product.displayPrice` / `priceString`).
- Per-period: "{price}/mes", "{price}/año" (Apple pattern "%@/%@" [AL]), or "{price} al año" in sentences.
- Percent: "Ahorra 40%" (no space) [CLDR es_419 `#,##0%`].

### Plurals and gender
- Spanish CLDR plural categories: `one`, `many` (large round numbers like "1 millón de…"), and `other`. Always supply `one` and `other`; `many` falls back safely for UI counts [J; check the i18n library].
- **The `one` form is often a different phrase, not "1 X".** Apple: one = "Cada hora", other = "Cada %u horas"; one = "Semanalmente", other = "Cada %u semanas"; one = "El evento se repetirá diariamente", other = "…cada %lu días" [AL ReminderKit PluralLocalizable]. So:
  - every 1 hour → **Cada hora** (not "Cada 1 hora"); every 2 hours → Cada 2 horas
  - every 1 day → **Todos los días**; every 3 days → Cada 3 días
  - 1 recordatorio / 2 recordatorios; 0 → "No hay recordatorios" (write a separate zero string)
  - 1 alarma activa / 3 alarmas activas
  - "Te queda 1 recordatorio gratis" / "Te quedan 3 recordatorios gratis" (the verb agrees too)
- Gender: recordatorio (m.), alarma (f.), suscripción (f.), prueba (f.), notificación (f.). Pass the noun gender to translators for every adjective or participle ("eliminado/eliminada", "activo/activa").

---

## (d) Paywall legal block (es-MX)

Built from Apple's own es_419 StoreKit phrasing ("El plan se renueva automáticamente por %@/%@ hasta que lo canceles", "%@ gratis, luego %@/%@") [AL], Apple MX's cancellation path and trial rule [AS-MX 118428], and the standard Guideline 3.1.2 points (price and period, charged to the account, auto-renew unless cancelled at least 24 h before the period ends, how to manage). Placeholders come from StoreKit at runtime.

**Short line under the CTA (trial plan):**
> 7 días gratis, luego {precio}/año. Se renueva automáticamente. Cancela cuando quieras.

**Short line (no trial):**
> {precio}/mes. Se renueva automáticamente hasta que lo canceles.

**Full disclosure (small print):**
> El pago se cargará a tu Cuenta de Apple al confirmar la compra. Si empiezas con la prueba gratis de 7 días, se te cobrará {precio} por {periodo} al terminar la prueba, a menos que la canceles al menos 24 horas antes de que termine. La suscripción se renueva automáticamente por el mismo precio y periodo, a menos que la canceles al menos 24 horas antes de que termine el periodo actual. El cargo de la renovación se hará dentro de las 24 horas previas al final del periodo. Puedes administrar o cancelar tu suscripción en Configuración > [tu nombre] > Suscripciones.
>
> [Términos de uso] · [Política de privacidad] · [Restaurar compras]

Notes:
- "Cuenta de Apple" replaces the old "ID de Apple" (apple.com/mx uses "Administra tu Cuenta de Apple"). Older third-party text still says "cuenta de iTunes" or "ID de Apple" (e.g. Foto ID and finviz listings); don't copy that.
- Path wording is verbatim from Apple MX: "En Configuración, toca tu nombre… Toca Suscripciones… Toca Cancelar suscripción" [AS-MX 118428].
- Use tú consistently. The finviz example mixes usted ("cancele", "se le cobrará"), which reads machine-translated.
- "periodo" and "período" are both valid; pick one (periodo) and use it everywhere.

---

## (e) Length and layout

- Spanish runs longer than English, and short strings grow the most. IBM/W3C table: up to 10 chars → 200–300% of the English length; 11–20 → 180–200%; 21–30 → 160–180%; over 70 → about 130% [W3C "Text size in translation"]. A common product-level average for Spanish is +15–20% (SimpleLocalize), but buttons and chips are where things break.
- Real examples: "Snooze" (6) → "Posponer" (8); "Later" (5) → "Más tarde" (9); "Restore Purchases" (17) → "Restaurar compras" (17); "Weekdays" (8) → "Entre semana" (12); "Every 2 hours" (13) → "Cada 2 horas" (12); "Get Pro" (7) → "Obtener Remi Pro" (16); "Listening…" (10) → "Escuchando…" (11); "slide to stop" (13) → "Desliza para detener" (20).
- Breakpoints to check on the smallest supported iPhone, with Dynamic Type at the default size and one size up:
  - alarm-screen buttons (Posponer / Detener)
  - repeat chips (Todos los días, Entre semana, Cada 2 horas)
  - tab labels
  - paywall plan cards ("Pro anual", price + "/año")
  - toast width
  - the record-button hint
- Layouts should grow (no fixed-width buttons). Allow 2 lines in paywall cards and settings rows. Fallback short forms if a chip clips: "Diario" for "Todos los días", "L–V" for "Entre semana" [J].

---

## (f) Pitfalls

### Spain-Spanish markers (never in es-MX)
| Avoid (Spain) | Use (LatAm) | Source |
|---|---|---|
| vosotros, os, vuestro, "pulsad" | tú (ustedes for plural) | SpanishDict, SuperMemo |
| Ajustes | Configuración | [AL] vs [AL-es] |
| móvil | celular / iPhone | [ASO], SuperMemo |
| ordenador | computadora | SuperMemo, lenguaje.com |
| añadir | agregar | Apple LatAm "Agregar" vs Spain "Añadir" |
| vale | de acuerdo / OK / listo | [ASO] |
| coger | tomar, agarrar | [ASO]; vulgar in Mexico |
| periodo / versión de prueba | prueba gratis | [ASO], Apple ES vs MX |
| auriculares | audífonos | [AS-MX] |
| altavoz | bocina | [AS-MX] |
| papelera | basurero | [AS-MX] |
| pulsar, pinchar | tocar | Apple MX "toca" |
| introducir (datos) | ingresar / escribir | [J] |
| zumo, beber agua | jugo, tomar agua | [ASO], SuperMemo |
| leísmo ("le ayudará" for him) | lo | [MS] "In Spanish for Mexico we will use lo" |
| "dentro de 15 minutos" | "en 15 minutos" | [CLDR] es_MX override |
| médico (in casual copy) | doctor | [ASO] |
| madre | mamá | [ASO] (vulgar senses in MX) |

### Mexico-only words to keep out of UI chrome (they don't travel to the other 16 storefronts)
neta, chido/padre, ahorita, un buen, se me va el avión, "cada tercer día" (ambiguous), "háblale" for "call" (llámale is pan-LatAm) [ASO].

### False friends
- **actualmente** = currently, not "actually" (use "en realidad")
- **eventualmente** = possibly/occasionally, not "eventually" (use "con el tiempo", "al final")
- **soportar** ≠ support a feature (use "ser compatible con", as Apple does: "no es compatible con notificaciones" [AL])
- **remover** sounds anglicized for delete/remove (use "eliminar" / "quitar")
- **aplicación** vs **app**: both are fine; Apple says "app" ("la app Reloj") [AS-MX]
- **tiempo** ≠ clock time (use "hora")
- **librería** = bookstore (use "biblioteca")
- **asistir** = attend (use "ayudar")
- **realizar** ≠ realize (use "darse cuenta")
- **"Tu recordatorio ha sido creado"** is a calque of the English passive (use "Recordatorio creado" or "Listo, te lo recuerdo a las…")

### Anglicisms
- **Accepted (Apple or market use):** app, iPhone, Pro, Wi-Fi, online (marketing only), email only in casual contexts ("correo" preferred).
- **Avoid:**
  - snooze → Posponer
  - click / clic → tocar
  - "setear" → configurar / establecer
  - "resetear" → restablecer
  - "chequear" → revisar
  - "upgradear" → mejorar
  - "trial" → prueba
  - "AM/PM" in caps

### Other traps
- **Hard-coded "$" or US number formats:** they break the Argentina, Chile and Colombia storefronts. Use the store's price string.
- **"Cada 1 hora" / "1 recordatorios":** plural bugs. Write `one` forms as their own phrases.
- **Capitalizing each word** ("Restaurar Compras", "Entre Semana"): English title case. Use sentence case.
- **Usted in legal text and tú elsewhere:** reads as machine translation. Use tú everywhere.
- **Dropped accents:** "notificacion", "dias" look broken. Test fonts with á é í ó ú ñ ü ¿ ¡ at every weight.
- **Subscription display names in ASC:** keep them accent-free ("Pro mensual", "Pro anual") [ASO]. In-app strings can and must use accents.

---

## Sources

**Apple system strings (applelocalization.com API, iOS 26.7.1, opened 2026-10-10)**
- API spec: https://applelocalization.com/openapi.json
- Snooze / Posponer: https://applelocalization.com/api/ios/26/search?q=Posponer&locale=es_419&size=40
- Detener (ALARM_STOP): https://applelocalization.com/api/ios/26/search?q=Detener&locale=es_419&b=SpringBoard.app&size=60
- Desliza para detener: https://applelocalization.com/api/ios/26/search?q=desliza%20para%20detener&locale=es_419&size=30
- Desliza para… (lock screen): https://applelocalization.com/api/ios/26/search?q=Desliza%20para&locale=es_419&b=SpringBoard.app&size=40
- Entre semana: https://applelocalization.com/api/ios/26/search?q=Entre%20semana&locale=es_419&size=40
- Todos los días (MobileTimer): https://applelocalization.com/api/ios/26/search?q=Todos%20los%20d%C3%ADas&locale=es_419&b=MobileTimer.framework&size=40
- Cada hora: https://applelocalization.com/api/ios/26/search?q=Cada%20hora&locale=es_419&size=40
- Diariamente: https://applelocalization.com/api/ios/26/search?q=Diariamente&locale=es_419&size=40
- ReminderKit "Cada %u…" and plurals: https://applelocalization.com/api/ios/26/search?q=Cada%20%25&locale=es_419&b=ReminderKit.framework&size=60
- Terminar repetición: https://applelocalization.com/api/ios/26/search?q=repetici%C3%B3n&locale=es_419&b=EventKitUI.framework&size=60
- Nuevo recordatorio: https://applelocalization.com/api/ios/26/search?q=Nuevo%20recordatorio&locale=es_419&size=30
- Programados: https://applelocalization.com/api/ios/26/search?q=Programados&locale=es_419&b=RemindersUICore.framework&size=20
- StoreKit free trial: https://applelocalization.com/api/ios/26/search?q=gratis&locale=es_419&b=_StoreKit_SwiftUI.framework&size=80
- StoreKit restore: https://applelocalization.com/api/ios/26/search?q=Restaurar&locale=es_419&b=_StoreKit_SwiftUI.framework&size=80
- StoreKit privacy: https://applelocalization.com/api/ios/26/search?q=privacidad&locale=es_419&b=_StoreKit_SwiftUI.framework&size=80
- StoreKit auto-renew: https://applelocalization.com/api/ios/26/search?q=renueva%20autom%C3%A1ticamente&locale=es_419&size=60
- Notifications prompt: https://applelocalization.com/api/ios/26/search?q=quiere%20enviarte&locale=es_419&size=60
- Microphone prompt: https://applelocalization.com/api/ios/26/search?q=micr%C3%B3fono&locale=es_419&b=TCC.framework&size=60
- No permitir: https://applelocalization.com/api/ios/26/search?q=No%20permitir&locale=es_419&size=40
- AlarmKit prompt: https://applelocalization.com/api/ios/26/search?q=alarmas%20y%20temporizadores&locale=es_419&size=40
- Urgente: https://applelocalization.com/api/ios/26/search?q=Urgente&locale=es_419&size=40
- Escuchando…: https://applelocalization.com/api/ios/26/search?q=Escuchando&locale=es_419&size=30
- Volver a intentar: https://applelocalization.com/api/ios/26/search?q=Volver%20a%20intentar&locale=es_419&size=30
- Ir a Configuración (es_419): https://applelocalization.com/api/ios/26/search?q=Ir%20a%20Configuraci%C3%B3n&locale=es_419&size=15
- Ir a Ajustes (es): https://applelocalization.com/api/ios/26/search?q=Ir%20a%20Ajustes&locale=es&size=15

**Apple Support / Apple sites**
- iPhone alarms, es-MX (modo Silencio, Agregar, Repetir, Etiqueta): https://support.apple.com/es-mx/118444
- Set an alarm, iPhone guide es-MX (Listo, Editar, Posponer, Duración de la posposición, Basurero, bocinas, audífonos, app Configuración): https://support.apple.com/es-mx/guide/iphone/iph2909d3a74/ios
- Cancel a subscription, es-MX (path, trial rule): https://support.apple.com/es-mx/118428
- Notifications on Mac/iPhone, es-MX (Configuración > Notificaciones, Permitir notificaciones): https://support.apple.com/es-mx/120684
- View notifications, iPhone guide es-US (pantalla bloqueada, Administrar…): https://support.apple.com/es-us/guide/iphone/iph6534c01bc/ios
- Clock for Mac guide, es-MX ("Te damos la bienvenida"): https://support.apple.com/es-mx/guide/clock-mac/welcome/mac
- Timers, iPhone guide es-ES (Ajustes, Añadir, for contrast): https://support.apple.com/es-es/guide/iphone/iph8241d6b2a/ios
- Recordatorios on App Store MX ("pendientes", "Crea, edita…"): https://apps.apple.com/mx/app/recordatorios/id1108187841
- Apple MX App Store page ("Administra tu Cuenta de Apple"): https://www.apple.com/mx/app-store
- Apple Developer LA, renewal ("cuenta de Apple", "Renovar automáticamente"): https://developer.apple.com/la/help/account/membership/renewal

**Style, locale data, orthography**
- Microsoft Spanish (Mexico) Localization Style Guide: https://download.microsoft.com/download/9/0/1/9016efc5-6455-4a9d-ae78-ed3df93b2851/spa-mex-StyleGuide.pdf
- CLDR es_MX: https://raw.githubusercontent.com/unicode-org/cldr/main/common/main/es_MX.xml
- CLDR es_419: https://raw.githubusercontent.com/unicode-org/cldr/main/common/main/es_419.xml
- Localechord es-MX formats (CLDR 48): https://localechord.app/es-mx
- Fundéu, horas: https://www.fundeu.es/recomendacion/horas-grafia
- Fundéu Guzmán Ariza, "a. m." y "p. m.": https://fundeu.do/a-m-y-p-m-en-minuscula-y-con-punto
- W3C, Text size in translation: https://www.w3.org/International/articles/article-text-size.en
- SimpleLocalize, text expansion: https://simplelocalize.io/blog/posts/text-expansion-ui-localization

**Market tone and legal-text examples (search excerpts)**
- Rappi App Store listing: https://apps.apple.com/py/app/rappi-pide-todo-en-minutos/id984044296
- Nu App Store listing: https://apps.apple.com/es/app/nu/id814456780
- Mercado Libre App Store listing: https://apps.apple.com/us/app/mercado-libre-compras-online/id463624852
- Foto ID (es-MX subscription disclosure example): https://apps.apple.com/us/app/foto-id/id447897226?l=es-MX
- finviz (usted-mixed disclosure, counter-example): https://apps.apple.com/us/app/finviz-bolsa-de-valores/id1495879445?l=es-MX
- Spain vs LatAm vocabulary: https://www.supermemo.com/en/blog/spanish-from-spain-vs-latin-american-spanish-what-is-worth-knowing ; https://lenguaje.com/en/spain-spanish-vs-latin-american-spanish-key-differences ; https://www.spanishdict.com/guide/vosotros

**Repo**
- `C:\Dev\VR\docs\aso\research\localization\es-MX.md`
- `C:\Dev\VR\docs\aso\research\localization\es-MX-1.0.1-draft.md`

**Gaps**
- applelocalization.com's search matches the translated text, not the English key, so some Apple terms couldn't be pulled. Not verified: "Ahora no", "Hoy", "Fines de semana", "Restaurar compras" as a short label (Apple's own is "Restaurar compras faltantes"). These rows are marked [J].
- No in-app screenshots of Mercado Libre, Rappi, Nu, Todoist or Google Tasks were opened. Tone evidence comes from their App Store listing text only.
- How "a.m." vs "a. m." renders on the device depends on the engine. Verify on the iPhone before locking any screenshots.
