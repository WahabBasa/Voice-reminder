# Remi app UI: Turkish (tr) translation notes (2026-10-10)

Companion to `tr.json` (426 keys, same order as `strings-en.json`). Validator: `[tr] PASS: 426 keys (en 426), 0 errors, 17 warnings`. Every warning is a false positive: 13 fire because "Reminder" contains "Remi", and 4 are placeholder-only strings ("{date} · {time}" etc.) plus "Alarm", which Turkish spells the same.

Source tags: **[AL]** = applelocalization.com API, iOS 26.7.1, locale `tr`, queried 2026-10-10 (bundle in brackets). **[AS-TR]** = support.apple.com/tr-tr. **[CLDR]** = Unicode CLDR `tr`. **[J]** = my judgment, not verified.

---

## 1. Mini style sheet

### Register: siz
Apple's Turkish iOS addresses the user with **siz**, always: "İnternet bağlantınızı denetleyin, sonra yeniden deneyin" [AL iCloud.app], "Ayarlar’da adınıza dokunun" [AS-TR 118428]. Remi follows suit: "dokunun", "deneyin", "seçin", "Aboneliğiniz". Remi's own first-person questions need no "you" form at all ("Ne zaman hatırlatayım?"). Never use sen-imperatives in sentences.

### Buttons: bare verb stem, Title Case
- Apple's Turkish buttons are the bare stem, the same form as the sen-imperative, but it reads as neutral command style: Ertele, Durdur, Geri Yükle, İzin Ver, Yeniden Dene, Ayarlar’a Git [AL]. So the stem is right on buttons even though sentences use siz: "Sil", "Gönder", "Pro’ya Geç".
- **Title Case** for buttons, screen, sheet and alert titles, tabs, settings rows, section labels and chips. Apple does this in Turkish: "Anımsatıcılar Açılamıyor", "Aboneliği Geri Yükle", "Hafta İçi", "Şimdi Değil" [AL]. Keep "ve", "ile", "veya" lowercase ("Abonelik ile Kullanılabilir" [AL]).
- **Sentence case** for body text, toasts, subtitles, hints, placeholders, status lines and VoiceOver labels.
- Apostrophes: use the typographic **’** before suffixes on proper nouns (Remi’nin, App Store’a, Ayarlar’da, Pro’ya), the way Apple's iOS strings do. Never use the ASCII `'`, which ICU treats as a quote character.

### Apple iOS terms

| English | Turkish | Status |
|---|---|---|
| Reminders (app / list) | Anımsatıcılar; reminder = anımsatıcı | **Verified** [AL iCloud.app, ReminderKit "Yeni Anımsatıcı"] |
| Alarm | Alarm | **Verified** [AL MobileTimer] |
| Snooze | Ertele | **Verified** [AL SpringBoard `ALARM_SNOOZE`] |
| Stop | Durdur | **Verified** [AL SpringBoard `SNOOZE_STOP`, `TIMER_STOP`] |
| Later | Sonra | **Verified** as Apple's short "Not Now" button [AL AccessorySetupUI, CompanionSetup `NOT_NOW`]. "Daha Sonra" is Apple's longer form ("Daha Sonra Ayarla"). |
| Not now | Şimdi Değil | **Verified** [AL SpringBoard, CoreTelephony] |
| Settings | Ayarlar | **Verified** [AL "Ayarlar’a Git"; AS-TR] |
| Delete | Sil | **Verified** [AL SpringBoard `BULLETIN_LIST_CLEAR`] |
| Done | Bitti | **Verified** [AL many bundles] |
| Cancel | Vazgeç | **Verified** [AL SpringBoard `CANCEL`] |
| Allow / Don't Allow | İzin Ver / İzin Verme | **Verified** [AL UserNotificationsServer `PERMISSION_ALERT_ALLOW`; iCloud `DONT_ALLOW`] |
| Try Again | Yeniden Dene | **Verified** [AL] |
| Subscription(s) | Abonelik / Abonelikler | **Verified** [AL; AS-TR] |
| Restore Purchases | Satın Alınanları Geri Yükle | **Partly verified.** Apple's StoreKit label is "Eksik Satın Alınanları Geri Yükle" (Restore Missing Purchases) and "Aboneliği Geri Yükle" [AL _StoreKit_SwiftUI]. I dropped "Eksik", which is the usual short paywall form [J]. |
| Free Trial | Ücretsiz deneme; CTA "Ücretsiz Dene"; "%@ ücretsiz, sonra %@/%@" | **Verified** [AL StoreKit `MODE_FREE`, `ACTION_FREE_TRIAL`, `SUBSCRIPTION_PRICE_…_FREE_TRIAL_THEN…`] |
| Auto-renews | otomatik olarak yenilenir | **Verified** [AL NewsCore "Plan iptal edilene kadar otomatik olarak yenilenir."] |
| Every day | Her gün (detail) / Her Gün (chip) | **Verified** [AL MobileTimer `ALARM_EVERY_DAY`, `f2Rpvd`] |
| Weekdays | Hafta İçi / hafta içi | **Verified** [AL MobileTimer `ALARM_WEEKDAYS`, ReminderKit]. Used lowercase in the paywall feature row. |
| slide to stop | durdurmak için kaydırın | **Verified** [AL ClockAngel `SLIDE_TO_STOP`]. Not used in the catalog; reference only. |
| Listening… | Dinliyor… | **Verified** [AL MusicRecognition `RECOGNIZE_MUSIC_LISTENING_VIEW`] |
| Privacy Policy | Gizlilik Politikası | **Verified** [AL StoreKit `PRIVACY_POLICY_LABEL`] |
| Notifications | Bildirimler | **Verified** [AL UserNotificationsUIKit] |
| Settings path to subscriptions | Ayarlar > [adınız] > Abonelikler | **Verified** [AS-TR 118428: "Ayarlar’da adınıza dokunun. Abonelikler’e dokunun."] |
| Apple Account | Apple Hesabı (Apple Hesabınız) | **Verified** [AL "Apple Hesabı’nıza", AS-TR "Apple Hesabınıza"] |
| Time Sensitive / Lock Screen / Silent Mode | Zamana Duyarlı / Kilitli Ekran / Sessiz Mod | **Verified** [AL] (reference only) |
| Screen Time | Ekran Süresi | **Inferred** (well known, but the API search returned no hit) |
| Terms of Use | Kullanım Koşulları | **Inferred** (standard on Turkish App Store listings) |
| device | aygıt | **Verified** (Apple says "aygıt", not "cihaz") [AL] |
| Provisional (notification status) | Geçici | **Inferred** |

---

## 2. Glossary (app terms)

| English | Turkish | Note |
|---|---|---|
| reminder | anımsatıcı | Apple's word. Turkish users also say "hatırlatıcı" (competitor reviews in `docs/aso/competitors/talking-alarm/reviews.csv` use "hatırlatıcı" / "hatırlatma"). **Decision for the user:** keep Apple's "anımsatıcı" in the UI, and put "hatırlatıcı" in the store keywords. |
| remind (verb) | hatırlatmak ("Ne zaman hatırlatayım?", "Bana Hatırlat") | Natural verb; "anımsatmak" sounds stiff in speech [J] |
| recording / take | kayıt | |
| spoken line | Söylenecek Cümle | |
| heads-up (pre-alert) | Ön Uyarı | [J] |
| voice note | Sesli Not | |
| Get Pro / Upgrade | Pro’ya Geç / Pro’ya Geçin | "Yükselt" was avoided as too technical [J] |
| active reminders | etkin anımsatıcı | Apple uses "etkin" for active [J] |
| Unlimited | Sınırsız | |
| Monthly / Annual | Aylık / Yıllık | |
| Best value | EN AVANTAJLI | [J] |
| Billed monthly | Aylık faturalandırılır | |
| feedback | Geri Bildirim | |
| diagnostics | tanılama | Apple term ("Tanılama") [J] |
| check (connection) | denetlemek | Apple: "bağlantınızı denetleyin" [AL] |
| AM / PM | ÖÖ / ÖS | [CLDR tr]. Turkey uses the 24-hour clock; use `Intl` and these should almost never show. |
| min / hr | dk / sa | Standard Turkish abbreviations |
| weekdays short | Paz Pzt Sal Çar Per Cum Cmt | [CLDR tr] |
| weekdays narrow (Mon first) | P S Ç P C C P | [CLDR tr]. Monday and Thursday are both "P", and so are Friday and Saturday ("C"). That is native and expected. |

Language names are written as Turkish adjectives in -ca/-ce, capitalized (they are proper nouns in Turkish, so they stay capitalized mid-sentence). They follow CLDR `tr`: Bengalce (Bangla), Felemenkçe (Dutch), Svahili dili (Swahili), Tagalogca, Norveççe Bokmål. They are only used bare, with no suffix, in "Dinleme dili: {language}" and "{language} henüz Remi’de desteklenmiyor".

---

## 3. Placeholder and suffix handling

Turkish case suffixes depend on the last vowel of the inserted value, so I rewrote every string to keep suffixes off placeholders:

| Key | Pattern used | Why |
|---|---|---|
| `time.ringsAgain` | "Yeniden çalacak: {time}" | Avoids "{time}’da/de" |
| `pending.askPastTime`, `pending.detail.pastTime` | "{time} bugün zaten geçti." | {time} is the bare subject. The fallback `pending.thatTime` = "O saat" works in the same slot. |
| `pending.detail.unsupportedLanguage` | "{language} henüz Remi’de desteklenmiyor" | Bare language name as the subject. The fallback `pending.thisLanguage` = "**Bu dil**" is capitalized because it always starts the sentence. The suffix sits on the fixed word "Remi’de". |
| `recording.listeningIn` | "Dinleme dili: {language}" | |
| `pending.quickChoice.a11y` | "Bana hatırlat: {choice}" | Chip label inserted after a colon |
| `times.remove.a11y` | "Kaldır: {time}" | |
| `notification.preAlert.body` | "{subject}: # dakika sonra" | e.g. "Annemi ara: 15 dakika sonra" |
| `pending.heard` | "Remi şunu duydu: “{quote}”" | Typographic quotes |
| `edit.delete.message` | "“{title}” silinsin mi?" | Apple pattern "… silinsin mi?" |
| `restore.*.message`, `paywall.toast.*.message` | "{product} bu aygıtta yeniden etkin." / "{product} aboneliğinizin…" | {product} is the subject, or a modifier of a separate noun |
| `paywall.toast.activated.message` | "Hoş geldiniz! {product} artık etkin." | "Remi Pro’ya hoş geldiniz" would put a suffix on the placeholder |
| `paywall.legal.disclosure.generic` | "{product}, otomatik olarak yenilenen bir aboneliktir." | The comma after the subject is standard Turkish |
| `paywall.billed.every`, `paywall.legal.disclosure.priced` | "Her {term} …", "her {term} için {price}" | {term} = "ay" / "3 ay": "her ay", "her 3 ay". Grammatical, slightly formal for multi-unit terms. |
| `paywall.cta.subscribe` | "Abone Ol: {price} / {term}" | |
| `take.partial.title` | "{created}/{total, plural, … # anımsatıcı oluşturuldu}" | Renders "2/3 anımsatıcı oluşturuldu" |
| `schedule.everyDuration`, `reminders.pattern.everyDays` | "Her {duration}", "Her {days}" | "Her 2 sa", "Her Pzt, Per". Natural enough for subtitles. |

**Places I could not fully avoid it:** none put a suffix directly on a placeholder. `aiConsent.learnMore` puts the suffix inside the link text ("<link>Gizlilik Politikamıza</link>"), which is fixed text, so it's safe.

**Plurals:** every plural block has `one` and `other` (CLDR `tr`). Nouns stay singular after numbers ("5 anımsatıcı", "3 gün"), so most blocks have identical forms. `take.multiCreated` gained a `one` branch; English had only `other`. Where English's `one` is a different phrase, Turkish follows Apple: one = "Her gün" / "Her saat" / "Her dakika", other = "# günde bir" / "# saatte bir" / "# dakikada bir". `paywall.term.*` keeps English's shape (one = "ay", other = "# ay").

**Dotted and dotless i:** all hand-written capitals are correct: **BİTTİ**, **ÜCRETSİZ** (i → İ), **EN AVANTAJLI** (ı → I), plus İzin, İngilizce, İnceleniyor. **Engineering note:** if any label is upper-cased at runtime (`textTransform: 'uppercase'` or `.toUpperCase()`), Turkish breaks: "bitti" becomes "BITTI" instead of "BİTTİ". The upper-case strings in the catalog are already upper-case, so don't transform them again. If a transform can't be avoided, use `toLocaleUpperCase('tr')`.

---

## 4. Length and overflow risks

Checked against the inventory's character limits:

| Key | Limit | Turkish | Len | Risk / fallback |
|---|---|---|---|---|
| `tabs.reminders` | ~10 | Anımsatıcılar | 13 | **Over.** Test on the smallest iPhone. Fallback: "Liste" or "Hatırlatma" (10). |
| `paywall.hero.default.line1` | ~12 | Daha az unutun. | 15 | **Over.** Serif display line. Fallback: "Az unutun." (10). |
| `paywall.table.col.free` | ~6 | ÜCRETSİZ | 8 | **Over**, narrow column. Fallback: "BEDAVA" (6), but it is colloquial. |
| `paywall.cta.trial` | ~24 | {length} ücretsiz deneyin | 21 rendered ("7 gün ücretsiz deneyin") | OK; with "12 ay" it is 21 too |
| `paywall.card.badge` | ~12 | EN AVANTAJLI | 12 | At the limit |
| `today.header.getPro`, `recording.gate.upgrade` | ~10 | Pro’ya Geç | 10 | At the limit |
| `today.timeDraft.confirm` | ~14 | Bana Hatırlat | 13 | OK |
| `times.mode.setTimes` | chip | Belirli Saatler | 15 (en 9) | Watch the chip row. Fallback: "Saatler". |
| `permission.allSet` | button | Her Şey Hazır! | 14 (en 8) | Probably fine on a full-width button |
| `paywall.legal.disclosure.priced` | small print | about 30% longer than English | | Allow wrap |
| `paywall.hero.interval.line1..3` | ~12 | İş bitene / kadar / tekrarlasın. | 9 / 5 / 12 | OK |

All other buttons and chips are within limits (Vazgeç, Bitti, Sonra, Konuş, İzin Ver, Gönder, Yanlış mı?, the chips 1 Saat Sonra / Bu Akşam / Yarın Sabah / Saat Seç…).

---

## 5. Paywall legal block

Built from Apple's own Turkish StoreKit phrasing (`otomatik olarak yenilenir`, `iptal edilene kadar`, `Apple Hesabı`) [AL], the Apple TR cancellation path [AS-TR 118428], and the standard Turkish App Store disclosure pattern: "Ödeme, satın alma onaylandığında Apple Hesabınızdan tahsil edilir … geçerli dönemin bitiminden en az 24 saat önce otomatik yenileme kapatılmadıkça … önceki 24 saat içinde hesabınızdan ücret tahsil edilir." The meaning matches English clause by clause: price and period, charged at confirmation, auto-renews at the same price, charged within 24 h before renewal unless auto-renew is turned off at least 24 h before the period ends, manage or cancel in Settings.

The path is written **"Ayarlar > [adınız] > Abonelikler"** because that is what a Turkish iPhone shows and what Apple TR tells users to tap. English says "Apple Account". If the developer prefers a literal mirror, use "Ayarlar > Apple Hesabı > Abonelikler".

---

## 6. Uncertain strings (review by a native speaker)

1. **anımsatıcı vs hatırlatıcı** (see the glossary). This is the biggest choice in the file. A global swap is mechanical if the user prefers the market word.
2. `alarm.button.later` / `alarmOverlay.later` = "Sonra". It's Apple-verified as a short "Not Now", but on an alarm "Ertele" (Apple's Snooze) might read clearer. English chose "Later" deliberately, so I kept the neutral word.
3. `edit.row.headsUp` = "Ön Uyarı" and `edit.spokenLine.label` = "Söylenecek Cümle" are coined labels [J].
4. `feedback.context.remiSays` = "Remi diyor ki" (a label above the quoted line). Alternative: "Remi’nin söyleyeceği".
5. `times.between` = "Aralık" (label left of the start–end window pills). Alternative: "Saat aralığı".
6. `paywall.hero.interval.*` = "İş bitene / kadar / tekrarlasın." (literally "let it repeat until the job is done"). A free rendering of "Repeat it until it's done."
7. `diagnostics.status.provisional` = "Geçici" [J]. Apple's Turkish term for provisional authorization wasn't found.
8. `time.nextIn.*` = "{count} dk sonra" drops English's "Next". In a row subtitle "15 dk sonra" already reads as the next ring. Prefix "Sonraki: " if that context is lost.
9. `paywall.caption.trial` follows Apple's "%@ ücretsiz, sonra %@/%@" ("7 gün ücretsiz, sonra ₺X/ay."), which is slightly more explicit than English's comma form.
10. `settings.version` = "Remi sürüm {version} ({build})". "v" was replaced with "sürüm".
11. `infoPlist.NSAlarmKitUsageDescription` now says "Remi" (English says "VoiceReminder", as the brief asked).
