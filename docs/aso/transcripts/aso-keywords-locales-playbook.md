# ASO fundamentals — keywords, locales, screenshots, then ads

**Source**: Arthur (founder of AppSprint, same host as transcript #1) — solo video on how he ranks his 3-day-built Bible app ("Vers", $2,400 in the last 28 days, 40+ active trials, portfolio of 5 revenue-generating apps).
**Saved**: 2026-08-19 (transcript #2 of the ASO series)
**Why it's here**: the organic-ASO groundwork that comes *before* the ASA playbook in transcript #1 — keyword selection, locale strategy, screenshot conversion. Directly relevant to Remi's ASC listing and the planned Arabic (Saudi) locale.

---

## Distilled playbook

### The model
- ASO = SEO for the App Store: pick keywords, place them where ranking weight is highest. **Priority order: app title (highest, front-load it) → subtitle → keyword field** (least important keywords).
- Keywords are **per-country**. Even two English-speaking countries search differently. The whole game: which title/subtitle keywords capture the most traffic you can actually rank for — balance popularity against difficulty.

### What influences ranking
- **Reviews** — a good average rating in a country improves ASO there.
- **Localization** — each App Store locale you add (title, subtitle, keywords, *and screenshots* translated) is new traffic.
- **Screenshots** — Apple extracts the keywords printed on them; screenshot text is ranking signal, not just conversion.

### Keyword selection rules
- Use an ASO tool (Astro, Appfigures, or AppSprint ASO) for popularity/difficulty scores plus top-5 downloads **and top-5 revenue** per keyword — revenue matters, not vanity downloads; a keyword can have traffic and no money.
- **Difficulty under ~50 or it's dead** — you won't rank without ads or external traffic. (Example: "Bible" in the US is unrankable; same keywords in Brazil have far lower difficulty → that's why his trials are Brazilian.)
- Localize keywords into the country's language; **singular forms only** — the store pairs plurals automatically.
- **Never repeat a keyword across fields** — the store keeps only the worst placement.
- Specific beats broad: broad keywords with mismatched intent bring installs that turn into bad reviews, which drags ASO down.

### The US matrix trick
- The US ranking reads keywords from **nine other locales** besides en-US. Adding English keywords to, e.g., the Russian locale boosts US ranking — and using *different* keywords there widens coverage (his example: "widget" only fits his US subtitle, but putting it in the Russian locale's title gives it title-weight in the US).

### Locale strategy
- Launch with **2–3 locales**, not 10–20. Add locales where traction appears (he added Korean only after Korean trials showed up).
- ASO is a marathon: a keyword change takes 1–2 weeks to show. Refresh keyword research weekly — popularity/difficulty move.
- A/B test the listing: swap one subtitle keyword, measure, keep or revert.

### Screenshots
- Top of the conversion funnel — the most important asset. Check conversion in App Store Connect analytics; **under 10% means rework**.
- A/B test icons and screenshots with Product Page Optimization. Never guess — only users' data tells you what works.

### Starting Apple Search Ads (bridge to transcript #1)
- Sign-up gives **$100 free credit**. Ads are "a ranking cheat": ranked 25th organically, the ad slot puts you first.
- His structure: a **discovery campaign** on broad match using his proven ASO keywords → after a week, harvest the best performers into an **exact-match campaign**.
- Campaign not spending? Normal for the first 24–48h; then raise the target CPA 10–20% per day until it spends.
- Conversion rate under 50% means wrong keywords (intent mismatch) or — usually — bad screenshots. His runs ~70%.
- ASA doubles as an experiment engine: finding better keywords and testing screenshots with real traffic.

### Launch boost
- Done well, the store gives a ~3-day new-app boost: roughly 300 downloads, 15–30 trials. Harder to get nowadays and possible to miss even with everything right — iterate rather than concluding "ASO is dead."

---

## Cleaned transcript

Lightly edited: fillers removed, auto-caption errors fixed ("ISO" → ASO, "local(s)" → locale(s), "M or"/"MO" → MRR, "by ball" → Bible, "Viculo doya" → versículo do dia, "App Sprintero" → AppSprint ASO). Content and order preserved.

This video is for you if you're stuck between zero and $5,000 per month in app revenue, or just getting started. Today I'll talk about the last app I built — my Bible app, a 3-day build I showed in my last videos. In the last 28 days it made $2,400 of revenue; MRR is slowly climbing and there are more than 40 trials right now. Lots of them are in Brazil — that's part of my strategy, and I'll explain. I'll walk you through the exact steps, tools, and frameworks I use to climb the App Store rankings. This is not a one-off: I have five apps, all generating revenue, because once your ASO base is done you can add Meta ads, TikTok ads, or organic content on top. ASO should be done first, and a lot of developers are missing a big opportunity there.

What is ASO? App store search optimization — exactly like SEO but for the App Store. If I run halloweencostumes.com, I optimize my site to rank on Google for "halloween costume", "scary costume". ASO is the same: for my Bible app I want to rank for "bible", "verse", "god", "scripture". How? By using those keywords in my app title, app subtitle, and keyword field. The most important keywords go in the title, then the subtitle, and the least important in the keyword field. The tricky part: keywords depend on the country. "Bible" has very different statistics in the US than in Australia or France — and even between two English-speaking countries there are big disparities, because people don't search the same way. The game of ASO is answering: which keywords do I put in my title and subtitle to get as much traffic as possible? Some keywords have huge traffic but are super hard to rank on — "Bible" is one, because there's a lot of money there and many apps compete. You have to find the balance between traffic and difficulty.

What influences ASO? First, reviews — a really good average rating in a country gives you better ASO there. Second, localization — the best way to get more traffic is adding languages, meaning creating locales on the App Store. My app is in the US; if I add the Spanish locale I translate the title, the subtitle, and all the screenshots. English, Spanish, Portuguese, Romanian, Polish and so on — everything on the store page has to be translated for that country's ASO to update. Screenshots also play a big ASO role because Apple extracts the keywords that appear on them — the words used in screenshots are usually high-traffic keywords the app is trying to rank on.

How do you start? There are lots of tools — Astro, Appfigures, and so on. Keep your ASO tool if you already know it; otherwise there's the one we built with the community for beginners and intermediates, AppSprint ASO. In the tool: add your app (or a temporary one if unpublished), pick a country — say the US — and add keywords: "bible", "bible verse", "prayer". For each keyword you get a popularity and difficulty score, the top five apps' estimated daily downloads, and the top five MRR — because you can find keywords with great stats and literally no money behind them. We want revenue, not vanity metrics like 20,000 downloads with no revenue; the MRR of apps ranking on a keyword hints at what it's worth. In the US it's super hard to rank — popularity is very high, but so is difficulty. You're looking for **difficulty under 50** — otherwise it's dead; you won't rank without ads or external traffic. I looked up the biggest markets for Bible apps and Brazil came up. Same keywords in Brazil: popularity still good, difficulty way lower — that's what you want. Then localize the keywords: in Brazil they speak Portuguese, so search Portuguese keywords. One thing to know: don't research plural forms — only singular ("prayer", not "prayers") — the App Store pairs the plural automatically. The keyword-suggestion tool gives related ideas — "bíblia", "versículo do dia" (verse of the day). After working the Brazil market a long time, I know some of the words myself.

Once you have your keywords, create your store page per locale — in App Store Connect (or through the tool, which edits the same fields): title, subtitle, keywords. Use your best keywords in the title, at the beginning of the title — that's the most important placement. Second-best keywords in the subtitle, the rest in the keyword field. Keep only very specific keywords — don't chase broad keywords even with great statistics, because people searching a specific thing want an app that answers that specific thing; if yours doesn't, you get bad reviews, which hurts your ASO. And never repeat the same keyword twice across fields — if "Vers" (my app name) appears in both title and subtitle, the store just takes the worst placement and ranks you on that. The tool flags it as a safety.

If you're targeting the US, use the US matrix trick: besides the US locale, nine other locales feed your US ranking. If I select Russian and use English keywords there, they count toward my US ranking. Better: use *different* keywords there to widen your net — "widget" sits in my US subtitle (lower impact), but putting it in the Russian locale's title gives it title-level impact on my US "widget" ranking. A really cool trick most people miss.

Before the screenshots part, to be clear: you don't need 10 or 20 locales to start — two or three are enough. Launch first, then iterate on feedback. I launched in English, got a few trials in Korea, and only then added Korean — it wasn't even a language I'd considered. ASO is a marathon, not a sprint: you build rankings slowly and iterate. A/B test your ASO too — change one subtitle keyword, watch the impact, decide.

Don't neglect screenshots. People search a keyword, then see your screenshots — if they look bad, they go to the next app. To measure: App Store Connect analytics shows your conversion; **under 10% means you need to work on it**. A/B test the icon and screenshots with Product Page Optimization — never assume something works because it looks good; only your users can tell you. Always test, always get data.

Last step, once everything is done well: Apple Search Ads. Sign up and you get **$100 of free credits**. ASA is a way to cheat your rankings: if I'm ranked 25th in the US on "bible", with ads I'm the first result. In the ads tab I work with two campaign types: first a **discovery campaign** targeting broad keywords — the keywords I found working well in my ASO research and store page. After it runs for a week, I pick the best keywords from it and create an **exact campaign** betting on those exact keywords. It looks complicated but isn't — I'll make a dedicated ASA video. Two problems you might hit: (1) the campaign doesn't start spending — wait 24–48 hours for it to fully set up, and if your target CPA is too low, raise it 10–20% per day until it spends; (2) low conversion rate — mine is at 70%, which is quite good. Under 50% means either your keywords are wrong (someone searching "pizza" finding a sports app won't click) or — usually — your screenshots are bad: your app ranks first but the screenshots don't make people want it. Screenshots are the top of the conversion funnel, the most important part. ASA is also an experimentation engine — for finding better keywords and iterating your screenshots.

To recap: ASO is the organic way to rank on the App Store. Find the right keywords, put them in your store pages, build screenshots with those keywords in them, iterate. Done perfectly, you might get the App Store launch boost — for the first 3 days after publishing, around 300 downloads and maybe 15–30 trials. It's harder and harder to get, and you can do everything right and still miss it — iterate anyway. A/B test keywords, screenshots, icons. Once something kind of works, start Apple ads with the free credits to find even better keywords in your target countries. It's a marathon: don't build all the locales up front, conclude "ASO is dead" and quit. A keyword change can take one or two weeks to show impact. Refresh your keywords at least once a week — popularity and difficulty scores move, and you need to know the current best way to rank in your niche.
