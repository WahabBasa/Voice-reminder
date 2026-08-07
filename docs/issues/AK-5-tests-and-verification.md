# AK-5: Test plan, instrumentation audit, and device verification script

**Read first:** `docs/alarmkit-port-prd.md`. This issue makes the other four provable on a phone we can't cable-debug (no Mac — Sentry live logs are the only tape).

## Owns (do not touch other files)

- `docs/alarmkit-test-plan.md` (new)
- `__tests__/lib/alarmKitContract.test.ts` (new)

## Tasks

- [ ] Contract conformance test: a Jest suite that imports the PRD contract shape and asserts `lib/alarmKit.ts` (AK-4) exposes exactly those methods with safe no-op fallbacks when `NativeModules.AlarmKitBridge` is undefined. This test is the tripwire that catches contract drift between the parallel workstreams at merge time.
- [ ] Event-log semantics table tests: given sequences of native events (spurious stop after snooze; stop; fired-then-nothing), assert the documented reconciliation outcomes. Encode the FamWake race scenarios explicitly — these tests are the guards' spec.
- [ ] `docs/alarmkit-test-plan.md`: a numbered on-device script the user can run in 10 minutes, each step with the exact Sentry log line (`[VR][JS][alarmkit] event=...`) that proves it, covering:
  1. authorization prompt appears once (iOS 26)
  2. proof-of-life test alarm through locked+muted phone
  3. voice line as alarm sound (wav pipeline end-to-end)
  4. Done → completion recorded on open
  5. Later → follow-up fires without opening the app (guard 4)
  6. Later then Done on follow-up → chain ends (guard 2)
  7. Focus mode ON repeat of step 3
  8. regression: Android untouched — same reminder flow on the S21 behaves exactly as the 2026-08-06 device verification
- [ ] Audit AK-1..4 deliverables for vrLog coverage of every decision point listed in the plan; file gaps as review comments in the issue docs (append a "## Review findings" section), not code edits.

## Acceptance

- Contract test red against an empty stub, green against AK-4's wrapper.
- Test plan steps each map to at least one observable Sentry log line.

## Out of scope

Writing feature code. Editing other issues' files.
