# ASO & Apple Search Ads playbook — Remi

Distilled 2026-08-16 from two founder references (Tensor Podcast ASA episode + AppSprint ASO video),
applied to Remi. Governs OLD-63 screenshots + listing. Messaging direction (OLD-63 comment, 08-15)
still rules all copy: pain point first — for people who forget a lot; outcome over features; the
spoken-out-loud alarm is the credibility mechanism; no medical/condition claims.

## The one principle

The funnel is: search keyword → product page → install → onboarding → paywall. Every surface speaks
the searcher's exact words. If they searched "voice reminder", the title, screenshots, and first
caption say "voice reminder" — their terminology, not ours. Better conversion = cheaper installs =
profitable ASA later.

## Keyword strategy

Two search intents, split across the two indexed fields (never repeat a keyword across fields —
Apple ranks you on the weaker placement):

| Field | Content | Chars | Carries |
|-------|---------|-------|---------|
| Title | `Remi: Voice Reminders` | 21/30 | voice, reminder |
| Subtitle | `The talking alarm clock` (already published in ASC) | 23/30 | talking, alarm, clock |
| Keyword field | `remember,forgetful,memory,habit,routine,task,daily,speak,audio,wake,adhd,med,water,aloud` | 93/100 | long tail |

Rules baked in: singular forms only (App Store auto-covers plurals), no word repeated across the
three fields, most important words earliest in the title, keyword field is comma-separated with no
spaces. `adhd` sits in the hidden keyword field ONLY — it is exactly "people who forget a lot"
search intent, but it never appears in visible copy (no condition claims). Drop it if App Review
ever flags metadata.

## Screenshot set (5, iOS 6.7" + 6.5")

Layout reference: `medical_theme-screenshots.zip` — angled device on flat two-tone background, one
bold caption per shot. Note the reference app is a competitor literally named "Voice Reminder"
(Android) — we reproduce the layout style, not the assets, and ours must be iPhone frames.

Copy register (locked 2026-08-16 after reading competitor reviews — Talking Alarm Clock / Sentry
Apps): direct statements of what the app does, in the users' own words. Reviewers say "the alarm
tells me what it's for", "it speaks the label out loud", "reminds me until I actually get it done".
No clever taglines. Reliability and no-ads are the two things reviews reward hardest.

Captions carry search terms (Apple indexes screenshot text; searchers see their own words):

| # | Caption | Screen |
|---|---------|--------|
| 1 | **The alarm tells you what it's for** | Alarm firing screen (full-screen banner) |
| 2 | **Speaks your reminder out loud** — even from the lock screen | Lock-screen alarm |
| 3 | **Set reminders with your voice** | Voice composer / recording sheet |
| 4 | **Daily, weekly, intervals — any schedule** | Schedule grid in edit sheet (OLD-99) |
| 5 | **For people who forget a lot** — it repeats until it's done | Today screen, populated |

### Store copy (EN-US, paste-ready)

Promotional text (≤170) — show the vocalization, don't describe it; the quote is the app's own
bare-imperative phrasing canon:

> "Drink your water." An alarm that says your reminder out loud — on time, and again until it's
> done.

Description:

> Remi is an alarm clock that speaks. Every reminder you set is read out loud at the time you set
> it — the alarm tells you what it's for, so you know why it's ringing without picking up your phone.
>
> WHAT IT DOES
> • Set reminders with your voice — say it once and it's scheduled
> • At the right time, the alarm speaks your reminder out loud, even from the lock screen
> • Snooze it and Remi repeats the reminder until you dismiss it — it doesn't let you forget
> • Any schedule: daily, weekly, exact times, intervals, every N days
> • Rings even when your phone is on silent
> • Works in English and Arabic
>
> WHAT PEOPLE USE IT FOR
> Meds, water, appointments, bills, chores, wake-ups — anything that needs to be said out loud
> instead of buried in a silent notification.
>
> Remi Pro: $6.99/month or $39.99/year with a 7-day free trial. Subscription auto-renews unless
> cancelled at least 24 hours before the period ends. Terms and privacy policy in the app.

Sequencing gate: screenshots are shot AFTER the Remi rebrand pass (display name shows in-app), on
the post-rebrand UI.

## Locales at launch

Two-three locales max at launch; ASO is a marathon, expand from trial data later.

1. **English (US)** — primary.
2. **Arabic (Saudi Arabia)** — the app already speaks Arabic (EN+AR phrasing canon); Gulf market is
   home turf, ASO competition in Arabic is far thinner than English. Translate title, subtitle,
   keywords, AND screenshot captions (locale doesn't count until everything is localized).

Later, with data: more locales + the "US matrix trick" (9 extra US-indexed locales carry English
keywords we couldn't fit — e.g. put a subtitle-tier word in a Russian-locale *title* to boost its US
weight).

## Iteration loop (post-launch)

- Product page CVR lives in ASC Analytics. Under 10% = rework screenshots. ASA tap-to-install under
  ~50% = wrong keywords or bad screenshots.
- A/B via Product Page Optimization (icon and screenshot treatments). Never guess — test.
- Reviews weigh on ASO per-country; ratings prompts matter early.
- Refresh keyword popularity/difficulty weekly-ish. Target difficulty < 50; we have no ASO tool yet —
  first real data will come from ASA itself.

## Apple Search Ads (post-launch, not now)

Condensed mechanics for when the listing is live:

- **$100 free credit** on signup. Budget expectation: $100–300 (low competition) to $200–500.
- **Tier 2/3 countries first**, never US at the start. One country per campaign, named
  `Remi - <Country> - exact`. Search-results placement only. **Search Match always OFF.**
- Exact match keywords in brackets; add long-tail (cheaper, less contested). Broad/discovery only
  once profitable and experienced.
- Bid ~30% under Apple's suggestion; raise in $0.50 steps; wait 3–4 days between changes. Above ~$3
  CPT, move on to the next keyword.
- Kill rules: zero sales + real spend → pause forever. ~0.5 ROAS → experiment with bid down. Never
  hold losers hoping they turn.
- Scale rule: winner with <90% impression share → raise bid gradually.
- Judge by ROAS from RevenueCat data (trials/subs per keyword), never by Apple's dashboard alone.

## Open decisions

- Final Arabic keyword set (needs a proper Arabic keyword pass, not literal translation).
- Whether `adhd` survives first App Review contact (default: keep, it's hidden metadata).
- ASO tool purchase — defer; ASA data covers discovery for v1.
