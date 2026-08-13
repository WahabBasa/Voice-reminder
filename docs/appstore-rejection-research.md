# App Store rejection risk — VoiceReminder pre-submission research

Research date: 2026-08-12. Sources are linked inline; everything about the app is cited to a file in this repo.

---

## 0. What we are actually submitting (verified, not assumed)

| Thing | Evidence |
|---|---|
| Bundle id `com.wahabbasa.VoiceReminder`, version 1.0.0, build 1, `supportsTablet: true`, `ITSAppUsesNonExemptEncryption: false` | `app.json:16-23` |
| Mic purpose string: "Allow VoiceReminder to access your microphone to record voice reminders." | `app.json:44-49` (expo-av plugin) |
| `NSAlarmKitUsageDescription`: "VoiceReminder uses alarms so spoken reminders ring even when your phone is silenced." | `plugins/withAlarmKit.js:17-18` |
| Voice audio leaves the device: Whisper (`whisper-1`) for STT, **OpenRouter → `google/gemini-3.1-flash-lite-preview`** for parsing, ElevenLabs *or* Resemble for TTS | `convex/actions.ts:425-460`, `:954-994`, `:22-35`, `:251-311` |
| Reminder **title + description text is stored server-side** in Convex, not local-only | `convex/schema.ts` (`reminders` table) |
| Crash + **every console line** streamed to Sentry | `lib/sentry.ts:19-26` (`enableLogs: true`, `consoleLoggingIntegration`) |
| Subscriptions via RevenueCat, entitlement `pro`, free tier = 5 active reminders | `lib/purchases.ts`, `lib/usageGate.ts:1` |
| Paywall screen | `app/paywall.tsx` |
| Settings has a Terms of Use row (Apple standard EULA), **no privacy policy row** | `app/settings.tsx:13-14,133-141` |
| Privacy policy exists only as an unhosted local file | `docs/privacy/index.html` |
| No accounts, no login anywhere | no auth code in `app/`, `lib/`, `convex/` |
| English + Arabic parsing and spoken output | `convex/actions.ts:103-190`, `convex/helpers.ts:57-83` |
| **No `ios/` directory — the iOS app has never been prebuilt or run** | repo root listing |

Primary rulebook: [App Store Review Guidelines](https://developer.apple.com/app-store/review/guidelines/) (as amended [13 Nov 2025](https://developer.apple.com/news/?id=ey6d8onl)).

---

## Tier A — Will definitely get us rejected (or can't even be submitted)

### A1. RevenueCat iOS API key is a placeholder → the paywall is dead on iOS
**Guideline 2.1(b) App Completeness / 3.1.1 In-App Purchase.**
`lib/purchases.ts:6` — `const REVENUECAT_IOS_KEY = 'PLACEHOLDER_IOS_KEY';`. `Purchases.configure()` gets that on iOS (`lib/purchases.ts:37-41`), so `getOfferings()` fails, `packages.length === 0`, and `app/paywall.tsx:259-265` renders "No plans available… check your connection". A reviewer tapping "Get Pro" (`app/index.tsx:770`) sees a broken store. 2.1 accounts for the largest single slice of rejections and Apple explicitly requires IAP to be "complete, up-to-date, visible to the reviewer and functional" ([2.1(b)](https://developer.apple.com/app-store/review/guidelines/)); RevenueCat's own rejection guide lists "issues fetching products" as rejection cause #1 ([RevenueCat](https://www.revenuecat.com/docs/test-and-launch/app-store-rejections)).
**Fix:** create the App Store app record + auto-renewable subscriptions in App Store Connect, attach them to the RevenueCat iOS app, paste the real `appl_…` key, and submit the IAP products *with* the first binary (products must be in "Ready to Submit" and attached to the version, or the reviewer cannot purchase).

### A2. No consent screen before voice data goes to third-party AI
**Guideline 5.1.2(i)** — the November 2025 amendment: *"You must clearly disclose where personal data will be shared with third parties, **including with third-party AI**, and obtain explicit permission before doing so."* ([guidelines](https://developer.apple.com/app-store/review/guidelines/), [Apple news 13 Nov 2025](https://developer.apple.com/news/?id=ey6d8onl), [TechCrunch](https://techcrunch.com/2025/11/13/apples-new-app-review-guidelines-clamp-down-on-apps-sharing-personal-data-with-third-party-ai)).
This app records the user's voice and ships the raw audio to OpenAI, then the transcript to OpenRouter/Google, then text to ElevenLabs or Resemble (`convex/actions.ts:425-460`, `:251-311`). A `grep` for consent/onboarding/disclosure across `app/`, `components/`, `lib/` returns **nothing** — there is no first-run disclosure, no per-provider naming, no stored choice, no revoke switch.
What reviewers expect: name each provider, say what data goes and why, explicit Allow / Don't Allow, persisted choice, and a way to change it in Settings; a privacy-policy line or a bundled "I agree to Terms" checkbox does **not** count ([dev.to implementation guide](https://dev.to/arshtechpro/apples-guideline-512i-the-ai-data-sharing-rule-that-will-impact-every-ios-developer-1b0p), [PTKD 5.1.2 breakdown](https://ptkd.com/journal/guideline-5-1-2-data-use-and-sharing-disclosure)).
**Fix:** a blocking first-record disclosure sheet — "To turn your voice into a reminder, VoiceReminder sends the recording to OpenAI (speech-to-text), Google via OpenRouter (understanding the reminder), and ElevenLabs (the spoken alarm). Audio is deleted after processing." + Allow / Not now, persisted in `settingsStore`, mirrored as a Settings row that can be flipped off. Declining must not crash the app (offer manual typed reminder creation as the fallback — `app/reminder/new.tsx` already exists).

### A3. No privacy policy — not hosted, not linked in-app
**Guideline 5.1.1(i)** requires a privacy policy link *both* in App Store Connect metadata *and* "within the app in an easily accessible manner". **3.1.2 / Schedule 2 §3.8(b)** independently requires a functional privacy policy link in the subscription flow.
`docs/privacy/index.html` is a file on disk with no host. `app/settings.tsx` links only Apple's standard EULA (`app/settings.tsx:14`). Grep for "privacy" across `app/`, `components/`, `lib/` returns zero hits. Rejections for a "missing or thin" policy are the single most common 5.1.1 outcome ([PTKD 5.1.1](https://ptkd.com/journal/guideline-5-1-1-data-collection-and-storage-fix)).
**Fix:** host it (GitHub Pages off `docs/privacy/` is fine), then (a) App Store Connect Privacy Policy URL, (b) a Privacy Policy row in `app/settings.tsx` next to Terms of Use, (c) a link on the paywall footer (see A4).

### A4. Paywall is missing the mandatory subscription disclosure block, legal links, and Restore
**Guideline 3.1.2 + Schedule 2 §3.8(b) of the Developer Program License Agreement; 3.1.1 for restore.**
Required *in the binary, on the purchase screen, visible without tapping through*: subscription **title**, **length**, **price (and price per unit)**, plus **functional links to Privacy Policy and Terms of Use (EULA)** ([Apple Schedule 2](https://developer.apple.com/support/downloads/terms/schedules/Schedule-2-and-3-English.pdf), [RevenueCat write-up](https://www.revenuecat.com/blog/engineering/schedule-2-section-3-8-b)). Apple's stock rejection line: *"Adding the above information to the StoreKit modal alert is not sufficient; the information must also be displayed within the app itself… without requiring additional action from the user, such as opening a link."*
`app/paywall.tsx:281-304` has only the price on the plan cards and a footer sentence. There is **no** auto-renewal sentence, **no** Terms link, **no** Privacy link, and **no Restore Purchases control anywhere in the app** — `restorePurchases()` exists in `lib/purchases.ts:88` but is never called from any screen (grep for "restore" in `app/`/`components/` hits only a bottom-sheet prop). Missing restore is a near-automatic 3.1.1 rejection ([VP0](https://vp0.com/blogs/restore-purchases-button-missing-rejection-fix), [RevenueCat community](https://community.revenuecat.com/sdks-51/we-get-rejected-from-apple-store-review-about-restore-purchases-693)); missing in-app legal links is one of the top paywall rejection patterns in 2026 ([RevenueFlo](https://revenueflo.com/blog/common-ios-paywall-rejections-and-the-fixes-that-work)).
**Fix (paywall footer, all visible without scrolling past the CTA):**
> Pro — $X.XX/month, auto-renews monthly until cancelled. Payment is charged to your Apple Account at confirmation. Cancel anytime in Settings › Apple Account › Subscriptions at least 24 hours before the period ends.
> **Restore Purchases · Terms of Use · Privacy Policy**
Wire Restore to `restorePurchases()` with three honest states: restoring / restored (unlock + confirm) / nothing to restore (say so — never a silent no-op). Also add a Restore row in `app/settings.tsx`.

### A5. The paywall says "Google Play" on an iOS screen
**Guideline 2.3.10** — no names, icons or imagery of other mobile platforms or app marketplaces in the app or its metadata. **2.3.1** — misleading.
`app/paywall.tsx:283`: `"Secure payment via Google Play. Cancel anytime."` This is a literal, unambiguous violation, and it is the first line above the buy button.
**Fix:** platform-conditional copy; on iOS say Apple Account / App Store, or drop the sentence and use the A4 disclosure block.

### A6. The privacy policy we do have is factually wrong about this app
**Guideline 5.1.1(i)** (policy must identify what is collected, all uses, all third parties, retention/deletion) and **5.1.2(i)** (declared behaviour must match the binary).
`docs/privacy/index.html` claims: reminders are "stored locally on your device only… We do not sync reminders to the cloud" — but `convex/schema.ts` stores title, description, time, frequency and audio blobs server-side, and `lib/convexUpload.ts` uploads the recording. It names OpenAI for NLP, but parsing actually runs on **OpenRouter → Google Gemini** (`convex/actions.ts:460`, `:994`). It never mentions **Resemble** (`convex/actions.ts:251-261`), **Sentry** (`lib/sentry.ts`), or **RevenueCat** (`lib/purchases.ts`). Reviewers cross-check in-app disclosure ↔ privacy policy ↔ App Privacy label; a mismatch is itself the violation ([PTKD 5.1.2](https://ptkd.com/journal/guideline-5-1-2-data-use-and-sharing-disclosure)).
**Fix:** rewrite the policy against the actual pipeline, name every processor, state retention ("audio deleted after processing; reminder text retained until you delete the reminder"), and describe how to request deletion. Add the Sentry log-streaming disclosure (see B6).

### A7. App Privacy "nutrition label" must be filled in to match the binary
**Guideline 5.1.1 / 5.1.2** and [App Privacy Details](https://developer.apple.com/app-store/app-privacy-details/) — you must declare data collected by you *and* by your third-party SDKs.
For this binary the honest answers are at minimum: **Audio Data** (voice recordings — captured in `lib/audio.ts:55-77`, uploaded via `lib/convexUpload.ts`), **Other User Content** (reminder text stored in Convex), **Crash Data / Other Diagnostic Data** (Sentry), **Purchase History** and a **User ID / Device ID** (RevenueCat's anonymous app user id). Under-declaring is a direct 5.1.2(i) violation once discovered.
**Fix:** complete the questionnaire from that list before submission and keep it in sync with the policy in A6.

### A8. Nobody has ever built or run this app on iOS
**Guideline 2.1** — "make sure your app has been tested on-device for bugs and stability… we will reject binaries that crash or exhibit obvious technical problems."
There is no `ios/` directory; `plugins/withArmOnlyBuild.js`, `withFullScreenAlarm.js` and `withNotifeeAndroidMaven.js` are Android-only, and `lib/notifications.ts` branches heavily on `alarmKitEnabled()` which is false on iOS < 26 (`lib/alarmKit.ts:1-13`). The AlarmKit Swift in `plugins/withAlarmKit.js` has never been compiled by CI.
**Fix:** `npx.cmd expo prebuild --platform ios` on a Mac (or EAS build), run on a real iOS 26 device *and* an iOS 18 device, exercise: record → parse → alarm fires → snooze → done → delete; plus paywall, restore, and permission-denied paths.

---

## Tier B — Commonly bites apps like ours

### B1. Paywall promises features the app does not have
**2.3.1 (misleading), 3.1.2(c) (describe clearly what the user gets), 3.1.2(a) (bait-and-switch = removal).**
`app/paywall.tsx:17-23` sells "Priority storage & sync" (there is no sync — README says local-first), "Zero ads forever" (there are no ads at all), "Custom notification sounds" and "Advanced AI voice processing" (not gated — the only real gate is 5 active reminders, `lib/usageGate.ts:1`, `app/index.tsx:248-285`).
**Fix:** cut the list down to what Pro actually unlocks today (unlimited active reminders — and anything else you genuinely gate), and make the free limit visible in the App Store description too (**2.3.2**: screenshots/description must indicate what needs a purchase).

### B2. Wrong product name shipped in the success path
**2.3.1 / 2.3.8** (metadata and in-app naming must be consistent, avoid confusion).
`app/paywall.tsx:110` — `"Welcome to NoteToSelf Pro!"` in an app called VoiceReminder, whose settings footer says "Voice Reminder" (`app/settings.tsx:144`). Pick one name and use it in app.json, the toast, the footer, and App Store Connect.

### B3. Purchase failures are swallowed into a generic banner
**2.1 / 3.1.1.** `app/paywall.tsx:73-78, 121-131` and every function in `lib/purchases.ts` log "silent" and fall back to free tier. If the reviewer hits a sandbox hiccup (RevenueCat documents `STORE_PROBLEM` when Apple's sandbox is degraded — [docs](https://www.revenuecat.com/docs/test-and-launch/app-store-rejections)) they see "Something went wrong" with no path forward, and file it as 2.1.
**Fix:** surface the real failure category (cancelled / network / store problem / already subscribed), keep a retry, and mention known sandbox flakiness in Review Notes.

### B4. AlarmKit reviewer environment
**2.1 / 4.5.4.** AlarmKit is iOS 26+ (`lib/alarmKit.ts`); on anything older the app silently degrades to notifee trigger notifications, so the "escalating alarm" the App Store listing promises may not be what the reviewer sees → 2.3.1 metadata mismatch. Alarm apps have historically been rejected for background-mode questions and for ringing without presenting a way into the app ([gdelataillade/alarm discussion](https://github.com/gdelataillade/alarm/discussions/87)).
Also: **there is no `com.apple.developer.alarmkit` entitlement.** An Apple engineer confirmed LLMs invent it and it breaks provisioning ([Apple forum 797950](https://developer.apple.com/forums/thread/797950)). Only `NSAlarmKitUsageDescription` is needed ([WWDC25 "Wake up to the AlarmKit API"](https://developer.apple.com/videos/play/wwdc2025/230/)) — which `plugins/withAlarmKit.js` already adds. Do not let anyone "fix" a build error by adding that key.
**Fix:** Review Notes must state the minimum OS for full alarm behaviour and how to trigger a test alarm in under a minute; keep the notifee fallback honest in the App Store description ("full-screen alarms on iOS 26; notifications on earlier versions").

### B5. Microphone purpose string doesn't mention that audio leaves the device
**5.1.1(ii)** — "Ensure your purpose strings clearly and completely describe your use of the data."
Current string (`app.json:47`) says only that it records. Given A2, the string should say the recording is sent for transcription.
**Fix:** "VoiceReminder records your voice so it can turn what you say into a reminder. Recordings are sent to our speech-to-text provider and deleted after processing."

### B6. Sentry streams every console line, including reminder content
**5.1.1(ii) consent + 5.1.2(i) disclosure.** `lib/sentry.ts:22-25` enables `consoleLoggingIntegration({ levels: ["log","warn","error"] })` with `enableLogs: true`, and the codebase logs liberally (`lib/vrLog.ts`, `[RevenueCat]`, `[VR]` lines). Any log that includes a reminder title ships a user's personal (often medical — the prompt's own example is "your medicine is waiting") text to a third-party processor that is not disclosed anywhere.
**Fix:** either scrub content from logs and restrict Sentry to crashes, or disclose Sentry in the policy + nutrition label and offer an opt-out. Cheapest correct move for v1: drop `enableLogs`/console integration in release builds.

### B7. Age rating questionnaire (AI + content)
**2.3.6.** Apple's 2025 overhaul replaced 12+/17+ with 13+/16+/18+ and added questions about AI chatbots/assistants and user-generated content; responses become **required on submission from September 2026** ([Apple news](https://developer.apple.com/news/?id=ks775ehf), [summary](https://ptkd.com/journal/app-store-age-ratings-2025-update)). This app generates spoken text from a model on arbitrary user input.
**Fix:** answer honestly, expect 4+ or 9+ (no social feed, no UGC distribution), and note the AI generation is constrained to reminder phrasing.

### B8. "Yet another AI reminder app" — 4.2 / 4.3
**4.2 Minimum Functionality**, **4.3 Spam.** Thin AI wrappers in crowded categories get bounced, sometimes within seconds of review ([Apple forum threads on 4.3](https://developer.apple.com/forums/thread/768738)).
Our defence is real and should be made visible in screenshots and Review Notes: native AlarmKit alarms with per-reminder generated audio, an escalating variant ladder (`docs/cadence-ladder-prd.md`, `convex/helpers.ts`), Arabic + English speech, offline-first local store. Don't ship generic stock-looking screenshots.

### B9. Privacy manifest
`PrivacyInfo.xcprivacy` is required for required-reason APIs and commonly-used third-party SDKs (blocking since Feb 2025). `app.json` has no `ios.privacyManifests` key. Expo packages ship their own, but Apple's parser misses some static-pod manifests, so ITMS-91053/91056 emails are common ([Expo docs](https://docs.expo.dev/guides/apple-privacy/), [Expo tracking issue #27796](https://github.com/expo/expo/issues/27796), [Sentry's manifest guidance](https://docs.sentry.io/platforms/react-native/data-management/apple-privacy-manifest/)).
**Fix:** add `expo.ios.privacyManifests` with `NSPrivacyAccessedAPICategoryUserDefaults` (`CA92.1`) and file-timestamp/disk-space reasons as needed; upload once and read the ITMS email before assuming it's clean.

### B10. iPad
`app.json:17` sets `supportsTablet: true`, so App Review **will** run it on an iPad and the listing needs iPad screenshots. The UI (`SwipePager`, dock, `screenCorners.ts`) has never been seen on a 13" canvas.
**Fix:** test on iPad, or set `supportsTablet: false` and ship iPhone-only.

### B11. Arabic
The parser and TTS handle Arabic (`convex/actions.ts:103-190`) but the UI strings are English-only and `app.json` declares no localizations. If we list Arabic on the store, 2.3 requires the app and its screenshots to match.
**Fix:** for v1 either don't claim Arabic localization in metadata (describe it as "understands Arabic voice input"), or do it properly with localized metadata + screenshots.

### B12. Convex `reminders.list` is an unauthenticated global read
Not something a reviewer would catch, but it makes A6's privacy promises untrue: `convex/reminders.ts:27-41` returns **every row in the table** with no user scoping, and there is no auth layer anywhere. Anyone with the deployment URL can read all users' reminder text and signed audio URLs. That is a 5.1.2 / GDPR problem the moment there is a second user.
**Fix:** scope rows to an installation id (or delete the unused `list` query — the app only calls `get`, `remove`, `update`, `generateAudioUploadUrl`).

---

## Tier C — Low risk, check once

- **5.1.1(v) account deletion** — no accounts exist anywhere in the app, so nothing is owed. Keep it that way for v1; the day sign-in appears, in-app account deletion becomes mandatory ([Apple](https://developer.apple.com/support/offering-account-deletion-in-your-app/)).
- **4.5.4 push notifications** — notifications are core function, not marketing. Just don't gate Pro features on granting notification permission (5.1.2(i) forbids requiring system functionality in exchange for compensation).
- **2.3.10 elsewhere** — after fixing A5, grep the whole repo and all store metadata/screenshots for "Google", "Play", "Android" before uploading.
- **Export compliance** — `ITSAppUsesNonExemptEncryption: false` is already set (`app.json:21`); correct for HTTPS-only usage.
- **Hidden/dev features (2.3.1(a))** — `app/diagnostics.tsx` is a legitimate user-facing permissions screen with no test buttons; the dev-only `scheduleTestAlarm` in `plugins/withAlarmKit.js:150+` is not reachable from JS UI. Verify no debug route ships.
- **App name / metadata** — "VoiceReminder" ≤ 30 chars, unique, no keyword stuffing (2.3.7); metadata must be 4+ appropriate (2.3.8).
- **Support URL** — App Store Connect requires one; the repo currently offers only a GitHub link in the privacy policy. Stand up a support page or a mailto.
- **Secrets** — the RevenueCat Android public key is hardcoded (`lib/purchases.ts:5`) and Sentry DSNs are in `lib/sentry.ts`; both are publishable keys, not review issues, but move them to config before the iOS key lands beside them.

---

## Pre-submission runbook

**Stage 1 — unblock (Tier A, in this order)**
1. Host `docs/privacy/index.html` (GitHub Pages) **after** rewriting it per A6; note the URL.
2. App Store Connect: create the app record, the auto-renewable subscription group + products, fill Privacy Policy URL, Support URL, App Privacy questionnaire (A7), age rating questionnaire (B7).
3. RevenueCat: create the iOS app, link the App Store Connect shared secret + products to entitlement `pro`, paste the real key into `lib/purchases.ts` (or `app.config` env).
4. Code: AI consent sheet + Settings toggle (A2); paywall disclosure block, Terms + Privacy links, Restore button (A4); Settings Privacy Policy + Restore rows (A3/A4); kill the "Google Play" string (A5); trim the benefits list and fix "NoteToSelf" (B1/B2); mic purpose string (B5); Sentry log scrubbing (B6).
5. `npx.cmd expo prebuild --platform ios` on a Mac / EAS, then build.

**Stage 2 — device pass (2.1)**
Run on iOS 26 device and one iOS 18 device. Script: fresh install → consent sheet appears before the first recording → deny once, confirm nothing breaks → allow → record English reminder → alarm fires with generated audio → snooze → done → record Arabic reminder → create 6th reminder → paywall appears → sandbox purchase succeeds → force-quit, reinstall, Restore Purchases restores → delete a reminder → check Settings links open. Repeat the paywall path with airplane mode on to see the error copy.

**Stage 3 — upload checks**
Watch for the ITMS-9105x privacy-manifest email (B9). Confirm the IAP products are attached to the version and are "Ready to Submit". iPhone **and** iPad screenshots if `supportsTablet` stays true (B10); screenshots must show real app UI and no Android chrome.

**Stage 4 — Review Notes (paste this shape)**
- No account or login required; all features are reachable on first launch.
- How to see an alarm in 60 seconds: tap the mic, say "remind me in one minute to take my medicine", then lock the phone.
- Full-screen escalating alarms use AlarmKit and require iOS 26; on earlier versions the app falls back to standard notifications.
- Voice recordings are sent to OpenAI (speech-to-text), Google via OpenRouter (parsing) and ElevenLabs (spoken alarm audio). The app asks for explicit consent naming these providers before the first recording; consent can be withdrawn in Settings.
- Subscription: Pro unlocks unlimited active reminders (free tier: 5). Price, term, auto-renewal, Restore Purchases, Terms of Use and Privacy Policy are all on the paywall screen.
- If in-app purchase fails, it may be a sandbox outage; happy to re-submit.

**Stage 5 — after approval**
Keep the App Privacy answers, the hosted policy, and the in-app consent copy in sync any time a provider changes (`convex/actions.ts` provider switch, `getTtsProvider()`), because that trio is what reviewers diff.

---

## Sources

- [App Store Review Guidelines](https://developer.apple.com/app-store/review/guidelines/) · [Updated guidelines, 13 Nov 2025](https://developer.apple.com/news/?id=ey6d8onl) · [Schedule 2 & 3 (PDF)](https://developer.apple.com/support/downloads/terms/schedules/Schedule-2-and-3-English.pdf) · [App Privacy Details](https://developer.apple.com/app-store/app-privacy-details/) · [Offering account deletion](https://developer.apple.com/support/offering-account-deletion-in-your-app/) · [Updated age ratings](https://developer.apple.com/news/?id=ks775ehf)
- [TechCrunch — Apple clamps down on apps sharing personal data with third-party AI](https://techcrunch.com/2025/11/13/apples-new-app-review-guidelines-clamp-down-on-apps-sharing-personal-data-with-third-party-ai) · [dev.to — implementing 5.1.2(i)](https://dev.to/arshtechpro/apples-guideline-512i-the-ai-data-sharing-rule-that-will-impact-every-ios-developer-1b0p) · [PTKD — 5.1.2 rejections](https://ptkd.com/journal/guideline-5-1-2-data-use-and-sharing-disclosure) · [PTKD — 5.1.1 rejections](https://ptkd.com/journal/guideline-5-1-1-data-collection-and-storage-fix) · [PTKD — 2025 age rating overhaul](https://ptkd.com/journal/app-store-age-ratings-2025-update)
- [RevenueCat — App Store rejections](https://www.revenuecat.com/docs/test-and-launch/app-store-rejections) · [RevenueCat — Schedule 2 §3.8(b)](https://www.revenuecat.com/blog/engineering/schedule-2-section-3-8-b) · [RevenueCat community — restore purchases rejection](https://community.revenuecat.com/sdks-51/we-get-rejected-from-apple-store-review-about-restore-purchases-693) · [RevenueFlo — common paywall rejections](https://revenueflo.com/blog/common-ios-paywall-rejections-and-the-fixes-that-work) · [VP0 — restore button fix](https://vp0.com/blogs/restore-purchases-button-missing-rejection-fix) · [Apple forum 809635 — repeated 3.1.2 link rejections](https://developer.apple.com/forums/thread/809635)
- [Apple forum 797950 — the fake AlarmKit entitlement](https://developer.apple.com/forums/thread/797950) · [WWDC25 — Wake up to the AlarmKit API](https://developer.apple.com/videos/play/wwdc2025/230/) · [gdelataillade/alarm — App Store guidelines for alarm apps](https://github.com/gdelataillade/alarm/discussions/87)
- [Expo — Privacy manifests](https://docs.expo.dev/guides/apple-privacy/) · [expo/expo#27796 — privacy manifest tracking](https://github.com/expo/expo/issues/27796) · [Sentry — Apple privacy manifest](https://docs.sentry.io/platforms/react-native/data-management/apple-privacy-manifest/) · [Apple forum — 4.3 Design: Spam](https://developer.apple.com/forums/thread/768738)
