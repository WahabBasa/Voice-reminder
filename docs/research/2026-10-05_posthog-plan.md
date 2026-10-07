# PostHog product analytics plan for Remi (2026-10-05)

Research and planning only. Nothing was installed, pushed, built or signed up for.

## Summary
- **Native build: yes.** The standard Expo install adds three native modules the binary doesn't have (`expo-application`, `expo-device`, `expo-localization`). The App Privacy manifest in `app.json` also has to change, and that ships in the binary too. Path: dev build → iPhone test → production build.
  - Bump `version` from 1.0.0 (to 1.0.1 or 1.1.0). `runtimeVersion` uses the `appVersion` policy, so the bump keeps OTAs for the new binary off 1.0.0 installs.
  - An OTA-only stopgap is technically possible, because every PostHog peer dependency is optional. It's not recommended (§1.1).
- **Session replay: leave it off for v1.**
  - It needs another native module (`@posthog/react-native-plugin`).
  - React Native records screenshots, not wireframes. By default it captures every 1000 ms, on the main thread.
  - Reminder titles and transcripts are on screen, and the voice pipeline is the part of the app most sensitive to performance.
- **Hybrid capture.**
  - The client SDK covers the funnel, permissions, paywall and rings.
  - Convex sends `take_completed` / `take_failed` from the server with a plain `fetch` to `https://eu.i.posthog.com/i/v0/e/`. This is the source of truth for whether a recording worked: it still reports when the app is killed or the user hasn't opted in.
- **Region: EU Cloud (Frankfurt).** Users are in the EU and Sentry is already on EU. The founder being in the UAE doesn't matter. Treat the region as permanent.
- **App Privacy changes in App Store Connect.**
  - Add Usage Data → Product Interaction (Analytics, linked).
  - Add the Analytics purpose to Device ID and Purchase History.
  - Add Diagnostics → Other Diagnostic Data and Performance Data (Analytics, linked).
  - Add Location → Coarse Location (Analytics, linked), only if GeoIP stays on.
  - Tracking stays at "No" everywhere.
- **ATT: not tracking.** This is first-party analytics, PostHog acts as a processor, and there's no IDFA. It becomes tracking the moment any Remi data or IDs go to an ad network or a data broker. That includes PostHog's own Meta, Google, TikTok, Reddit and LinkedIn Ads destinations, an MMP SDK (AppsFlyer, Adjust, Branch), or RevenueCat → ad-network integrations.
- **Alerts on the free plan.**
  - Real-time Data-pipeline destinations (Slack, Discord or webhook) on `app_first_open` and `take_failed`. The first 10,000 triggers a month are free.
  - Up to 5 insight alerts, checked at most hourly. Real-time alerts need the Scale plan.
  - A daily dashboard subscription by email.
- **Keys:**
  - The **Project API key / project token** (`phc_…`, public) ships in the app and also goes into Convex env and RevenueCat.
  - The **Project ID** (a number).
  - A **personal API key** (`phx_…`) for Claude, created from the **MCP Server** preset and scoped to the Remi project only. That covers `query:read`, `insight:*`, `dashboard:*`, `alert:*` and `hog_function:*`.
- **Cost: $0 at current scale.**
  - Free each month: 1M events, 2,500 mobile replays, 10k destination triggers, 5 alerts, 1-year retention and 1 project.
  - At about 35 events per daily active user per day, the free tier covers roughly 950 DAU.

---

## 0. What Remi has today (relevant facts from the repo)

| Item | Where | Why it matters |
|---|---|---|
| Install identity | `lib/deviceId.ts`: 128-bit hex id, minted on first use, kept in AsyncStorage, sent with every Convex call. A reinstall mints a new one. | Use it as PostHog `distinct_id` on both client and server, so the two event streams join with no extra identity work. "Minted this launch" is the reliable new-install signal (see `app_first_open`). |
| Take outcome on the server | `convex/schema.ts` `creationJobs`: `deviceId`, `status` (committed/failed/cancelled), `errorCode` (`storage_missing \| stt_failed \| parse_failed \| unparseable \| internal`), `sttSource`, `deviceSttMs`, `deviceSttEngine`, `deviceSttLocale`, `timezone`, `perf.{totalMs,sttMs,parseMs,sttFallbackUsed,…}` | Everything the take events need already lives on the job row. Server-side capture is close to free. |
| Take outcome on the client | `lib/pendingTakes.ts` `PendingErrorKind = network \| unparseable \| server \| cap_unverified`, `serverErrorCode`, `sttSource` | Client-side failures (network, cap) never reach the server, so they need a client event. |
| Content-free telemetry precedent | `lib/sentry.ts` `creationBreadcrumb()`: "Content-free by construction" | Apply the same rule to analytics: a typed allow-list of properties, with no transcript, title or URI anywhere. |
| Performance sensitivity | `lib/sentry.ts`: Sentry tracing was removed because it stalled the JS and main threads during the voice pipeline | Strong reason to keep session replay off and touch autocapture off. |
| RevenueCat | `react-native-purchases` 9.6.11, configured anonymously (`Purchases.configure({ apiKey })`, no `appUserID`) | Join RevenueCat events to PostHog with `Purchases.setAttributes({ $posthogUserId: deviceId })`. 9.6.11 has `setAttributes` but no dedicated `setPostHogUserId` (checked in `node_modules`). |
| Privacy manifest | `app.json` → `ios.privacyManifests.NSPrivacyCollectedDataTypes`: AudioData, OtherUserContent, DeviceID, PurchaseHistory (all linked, App Functionality); CrashData (not linked) | Needs the new types and the Analytics purpose. It's native, so it ships in the next binary. |
| OTA runtime | `app.json` `runtimeVersion.policy: appVersion`, `version: 1.0.0` | Adding native modules without a version bump would let PostHog-carrying OTAs reach 1.0.0 binaries. |
| Convex | `convex` 1.45.0; `convex/creationJobActions.ts` is `"use node"`; dev deployment `proper-stoat-767` is **live** | Any push of the server events goes straight to real users. Test first, as usual. |

---

## 1. SDK fit

### 1.1 `posthog-react-native` on Expo SDK 54

- **Install, per PostHog's Expo docs:** `npx expo install posthog-react-native expo-file-system expo-application expo-device expo-localization`. ([PostHog RN install](https://posthog.com/docs/product-analytics/installation/react-native))
  - Remi already has `expo-file-system` (~19.0.21). The other three are new **native** modules.
  - `posthog-react-native` itself is pure JS. The latest is 4.78.4, checked with `npm view` on 2026-10-05.
  - Every peer dependency is marked `optional` in `peerDependenciesMeta`: expo-device, expo-application, expo-localization, expo-file-system, expo-updates, async-storage, the session-replay plugin, and others.
- **Which properties need which module.** I read `dist/native-deps.js` in 4.78.4:

  | Module | Properties it fills |
  |---|---|
  | `expo-application` | `$app_version`, `$app_build`, `$app_namespace` |
  | `expo-device` | `$device_name` (the **model name**, e.g. "iPhone 15", not the user's device name), `$os_name`, `$os_version`, `$device_manufacturer`, `$is_emulator` |
  | `expo-localization` | `$locale`, `$timezone` |
  | `expo-updates` (already installed) | `$expo_update_id`, `$expo_runtime_version`, `$expo_channel` |

  If a module is missing, its properties are silently omitted.
- **Verdict: plan a new EAS build.**
  - The recommended setup needs three new native modules.
  - The privacy manifest (`app.json`) has to change, and that lives in the binary.
  - Bump `version` so the `appVersion` runtime changes, and OTAs built against the new modules never land on 1.0.0.
  - The path follows the standing rules: `eas build --profile development` → install with go-ios → test on the iPhone → production build only on the user's go.
- **OTA-only stopgap (not recommended).**
  - Install only `posthog-react-native`. Storage falls back to the existing `expo-file-system` or AsyncStorage.
  - Supply `$app_version`, model, locale and timezone yourself through `customAppProperties`, using `expo-constants`, `Platform` and `Intl.DateTimeFormat().resolvedOptions().timeZone`.
  - It works, but the binary's privacy manifest would lag behind what's collected, and the consent UI would still have to ship. Use it only if a native build is weeks away.
- **Config to use:**
  - `host: 'https://eu.i.posthog.com'`.
  - `captureAppLifecycleEvents: true`, the default since 4.39.0. This gives Application Installed, Updated, Opened, Became Active and Backgrounded.
  - Touch autocapture stays off (also the default).
  - `captureScreens: false`, because Remi uses expo-router. Call `posthog.screen(pathname)` from a `usePathname()` effect in `app/_layout.tsx`, as PostHog's expo-router guidance says.
  - `errorTracking` autocapture off: Sentry owns crashes.
  - `defaultOptIn: false` if you take the consent route in §2.4.
  - `before_send`: an allow-list filter that drops any property not in the event schema (§3).
  ([RN SDK config](https://posthog.com/docs/libraries/react-native))
- **Identity.** Pass `bootstrap: { distinctId: deviceId }`, or call `posthog.identify(deviceId)` once at boot, so server events sent under `distinct_id = deviceId` land on the same person. A reinstall gives a new deviceId, which means a new person. That's the same outcome as the reminders.
- **"Application Installed" caveat.** PostHog says there's no native way to detect a real install. The SDK writes a marker the first time it loads and treats that as the install. ([RN docs, migration notes](https://posthog.com/docs/libraries/react-native))
  - So when the analytics build ships, every existing 1.0.0 user will show up as "installed".
  - Use a custom `app_first_open` event with `device_id_minted: true` (deviceId created this launch) as the true new-install signal.

### 1.2 Session replay on iOS

- **Supported** on iOS 13+ with a development build (not Expo Go). In posthog-react-native 4.47.0+ it needs the native `@posthog/react-native-plugin` (2.12.4 today), which was renamed from `posthog-react-native-session-replay`. It's a native module, so it needs a build. ([RN replay install](https://posthog.com/docs/session-replay/installation/react-native))
- **How it records.** React Native always records in **screenshot mode**, never wireframe. ([Mobile replay](https://posthog.com/docs/session-replay/mobile))
- **Performance cost.**
  - Screenshots are throttled by `throttleDelayMs`, default 1000 ms.
  - On iOS there's an experimental `screenshotModeBackgroundCapture` option to move capture off the main thread, aimed at high-refresh iPhones.
  - There's a 2026 report of SIGSEGV crashes on iOS 26.3.1 with replay on. It was closed after PostHog couldn't reproduce it. ([posthog-js #3329](https://github.com/PostHog/posthog-js/issues/3329))
- **Masking.**
  - `maskAllTextInputs` (default true) masks "all text and text input fields". `maskAllImages` is also default true. Password inputs are always masked. ([PostHogSessionReplayConfig](https://posthog.com/docs/references/posthog-react-native/types/PostHogSessionReplayConfig))
  - For individual views, wrap them in `<PostHogMaskView>`, or set `accessibilityLabel="ph-no-capture"`. Avoid the label approach: it breaks VoiceOver. ([Replay privacy](https://posthog.com/docs/session-replay/privacy))
  - Other knobs: `captureTouches: false`, `captureNetworkTelemetry: false`, `captureLog: false`, `sampleRate`.
  - If the plugin is installed, also set `capturePushNotificationSubscriptions: false`. It defaults to true and would register the device push token with PostHog.
- **Recommendation: off for v1.**
  - The replay surfaces (reminder cards, transcript, recording overlay) are exactly the user content Remi promises not to export.
  - The capture loop would run during recording and STT.
  - Product events answer the founder's questions without it.
  - Revisit later at a low `sampleRate`, with every reminder and transcript surface wrapped in `PostHogMaskView` and the privacy label re-checked.

### 1.3 Server-side events from Convex

| Option | Fit for Remi |
|---|---|
| **Plain `fetch` to the capture API (recommended)** | `POST https://eu.i.posthog.com/i/v0/e/` with `{api_key, event, distinct_id, properties, timestamp}`. ([Capture API](https://posthog.com/docs/api/capture)) It's about 20 lines with no dependencies and is testable under `convex-test` with a stubbed `fetch`. Mutations can't call `fetch`, so the terminal-state mutations in `convex/creationJobs.ts` schedule an internal action (`ctx.scheduler.runAfter(0, internal.analytics.capture, …)`). That action can live in the default runtime; `fetch` works there. |
| `@posthog/convex` component | Official, needs Convex ≥ 1.39 (Remi has 1.45). Env: `POSTHOG_PROJECT_TOKEN`, `POSTHOG_HOST`. `posthog.capture(ctx, …)` schedules the HTTP call with `ctx.scheduler.runAfter`. ([PostHog Convex docs](https://posthog.com/docs/libraries/convex)) It's the same pattern, plus feature flags. It's worth it only if you want server-side flags; otherwise it's an extra `convex.config.ts` component to own. |
| `posthog-node` | Built for long-lived servers that batch events. In a short Convex action you'd need `flushAt: 1`, `captureImmediate`/`shutdown`, and `"use node"`. Heavier than `fetch`, for nothing extra. |

Server-event rules:
- `distinct_id = job.deviceId`.
- `$geoip_disable: true`. Otherwise PostHog geolocates the Convex data center. Location comes from the client, plus `timezone` and `deviceSttLocale` from the job row.
- `timestamp` = the job's `updatedAt`.
- `$lib: "convex"`.
- Include `creation_id`, so duplicates are countable.
- Honour client opt-out: have the client send an `analyticsOptOut` flag on `begin`, and skip capture when it's set.
- Convex env vars `POSTHOG_PROJECT_TOKEN` (the public `phc_` key) and `POSTHOG_HOST=https://eu.i.posthog.com` go on `proper-stoat-767`, which is **live**.

---

## 2. Region and privacy

### 2.1 EU vs US cloud: pick EU (Frankfurt)

- PostHog Cloud EU is hosted in Frankfurt. On EU Cloud, new projects discard client IPs by default. ([PostHog GDPR](https://posthog.com/docs/privacy/gdpr-compliance))
- With "Discard client IP data" on, GeoIP still enriches country and city before the IP is dropped. Only cookieless server-hash mode prevents that. ([Data storage](https://posthog.com/docs/privacy/data-storage))
- That's the right trade: Remi gets "from where" at city level, and no raw IPs are stored.
- Users are in the EU (the first one in Stockholm), and Sentry is on `de.sentry.io`, so all telemetry stays in the EU. That keeps the privacy policy simple.
- The founder in the UAE just logs into `eu.posthog.com`. The region only decides where data is stored.
- RevenueCat's PostHog integration has an explicit EU region option. ([RC → PostHog](https://www.revenuecat.com/docs/integrations/third-party-integrations/posthog))
- PostHog's MCP server routes to EU automatically. ([MCP FAQ](https://posthog.com/docs/model-context-protocol/faq))
- The region is picked at signup and is tied to the organization. Treat it as permanent: moving later means a new project.
- Sign the PostHog DPA (Article 28 processor contract) in the org settings. ([PostHog GDPR](https://posthog.com/docs/privacy/gdpr-compliance))

### 2.2 App Store Connect → App Privacy changes

Apple's rules on "linked":
- Data is linked unless it's de-identified before collection *and* never re-linked.
- Personal data under privacy law counts as linked.
- Every event carries the deviceId, which also keys the user's reminders, so **everything below is "Linked to you"**.
- The IP-address rule: if you collect and store IP, "declare the relevant data types based on how you use IP address, such as… coarse location".
([App Privacy Details](https://developer.apple.com/app-store/app-privacy-details/))

| Category → Data type | Change | Purposes | Linked | Tracking |
|---|---|---|---|---|
| Usage Data → **Product Interaction** | **Add** | Analytics | Yes | No |
| Identifiers → **Device ID** | Already declared (App Functionality). **Add a purpose** | App Functionality + **Analytics** | Yes | No |
| Diagnostics → **Other Diagnostic Data** | Add, or extend if already declared for feedback | Analytics (+ App Functionality) | Yes | No |
| Diagnostics → **Performance Data** | **Add** if you send latency (`total_ms`, `stt_ms`, as planned) | Analytics | Yes | No |
| Location → **Coarse Location** | **Add** if GeoIP stays on. Skip it if you set `disableGeoip: true` and rely on `$timezone`/`$locale` | Analytics | Yes | No |
| Purchases → **Purchase History** | Already declared. **Add a purpose** (RevenueCat → PostHog sends purchase events keyed to the deviceId) | App Functionality + **Analytics** | Yes | No |
| Diagnostics → **Crash Data** | No change, as long as PostHog error tracking stays off (Sentry keeps crashes) | — | — | — |
| User Content / Audio Data | No change. Analytics never carries transcripts, titles or audio | — | — | — |

Where: App Store Connect → Apps → Remi → **App Privacy** → Edit next to Data Types → Publish. These answers can be edited at any time without a new build. Publish them **before** the analytics build reaches users.

Mirror the same changes in `app.json` → `ios.privacyManifests.NSPrivacyCollectedDataTypes`, all with `Linked: true`, `Tracking: false` and `NSPrivacyCollectedDataTypePurposeAnalytics`:
- Add `NSPrivacyCollectedDataTypeProductInteraction`.
- Add `NSPrivacyCollectedDataTypeOtherDiagnosticData`.
- Add `NSPrivacyCollectedDataTypePerformanceData`.
- Add `NSPrivacyCollectedDataTypeCoarseLocation`.
- Add the Analytics purpose to the DeviceID and PurchaseHistory entries.
- Keep `NSPrivacyTracking: false`.

### 2.3 ATT: does this count as tracking?

Apple's definition: tracking is "linking user or device data collected from your app with user or device data collected from other companies' apps, websites, or offline properties for targeted advertising or advertising measurement purposes", plus "sharing user or device data with data brokers". It also covers a third-party SDK that combines your app's data with other developers' data for ads, "even if you don't use the SDK for these purposes". ([User Privacy and Data Use](https://developer.apple.com/app-store/user-privacy-and-data-use/))

**Confirmed: PostHog as planned is not tracking.** It's first-party product analytics:
- The data goes to a processor under a DPA.
- No IDFA is collected.
- No third-party data is joined in.
- Nothing is used for ads.
- No ATT prompt is needed. `NSPrivacyTracking` stays `false`.

**Any of these would push it over the line** and require ATT, the label flip to "Used to Track You", and `NSPrivacyTracking: true` plus tracking domains:
1. Turning on any of PostHog's own **ad-conversion destinations** (Meta Ads Conversions API, Google Ads, TikTok Ads, Reddit, Microsoft Ads, LinkedIn Ads). ([Meta Ads destination](https://posthog.com/docs/cdp/destinations/meta-ads), [Google Ads](https://posthog.com/docs/cdp/destinations/google-ads), [TikTok](https://posthog.com/docs/cdp/destinations/tiktok-ads)) This is the easy one to trip over, because it's a few clicks in the same UI.
2. Adding an MMP or ad-attribution SDK (AppsFlyer, Adjust, Branch, Singular, Meta SDK). This is the founder's existing note.
3. Turning on RevenueCat integrations that forward purchase events to ad networks or MMPs (Meta, TikTok, AppsFlyer, and so on).
4. Collecting the IDFA, or sending deviceId, email or any other identifier to an ad network or a data broker.
5. A batch export of PostHog data to anyone who uses it for ads.

### 2.4 Consent (EU) — a decision for the founder (not legal advice)

- The EU ePrivacy rule (Sweden implements it in its Electronic Communications Act) needs **consent** to store or read information on a device unless it's strictly necessary.
- The PostHog SDK writes its own ID and queue to the device and reads device info, purely for analytics.
- PostHog's own GDPR page says to provide "consensual capturing" and the ability to withdraw. ([PostHog GDPR](https://posthog.com/docs/privacy/gdpr-compliance))

**Recommended split:**
- **Client SDK: opt-in.**
  - Add a "Share anonymous usage stats to help improve Remi" choice to the existing first-run consent card (`components/AiConsentCard.tsx`). It must not be pre-ticked. Mirror it as a toggle in Settings.
  - Init with `defaultOptIn: false` and call `posthog.optIn()` / `optOut()` from that choice.
  - Hold `app_first_open` in memory and send it once the user opts in.
- **Server-side reliability events (take completed/failed): on by default, under legitimate interest.** They:
  - add no new on-device storage (they reuse the deviceId the app already needs);
  - carry no content;
  - have the same purpose as Sentry's crash reporting;
  - are disclosed in the policy;
  - respect the opt-out flag.
- **Result:** "Did a new user arrive today, and did their first recording work?" stays answerable for **everyone** from server events, with `timezone`/`deviceSttLocale` standing in for location. Opted-in users add city-level GeoIP, permission funnels and paywall data.
- **Simpler alternative:** opt-out (on by default, disclosed, with a Settings toggle). Many small apps do this, but it carries EU ePrivacy risk. The founder decides.

### 2.5 What the privacy policy must say

The policy is hosted at `wahabbasa.github.io/voicereminder-legal/privacy.html`. Add:
1. **What's collected:**
   - in-app usage events (screens, button and flow steps, permission outcomes, reminder scheduled/rang/snoozed/dismissed, paywall views);
   - the install's random device ID;
   - device model, iOS version, app version, language/locale and time zone;
   - approximate location (city/country) derived from the IP address, **with the IP itself not stored**;
   - technical diagnostics (error codes, timings);
   - subscription events from the purchase provider.
   - Say explicitly: **never** the recordings, transcripts or reminder text.
2. **Why:** product analytics, reliability and debugging, and measuring conversion. **Not** advertising, not sold, not shared with ad networks or data brokers, no cross-app tracking.
3. **Legal basis:** consent for in-app analytics, and legitimate interest for reliability diagnostics (or whatever §2.4 decides).
4. **Processor and location:** PostHog Inc., data hosted in the EU (Frankfurt), under a DPA. Mention onward-transfer safeguards (SCCs) for any non-EU sub-processors.
   - In-app copy stays generic ("an analytics provider"), following the no-provider-names rule.
   - The policy can name PostHog, or say "analytics provider". GDPR requires recipients **or categories of recipients**.
5. **Retention:** events kept up to 1 year (the free-plan maximum), or whatever you set.
6. **Choices:** how to opt in or out (Settings toggle), and how to request deletion: email or the feedback form with the device ID, followed by deletion of the PostHog person.
7. **Change log:** update the "last updated" date. The policy and the ASC labels should change in the same release.

---

## 3. Event plan

**Guards.**
- One wrapper module (`lib/analytics.ts`) with a typed event map. Each event allows only the property keys listed below, with string-literal unions wherever possible.
- `before_send` drops anything else.
- No free-text property exists anywhere. This follows the same "content-free by construction" rule as `lib/sentry.ts`.

**Super-properties**, registered once and refreshed on change: `app_variant` (development|production), `voice_language` (the setting: auto|…), `is_pro`, `notif_permission`, `alarmkit_status`, `ai_consent`.

**Automatic properties:** `$app_version`, `$app_build`, `$device_name` (model), `$os_version`, `$locale`, `$timezone`, `$expo_update_id`, `$expo_channel`, plus GeoIP `$geoip_country_name` and `$geoip_city_name`.

Source key: C = client SDK · S = Convex server · A = SDK automatic · RC = RevenueCat server.

| # | Event | Src | When | Properties (no content, ever) |
|---|---|---|---|---|
| 1 | `Application Installed` / `Application Updated` | A | First SDK load / version change | `version`, `build`, `previous_version` (auto). **Inflated once** by existing users on the analytics release (see 1.1). |
| 2 | `app_first_open` | C | First launch where `getDeviceId()` minted a new ID | `device_id_minted: true`, `reinstall_hint` (bool: Keychain/backup marker, if you add one) |
| 3 | `Application Opened` / `Became Active` / `Backgrounded` | A | Lifecycle | auto (`from_background`). Drop Became Active/Backgrounded in `before_send` if volume ever matters |
| 4 | `$screen` | C | expo-router `usePathname` change | `$screen_name`: home \| settings \| paywall \| alarm \| reminder_new \| diagnostics |
| 5 | `ai_consent_shown` | C | Consent card shown | `trigger`: first_record_tap \| settings |
| 6 | `ai_consent_answered` | C | Allow / decline | `choice`: allow \| decline, `ms_to_answer` |
| 7 | `permission_requested` | C | Just before a system prompt (mic, speech recognition, notifications via `notifee.requestPermission`, AlarmKit `requestAuthorization`) | `permission`: microphone \| speech_recognition \| notifications \| alarmkit, `context`: first_record \| reminder_save \| settings \| launch, `status_before` |
| 8 | `permission_result` | C | Prompt resolved | `permission`, `result`: granted \| denied \| provisional \| restricted \| unsupported, `was_system_prompt` (bool), `ms_to_answer` |
| 9 | `permission_blocked_cta` | C | `PermissionPrompt` (denied state) acted on | `permission`, `action`: open_settings \| dismiss |
| 10 | `record_tapped` | C | Mic button | `blocked_by`: none \| ai_consent \| mic_permission \| usage_cap \| cap_unverified \| offline, `active_reminders` (count) |
| 11 | `recording_started` | C | Audio actually recording | `planned_stt`: device \| cloud, `speech_locale` (the BCP-47 recognizer locale, e.g. `sv-SE`) |
| 12 | `recording_stopped` | C | Stop / cancel | `duration_ms`, `outcome`: submitted \| cancelled \| too_short \| interrupted |
| 13 | `take_submitted` | C | `begin` called | `creation_id`, `stt_source`: device \| cloud, `device_stt_ms`, `device_stt_engine`: dictation \| transcriber |
| 14 | **`take_completed`** | **S** | Job → `committed` | `creation_id`, `stt_source`, `reminders_created` (count), `total_ms`, `stt_ms`, `parse_ms`, `stt_fallback_used`, `device_stt_locale`, `timezone`, `is_first_take` (first job for this deviceId) |
| 15 | **`take_failed`** | **S** | Job → `failed` | `creation_id`, `server_error_code`: storage_missing \| stt_failed \| parse_failed \| unparseable \| internal, `stt_source`, `total_ms`, `device_stt_locale`, `timezone`, `is_first_take` |
| 16 | `take_failed_client` | C | Pending take ends `failed` locally (`lib/takeReconcile.ts`) | `creation_id`, `error_kind`: network \| unparseable \| server \| cap_unverified, `server_error_code`, `stt_source`, `phase_at_failure` |
| 17 | `take_imported` | C | Client acks the committed take (reminders on the phone) | `creation_id`, `reminders_count`, `end_to_end_ms` (stop-tap → visible) |
| 18 | `reminder_scheduled` | C | Ring scheduled | `kind`: one_off \| repeating \| interval, `ring_mode`: alarmkit \| notification, `lead_bucket`: <1h \| 1–24h \| >1d, `has_voice_audio` |
| 19 | `reminder_rang` | C | Observed only when the app runs: foreground fire, alarm screen open (`app/alarm.tsx`), or AlarmKit event-log reconcile on next launch (`reconcileAlarmEvents`) | `ring_mode`, `observed_via`: foreground \| alarm_screen \| reconcile, `fired_at` (epoch, since reconcile reports late) |
| 20 | `reminder_snoozed` | C | Snooze action (Notifee action, alarm screen, AlarmKit) | `ring_mode`, `snooze_minutes`, `source` |
| 21 | `reminder_dismissed` | C | Stop/dismiss | `ring_mode`, `source`: alarm_screen \| notification_action \| alarmkit_stop, `secs_to_dismiss` |
| 22 | `paywall_shown` | C | `app/paywall.tsx` mount | `context` (from `resolvePaywallContext`: interval \| cap \| settings …), `offering_id` |
| 23 | `paywall_closed` | C | Leave paywall | `outcome`: purchased \| restored \| dismissed \| error, `plan_tapped`: monthly \| annual \| none |
| 24 | `usage_cap_hit` | C | `usageGate` blocks | `gate`: blocked_upgrade \| blocked_unverified, `active_reminders` |
| — | `rc_trial_started_event`, `rc_initial_purchase_event`, `rc_trial_converted_event`, `rc_trial_cancelled_event`, `rc_renewal_event`, `rc_cancellation_event`, `rc_expiration_event`, `rc_billing_issue_event` | RC | RevenueCat servers → PostHog, also when the app is closed | `revenue`, `currency`, `product_id`, `period_type`, `store`, `environment` (SANDBOX/PRODUCTION) … ([RC → PostHog](https://www.revenuecat.com/docs/integrations/third-party-integrations/posthog)) |

That's 24 custom or auto event rows, plus RevenueCat's events.

**RevenueCat ↔ PostHog setup:**
1. In the app, after `Purchases.configure`, call `Purchases.setAttributes({ $posthogUserId: deviceId })`. Without it RevenueCat falls back to `$RCAnonymousID:…`, which won't join.
2. In RevenueCat: Project → Integrations → **PostHog** → paste the **Project API key** (public; "no need to set up personal API keys"), set Region = **EU**, keep the default event names, and add the optional ones (expiration, billing issue, uncancellation).
3. Sandbox purchases need their own key field. The free plan has 1 project, so leave sandbox off, or filter on `environment`.

The PostHog-side RevenueCat warehouse source (which needs an RC `sk_` secret) is optional and comes later. ([PostHog RC source](https://posthog.com/docs/data-warehouse/sources/revenuecat))

**Housekeeping:**
- Turn on Project settings → "Filter out internal and test users". Exclude `app_variant = development` and the founder's deviceIds (a cohort).
- Set the project timezone to the founder's.
- Add an annotation for each release.

### 3.1 First dashboards (in order)

**1. "Today: new users"** — answers "did a new user arrive today, from where, and did their first recording work?"
- Trend: unique `app_first_open` today, with a breakdown by `$geoip_country_name`.
- Funnel (1-day window, breakdown by country): `app_first_open` → `record_tapped` → `recording_started` → `take_completed` where `is_first_take = true`.
- SQL table, one row per new install:

```sql
WITH firsts AS (
  SELECT distinct_id,
         min(timestamp)                                   AS first_open,
         argMin(properties.$geoip_country_name, timestamp) AS country,
         argMin(properties.$geoip_city_name, timestamp)    AS city,
         argMin(properties.$locale, timestamp)             AS locale,
         argMin(properties.$timezone, timestamp)           AS tz,
         argMin(properties.$device_name, timestamp)        AS model,
         argMin(properties.$os_version, timestamp)         AS ios,
         argMin(properties.$app_version, timestamp)        AS app_version
  FROM events
  WHERE event = 'app_first_open' AND timestamp >= today()
  GROUP BY distinct_id
),
first_take AS (
  SELECT distinct_id,
         argMin(event, timestamp)                          AS result,
         argMin(properties.server_error_code, timestamp)   AS error_code,
         argMin(properties.stt_source, timestamp)          AS stt,
         argMin(properties.device_stt_locale, timestamp)   AS stt_locale,
         min(timestamp)                                    AS at
  FROM events
  WHERE event IN ('take_completed', 'take_failed', 'take_failed_client')
    AND timestamp >= today() - INTERVAL 1 DAY
  GROUP BY distinct_id
)
SELECT f.*, t.result, t.error_code, t.stt, t.stt_locale,
       dateDiff('second', f.first_open, t.at) AS secs_to_first_take
FROM firsts f LEFT JOIN first_take t ON t.distinct_id = f.distinct_id
ORDER BY f.first_open DESC
```

- Add a second panel for users who haven't consented: the server-only version. Use `take_*` where `is_first_take = true` today, with `timezone` and `device_stt_locale` in place of GeoIP.

**2. Take reliability**
- `take_completed` vs `take_failed` (+ `take_failed_client`) per day.
- Failure rate broken down by `server_error_code`, `stt_source`, `device_stt_locale`, `$app_version` and `$expo_update_id`.
- p50/p90 `total_ms` and `end_to_end_ms`.
- The `stt_fallback_used` share.

**3. Activation and permissions**
- Funnel: `app_first_open` → `ai_consent_answered(allow)` → `permission_result(microphone, granted)` → first `take_completed` → first `reminder_rang`.
- Grant rate per `permission`.
- Weekly retention: first `take_completed`, then a returning `take_completed`.

**4. Monetisation**
- Funnel: `paywall_shown` (breakdown by `context`) → `paywall_closed(purchased)` → `rc_trial_started_event` → `rc_trial_converted_event`.
- `usage_cap_hit` → `paywall_shown`.
- Revenue from the `rc_*` events.

---

## 4. Alerts: never find a failure by accident again

| Need | Mechanism | Free plan? |
|---|---|---|
| **Instant push when a new user installs** | Data pipeline → Destinations → + New → **Slack** (connect the workspace) or **Discord / Webhook**. Filter: event `app_first_open`, `app_variant = production`. Message template, e.g. "New Remi user: {event.properties.$geoip_city_name}, {event.properties.$geoip_country_name} · {event.properties.$device_name} iOS {event.properties.$os_version} · {event.properties.$locale}". Slack or Discord on the phone gives the push. ([Slack destination](https://posthog.com/docs/cdp/destinations/slack), [Destinations](https://posthog.com/docs/cdp/destinations)) | Yes. Realtime destinations: 10,000 trigger events free each month. ([Data pipeline pricing](https://posthog.com/blog/data-pipeline-pricing)) |
| **Instant push when a take fails** | A second destination on `take_failed` OR `take_failed_client`: "Take failed: {server_error_code or error_kind} · stt={stt_source} · first take={is_first_take} · {timezone}", with a link to the person. Use the server event so it fires even if the app died. | Yes (same 10k) |
| Hourly email safety net | Insight alerts on: (a) trend `take_failed` count, hourly, "more than 0"; (b) `take_completed` daily, "less than 1", to catch a silent outage where nothing succeeds; (c) failure-rate SQL insight daily, "more than 20%". Alerts notify by email, Slack, Discord, Teams or webhook. ([Alerts](https://posthog.com/docs/alerts)) | Up to **5 alerts**. Hourly/daily/weekly checks only: every 15 minutes needs Boost, real-time needs Scale |
| Morning digest | Dashboard 1 → Subscribe → email daily at 08:00 | Up to 5 subscriptions |
| Email straight from an event | PostHog **Workflows** (trigger on event → email dispatch). Needs an email channel with a **verified sending domain** (SPF/DKIM). ([Workflows](https://posthog.com/docs/workflows/launch-workflow)) | 10k emails a month free; only worth it if the founder owns a domain |
| Independent of PostHog | Convex already emails through Resend (`convex/feedbackEmail.ts`). A few lines in the `take_failed` path could also email the founder. That's a belt-and-braces option if PostHog is ever down or misconfigured. | n/a |

Keep notification payloads content-free. The events have no content to leak anyway.

---

## 5. Keys needed

| Key | What it's for | Secret? | Where to create or find it (EU UI) |
|---|---|---|---|
| **Project API key / project token** (`phc_…`) | Ships in the app (`EXPO_PUBLIC_POSTHOG_KEY` in the EAS env for all three environments, and in `.env.local`). Also Convex env `POSTHOG_PROJECT_TOKEN`, and RevenueCat's PostHog integration | **No.** Write-only ingestion key, designed to be public | `eu.posthog.com` → **Settings → Project → General** ("Project token" / "Project API key"). Same page as the Project ID |
| **Project ID** (a number) | API paths (`/api/projects/:id/…`), MCP pinning header `x-posthog-project-id` | No | Same page as above |
| **Host values** | App and Convex: `https://eu.i.posthog.com` (ingestion). API/UI: `https://eu.posthog.com` | No | — |
| **Personal API key for Claude** (`phx_…`) | Reading data (HogQL `/query`), creating insights, dashboards, alerts and destinations, through the REST API or the PostHog MCP server (`https://mcp.posthog.com/mcp`, routes to EU automatically) | **Yes.** Never in the repo; keep it beside the ASC `.p8` in the user profile | Avatar → **Account settings → Personal API keys → + Create personal API key**. The direct link with the preset is `…/settings/user-api-keys?preset=mcp_server`. Choose the **MCP Server** preset, label "Claude – Remi", and set access to **this project only**, not the organization. ([Personal API keys](https://posthog.com/docs/api/personal-api-keys), [MCP FAQ](https://posthog.com/docs/model-context-protocol/faq)) The value is shown once. |

Scopes the personal key must cover, if you build it by hand instead of using the preset:
- `query:read` — HogQL. The docs call it the "Query Read" permission. ([API queries](https://posthog.com/docs/api/queries))
- `insight:read` + `insight:write`.
- `dashboard:read` + `dashboard:write`. ([Core API](https://posthog.com/docs/api/core))
- `alert:read` + `alert:write`. ([Alerts API](https://posthog.com/docs/api/alerts))
- `hog_function:read` + `hog_function:write`, for the Slack, Discord and webhook destinations.
- Read access to project, persons, event definitions and property definitions, plus cohort and annotation write, for the internal-user cohort and release annotations.
- Not needed: organization or member admin, billing, `person:write`. Add `person:write` later only if you script GDPR deletions.

Founder-only clicks:
- Choose EU at signup.
- Sign the DPA.
- Connect Slack (an OAuth click), or paste a Discord webhook URL.
- Enable the RevenueCat integration in the RevenueCat dashboard.
- Toggle "Discard client IP data" (check it's on).
- Publish App Privacy.

Query-API limits for personal keys: 240 requests per minute, 2,400 per hour, 3 concurrent, 10 s max execution. That's plenty for Claude.

---

## 6. Cost

**Free monthly tier (no card):**
- Product analytics: **1,000,000 events**.
- Session replay: **2,500 mobile recordings** (5,000 web).
- Realtime destinations: **10,000 trigger events**.
- Workflows: **10,000 messages per channel**.
- Error tracking: **100k exceptions**.
- Feature flags: **1M requests**.
- Alerts: **5**.
- Dashboard subscriptions: **5**.
- Data retention: **1 year**.
- Projects: **1**.

Above the free tier, analytics costs $0.00005 per event, falling with volume.

Sources: [PostHog home pricing table](https://posthog.com/), [Product analytics pricing](https://posthog.com/product-analytics/pricing), [Session replay pricing](https://posthog.com/session-replay/pricing), [Workflows pricing](https://posthog.com/workflows/pricing), [FAQ](https://posthog.com/faq).

**Volume estimate** (my assumption for a daily active user):

| Source | Events per DAU per day |
|---|---|
| Lifecycle (about 3 opens × 3) | ~9 |
| Screens | ~6 |
| Takes (2 × ~6) | ~12 |
| Rings / snoozes | ~5 |
| Misc | ~3 |
| **Total** | **~35** |

That's about 1,050 events per DAU per month, so the 1M free events cover **about 950 DAU**. At launch scale (tens of users) usage will be under 5% of the free tier. Server and RevenueCat events are a rounding error. Destination triggers (new users + failures) stay far below 10k.

**Safety:**
- With no card on file, PostHog drops data above the free allowance instead of billing. With a card, set per-product billing limits; PostHog emails at 80% and 100%.
- Not needed now, but worth knowing: PostHog's startup programme offers up to $50k in credits to companies under 2 years old and pre-Series B.

---

## 7. Implementation outline (for a later, approved session)

1. **Founder:** create the EU org and project, sign the DPA, make the keys (§5), connect Slack or Discord.
2. **Client code (one PR):**
   - `lib/analytics.ts`: typed wrapper, consent gate, `before_send` allow-list.
   - `app/_layout.tsx`: provider and `$screen` effect.
   - `lib/deviceId.ts`: expose "minted this launch".
   - Consent toggle in `AiConsentCard` and Settings.
   - Call sites in the permission code (`lib/audio.ts`, `lib/notifications.ts`, `lib/alarmKit.ts`, the speech module), the take path (`lib/takeReconcile.ts`, `lib/creationJobWatch.ts`), rings, and `app/paywall.tsx`.
   - `Purchases.setAttributes({ $posthogUserId })` in `lib/purchases.ts`.
   - Tests for the allow-list, so no event can carry a string that isn't in its enum.
3. **Native config:**
   - `npx expo install posthog-react-native expo-application expo-device expo-localization`.
   - Privacy-manifest additions in `app.json`.
   - Bump `version`.
   - EAS env `EXPO_PUBLIC_POSTHOG_KEY` / `EXPO_PUBLIC_POSTHOG_HOST` (all three environments) and `.env.local`.
4. **Server:**
   - `convex/analytics.ts`: an internal action that does the `fetch`.
   - Schedule it from the committed/failed transitions in `convex/creationJobs.ts`.
   - Convex env vars.
   - **Push only after tests; `proper-stoat-767` is live.**
5. **Rollout:**
   - Dev build → iPhone test: events show up in PostHog "Activity" with `app_variant = development`.
   - Founder go → production build.
   - Publish App Privacy and the policy update before release.
6. **Claude, with the personal key:** create dashboards 1–4, the two destinations, the alerts, the subscription and the internal-user cohort.

---

## Sources
- PostHog React Native SDK docs (install, config, lifecycle events, expo-router screens, identify): https://posthog.com/docs/libraries/react-native · install page https://posthog.com/docs/product-analytics/installation/react-native · SDK reference https://posthog.com/docs/references/posthog-react-native
- PostHog React Native session replay: https://posthog.com/docs/session-replay/installation/react-native · mobile replay modes https://posthog.com/docs/session-replay/mobile · config type https://posthog.com/docs/references/posthog-react-native/types/PostHogSessionReplayConfig · masking https://posthog.com/docs/session-replay/privacy · iOS crash report https://github.com/PostHog/posthog-js/issues/3329
- PostHog capture API: https://posthog.com/docs/api/capture · Convex component https://posthog.com/docs/libraries/convex · https://www.convex.dev/components/posthog/convex
- PostHog GDPR / EU hosting / IP handling: https://posthog.com/docs/privacy/gdpr-compliance · https://posthog.com/docs/privacy/data-storage
- Apple App Privacy Details (data types, linked, IP guidance, Analytics purpose): https://developer.apple.com/app-store/app-privacy-details/ · definitions https://apps.apple.com/us/story/id1539235847
- Apple User Privacy and Data Use (ATT tracking definition): https://developer.apple.com/app-store/user-privacy-and-data-use/ · WWDC22 "Explore App Tracking Transparency" https://developer.apple.com/videos/play/wwdc2022/10166/
- PostHog ad-conversion destinations (what would make it tracking): https://posthog.com/docs/cdp/destinations/meta-ads · https://posthog.com/docs/cdp/destinations/google-ads · https://posthog.com/docs/cdp/destinations/tiktok-ads
- RevenueCat → PostHog integration: https://www.revenuecat.com/docs/integrations/third-party-integrations/posthog · PostHog RevenueCat source https://posthog.com/docs/data-warehouse/sources/revenuecat
- PostHog alerts: https://posthog.com/docs/alerts · alerts API https://posthog.com/docs/api/alerts · Slack destination https://posthog.com/docs/cdp/destinations/slack · destinations https://posthog.com/docs/cdp/destinations · Workflows https://posthog.com/docs/workflows/launch-workflow
- PostHog keys and API: personal API keys https://posthog.com/docs/api/personal-api-keys · queries https://posthog.com/docs/api/queries · core (dashboards) https://posthog.com/docs/api/core · MCP https://posthog.com/docs/model-context-protocol · MCP FAQ https://posthog.com/docs/model-context-protocol/faq
- PostHog pricing: https://posthog.com/ · https://posthog.com/product-analytics/pricing · https://posthog.com/session-replay/pricing · https://posthog.com/workflows/pricing · https://posthog.com/blog/data-pipeline-pricing · https://posthog.com/faq
- Local checks (2026-10-05):
  - `npm view posthog-react-native` → 4.78.4 with all peer dependencies optional.
  - `@posthog/react-native-plugin` → 2.12.4.
  - unpkg `posthog-react-native@4.78.4/dist/native-deps.js`: `$device_name` = `expo-device` `modelName`.
  - `node_modules/react-native-purchases` 9.6.11 has `setAttributes`, no `setPostHogUserId`.
  - `node_modules/convex` → 1.45.0.
