# Urdu (ur) UI translation: independent review

Reviewer pass on `ur.json` against `locales/en.json` (430 keys) and `strings-inventory.md`. Every string was back-translated to English and compared with the source. 4 strings changed. Validator: PASS (430 keys, order matches en.json, every message parses with `@formatjs/icu-messageformat-parser` with the same argument and tag names as English, plurals use `Intl.PluralRules('ur')` = {one, other}, no bidi controls, no provider names, docs and locales copies byte-identical, iOS plist 2 keys OK).

## Verdict: **SHIP WITH NOTES**

Natural, polite آپ-register Urdu with correct Urdu letters (ی ک ہ ے, no Arabic ي ك ه) and ۔ full stops throughout. Gender handling is careful (passive or possessive where English says "you"). The paywall disclosures are legally complete. The fixes are small: one plural message whose verb agreed with the wrong number, a masculine "paused" status, and the bare "{time} has passed" line. The notes are the two device checks (Settings label, tab-bar width) that can't be settled from here.

## Changes

| key | before | after | back-translation | why |
|---|---|---|---|---|
| `take.partial.title` | {total, plural, one {# میں سے {created} یاد دہانی بن گئی} other {# میں سے {created} یاد دہانیاں بن گئیں}} | {total, plural, one {یاد دہانی بن گئی: # میں سے {created}} other {یاد دہانیاں بن گئیں: # میں سے {created}}} | Reminders created: {created} of N | The verb and noun agreed with `total` but sat next to `created`. With created = 1, total = 3 (the common case) it read "3 میں سے 1 یاد دہانیاں بن گئیں" (1 reminders were created). The label form reads right for any count and starts with an Urdu word |
| `recording.status.paused` | رکا ہوا ہے | موقوف | Paused | "رکا ہوا ہے" is masculine, but the subject (ریکارڈنگ) is feminine. موقوف is gender-neutral and is the usual Urdu word for a paused state |
| `pending.askPastTime` | آج {time} گزر چکا ہے۔ میں آپ کو کب یاد دلاؤں؟ | آج {time} کا وقت گزر چکا ہے۔ میں آپ کو کب یاد دلاؤں؟ | Today's {time} has already passed. When should I remind you? | "آج 3:00 PM گزر چکا ہے" treats a bare clock reading as a masculine subject. "…کا وقت گزر چکا ہے" is what people say |
| `pending.detail.pastTime` | آج {time} گزر چکا ہے۔ میں آپ کو کب یاد دلاؤں؟ دوبارہ ریکارڈ کرنے کے لیے ٹیپ کریں۔ | آج {time} کا وقت گزر چکا ہے۔ میں آپ کو کب یاد دلاؤں؟ دوبارہ ریکارڈ کرنے کے لیے ٹیپ کریں۔ | Today's {time} has already passed. When should I remind you? Tap to record again. | Same as above |

## Rules checked

- **Plurals:** `Intl.PluralRules('ur')` gives exactly one / other, and every plural uses those two categories. `take.multiCreated` has `other` only, like the English (the count is always 2 or more). Per-branch forms are right: the oblique گھنٹے after میں / ہر, the invariant دن / منٹ / ماہ / سال, and یاد دہانی → یاد دہانیاں / یاد دہانیوں with agreeing verbs (رہ سکتی ہے / رہ سکتی ہیں). In `paywall.term.*`, `one` has no `#`, mirroring "day" vs "# days".
- **Gender (the translator's flag):** `time.missedAt` (چھوٹ گئی), `time.ringingNow` (بج رہی ہے) and `time.ringsAgain` (بجے گی) are the reminder card's ring-state labels (`lib/time.ts:570-588`, `components/days/DaysPage.tsx:68`). The subject is the reminder (یاد دہانی, f), so the feminine forms are correct. Alarm strings stay masculine (`edit.row.alarm.subtitle` بجتا رہتا ہے). Remi speaks as masculine (میں سمجھ نہیں سکا). The user is never gendered.
- **Paywall legal:** both disclosures keep the price per term, the charge to the Apple Account at purchase confirmation, auto-renew until cancelled, the charge within 24 hours before each renewal, the cut-off for turning auto-renew off at least 24 hours before the period ends (priced), and the manage/cancel path سیٹنگز > Apple اکاؤنٹ > سبسکرپشنز. `paywall.error.alreadyOwned` quotes the `paywall.restore` label exactly.
- **Brand and providers:** Remi, Pro, PRO, App Store, Apple and iPhone stay Latin. No provider is named in the catalog or in `locales/ios/ur.json`. The consent text keeps "third-party" (تھرڈ پارٹی).
- **iOS plist:** `locales/ios/ur.json` is identical to the catalog's `infoPlist.*` values. Its meaning matches the English (the recording leaves the device, secure AI services process it, and reminders ring when the phone is silenced). No change.
- **RTL:** almost every string starts with an Urdu word. The Latin-initial ones are `today.header.getPro` (Pro لیں), `feedback.context.remiSays`, `feedback.list.fromRemi`, `settings.version`, and the two `{product}`-initial legal disclosures. None has a natural reorder that fits, so they are kept. Number-led strings (`gate.limit.*`, `recording.listeningIn`) resolve to RTL on the first Urdu letter, since digits are bidi-weak. No bidi control characters.
- **Orthography:** no Arabic ي / ك / ه / ۀ anywhere. No Latin full stops at sentence ends (۔ is used). Western digits, which the Intl formatters also print for `ur`.

## Everyday word vs Apple term

- **یاد دہانی** over Apple's **ریمائنڈر** (Apple's Reminders app). Kept as the user asked: it is correct, natural Urdu, and Pakistani banks and telcos use it. Changing to ریمائنڈر would be a global replace if testers prefer it.
- **سیٹنگز** for Settings. Not verifiable: the applelocalization.com API (iOS 26, locale `ur`) returns Settings untranslated in the bundles it covers, and Apple's running text uses "سیٹنگ میں" (SystemVersionSettings). The Settings app's own display name could not be pulled. سیٹنگز is common Pakistani usage and is used consistently in all 11 occurrences (no bare سیٹنگ). If the Urdu iPhone's Settings icon reads "سیٹنگ", replace in those 11 strings.
- **اطلاعات** (Apple, verified) over "نوٹیفیکیشنز". **رائے** over فیڈبیک. **خودکار تجدید** for auto-renew. **موقوف** for Paused.

## Length and open notes

- `tabs.reminders` یاد دہانیاں is 11 characters against about 10. Arabic-script glyphs set narrower than Latin, so it most likely fits, but Nastaliq is tall: check the tab bar on the device for both width and vertical clipping. The fallback is ریمائنڈرز (9).
- `today.timeDraft.confirm` یاد دلائیں (remind) drops "me". It is natural as a button, and مجھے یاد دلائیں (13, limit 14) is available if wanted. Not changed.
- `paywall.cta.subscribe` "سبسکرائب کریں: {price} / {term}" may wrap with a long PKR price. Check on the device.
- `paywall.term.week` one = ہفتے (oblique) reads right after ہر but odd after "/". No weekly plan ships today.
- `paywall.toast.activated.title` adds مبارک ہو! (Congratulations!) so the line opens in Urdu. A harmless addition, kept.
- Nastaliq line height: chips, single-line rows and the tab bar need a visual check for clipping.

## Length pass (2026-10-26)

- pending.recordAgain | دوبارہ ریکارڈ کریں → دوبارہ ریکارڈ | 18 > 16; button label without the imperative "کریں" reads naturally on a button.
- gate.unverified.status | …اپنا انٹرنیٹ کنکشن چیک کریں… → …اپنا انٹرنیٹ چیک کریں… | 86 > 85; drops "کنکشن", same wording as paywall.error.network / settings.alert.restoreFailed.offline.
- edit.confirm.updatingVoice | آواز اپ ڈیٹ ہو رہی ہے… → آواز اپ ڈیٹ جاری… | 22 > 17; "جاری" (in progress) is the common short progress form.
- feedback.status.looking | جائزہ لیا جا رہا ہے → زیرِ جائزہ | 19 > 18; "زیرِ جائزہ" (under review) is the standard status-chip phrase.
