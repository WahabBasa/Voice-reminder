# CL-2: Native — sibling-aware Done/Later intents

**Read first:** `docs/cadence-ladder-prd.md` (frozen contract), then
`plugins/ios-src/VRAlarmIntents.swift` and the Swift sources embedded in
`plugins/withAlarmKit.js` (`VRAlarmScheduler`, `VRAlarmIntentStore`). The five guards in
`docs/alarmkit-port-prd.md` remain mandatory — do not weaken them.

## Problem

The ladder schedules up to 3 real alarms per occurrence. Tapping Done (or Later) on one
rung must kill the remaining rungs natively — the app may never be opened, so JS
reconciliation alone is too late (the user would get "reminded" after acknowledging).

## Owns (do not touch other files)

- `plugins/ios-src/VRAlarmIntents.swift`
- `plugins/withAlarmKit.js` (Swift-in-JS: scheduler/store/bridge sources only)
- Contract tripwire tests for plugin sources under `__tests__/` (the existing AK tripwire
  test files that assert on plugin source content — extend those only)

## Tasks

- [ ] Verify how metadata reaches `VRAlarmIntentStore` at schedule time; ensure the
      `siblings` / `rung` / `rungCount` keys JS passes (PRD contract) are persisted per
      appKey and readable from both intents. Adapt storage if the store currently
      whitelists keys.
- [ ] `VRStopIntent.perform`: after the existing spurious-stop guard accepts the stop as
      real, read `siblings` from stored metadata for the resolved appKey and cancel each
      sibling appKey rotation-aware (the registry knows appKey → current UUID; reuse the
      scheduler's cancel, do not duplicate its logic). Empty/absent `siblings` → today's
      behavior exactly.
- [ ] `VRSnoozeIntent.perform`: cancel siblings the same way BEFORE scheduling the
      follow-up; follow-up scheduling itself is unchanged (single alarm, existing
      follow-up key convention, guard 4 sleep preserved).
- [ ] Clean up stored sibling metadata for cancelled keys so the store doesn't grow
      unbounded (match however the store currently evicts stopped alarms).
- [ ] Log one event per sibling-cancel into the existing event log (same channel the JS
      drain reads) so reconciliation can observe what the intent did.
- [ ] Tripwire tests: assert the plugin source contains sibling-cancel in both intents,
      guard order preserved (sibling-cancel strictly after the spurious-stop guard in
      Stop), and follow-up keys never treated as siblings.

## Acceptance

- `npx.cmd tsc --noEmit` clean; full jest suite passes (tripwires updated, none deleted).
- Reading the generated Swift: Done on rung 0 with `siblings=[k1,k2]` cancels both; Later
  cancels both then schedules its follow-up; a spurious stop during a snooze guard cancels
  nothing.

## Out of scope

JS-side ladder scheduling/reconcile (CL-3 passes the metadata; you consume it). Any
change to alert presentation, sound resolution, or the schedule bridge signature. EAS
builds (compile verification is the next cloud build's job — flag anything you're unsure
compiles).
