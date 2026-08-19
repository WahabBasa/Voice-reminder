# Apple Search Ads on a small budget — tier 2/3 countries

**Source**: Tensor Podcast — host Arthur (founder of AppSprint, an ASO/ASA Mac app), guest Yonatan (runs multiple apps; main app did $10k+ last month with Apple Search Ads as the only acquisition channel — no UGC, no TikTok, no Meta).
**Saved**: 2026-08-19 (transcript #1 of the ASO series)
**Why it's here**: the campaign playbook for Remi's first paid acquisition after launch. Remi already has RevenueCat, which is the exact revenue-attribution setup this episode says ASA is useless without.

---

## Distilled playbook

### Why ASA over Meta/TikTok
- ASA captures **existing intent** — people already searching to solve their problem. You bid on that intent instead of manufacturing demand with creative.
- No content treadmill: no UGC, no viral hooks, no ad fatigue cycle.

### Budget expectations
- Competitive niche: **$200–500** to see meaningful results and find first winners. Expect the overall test budget to lose a little money — that's the game.
- Low-competition niche: **$100–300**, success possible from ~$100.

### Build the whole funnel around the search intent (BEFORE spending)
- Funnel = keyword → product page → install → onboarding → paywall → payment. Every step should echo the intent you're bidding on.
- Icon and app title must convey the searched-for job (his example: plant identification).
- **Put the actual search keyword inside the screenshots** — use the customer's own terminology. Better conversion → lower effective CPI → that's what makes the account profitable.
- Localize the listing for each target country and validate it **before** launching campaigns.

### Country tiers — start in tier 2/3, not the US
- **Tier 1** (US, Canada, Australia, New Zealand, UK, Ireland): most expensive installs; US is the worst. Don't start here on a small budget.
- **Tier 2** (Germany, France, Italy, Spain, Netherlands, Finland): much cheaper than the US.
- **Tier 3** (Slovakia, Slovenia, Estonia, Albania; he files Argentina around here too): cheapest impressions with real willingness to pay for subscriptions.
- His core advice: start tier 2/3 and **never stop testing**. Apple supports ~91 countries — pick a few with AI help, don't overthink it.

### Campaign structure
- **One country per campaign.** Multi-country campaigns make the data unreadable.
- Naming: `AppName – Country` (mirror it on the ad group), note match type (e.g. "exact").
- Placement: **search results only** — don't experiment with the other placements.
- Match type: **exact match** (keyword in brackets) to start. Broad match only once you have budget and experience — it flexes the intent and loses money more easily. Apple defaults to broad; watch for it.
- Keywords: build the list with AI (GPT/Claude). Test **both short-tail and long-tail** — long-tail impressions are cheaper because most marketers skip them.
- **Search Match: always OFF.** ("Apple will spend your money the way they think is best, which is the worst way.")
- Audience: don't leave it on all-eligible defaults — restrict to what fits (iPhone-only if the app is iPhone-only), customer type **new users**. Demographics: leave alone unless you already have gender/age data from other channels. Location & ad scheduling: don't touch. Custom product page: default unless you actually have one.

### Bidding
- Start **~30% below Apple's suggested bid** (suggestion $1.40 → bid $1). It's a second-price auction — you pay just above the runner-up anyway. With spare budget, bid higher to buy data faster.
- Daily budget example: $20/day.
- Raise bids in **$0.50 steps**, then watch the impression trend before raising again.
- **Wait 3–4 days between changes** — ASA is slow; effects sometimes show in 12h, but 3–4 days is the judgment window.
- **CPT ceiling ~$3**: if you're bidding above that and still not capturing impressions, move on to the next keyword.

### Kill / scale rules
- **Never keep a losing keyword hoping it turns around** — that's how he burned $10k+. Real spend with zero sales → pause it and never think about it again.
- ~0.5 ROAS (recouping half of spend) → experiment with bid changes before killing.
- For winners, three metrics:
  - **Impression share**: at ~50%, raise bids gradually to capture more.
  - **Tap-through rate** (impressions → taps; taps are what you pay for).
  - **Conversion rate** (taps → installs): anything under ~80% is improvable, and improving it is "free money" — same spend, more sales. At a marginal 1.1 ROAS, conversion-rate work is what tips profitability.

### Measurement
- Apple's dashboard can't see revenue. Wire keyword spend to **RevenueCat/Superwall data** — trials, subscriptions, revenue, ROAS per keyword. ROAS is the only number that ultimately matters; spending on ads is only ever about getting more money back.

---

## Cleaned transcript

Lightly edited: fillers and [music] tags removed, obvious auto-caption errors fixed (e.g. "Apple Searchhat" → Apple Search Ads, "payroll" → paywall, "RO was" → ROAS, "top two rate" → tap-through rate, "board match" → broad match). Content and order preserved.

**Arthur (host):** Today's guest, Yonatan, runs multiple apps, and one of his main apps just made more than $10,000 in the last month — and his main acquisition channel is Apple Search Ads. No viral content, no UGC, not even TikTok ads. Only Apple Search Ads. At the end of this episode, he'll share his screen and walk through the exact steps to create your first Apple Search Ads campaign with a small budget. If you're building an app, have no audience, and want your first paying customers through Apple Search Ads, this is your episode. You'll learn the playbook for scaling an app with a small budget, why targeting countries outside the US can be way more profitable, and how to structure your entire funnel around search intent. I'm Arthur, founder of AppSprint, a Mac app for app founders who want more downloads from the App Store — keywords, competitors, rankings by country, metadata editing, localized pricing, and Apple Search Ads management in one place; connect RevenueCat or Superwall and you can see which ASA keywords bring trials, subscriptions, revenue, and ROAS.

**Arthur:** You're currently scaling your app through Apple Search Ads. Why pick ASA when Meta or TikTok ads look easier to start with?

**Yonatan:** The most obvious reason: I'm just not a consumer of Meta and TikTok. But mainly, ASA is easier and quicker because it captures an existing intent. People are already searching for your app — already searching to solve their problem. You place a bid, compete for those customers, and you can get sales.

**Arthur:** The main difference versus organic is you need a budget. What's the minimum to start?

**Yonatan:** Depends on your niche. Competitive niche: set expectations between $200 and $500 to see meaningful results and maybe find your first winners. The overall budget might lose a little money, but that's the game — you're testing keywords, testing countries, figuring it out. Low-competition niches can succeed with even $100 — I'd set expectations around $100 to $300. It depends on your execution in the app and on the product page.

**Arthur:** What do you mean by building everything around the search intent?

**Yonatan:** The funnel is everything your future customer goes through until they pay: searching a keyword, seeing your product page, installing, onboarding, paywall, pricing. If I'm bidding on a specific intent like plant identification, it's best to focus the entire funnel on that intent. The icon should convey plant identification as much as possible. The title too — something like "plant quiz" isn't relevant to that intent and won't convert. Same for screenshots. Huge tip: use the actual search term inside the screenshots. If someone searches "plant identifier" and that keyword has the most impressions for me, I use it inside my screenshots — I'm using the future customer's own terminology, which raises conversion. The better I convert, the less it costs to bring each user — lower CPI is what ends up making me profitable. You want the user to feel your app is the most relevant way to solve their problem. If you know you'll compete for a keyword, do this in advance — don't wait for results. Improve your chances to convert as cheaply as possible so you're not burning money.

**Arthur:** What about markets? You target countries outside the US — how do you find good ones?

**Yonatan:** First, why you shouldn't go for the US at the beginning: the US is the holy grail of app marketing, everyone competes there, the population spends the most, converts easily, pricing is high. Those are tier 1 countries — US, Canada, Australia, New Zealand, maybe UK, maybe Ireland — the most expensive installs, with the US the most expensive of all. On a small budget it costs too much just to get a sense of whether it works. Tier 2 is Germany, France, Italy, Spain, the Netherlands, Finland — a lot cheaper than the US. Tier 3 is countries with weaker economies but populations willing to spend on subscriptions — Slovakia, Slovenia, Estonia, Albania, maybe Argentina. Tier 3 tends to be the cheapest with the most purchasing power. If you want to really optimize your budget: start with tier 2 and tier 3, and just never stop testing.

**Arthur:** With ads it's easy to lose money. How do you know which keywords to cut and which to scale?

**Yonatan:** Figure out your winners and losers — compare spend against revenue. First, something important: never keep keywords that are losing money hoping they'll someday turn profitable. That's how you burn money — that's how I burned maybe more than $10k in ASA. It can be avoided: a keyword not performing → pause it or decrease the bid. If a keyword made some money but you only got back half your spend — around 0.5 ROAS — experiment with the bid. Zero sales and real spend → pause and never think about it again. For a winner, there are a few metrics: tap-through rate, conversion rate, and impression share. Impression share is easiest: if you're getting ~50% of possible impressions on a winning keyword, raise bids gradually to capture more. Tap-through rate is impressions → taps; you pay for taps, not installs. Conversion rate — taps → installs — is where your free money lies. Everything under 80% can be improved (at 75–80% you have better things to do). Improving conversion means the same spend gets more sales — if you're at 1.1 ROAS, barely making money, conversion-rate work is free money.

**Arthur:** The most important part is ROAS — return on ad spend. Is the spend on a keyword bringing RevenueCat or Superwall trials and conversions? Apple's ads dashboard can't tell you — it has no access to your revenue data. That's why tracking it matters: the only reason you spend on Apple ads is to get money back. — Now let's get hands-on. Say I'm a founder with $300–500 and I want to start. Take us through the whole playbook.

**Yonatan:** First: select countries. For this budget, tier 2 or tier 3 — preferably tier 3 if you want to be super conservative. Apple supports I believe 91 countries for ads — get the list, walk through it, ask GPT to help you decide. Don't overthink it: select a few countries and go. Before starting ASA, optimize the localization — after picking your countries, localize everything and validate it before publishing. Then keywords: build your list with AI — GPT, Claude. On a low budget go for both short-tail and long-tail keywords. Long-tail impressions tend to be a lot cheaper because most marketers don't go for them — they go where the masses are. Placement: the only option I recommend is search results — don't experiment with the rest.

**Yonatan (screen share, example campaign):** Let's use Germany — tier 2; you should go tier 3, but for demonstration. Campaign per country, named app-first: "Plant – Germany", exact match, so I write "exact" in the name. Bid strategy: managed bids only. Daily budget depending on yours — say $20/day. Ad group: same name. Language: English. So this ad group shows English keywords, exact match, in Germany, with the plant-identification intent. Bids: if Apple suggests $1.40, start conservative — cut about a third off, go with $1. You can always adjust. If you have budget and want data quicker, bid $3 — the App Store auction is second-price, so you pay just above the second-highest bid anyway. **Search Match: the oldest rule in the book — never turn it on.** Apple will spend your money the way they think is best, which is the worst way. Keywords: always exact match — wrap the keyword in brackets; that's the exact term you compete for. The difference with broad match is broad gives Apple flexibility to play with the keyword's intent for more impressions — easier to lose money. Experiment with broad when you have money and experience. Watch out: Apple defaults keywords to broad match because broad spends more. Long-tail formats are cheapest — the masses bid on the head terms. Audience: don't use the all-eligible default — use specific audiences. If your app is iPhone-optimized, go iPhone only. Customer type: I go for new users — makes the most sense to me. Demographics: if your app is obviously gendered — a period tracker, say — don't spend on the other gender. Otherwise I leave all genders, all ages; if you already have Meta/TikTok data on what converts, use it. Location and ad scheduling: don't touch. Custom product page: use the default unless you actually have one.

**Arthur:** How do you manage the campaign if it's barely spending? How do you increase bids, and what's the ceiling?

**Yonatan:** Every increase, even on winning keywords, is half a dollar. After a raise I watch the impression chart — if it's trending up, I don't raise more, I wait for sales to come in. If I raise $0.50, then $0.50 again after 4 days to a week and nothing changes, and my max CPT is above ~$3, I probably can't capture more impressions profitably. If you know you're getting less than 90–100% of impression share, someone's outbidding you — you can experiment with raising further and see what happens. But best practice: above $3, move on to the next keyword. Don't bother.

**Arthur:** How long do you wait between changes? Apple ads is slow — on TikTok a change applies in an hour.

**Yonatan:** I wait about 3 to 4 days. Sometimes impressions and changes go live in about 12 hours — depends on the country and keyword popularity — but 3–4 days is my maximum wait before judging.
