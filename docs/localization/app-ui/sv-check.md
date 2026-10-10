# Swedish (sv) UI translation: independent review

Reviewer pass on `sv.json` against `strings-en.json` and `strings-inventory.md`. Every string was back-translated to English and compared with the source. 33 strings changed. Validator: PASS (warnings are only "Remi" inside "Reminder", and strings that are identical to English on purpose).

## Verdict: **SHIP**

Natural Swedish, but it was not shippable before this pass. It used "abonnemang" for App Store subscriptions, so the Settings path in the alert and in both legal disclosures pointed to a menu that doesn't exist (iOS says "Prenumerationer"). It is now fixed in 21 keys, along with "vardagar" (Monday to Friday) on the paywall.

## Changes

| key | before | after | back-translation | why |
|---|---|---|---|---|
| `time.ringsAgain` | Ringer igen {time} | Ringer igen kl. {time} | Rings again at {time} | Swedish needs 'kl.' before a clock time |
| `reminders.next.none` | Inget nästa alarm schemalagt | Inget kommande alarm | No upcoming alarm | 'Inget nästa alarm schemalagt' is a word-for-word calque |
| `pending.quickChoice.a11y` | Påminn mig {choice} | Påminn mig: {choice} | Remind me: {choice} | Colon pattern so the chip label (stored capitalised) reads correctly mid-sentence; no lower-casing assumed |
| `gate.unverified.status` | Det går inte att verifiera ditt abonnemang. Kontrollera internetanslutningen och försök igen. | Det går inte att verifiera din prenumeration. Kontrollera internetanslutningen och försök igen. | Can't verify your subscription. Check the internet connection and try again. | App subscriptions are 'prenumeration' in Swedish iOS (Settings > Prenumerationer); 'abonnemang' is a phone contract |
| `gate.unverified.toastTitle` | Det går inte att verifiera ditt abonnemang | Det går inte att verifiera din prenumeration | Can't verify your subscription | prenumeration, see above |
| `gate.limit.status` | {limit, plural, one {Du har nått # aktiv påminnelse. Uppgradera för obegränsat.} other {Du har nått # aktiva påminnelser. Uppgradera för obegränsat.}} | {limit, plural, one {Gränsen är nådd: # aktiv påminnelse. Uppgradera för obegränsat.} other {Gränsen är nådd: # aktiva påminnelser. Uppgradera för obegränsat.}} | Limit reached: N active reminders. Upgrade for unlimited. | 'Du har nått # aktiva påminnelser' is a literal calque |
| `gate.limit.toastTitle` | {limit, plural, one {Du har nått # aktiv påminnelse} other {Du har nått # aktiva påminnelser}} | {limit, plural, one {Gränsen är nådd: # aktiv påminnelse} other {Gränsen är nådd: # aktiva påminnelser}} | Limit reached: N active reminders | Same as above |
| `notificationsOff.message` | Slå på dem i Inställningar för att få aviseringar | Slå på dem i Inställningar för att få notiser | Turn them on in Settings to get notifications | Consistent term: the app says 'notiser' everywhere else |
| `edit.headsUp.minutesBefore` | {minutes} min innan | {minutes} min före | {minutes} min before | 'före' is the standard written form for a time offset |
| `repeat.mode.date` | Ett datum | På ett datum | On a date | 'Ett datum' alone dropped 'on' |
| `settings.row.restore.subtitle` | Redan abonnent? Få tillbaka Pro | Prenumererar du redan? Få tillbaka Pro | Already subscribing? Get Pro back | prenumeration |
| `settings.voiceLanguage.alert.message` | Vilket språk dina inspelningar transkriberas på på den här iPhonen. Automatiskt följer enhetens språk. | Välj vilket språk dina inspelningar ska transkriberas till på den här iPhonen. ”Automatiskt” följer enhetens språk. | Choose which language your recordings are transcribed into on this iPhone. 'Automatic' follows the device languages. | Fixed the doubled 'på på' and quoted the option name |
| `settings.row.terms.subtitle` | Abonnemangsvillkor och applicens | Prenumerationsvillkor och applicens | Subscription terms and app licence | prenumeration |
| `settings.alert.checkFailed.title` | Det gick inte att kontrollera ditt abonnemang | Det gick inte att kontrollera din prenumeration | Couldn't check your subscription | prenumeration |
| `settings.alert.manageFailed.title` | Det gick inte att öppna abonnemang | Det gick inte att öppna prenumerationer | Couldn't open subscriptions | prenumeration |
| `settings.alert.manageFailed.message` | Hantera ditt abonnemang under Inställningar › [ditt namn] › Abonnemang. | Hantera din prenumeration under Inställningar › [ditt namn] › Prenumerationer. | Manage your subscription under Settings > [your name] > Subscriptions. | The iOS path is 'Prenumerationer'; 'Abonnemang' does not exist there |
| `proCard.unknown.title` | Abonnemang | Prenumeration | Subscription | prenumeration |
| `restore.expired.title` | Abonnemanget har gått ut | Prenumerationen har gått ut | The subscription has expired | prenumeration |
| `restore.expired.message` | Ditt {product}-abonnemang har upphört. Du kan teckna det igen när du vill. | Din {product}-prenumeration har upphört. Du kan prenumerera igen när du vill. | Your {product} subscription has ended. You can subscribe again whenever you like. | prenumeration |
| `restore.nothing.message` | Inget tidigare abonnemang hittades för det här kontot. | Ingen tidigare prenumeration hittades för det här kontot. | No previous subscription was found for this account. | prenumeration |
| `paywall.table.row.schedules` | Vardagar, datum, med några dagars mellanrum | Veckodagar, datum, med några dagars mellanrum | Days of the week, dates, every few days | 'Weekdays' here means days of the week (pick Mon, Thu...); the old word means Monday-Friday ('vardagar') |
| `paywall.trialLabel` | ({length} provperiod) | (Provperiod: {length}) | (Trial: {length}) | '(7 dagar provperiod)' needs a genitive ('dagars'); colon form works for every length |
| `paywall.cta.unavailable` | Inga abonnemang | Kan inte visa priser | Can't show prices | 'Inga abonnemang' (no subscriptions) misread the state and used the wrong term |
| `paywall.cta.subscribe` | Abonnera för {price}/{term} | Prenumerera för {price}/{term} | Subscribe for {price}/{term} | prenumeration |
| `paywall.plansUnavailable` | Det gick inte att läsa in abonnemangen just nu. | Det gick inte att läsa in prenumerationerna just nu. | Couldn't load the subscriptions right now. | prenumeration |
| `paywall.legal.disclosure.generic` | {product} är ett abonnemang som förnyas automatiskt. Betalningen debiteras ditt Apple-konto när köpet bekräftas, och abonnemanget förnyas automatiskt tills det avslutas. Hantera eller avsluta när du vill under Inställningar > [ditt namn] > Abonnemang. | {product} är en prenumeration som förnyas automatiskt. Betalningen debiteras ditt Apple-konto när köpet bekräftas, och prenumerationen förnyas automatiskt tills den avslutas. Hantera eller avsluta när du vill under Inställningar > [ditt namn] > Prenumerationer. | {product} is a subscription that renews automatically. Payment is charged to your Apple Account when the purchase is confirmed, and it renews automatically until cancelled. Manage or cancel anytime under Settings > [your name] > Subscriptions. | Legal path must match iOS ('Prenumerationer'); term fixed |
| `paywall.legal.disclosure.priced` | {product} kostar {price} per {term}. Betalningen debiteras ditt Apple-konto när köpet bekräftas. Abonnemanget förnyas automatiskt för {price} per {term}, och ditt konto debiteras inom 24 timmar före varje förnyelse, om inte automatisk förnyelse stängs av senast 24 timmar innan den aktuella perioden tar slut. Hantera eller avsluta när du vill under Inställningar > [ditt namn] > Abonnemang. | {product} kostar {price} per {term}. Betalningen debiteras ditt Apple-konto när köpet bekräftas. Prenumerationen förnyas automatiskt för {price} per {term}, och ditt konto debiteras inom 24 timmar före varje förnyelse, om inte automatisk förnyelse stängs av senast 24 timmar innan den aktuella perioden tar slut. Hantera eller avsluta när du vill under Inställningar > [ditt namn] > Prenumerationer. | {product} costs {price} per {term}. Payment is charged to your Apple Account when the purchase is confirmed. It renews automatically for {price} per {term}, and your account is charged within 24 hours before each renewal, unless auto-renew is turned off at least 24 hours before the current period ends. Manage or cancel anytime under Settings > [your name] > Subscriptions. | Legal path must match iOS ('Prenumerationer'); term fixed; legal meaning unchanged |
| `paywall.error.alreadyOwned` | Du har redan det här abonnemanget – tryck på Återställ köp. | Du har redan den här prenumerationen – tryck på Återställ köp. | You already have this subscription - tap Restore purchase. | prenumeration |
| `paywall.toast.selectPlan` | Välj ett abonnemang. | Välj en prenumeration. | Choose a subscription. | prenumeration |
| `paywall.toast.complete.message` | Tack för att du abonnerar! | Tack för att du prenumererar! | Thanks for subscribing! | prenumeration |
| `paywall.toast.expired.title` | Abonnemanget har gått ut | Prenumerationen har gått ut | The subscription has expired | prenumeration |
| `paywall.toast.expired.message` | Ditt {product}-abonnemang har upphört. Du kan teckna det igen nedan. | Din {product}-prenumeration har upphört. Du kan prenumerera igen nedan. | Your {product} subscription has ended. You can subscribe again below. | prenumeration |
| `paywall.toast.nothing.message` | Inget tidigare abonnemang hittades för det här kontot. | Ingen tidigare prenumeration hittades för det här kontot. | No previous subscription was found for this account. | prenumeration |

## Orchestrator rules

- **Language names / {language} sentences:** Checked: `language.name.*` are lower-case basic forms (engelska). "Lyssnar på engelska", "Remi talar inte engelska än" (fallback "det här språket") and the subtitle after a middot are grammatical. No change needed.
- **Remind-me chip label:** `pending.quickChoice.a11y` now uses a colon ("…: {choice}"), so the chip label works with the capital it is stored with and no lower-casing is needed.
- **Remi as "I":** `pending.ask`, `askPastTime` and `detail.noTime` keep the first person. No change needed.
- **Weekdays:** `paywall.table.row.schedules` now says days of the week (picked days), not Monday to Friday. `repeat.mode.weekly` and `repeat.section.repeatOn` were checked and are fine.
- **Brand / providers / legal:** "Remi" and "Remi Pro" ({product}) are untranslated. No AI provider is named. Both disclosures keep auto-renew, the charge to the Apple Account, the 24-hours-before cut-off and the path to Subscriptions (written as "[your name]", the label iOS shows, matching the pt-BR reference).

## Everyday word vs Apple term

- **prenumeration** over "abonnemang" for app subscriptions (21 keys). Swedish iOS says "Prenumerationer", and "abonnemang" means a phone or broadband contract. This also corrects the Settings path in `manageFailed.message` and both legal disclosures.
- Kept **Radera** (Apple) for Delete. It is also common everyday Swedish.

## Length and open notes

- `tabs.reminders` "Påminnelser" (11) and `tabs.settings` "Inställningar" (13) are over the limit of about 10. Standard terms; check the bottom bar on the device.
- `time.every.*` uses "Var # minut" (colloquial). The normative written form "var 5:e minut" needs an ordinal suffix that ICU `#` can't produce.
