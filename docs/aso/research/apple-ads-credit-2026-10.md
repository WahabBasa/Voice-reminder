# Apple Ads: $100 credit and Claude API access (research, 2026-10-08)

Read-only research. Nothing was signed up for, claimed, accepted or changed.

## Verdict

| Question | Answer |
|---|---|
| Does the user already have the credit or an Apple Ads account? | **No sign of either.** Gmail has no Apple Ads / Search Ads welcome, offer or billing email. The only hit is the 2026-10-02 "Welcome to the App Store" approval mail, which just links to searchads.apple.com. |
| Is the user eligible for the $100 credit? | **Very likely yes.** The App Store new-account credit goes to any App Store Connect developer with at least one app on sale in an Apple Ads country. Remi has been live since 2026-10-02, and the UAE is on both lists: a storefront ads can run in, and a country advertisers may live in. |
| How is it claimed? | **Automatically.** Create the Apple Ads account, link it at the **top-level account** (not a campaign group) to the App Store Connect account, and add a payment method. The credit appears at the top of the Billing page. There is no code or promo link. A valid payment method is required. |
| Expiry? | Apple's help page gives none. It says to watch invoices to see how much is used. Apple may change or end offers at any time. |
| Can Claude run campaigns now? | **No.** The ASC keys on this machine can't call the Apple Ads API. It uses a separate OAuth client-credentials setup, and no Apple Ads credentials exist locally. |
| What the user must do | (1) Sign up at ads.apple.com (pick **Advanced**; the API invite flow runs from Advanced). (2) Link App Store Connect and add a card. That accepts Apple's terms and triggers the credit. (3) Invite an API user with the **API Account Manager** role. (4) Accept the invite. (5) Paste Claude's public key into Account Settings > API. Steps below. |

## A. The credit offer

- **Amount and trigger:** "When you first set up your Apple Ads account for ads on the App Store, we automatically give you a $100 (U.S.) credit... You'll see this at the top of the Billing page when you add a payment method." It is a one-time new-account credit. Non-USD accounts get it converted at Apple's daily rate. Source: https://ads.apple.com/app-store/help/billing/0032-apple-ads-promo-credit
- **Eligibility:** you must be "a developer and registered account holder on App Store Connect, and have at least one app available for sale on the App Store in the available countries and regions," and you "must link your Apple Ads account to an App Store Connect account." "If you link a campaign group instead of your top-level account, the credit won't be applied." (same page)
- **Basic vs Advanced:** the marketing pages offer "Try Apple Ads for free with a 100 USD credit" on both the Basic page (https://ads.apple.com/app-store/basic) and the Advanced/App Store page (https://ads.apple.com/app-store). The help page ties the credit to the account, not to one product, so either should qualify. Apple doesn't say so explicitly.
- **Payment method required:** the general offer terms (effective 2026-08-14) say "You must have a valid active Account, in good standing, with a valid payment method." Credits can't be used for taxes, can't be cashed out, and expire if the account is terminated. Source: https://ads.apple.com/promo-terms
- **UAE:** the countries page lists United Arab Emirates both under storefronts where App Store ads run and under "Advertisers residing in the following countries and regions may use Apple Ads." Saudi Arabia, Egypt, Kuwait, Qatar and the other tier 2/3 markets from the playbook are also on the storefront list. Source: https://ads.apple.com/app-store/countries-and-regions
- **Don't confuse it with the Maps offers.** The eligibility page (https://ads.apple.com/credit-eligibility-criteria-and-limitations) lists a $150 sign-up credit and a 15%-back "Grand Opening" promo, deadline 2026-10-11. Both cover **ads on Apple Maps** only, which run in the US and Canada. They don't apply to Remi.

**ASO transcripts.** `docs/aso/transcripts/aso-keywords-locales-playbook.md` (lines 40, 71) says sign-up gives $100 of free credit. The plan it gives is to run a broad discovery campaign for about a week, then move the winning keywords into an exact-match campaign. If a campaign doesn't spend, wait 24–48h and raise the target CPA 10–20% a day. `asa-small-budget-tier23-playbook.md` says $100–300 is enough in a low-competition niche. Its rules: tier 2/3 countries first, exact match only, Search Match off, one country per campaign, raise bids $0.50 at a time, drop a keyword whose bid passes about $3, judge ROAS through RevenueCat. Taken together, the $100 credit covers a first low-competition test.

## B. Gmail (read-only search of wahabbasa@gmail.com)

Queries run: `"Apple Ads" OR "Apple Search Ads" OR searchads OR "ads.apple.com" ...`, `searchads OR "search ads" OR "apple ads" OR "advertising credit" OR "promo credit" in:anywhere`, `from:(searchads.apple.com OR ads.apple.com ...) in:anywhere`, `from:apple.com ("$100" OR credit OR advertising) in:anywhere`.

Results:
- 2026-10-02 "Welcome to the App Store" (no_reply@email.apple.com). Approval notice for Remi with a generic "Search Ads (https://searchads.apple.com)" link. No offer and no code.
- Everything else was Apple retail newsletters and a 2022 Google Ads policy mail.
- **No Apple Ads account, welcome, invite, billing or credit email.** One caveat: if the developer Apple ID uses a different email address, Apple Ads mail would go there instead.

## C. Access for Claude

### The ASC keys can't drive Apple Ads
- `C:\Users\AtheA\.appstoreconnect\private_keys\` holds two App Store Connect keys: `AuthKey_UK56CMV8QG.p8` (App Manager) and `AuthKey_6KVUTSNM37.p8` (Admin, used for reports). Both are App Store Connect API JWT keys.
- The Apple Ads API authenticates differently. An Apple Ads account admin invites a user with an API role, that user uploads an EC P-256 public key under Account Settings > API, and Apple returns a `clientId`, `teamId` and `keyId`. A client secret is an ES256 JWT signed with the matching private key, valid for at most 180 days. It is exchanged at `https://appleid.apple.com/auth/oauth2/token` (`grant_type=client_credentials`, `scope=searchadsorg`) for a 1-hour access token. Source: https://developer.apple.com/documentation/apple_ads/implementing-oauth-for-the-apple-search-ads-api
- **Which API version:** "The Apple Ads Platform API supersedes the Apple Ads Campaign Management API, which will be sunset on January 26, 2027." New work should target the Platform API (`https://api.ads.apple.com/v1/...`, header `X-AP-Context: adAccountId=...`). It uses the same OAuth flow. Sources: https://developer.apple.com/documentation/apple_ads and https://developer.apple.com/documentation/apple-ads-platform-api/access-overview

### Local credential check (names only)
- `C:\Users\AtheA\.appstoreconnect\`: only the two ASC `.p8` files above.
- `C:\Dev\VR\.env.local` and `.env.example`: no searchads or Apple Ads entries.
- `C:\Users\AtheA\.claude\`: no searchads or Apple Ads credential files.
- `ptc keys list`: ACRCLOUD_TOKEN, ELEVENLABS_API_KEY, EPIDEMIC_API_KEY, LINEAR_API_KEY, MS_TODO_CLIENT_ID, NOTION_API_KEY, OPENROUTER_API_KEY, REVENUECAT_SECRET_KEY, SPEECHIFY_API_KEY, TEST_KEY, TWITTER_* (5). **No Apple Ads credentials.**

### Steps for the user (browser), once the account exists
1. Sign in at https://ads.apple.com and choose **Advanced**. Create the account, link App Store Connect at the top-level account, and add a card. This step accepts Apple's terms and starts the credit, so it stays with the user.
2. Under Users (top right), pick the account, then **Account Settings > User Management > Invite Users**.
3. Enter the name and Apple ID of the API user and pick **API Account Manager** (read/write on all campaigns plus reporting through the API). For a lower-risk start, pick **API Account Read Only** (reporting only). Role list: https://ads.apple.com/app-store/help/advanced/0011-invite-users-to-your-account
   - Apple's docs don't say whether the admin Apple ID can also hold an API role. In practice developers usually invite a **second Apple ID** for the API user. Plan for that.
4. The invited Apple ID gets an email with a secure code, signs in at the link, and enters the code.
5. Claude generates an EC P-256 key pair on this machine (the private key stays local, e.g. `~/.appleads/`, never in the repo) and gives the user the **public** key.
6. Signed in as the API user: **Account Settings > API**, paste the public key, Save. Send Claude the `clientId`, `teamId` and `keyId` that appear. They're identifiers, but store them in `ptc keys` anyway.
7. Claude builds the client secret and confirms access with `GET /v1/me` and `GET /v1/acls`.

### What Claude could do after that
Through the API (account-level API Account Manager role): create, edit, pause and delete campaigns, ad groups, keywords and negatives; set bids and daily budgets; pull campaign, keyword, search-term and impression-share reports; use custom product page ads. The role covers "manage all campaigns... with read and write capabilities."

### What stays with the user
- Creating the account, accepting the Apple Ads terms, linking App Store Connect, and adding or changing the payment method. Billing isn't an API job, and the Account Finance role is UI-only.
- Inviting users and uploading the public key, both done as admin or invited user in the browser.
- Approving spend. By house rule, Claude doesn't start or raise a budget without the user's explicit go.
- Renewing the client secret before its 180-day limit (Claude can do this if the private key stays local).

### Attribution, tracking and ATT
Apple's own attribution is the AdServices framework: the app calls `AAAttribution.attributionToken()` and posts the token to `https://api-adservices.apple.com/api/v1/`. The response carries campaign, ad group, keyword and country IDs, with no device identifier. Source: https://developer.apple.com/tutorials/data/documentation/adservices/aaattribution/attributiontoken().md. Apple's AdServices page doesn't mention ATT. RevenueCat's write-up says "Unlike iAd, AdServices doesn't require the user to opt-in to the App Tracking Transparency prompt," and that it works for all users (https://www.revenuecat.com/blog/engineering/iad-vs-adservices-whats-the-difference.md). So using AdServices, directly or through RevenueCat's AdServices token collection, needs no ATT prompt and shouldn't count as "tracking" on the privacy label. This rests on a third-party source plus the payload design, not a sentence from Apple. A third-party MMP or ad SDK that links data across companies is still the "Apple tracking/ATT trap" noted in memory: privacy-label change plus an ATT prompt. Remi's code doesn't use AdServices or ATT today (grep, 2026-10-08).
