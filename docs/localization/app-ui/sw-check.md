# sw review (independent check, 2026-10-10)

Validator: `[sw] PASS: 426 keys (en 426), 0 errors, 16 warnings` (all pre-existing and intended).

## Changed strings

| key | before | after | back-translation | why |
|---|---|---|---|---|
| `notificationsOff.message` | Ziwashe katika Mipangilio ili upate arifa | Ziwashe katika Settings ili upate arifa | Turn them on in Settings to get alerts | Tapping the toast opens iOS Settings (`lib/notificationsOffNotice.ts`, `openNotificationSettingsSafe`). iOS isn't in Swahili, so the user's screen says "Settings". |
| `times.mode.interval` | Kipindi | Kwa vipindi | At intervals | "Kipindi" alone reads as "a period / session". The chip is the repeat-every-N-minutes mode. |

## Not changed, noted

- iOS paths (Settings › Apple Account › Subscriptions, Screen Time, App Store) are already in English everywhere.
- "Nimemaliza" (I'm done) for Done matches Android Swahili and suits the alarm stop button.
- Weekday short forms Jpi/Jtt/Jnn/Jtn/Alh/Iju/Jmo are an app convention, not CLDR (CLDR uses full names). Readable, but worth a native skim. Narrow letters are CLDR's English-style M T W….
- `paywall.table.row.schedules` "Siku za wiki" (days of the week) already matches the feature.
- Legal disclosures checked clause by clause: exact. Remi is animate (Remi amesikia / anasema), which is natural and has no gender.

## Verdict

**SHIP.** Confidence: medium-high. The everyday register is natural (Google/Android terms). Before release, confirm that iOS offers Swahili in Remi's per-app language list, or that Remi's own picker covers it.
