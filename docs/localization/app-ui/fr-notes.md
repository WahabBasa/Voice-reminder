# fr (French, France) — translator notes for `fr.json` (2026-10-10)

## Style sheet

- **Register: vous.** Apple's French iOS and support pages use "vous" everywhere ("Touchez Modifier", "Si vous ne trouvez pas…"). Never "tu".
- **Buttons: infinitive** (Annuler, Supprimer, Autoriser, Réessayer, Passer Pro). **Instructions/hints: imperative vous** (Touchez…, Vérifiez…, Choisissez…). Same split Apple uses.
- **Errors:** "Impossible de + infinitif" for system failures; Remi's own voice in first person ("Je n'ai pas compris").
- **Sentence case** for Remi's own strings; Apple's named elements keep Apple's capitalisation (Réglages, Abonnements, Temps d'écran).
- **Typography:** curly apostrophe ’ everywhere (Apple fr style; also keeps ICU safe). No-break space (U+00A0) before ? ! : ; and inside « ». Applied by script, so check that any later edit keeps it.
- **Gender:** user's gender unknown. Avoided "alerté(e)", "abonné(e)", "entendu(e)": rephrased ("Recevez vos alertes", "Déjà un abonnement ?", "Aucun son capté"). Remi is masculine ("Remi a entendu").
- **Language names** lowercase, no article ("Écoute en arabe", "Remi ne parle pas encore arabe" / "…cette langue").
- **Plurals (CLDR fr):** one (0 and 1), many (millions), other. Every plural has all three; `many` = `other` text. 0 takes the singular ("0 rappel actif"), which is correct French.
- **No AI provider names**; "services d'IA tiers sécurisés".

## Apple terms

| EN | fr | Status |
|---|---|---|
| Reminders (app/tab) | Rappels | Verified (Apple app name) |
| Alarm | Alarme | Verified (support 118444, "Supprimer l'alarme") |
| Snooze | Rappel d'alarme (setting) / Rappel (button) | Verified (iPhone guide, "afficher un bouton Rappel") |
| Stop | Arrêter | Inferred |
| Later | Plus tard | Inferred (standard iOS fr) |
| Settings | Réglages | Verified |
| Delete | Supprimer | Verified |
| Done | OK | Verified ("Touchez le bouton OK") |
| Allow / Don't Allow | Autoriser / Ne pas autoriser | Inferred (iOS system dialog) |
| Subscription(s) | abonnement / Abonnements | Verified (support 118428) |
| Cancel subscription | Annuler l'abonnement / résilier | Verified |
| Restore Purchases | Restaurer les achats | Inferred (universal App Store wording) |
| Free Trial | essai gratuit / période d'essai | Verified ("période d'essai", 118428) |
| Apple Account | compte Apple | Verified (118428, lowercase "compte") |
| Repeat | Récurrence | Verified (iPhone guide) |
| Every day | Tous les jours | Inferred |
| Weekdays | Jours de semaine | Inferred |
| slide to stop | Faire glisser pour arrêter | **Not verified** (iOS 26.1 string not found); not used in the catalog |
| Listening… | À l'écoute… | Inferred |
| Silent mode | mode Silence | Verified (118444) |
| Screen Time | Temps d'écran | Inferred |

Note: Remi's "Later" button is Remi's own re-ring, not Apple's Snooze, so it stays "Plus tard", not "Rappel".

## Paywall legal

- Apple's French path is "Réglages > [votre nom] > Abonnements" (118428: "Dans Réglages, touchez votre nom. Touchez Abonnements."). I used that instead of a literal "Réglages > compte Apple" (no such row label exists). Same choice in `settings.alert.manageFailed.message`.
- "débité de votre compte Apple", "renouvellement automatique", "résiliez-le" are the standard App Store FR terms. Meaning matches English 1:1 (price + period, charged at confirmation, auto-renew, 24 h rule, manage/cancel).
- `{price} par {term}`: `term` one-forms are bare nouns (jour, semaine, mois, an), other-forms "# semaines". "par 2 semaines" is understandable but slightly loose; only odd packages hit it.

## Uncertain strings (alternatives)

- `today.header.getPro` "Passer Pro" (10). Alt "Passer à Pro" (12, cleaner grammar, may overflow).
- `paywall.billed.every` "Facturé par {term}": avoids the tous/toutes gender clash ("tous les 2 semaines" would be wrong). Alt if `term` gets an article: "Facturé toutes les 2 semaines".
- `schedule.everyDuration` "Toutes les {duration}": fine for "2 h" / "45 min"; reads oddly for "1 h" ("Toutes les 1 h"). Alt: special-case 1 h as "Toutes les heures".
- `reminders.pattern.everyDays` "Tous les {days}" → "Tous les lun., jeu.". Alt: "Le {days}".
- `time.ringsAgain` "Resonne à {time}": assumes `{time}` is a clock time. If it can be relative, use "Resonne {time}".
- `pending.askPastTime` / `pending.detail.pastTime` built as "{time}, c'est déjà passé…" so the fallback "Cette heure-là" works too.
- `paywall.hero.*` rewritten, not literal: "Oubliez moins. / Pensez-y / au bon moment." and "Un rappel / qui insiste / jusqu'au bout."
- `time.clock.am/pm`, `times.picker.am/pm`: kept AM/PM as placeholders only. France uses 24 h; these should come from `Intl.DateTimeFormat('fr')` and the picker should be 24 h.
- `diagnostics.status.*` agree with "notifications" (feminine plural): Autorisées, Refusées…

## Overflow risks

| Key | fr | Chars / limit |
|---|---|---|
| `paywall.card.badge` | MEILLEURE OFFRE | 15 / ~12. Alt "MEILLEUR PRIX" (13) |
| `paywall.table.col.free` | GRATUIT | 7 / ~6 |
| `paywall.hero.default.line1/3`, `interval.line3` | 14 each | ~12 (serif display, check wrap) |
| `alarm.button.later` | Plus tard | 9 / ~8 (AlarmKit pill) |
| `paywall.cta.trial` | Essai gratuit de 7 jours | 24 / 24 (at limit with 7 days; longer trials overflow) |
| `today.timeDraft.confirm` | Me le rappeler | 14 / 14 |
| `repeat.mode.everyDay` | Chaque jour | 11 (shortened from "Tous les jours" to fit 12) |
