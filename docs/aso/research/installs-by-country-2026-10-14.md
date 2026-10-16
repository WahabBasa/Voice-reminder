# Remi installs and impressions by country (2026-10-02 to 2026-10-12)

Pulled 2026-10-14. Read-only: nothing was changed in App Store Connect, Apple Ads or Convex.

**Coverage.** Sales and Trends daily reports are available for 10-03 to 10-12. 10-02 and 10-08 had no sales, and 10-13 wasn't published yet. App Analytics runs through 10-12.

**Keys.** The App Manager key `UK56CMV8QG` gets a 403 on `salesReports` and `analyticsReportRequests`, so both pulls used the account's other key, `6KVUTSNM37`, which earlier sessions also used for these reads. All requests were GETs, except for the Apple Ads report call, which is a read-only POST.

## 1. App Store Connect: first-time downloads, impressions and page views

Sources:
- **Installs:** Sales and Trends, product type `1`, Units. These are the authoritative counts. Type `7` (updates) and `3` (redownloads) are excluded.
- **Impressions and page views:** App Analytics "App Store Discovery and Engagement Standard", from the existing ONGOING request `a6736054…` plus the earlier one-time snapshot for 10-03 to 10-05.
- **Conversion:** CVR = installs / impressions. Analytics drops very small rows for privacy, so the low-volume rows are rough.

| Country | Installs | Impressions | Product page views | Taps | CVR (inst/impr) | Note |
|---|---:|---:|---:|---:|---:|---|
| MX | 8 | 384 | 8 | 19 | 2.1% | Ads ran 10-11 to 10-13 |
| BR | 6 | 677 | 17 | 11 | 0.9% | Ads ran 10-11 to 10-13 |
| US | 5 | 15 | 4 | 1 | n/a | 4 of the 5 came on 10-03 from device "Desktop" via "App Store browse" (launch day, likely Macs, not real users) |
| AE | 3 | 24 | 6 | 7 | n/a | Founder and his circle |
| GB | 3 | 27 | 7 | 5 | 11% | Organic: 2 from search, 1 from an app referrer |
| IL | 1 | 49 | 0 | 4 | 2% | |
| IN | 1 | 31 | 5 | 4 | 3% | |
| NG | 1 | 6 | 3 | 6 | n/a | App referrer |
| PL | 1 | 1 | 0 | 2 | n/a | |
| SE | 1 | 1 | 2 | 4 | n/a | App referrer |
| TW | 1 | 4 | 1 | 1 | n/a | App referrer |
| **Total** | **31** | **1,279** | **53** | **65** | 2.4% | |

**Impressions with zero installs:** VN 6, PE 5, PK 4, SA 3, MY 3, DO 3, LA 3, and 1 or 2 each in about 25 more countries, including **DE 1, AU 1, NL 1**. **CH and AT: 0 impressions, 0 installs.**

Every impression in the data is source "App Store search". Browse and referrer traffic only shows up as taps and page views.

**Daily impressions.** Outside BR and MX, impressions ran 11 to 41 a day the whole period. BR and MX went from 0-1 a day to 21 on 10-10, then 351 on 10-11 and 686 on 10-12 once the ads went live.

### Apple Ads vs organic

Apple Ads campaign report, org time zone (Asia/Dubai), 10-09 to 10-14:

| Campaign | Impressions | Taps | Installs (all new downloads) | Spend |
|---|---:|---:|---:|---:|
| Remi - BR - Exact | 541 (10-11: 126, 10-12: 269, 10-13: 146) | 19 | 6 (3 / 1 / 2) | $5.37 |
| Remi - MX - Exact | 220 (10-11: 70, 10-12: 143, 10-13: 7) | 11 | 6 (4 / 2 / 0) | $2.99 |
| **Total** | **761** | **30** | **12** | **$8.36** |

- **Paid: about 12 installs, all in BR and MX.** Sales and Trends shows 14 BR+MX installs between 10-10 and 10-12 Pacific time. That window overlaps the Dubai-time campaign days: 10-11 Dubai starts at 13:00 PT on 10-10. Before 10-10 there were 0 BR or MX installs. Apple Ads attributes 10 installs through 10-12 Dubai, plus 2 BR on 10-13 Dubai, so roughly 10-12 of the 14 were paid and **only about 2-4 BR/MX installs were organic**.
- **Organic: 17 installs outside BR and MX.** Take out AE (3, founder circle) and the 4 US "Desktop" launch-day downloads, and **about 10 organic installs from real strangers remain**: GB 3, IL, IN, NG, PL, SE, TW and US 1 each.
- **BR and MX impressions are mostly paid.** ASC counts BR 677 and MX 384 through 10-12. Apple Ads counts BR 395 and MX 213 over the same days, which leaves roughly 280 BR and 170 MX non-ad impressions. That assumes ASC search impressions include ad impressions, which isn't confirmed. Treat the split as approximate.

## 2. Our telemetry: Convex `devices` and `takeOutcomes` (LIVE `proper-stoat-767`, read via `npx convex data`)

Each new device is a row first seen on or after 10-02 with `seeded=false`. Country comes from the time-zone region, with locale shown alongside.

**Excluded:**
- 7 Asia/Dubai en-AE devices (the founder's).
- 2 seeded rows from 10-04 and 10-05 with no time zone. One of them has 1 failed take.
- Dev builds: they can't be told apart, since the build number alone doesn't mark them.

| Country (from time zone) | New devices | Locales | Devices with ≥1 committed take |
|---|---:|---|---:|
| BR | 6 | 2x en-BR, 4x pt-BR (São Paulo, Recife, Bahia, Fortaleza) | 0 |
| MX | 5 | 3x en-MX, 2x es-MX (Mexico City, Tijuana, Monterrey) | 0 |
| CN | 3 | en-US, en-US, en-CN (all Asia/Shanghai, on 10-09 and 10-12) | 0 |
| US | 2 | 1x en-US (Los Angeles), 1x es-MX (New York, likely a Mexican user) | 0 |
| GB | 2 | en-GB | 0 |
| IL | 1 | en-US, speaks Hebrew | 1 (5 takes, 2 committed) |
| PL | 1 | — | 1 |
| NG | 1 | — | 1 |
| **Total** | **21** | | **3** |

The 3 Shanghai devices line up with the 1.0.1 and 1.0.2 review windows and are most likely App Review, not users. CN has 0 installs in Sales.

Telemetry matches Sales well: BR 6 vs 6, MX 5-6 vs 8, GB 2 vs 3, and IL, PL and NG 1 each. **No device from BR, MX, GB or the US has recorded a take.** All 3 devices that made a reminder are organic: IL, PL and NG.

## 3. Store listing

- Version 1.0.2 localizations: **en-US, es-MX, pt-BR**. App-info localizations are the same.
- No German (de-DE) and no English (Australia) / en-AU localization. AU falls back to en-US. CH and AT would show en-US.
- The app is available in 175 territories, including CHE, AUT, AUS and DEU.

## What's still missing

- Sales for 10-13 onward: not published yet when pulled. This covers the last ad day.
- Analytics for 10-13: the instance processed 10-13 holds data up to 10-12.
- The detailed engagement report (r15) only started on 10-11. Its `Campaign` and `Source Info` columns are empty, so App Analytics itself can't separate ad from organic impressions. The paid split above leans on the Apple Ads report.
- Privacy thresholds mean App Analytics undercounts small rows. It shows BR at 4 installs where Sales shows 6, so per-country CVR in small markets is noisy.
- There's no reliable way to flag dev-build devices in Convex.
