# de (German) — translator notes for `de.json` (2026-10-10)

## Style sheet

- **Register: du**, lowercase "du/dein" (Apple de uses "du": "Tippe in den Einstellungen auf deinen Namen", support 118428). Never "Sie".
- **Buttons: infinitive** (Abbrechen, Löschen, Erlauben, Abspielen, Erneut versuchen). **Instructions: du-imperative** (Tippe…, Prüfe…, Wähle…). Short toast actions use infinitive constructions ("Zum Wiederholen tippen"), like iOS.
- **Progress states:** passive "Wird geladen …" / "Wird erstellt …"; Apple de puts a space before the ellipsis ("Laden …"), so the catalog does too.
- **Quotes:** „…“. UI element names in running text in „…“ the way Apple de does („Einstellungen“, „Abonnements“, „Bildschirmzeit“).
- **Notifications are "Mitteilungen"** (iOS de term), not "Benachrichtigungen". "Abo" in short UI, "Abonnement(s)" where Apple names the screen.
- **Alarm vs Wecker:** iOS Clock calls its alarms "Wecker". Remi's alarms are reminders that ring, so the catalog says "Alarm" (also the AlarmKit/permission sense). Revisit if testers expect "Wecker".
- **Language names** are capitalized nouns (Deutsch, Arabisch). Sentence built so fallback works: "Remi spricht {language} noch nicht" → "…spricht diese Sprache noch nicht".
- **Plurals (CLDR de):** one / other only. Dative plural where needed ("in # Tagen").
- **No AI provider names**; "sichere KI-Dienste Dritter".

## Apple terms

| EN | de | Status |
|---|---|---|
| Reminders | Erinnerungen | Verified (app "Erinnerungen", iPhone guide) |
| Alarm (Clock) | Wecker | Verified (support 118444 title) — Remi uses "Alarm", see above |
| Snooze | Schlummern | Verified (iPhone guide) |
| Stop | Stoppen | Inferred |
| Later | Später | Inferred |
| Settings | Einstellungen | Verified |
| Delete | Löschen | Inferred (standard) |
| Done | Fertig | Verified ("Tippe auf die Taste „Fertig“") |
| Allow / Don't Allow | Erlauben / Nicht erlauben | Inferred (iOS dialog) |
| Subscription | Abonnement / Abo; "Abo kündigen" | Verified (118428) |
| Restore Purchases | Käufe wiederherstellen | Inferred |
| Free Trial | Probeabo / Probezeit; "gratis testen" in CTAs | Verified ("Probeabonnement", "Probezeit", 118428) |
| Apple Account | Apple Account (untranslated) | Verified (118428) |
| Every day | Jeden Tag / Täglich | Inferred |
| Weekdays | Wochentags | Inferred |
| slide to stop | Zum Stoppen streichen | **Not verified**; not used |
| Listening… | Hört zu … | Inferred |
| Screen Time | Bildschirmzeit | Inferred |

## Paywall legal

- Path: "Einstellungen > [dein Name] > Abonnements" (Apple de: "Tippe in den Einstellungen auf deinen Namen. Tippe auf „Abonnements“").
- "über deinen Apple Account abgerechnet", "verlängert sich automatisch", "kündigen" = standard German App Store wording. Meaning complete: price/period, charged at confirmation, auto-renew, charged within 24 h before renewal, unless turned off 24 h before period end, manage/cancel.
- Germany has special cancellation rules (Apple 108098, "Kündigungsbutton"). The disclosure still matches Apple's own phrasing; legal review out of scope.

## Uncertain strings

- `pending.quickChoice.a11y` "Erinnere mich {choice}": **code lower-cases the chip label** (`PendingTakeCard.tsx:260`). In German that yields "heute abend" / "morgen früh"; the noun must stay "Abend". Fix in code (don't lower-case for de) when wiring.
- `paywall.hero.default.*` rewritten: "Rechtzeitig / an alles / denken." (literal "Weniger vergessen" doesn't split into 12-char lines). "Forget less" lives on in `paywall.closing.headline`.
- `paywall.billed.every` "Abrechnung pro {term}" (pro Woche / pro 2 Wochen).
- `today.header.getPro` "Pro holen". Alt "Pro sichern".
- `settings.row.voiceLanguage` "Sprache der Aufnahme" (it is the transcription language). Alt "Diktiersprache".
- `time.clock.am/pm`, picker AM/PM: placeholders only; Germany is 24 h. Use `Intl`.

## Overflow risks

| Key | de | Chars / limit |
|---|---|---|
| `tabs.reminders` | Erinnerungen | 12 / ~10 — likely truncation; no shorter natural word. Alt: shrink tab font |
| `tabs.settings` | Einstellungen | 13 / ~10 — same. Alt "Optionen" (8), but not Apple's term |
| `paywall.hero.interval.line3` | erledigt ist. | 13 / ~12 |
| `common.cancel` | Abbrechen | 9 / 10 OK |
| `recording.status.upgradeToContinue` etc. | German runs ~30% longer; check status lines that allow 2 lines |
