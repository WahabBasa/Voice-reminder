# Remi activation gap: 2026-10-02 to 2026-10-30

Pulled 2026-10-30, read-only (`convex data <table> --format jsonl` on `dev:proper-stoat-767`, aggregated locally, raw dumps deleted). No content fields were read into this report. Dates are UTC. "Install" = a `devices` row; the deviceId lives in AsyncStorage (`lib/deviceId.ts`), so **every reinstall is a new row**.

**Definitions.** Created = at least one live `reminders` row **or** a committed `takeOutcomes` row (3 users made reminders and later deleted all of them; `reminders` keeps live rows only). Tried = any `takeOutcomes`, `failedTakes` or `creationJobs` row. Opened once = `lastSeenAt` within 10 min of `firstSeenAt`; `hello` writes at most once an hour, so "came back" means a launch at least an hour later.

## Headline

| | Rows | People (deduped) | Created ≥1 | Created 0 | % zero |
|---|---|---|---|---|---|
| All `devices` rows first seen ≥ 10-02 | 67 | | | | |
| Real installs (founder, App Review, device farm removed) | **45** | **41** | 24 | **17** | **41%** |
| Strict dedupe (only the two confident merges) | 45 | 43 | 24 | 18 | 42% |
| No dedupe | 45 | 45 | 25 | 20 | 44% |

**All 17 zero-reminder people never tried.** None has a take outcome, failed take or creation job. 14 of the 17 opened the app once and never came back. The gap is before the first take, not in parsing.

## Weekly

| Week (first seen) | All rows | Excluded (founder / review / farm) | Real raw | Deduped | Created ≥1 | Created 0 |
|---|---|---|---|---|---|---|
| 10-02 – 10-08 (1.0, 1.0.1 on 10-08) | 7 | 3 / 0 / 0 | 4 | 4 | 4 | 0 |
| 10-09 – 10-15 (BR+MX ads 10-10 – 10-13, 1.0.2 10-12) | 27 | 5 / 1 / 3 | 18 | 18 | 5 | **13** |
| 10-16 – 10-22 | 9 | 0 / 0 / 1 | 8 | 6 | 5 | 1 |
| 10-23 – 10-29 (1.0.3 10-27) | 23 | 5 / 3 / 0 | 15 | 13 | 10 | 3 |
| 10-30 (partial) | 1 | 0 / 1 / 0 | 0 | 0 | 0 | 0 |
| **Total** | **67** | 13 / 5 / 4 | **45** | **41** | **24** | **17** |

The paid BR+MX cohort (BR/MX timezones, first seen 10-10 – 10-14) is 11 people with **2 creators (18%)**. Everyone else: 30 people, 22 creators (73%).

## The 17 zero-reminder people

| Split | Count |
|---|---|
| Tried and failed (any server-side take) | **0** |
| Never tried | **17** |
| Opened once (≤10 min) | 14 |
| Came back later | 3 (GB next day; RO 2 days later; the zh-CN pair, if it is one person, reinstalled 4 days later) |
| Sent in-app feedback without making a reminder | 2 (pt-BR 10-15, ru-RU 10-26) |

By country (timezone) and locale language:

| Country | Zero / all | | Locale lang | Zero / all |
|---|---|---|---|---|
| BR | **8 / 12** | | pt | 6 / 11 |
| MX | 4 / 6 | | en (incl. en-MX, en-BR) | 6 / 16 |
| US | 1 / 4 (es-MX locale) | | es | 2 / 6 |
| GB | 1 / 3 | | ru, zh, ro | 1 / 1 each |
| CN, RO, RU | 1 / 1 each | | none recorded | 0 / 4 |
| 11 others (EC 2, IL, PL, NG, SA, AO, AR, AU, CH, FR; 2 unknown) | 0 / 13 | | fr | 0 / 1 |

By build at last hello (the zero group mostly never came back, so for them this is the install build): build 9 = 5 zero / 3 creators, build 10 = 12 / 11, build 11 = **0 / 6**, no build (seeded or never said hello) = 0 / 4. Build 11 only had about three days on the store, so the 0 is a small sample.

## Failures (real users, all takes)

62 takes since 10-06: 37 committed, 25 failed (40%). All failures are from people who still ended up creating.

| errorCode / detail | Takes | Devices |
|---|---|---|
| `unparseable/not_understood` | 13 | 8 |
| `unparseable/no_time` | 9 | 6 |
| `unparseable/past_time` | 1 | 1 |
| `stt_failed` | 1 | 1 |
| `parse_failed` | 1 | 1 |

## Creators

- 24 people. Live reminders per creator: median 1, max 36 (Zurich, 10-28 → 10-29).
- **Time from first seen to first reminder: median 1.2 min** (n = 20 with a real `firstSeenAt`; 18 of 20 under 3 min, max 11 min). The 4 others are seeded or never-said-hello rows whose `firstSeenAt` *is* their first reminder.
- 9 of 24 came back on a later launch; 11 opened once; 4 unknown (`lastSeenAt = 0`).

## Duplicates and exclusions

**Founder (13 rows, high confidence).** All share en-AE + Asia/Dubai + iOS 26.6.2, the week-1 signature. The 4 week-1 tags (`066b3213`, `21ace7bb`, `48f004a3`, `935d87e6`, builds 8–9, dev updateIds `01a1…`), plus: `5ac9287a`, `407c55dc` (10-11, build 9; devlog: founder reinstalled 1.0.1/1.0.2 that day), `67ef8aee`, `4c3de917` (10-11, build 10 *before* 1.0.2 was on sale), `214b55ce`, `bdfaf774` (10-26, Arabic, the day the 1.0.3 RTL work was tested), `b339e98a`, `09279916`, `53865777` (10-26/27, dev updateIds `01a177c3`/`01a17865`, build 11 before release). No other en-AE row exists, so no real AE user was dropped. 45 takes and 11 live reminders sit on these rows.

**App Review (5, medium-high).** Pacific-time installs on a build that wasn't on sale yet, opened once, no takes: `87bbf773` (build 10, 10-11), `5eb10b61`, `e01da3ad` (build 11, 10-27 morning), `70832eef` (build 11, 10-27 23:26, a minute before the 23:27 release; medium), `9ecc08f8` (build 12, TestFlight only, 10-30).

**Probable device farm (4, medium).** Asia/Shanghai, iOS 27.0.1, en-US/en-CN, build 9, one open, no takes: `81aaaf6c` + `0521887a` (10-09, one minute apart), `1eaa0f3a` (10-12), `1825c452` (10-16, still on build 9 four days after build 10 shipped). Counted as real, they would make it 44 people with 21 zero (48%). The two zh-CN Shanghai rows are kept as real.

**Reinstall merges (same timezone + locale + iOS):**

| Merged | Why | Confidence |
|---|---|---|
| `cc0ec181` → `6be4837f` (Zurich, en-001, 26.7) | Rare combo; `cc0ec181` ran the embedded bundle inside `6be4837f`'s active window, so likely a second device, not a reinstall | High (same person) |
| `5a8702c6` → `81793eb3` (Guayaquil, es-EC, 27.0.1) | 26 h apart, windows don't overlap | Medium-high |
| `0437195d` → `75f9de8b` (Fortaleza, pt-BR, 26.6.2) | 3 days apart, both creators; 26.6.2 is common | Low-medium |
| `290724c1` → `df2b0c9c` (Shanghai, zh-CN, 27.0.1) | 4 days apart, both one open, no takes | Low-medium |

Not merged: same timezone + locale but different iOS (the en-MX, en-BR, en-GB and pt-BR São Paulo/Bahia groups).

**Seeded / never said hello, kept and flagged:** `4737b946` (10-04) and `12978b47` (10-05) are seeded rows with no metadata, both creators; `4737b946` could be the founder's 10-04 AE download (unverified). `539afd90` (PL) and `cc20df8b` (NG) have `lastSeenAt = 0` (old build, registered by a take), both creators. The 22 seeded rows from before 10-02 are out of scope.

## What this suggests

- **The activation gap is entirely pre-first-take.** 17 of 41 people (41%) made nothing, and not one of them reached the server with a take. Parsing failures cost retries, not users.
- **Most of the gap is the paid BR+MX cohort.** It has 2 of 11 creators, against 22 of 30 for everyone else. Organic installs activate at about 70–75%, so cheap ad installs (the 10-10 – 10-13 campaigns) were low-intent, or the pt/es first-run lost them.
- **Creators decide in about a minute.** The median first reminder lands 1.2 min after first open. Anyone who doesn't record in the first session almost never comes back (14 of 17 opened once).
- **Build 11 shows 0 zero-reminder installs (6 of 6 created)**, but only three days of data, so it isn't a verdict on 1.0.3.
- **What the data can't tell:** mic and notification permission denials, paywall or trial views, onboarding drop-off, client-side record errors (too short, upload failed) and cancelled takes aren't logged server-side. So "never tried" can't be split into "denied the mic", "hit the paywall" and "just left". RevenueCat `paywall_encounter` and a client `hello` field for permission state would close that. `takeOutcomes` covers 10-06 onward, and `creationJobs` is garbage-collected (2 rows left).
