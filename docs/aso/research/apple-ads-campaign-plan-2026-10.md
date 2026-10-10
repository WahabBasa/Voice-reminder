# Apple Ads campaign plan: Remi, first $100 (2026-10-09)

Read-only research and planning. Nothing was signed up for, claimed, accepted, created or paid. Builds on `apple-ads-credit-2026-10.md` and `country-selection-2026-10.md`, and follows Yonatan's rules in `../transcripts/asa-small-budget-tier23-playbook.md`.

## 1. Verdict

| Question | Answer |
|---|---|
| **$100 credit?** | **Yes, for Advanced too.** Apple's Advanced page says "Try Apple Search Ads for free with a 100 USD credit" and its footnote ties the credit to the *new account*, not to Basic. It is **automatic**: no code, no promo link, nothing in Gmail (searched 10-09; the only Apple mail is the 10-02 "Welcome to the App Store"). Conditions: you're the App Store Connect account holder with an app on sale, you **link App Store Connect at the top-level account** (a campaign-group link gets no credit), and you **add a payment method**. The credit then shows at the top of Billing. Apple's help gives no expiry. Credits can't pay tax and die if the account is terminated. |
| **UAE billing, Brazil/Mexico ads?** | Fine. The UAE is on Apple's list of countries advertisers may live in, and Brazil, Mexico and Colombia are on the storefront list. Campaign country and billing country are separate. Pick **USD** at signup: currency and time zone can't be changed later. Expect a small VAT line the credit won't cover. |
| **Can Claude build it?** | **Partly now, fully after 6 user steps.** The Apple Ads Platform API (`https://api.ads.apple.com/v1`, replacing the Campaign Management API, which ends 2027-01-26) creates campaigns, ad groups, exact-match keywords, negatives, daily budgets and manual CPT bids. It also sets `automatedKeywordsOptIn: false` (Search Match off), `deviceClass: IPHONE`, and `appDownloader.exclude: [6801797784]` (new users only), and pulls keyword, search-term and impression-share reports. The browser steps below stay with you. |
| **Tracking** | One JS line, `Purchases.enableAdServicesAttributionTokenCollection()`, which the installed SDK 9.6.11 already bridges natively. So it ships as an **OTA update, no new build**. Plus one toggle in RevenueCat. No ATT prompt. **It must be live before the first ad spends.** |

### Your steps (browser, about 20 minutes)

1. **Sign up:** go to ads.apple.com > **Get Started** (that's Advanced). Sign in with the **same Apple Account you use for App Store Connect**; Apple requires the same email for linking. Fill in the account: country UAE, **currency USD**, time zone Asia/Dubai, legal name. Accept the Terms of Service, then fill in Business Details (tax).
2. **Payment:** click your account name (top right) > **Settings > Billing > Payment Method**, then add a Visa, Mastercard or Amex card. Check that "Promo Credit" shows $100 on that page.
3. **Link App Store Connect:** in the Campaigns dashboard, click the **down arrow (top left, above Campaigns) > Settings > Link accounts**, then sign in again. Link the **top-level account**, not a campaign group.
4. **Invite the API user:** click your name (top right) > **Account Settings > User Management > Invite Users**. Enter a **second Apple Account** you control (the admin login stays separate) and pick the role **API Account Manager**, then Send Invite.
5. **Accept:** open the invite email for that second Apple Account, follow the secure link and enter the code.
6. **Key:** Claude generates an EC P-256 key pair locally and gives you the **public** key. Sign in as the API user > **Account Settings > API**, paste the key, Save. Send Claude the `clientId`, `teamId` and `keyId` shown above the field.
7. **RevenueCat:** Project > **Integrations > Apple AdServices > Add Apple Search Ads integration**. Optionally do "Sign in with Apple" with the Apple Ads admin so RevenueCat can fetch campaign and keyword names.
8. **Go:** test the OTA (tracking line) on your iPhone, then give Claude an explicit go on the budget. Claude builds everything **paused**, shows you the payload, and enables it on your word.

## 2. Preconditions (check before spending)

The $100 only buys signal if the funnel past the install works for these users:

- **Portuguese and Spanish takes must work.** Week 1 showed 4 of 8 outside takes failing, 3 of them from the Hebrew speaker. Record 3 to 5 pt-BR and es-MX takes on a device first. If parsing fails, ads just buy 1-star reviews.
- **Paywall reach.** There were 0 trials from about 9 real users. Pull RevenueCat `paywall_encounter` first, so we know whether users never see the paywall or see it and pass.
- **Store page.** Confirm the 1.0.1 pt-BR and es-MX metadata and screenshots are live, and which subtitle variant went out. The screenshot column below assumes the draft headlines. If the localized screenshots aren't live yet, the "keyword in the screenshot" rule isn't met and taps convert worse.
- **Tracking OTA live** (section 4).

## 3. Countries

| Campaign | Country | Why | CPT / CPI estimate | Ads country |
|---|---|---|---|---|
| Remi – Brazil – exact | BR | Localized pt-BR page; best paying-subs-per-dollar market in Adapty's data (65 per $1k; $15.36 per paying sub) | CPT **$0.41** (Adapty); LatAm CPT $0.40–0.60, CPA $0.50–0.80 (SplitMetrics 2025); CPI ≈ $1.05 (AppTweak, prior report) | Yes |
| Remi – Mexico – exact | MX | Localized es-MX page; Mexico had a TTR of 11.4% and the 2nd-lowest CPA in LatAm (SplitMetrics 2025) | CPI ≈ $1.10, CPT ≈ $0.59 (prior report) | Yes |
| *(after Nov 3, if a country wins)* Remi – Colombia – exact | CO | es-MX is the **default** language there, so the page is already localized; Adapty puts Colombia in the "efficient quadrant" | No published figure | Yes |

**A third, English-page country?** Not on $100 over 24 days: a third campaign would get about $1.30 a day, which is unreadable. If one is wanted later, Colombia beats any English-page market because it gets the Spanish page free (copy the MX keywords minus the Mexico-only "luz"). English-page candidates for later: Sweden (CPT $0.57, conversion 57.8%) and the Netherlands (CPT $0.65, conversion 60.5%), both Adapty 2026. Search volume for English reminder terms there is unknown, and they're tier 2 prices. The UAE is home, but small and skewed by the founder's own traffic.

## 4. Campaign structure

The same settings apply to every campaign (API field in brackets):

- Placement: search results only (`supplyPlacement: APPSTORE_SEARCH_RESULTS`).
- One country per campaign.
- Bidding: manual CPT (`MANUAL_CPT`), not Maximize Conversions, which forces Search Match.
- Search Match off (`automatedKeywordsOptIn: false`).
- iPhone only (`deviceClass.include: [IPHONE]`).
- New users only (`appDownloader.exclude: ["6801797784"]`).
- Leave age, gender, location and daypart alone.
- Default product page.
- One ad group per campaign, named like the campaign.
- Every keyword `EXACT`.

**Bids.** Start each keyword at **0.7 × Apple's suggested bid**, where the UI or suggestions API shows one. Without a suggestion, use the fallback below. Expected CPT is $0.30–0.60.

**The window:** the $100 must last from launch (about Oct 10–11) to **Nov 3, 2026**. That's about 24 days, or about $4 a day in total.

| Campaign | Ad group | Daily cap | Default bid (fallback) | 24-day spend |
|---|---|---|---|---|
| Remi – Brazil – exact | Remi – Brazil – exact | **$2.25** | $0.40 | ≈ $54 |
| Remi – Mexico – exact | Remi – Mexico – exact | **$1.75** | $0.45 | ≈ $42 |
| buffer | — | — | — | ≈ $4 for Apple's daily overspend (it can exceed a daily cap on some days) |

No Colombia and no reserve top-up inside this window: there's no room.

**What $4 a day buys** (CPT from benchmarks; tap→install ≈ 55%)

| | CPT | Taps/day | Installs/day | Over 24 days |
|---|---|---|---|---|
| Brazil @ $2.25 | $0.40 | ≈ 5.6 | ≈ 3 | ≈ 135 taps, **≈ 74 installs** |
| Mexico @ $1.75 | $0.50 | ≈ 3.5 | ≈ 2 | ≈ 84 taps, **≈ 46 installs** |
| **Total** | | ≈ 9 | ≈ 5 | ≈ 220 taps, **≈ 120 installs**, so **6–12 trials** at a 5–10% install→trial rate |

**Fewer keywords.** At about 9 taps a day, 33 keywords would each get roughly 0.3 taps a day, which can't be read.
- **Wave 1 (launch):** the **8 keywords per country** marked **W1** below. That's about 0.7 taps per keyword per day in BR.
- **Wave 2 (from day 8):** the rest, added only if wave 1 can't spend the cap.
- Read results per **intent cluster** (voice/talking alarm, pills, bills, doctor, birthday, water/ADHD) as well as per keyword: the clusters reach readable sizes far sooner.

### Brazil keywords (exact)

"SS" means the pt-BR screenshot headline the keyword matches. Bids start at 0.7 × suggested; the fallback bid is shown.

| Keyword | Tail | Intent | SS match | Fallback bid |
|---|---|---|---|---|
| **despertador falante** | short · **W1** | talking alarm (category) | subtitle; SS4 "Sempre toca" | 0.40 |
| **alarme que fala** | short · **W1** | alarm speaks the reminder | SS4 | 0.40 |
| **lembrete por voz** | short · **W1** | set by voice | name; SS3 "por comando de voz" | 0.40 |
| lembretes por voz | short | set by voice | name; SS3 | 0.40 |
| **despertador que fala** | short · **W1** | talking alarm | SS4 | 0.40 |
| alarme falante | short | talking alarm | SS4 | 0.35 |
| lembrete falado | long | alarm says the reminder | promo text | 0.35 |
| alarme com voz | long | voice alarm | SS3/SS4 | 0.35 |
| **lembrete de remédio** | short · **W1** | pills | promo text (**no screenshot**) | 0.40 |
| alarme de remédio | long | pills ("despertador no celular" fix) | promo text | 0.35 |
| lembrete para tomar remédio | long | pills | promo text | 0.30 |
| **lembrete de boleto** | long · **W1** | bills | SS1 "o boleto vencer" | 0.30 |
| lembrete de contas | long | bills | SS1 | 0.30 |
| **lembrete de consulta** | long · **W1** | doctor | SS2 "a consulta médica" | 0.30 |
| **lembrete de aniversário** | long · **W1** | Mom's birthday | SS5 | 0.30 |
| lembrete beber água | long | schedule / water | SS6 "Qualquer rotina"; description | 0.30 |
| lembretes tdah | long | ADHD / forgetful | keywords field | 0.30 |
| lembrete | short (head) | generic, Apple Reminders territory | — | 0.25, watch |

### Mexico keywords (exact)

| Keyword | Tail | Intent | SS match | Fallback bid |
|---|---|---|---|---|
| **alarma que habla** | short · **W1** | alarm speaks the reminder | subtitle/keywords; SS4 | 0.45 |
| **recordatorios con voz** | short · **W1** | set by voice | name; SS3 "con tu voz" | 0.45 |
| recordatorio con voz | short | set by voice | name; SS3 | 0.45 |
| **alarma con voz** | short · **W1** | voice alarm (review language) | SS3/SS4 | 0.45 |
| **despertador que habla** | short · **W1** | talking alarm (competitor head term) | SS4 | 0.40 |
| **recordatorio de pastillas** | short · **W1** | pills | promo text (**no screenshot**) | 0.40 |
| alarma para pastillas | long | pills | promo text | 0.35 |
| recordatorio para tomar pastillas | long | pills | promo text | 0.30 |
| **recordatorio de pagos** | long · **W1** | bills ("se me pasó pagar") | SS1 "el recibo de la luz" | 0.35 |
| recordatorio de pago de tarjeta | long | bills | SS1 alt | 0.30 |
| **recordatorio de citas** | long · **W1** | doctor | SS2 "la cita con el doctor" | 0.30 |
| **recordatorio de cumpleaños** | long · **W1** | Mom's birthday | SS5 | 0.30 |
| recordatorio tomar agua | long | schedule / water | SS6 "Cualquier horario"; promo text | 0.30 |
| recordatorios tdah | long | ADHD / forgetful | keywords field | 0.30 |
| recordatorios | short (head) | generic | — | 0.25, watch |

Skipped on purpose:
- Competitor brand names, in both countries: low conversion and an extra review risk on a $100 test.
- "recordatorio de voz" / "lembrete de voz": these read as voice *memos*.

### Negative keywords (campaign level, both countries)

With exact match and Search Match off, negatives barely fire. They're a safety net in case anything is ever switched to broad. Spanish, then Portuguese:

- Voice memos and recorders: `grabadora de voz` / `gravador de voz`, `notas de voz` / `nota de voz`
- Voice changers: `cambiar voz` / `mudar voz`
- Translators: `traductor` / `tradutor`
- Ringtones: `tonos de alarma` / `toques de alarme`, `ringtone`
- Clock widgets: `reloj` / `relógio`

## 5. Rules: launch (about Oct 10–11) to Nov 3

Days count from launch. Claude pulls the reports, and any change to spend needs your go. Yonatan's 3–4 day wait between changes stays as it is.

### Yonatan's bid rules, scaled to BR/MX prices

His numbers are built for a market where the suggested bid is about $1.40 and the US median CPT is about $1.58. Brazil's median CPT is $0.41, about a quarter of that, so his rules scale down proportionally:

| Rule | Yonatan (tier 1/2) | Remi BR/MX | Basis |
|---|---|---|---|
| Starting bid | 30% under suggested | Same: 0.7 × suggested; fallback $0.30–0.45 | unchanged |
| Raise step | +$0.50 (≈ 35% of a $1.40 bid) | **+$0.15** (≈ 35% of a $0.40 bid) | same proportion |
| Move-on ceiling | max CPT about $3 (≈ 2× US median CPT) | **$0.90 BR, $1.00 MX** (≈ 2× local median CPT of $0.41 / ≈$0.59) | same ratio to local median |
| Why the ceiling holds | — | At $0.90 CPT and 55% tap→install, CPI ≈ $1.65. At a 10% trial rate, that's ≈ $16 per trial. Above that, a $6.99/month app (cheaper after regional pricing) can't pay back on a $100 test. | economics |

### Calendar

| When | Check | Action |
|---|---|---|
| Day 0 | Everything created paused | You review, then enable. Tracking OTA already live. |
| Day 1–2 | No impressions | Normal. Wait. |
| **Day 4** (Oct 14) | Wave-1 keywords with 0 impressions | Raise **+$0.15** once |
| Day 4 | Search-terms report | Note real queries. No changes yet. |
| **Day 8** (Oct 18) | Cap not spent | Add wave-2 keywords |
| Day 8 | Still 0 impressions after one raise | Raise +$0.15 again, up to the ceiling. **At the ceiling → pause, move on.** |
| Day 8 | Search terms | Promote real queries to exact keywords |
| **Day 12** (Oct 22) | **Impressions, CPT, tap-through: readable per keyword** | Pause keywords with impressions but tap-through under 3% (wrong intent for the page) |
| Day 12 | Install conversion (taps→installs) per intent cluster, about 50–100 taps per country | Under 50% means a screenshot or page problem for that intent. Note it for the PPO test, don't raise bids. |
| **Day 16** (Oct 26) | Install→trial per country (about 50 BR / 30 MX installs) | **First fair read of trials.** Pause any keyword with **≥ $5 spend and 0 trials** (≈ 7 installs at ~$0.75 CPI), and never revive it. |
| Day 16 | A keyword with ≥ 1 trial and impression share ≤ 50% | Raise +$0.15 |
| **Day 20** (Oct 30) | Same rules | Shift cap: up to +$0.50/day toward the country with the lower cost per trial, same $4/day total |
| Day 22–24 (Nov 1–3) | Credit about spent | Pause everything on Nov 3. Write up: CPT, CR and cost per trial per country and cluster. |
| about Nov 10–17 | Trial→paid for trials started by about Oct 27 | First revenue read; ROAS still directional |

### When each question can be answered

| Question | Readable from | Why then |
|---|---|---|
| Does a keyword get impressions, and at what CPT? | Day 4–8 | Apple data shows within 12h–4 days |
| Tap-through per keyword | about day 12 | Needs a few hundred impressions per keyword |
| Install conversion per **intent cluster** | about day 12 | about 50–100 taps per country; per *keyword*, many never get there |
| Install→trial per **country** | about day 16 | about 50 BR / 30 MX installs; 0 trials by then at 5%+ expected is already a signal |
| Trial→paid / revenue | **after Nov 3** | 7-day trial plus the delay of the first renewal. By Nov 3 only trials from about Oct 27 or earlier can have converted, and there are maybe 3–8 of them. |
| ROAS per keyword | **not with $100** | Single-digit payers. Judge on cost per trial. |

**What $100 can and can't tell us**
- **Can:** CPT and volume per keyword; tap-through; tap→install per intent cluster (which screenshot story pulls); install→trial per country; real search terms.
- **Can't:** ROAS, or trial→paid at keyword level. About 120 installs gives 6–12 trials and maybe 2–5 payers. One paid month returns about $4–5 net after regional pricing and Apple's cut. **Judge on cost per trial**, and treat the $100 as keyword and funnel discovery, as both playbooks frame it.

## 5b. When spending more would be justified

Real money (beyond the credit) only when **all** of these hold for a country at the Nov 3 review (or later, once revenue lands):

1. **Funnel proven.** At least 5 ad-attributed trials in that country, with RevenueCat showing the keyword. Below 5, one lucky user moves the rate.
2. **Cost per trial ≤ $10.**
   - Rough payback math: Remi's net per payer in the first year is about $25–34 (annual $39.99, or about 4–6 months of monthly, after Apple's 15% small-business cut and lower BR/MX regional prices).
   - At a 30–40% trial→paid rate, a $10 trial costs $25–33 per payer, roughly break-even within a year.
   - The 30–40% is an **assumption to replace** with Remi's own rate.
3. **At least 1 trial→paid conversion confirmed** in RevenueCat (not just trials started). It proves the paywall and price convert in that market.
4. **Capped, not saturated.** The country spends its full daily cap early, Apple shows "limited by budget", or impression share on trial-producing keywords is ≤ 50%. Without that, more budget wouldn't buy more.
5. **Install conversion ≥ 50%** on the winning cluster. Below that, fix screenshots first: it's cheaper than buying taps.

**If all hold:** raise that country to **$5–8/day** on the winning keywords only. Keep exact match. Review every 3–4 days, and keep the same ceiling and the $5-with-0-trials kill rule.

**If 1–3 hold but not 4:** keep $2/day, because more money buys nothing.

**If none hold** (e.g. 0 trials from about 120 installs): stop ads. Fix the paywall and onboarding first; that's what the week-1 zero-trial data already hinted at.

## 6. Tracking setup

1. **App, JS only:** in `lib/purchases.ts`, right after `await Purchases.configure({ apiKey })` (line 138), add `Purchases.enableAdServicesAttributionTokenCollection();`. RevenueCat requires it after configure (iOS 14.3+).
   - **Today:** a grep of the repo finds no AdServices, ATT or `enableAdServices...` call.
   - **No new build:** the installed `react-native-purchases` 9.6.11 already exports it natively (`ios/RNPurchases.m:212`), so it ships as an OTA through the cloud EAS update workflow after your device test.
2. **RevenueCat dashboard:** Integrations > Apple AdServices > Add. Basic mode needs no credentials. The optional "Sign in with Apple" with the Apple Ads admin lets RevenueCat pull campaign data from Apple.
   - **Current state unknown:** the RevenueCat API doesn't show integration status. Read-only check: the iOS app `app7f9e2d4095` lists no integration fields.
   - **Either way no tokens are sent today**, because the app never calls the method.
   - **Optional:** add the App Store Connect API key in RevenueCat too (`app_store_connect_api_key_configured: false` today) for cleaner price and trial data.
3. **What you get:** campaign, ad group and keyword as filters in RevenueCat Charts (trials, conversions, revenue) and as customer attributes.
4. **ATT:** not needed. RevenueCat: standard AdServices attribution needs no ATT consent; only the "detailed" payload does, and we don't use it. No privacy-label change, no third-party SDK.
5. **Day-to-day:** Claude joins the Apple Ads keyword report (spend) with RevenueCat keyword charts (trials) at each review.

## 7. Sources (fetched 2026-10-09)

**Apple Ads help and marketing**
- Promo credit: https://ads.apple.com/app-store/help/billing/0032-apple-ads-promo-credit
- Advanced page ("100 USD credit"): https://ads.apple.com/en/app-store/advanced
- Basic page: https://ads.apple.com/app-store/basic
- Promo terms (2026-08-14): https://ads.apple.com/promo-terms
- Maps-only offers, not ours: https://ads.apple.com/credit-eligibility-criteria-and-limitations
- Account setup (Advanced vs Basic; currency and time zone permanent): https://ads.apple.com/app-store/help/get-started/0004-set-up-an-account
- Payment method click path: https://ads.apple.com/app-store/help/get-started/0030-set-your-payment-method
- Linking App Store Connect (same email, roles): https://ads.apple.com/app-store/help/get-started/0012-link-app-store-connect-accounts
- User roles, incl. API Account Manager: https://ads.apple.com/app-store/help/get-started/0011-invite-users-to-your-account
- Platform API access: https://ads.apple.com/app-store/help/campaigns/0022-use-the-apple-ads-platform-api
- Countries and regions, incl. UAE as advertiser home: https://ads.apple.com/app-store/countries-and-regions
- Billing cycle: https://ads.apple.com/app-store/help/billing/0040-understand-the-billing-cycle

**Apple developer documentation**
- Platform API overview: https://developer.apple.com/documentation/apple-ads-platform-api.md
- App Store ads walkthrough (campaign, ad group, keywords, negatives, reports): https://developer.apple.com/documentation/apple-ads-platform-api/journey-app-store-ads.md
- OAuth, invite flow and key upload path: https://developer.apple.com/documentation/apple-ads-platform-api/implementing-oauth-for-the-apple-ads-platform-api.md
- Access, `X-AP-Context`, ad accounts: https://developer.apple.com/documentation/apple-ads-platform-api/access-overview.md
- AdGroupCreate example (`automatedKeywordsOptIn`, `deviceClass`, `appDownloader`): https://developer.apple.com/documentation/apple-ads-platform-api/adgroupcreate.md
- AppDownloader include/exclude: https://developer.apple.com/documentation/apple-ads-platform-api/adgrouptargetingcreate/appdownloader-data.dictionary.md
- Campaign Management API sunset 2027-01-26 and Search Match toggle: https://developer.apple.com/documentation/apple_ads and https://developer.apple.com/documentation/apple_ads/ad-groups

**Benchmarks and RevenueCat**
- Brazil CPT, paying subs per $1k, Colombia efficient: https://adapty.io/blog/cheapest-and-most-expensive-countries-for-apple-ads/
- Netherlands and Sweden rows, productivity niches: https://adapty.io/blog/apple-ads-benchmarks-2026/
- LatAm CPT/CPA ranges, Mexico TTR (SplitMetrics 2025 summary): https://appdevelopermagazine.com/apple-ads-search-results-benchmarks-report-2025
- RevenueCat Apple Search Ads integration (JS call, dashboard path, ATT): https://www.revenuecat.com/docs/integrations/attribution/apple-search-ads
- Mexico CPI/CPT and Brazil CPI: carried from `country-selection-2026-10.md` (AppTweak, Adapty)

**Discounted:** blogpros.com (2023) says Advanced "removes any new account credit". Apple's current Advanced page contradicts it.

**Local checks**
- Gmail (read-only, last 30 days): "Apple Ads / Search Ads / searchads / ads.apple.com" and "from:apple.com credit/$100/advertising/promo" return only the 10-02 approval email.
- Repo: grep for AdServices, `enableAdServicesAttributionTokenCollection`, `Purchases.configure`; `node_modules/react-native-purchases` 9.6.11.
- RevenueCat `list-apps` (read-only).
