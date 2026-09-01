# Creation pipeline P0+P1 — change spec v3 (2026-09-01)

Goal: reminder creation feels <1s (pending card on screen at stop-tap), real pipeline ~7.3s → ~4-5s,
card fills gradually (setting-up → transcript → parsed rows → armed). Grounded in the 2026-09-01
latency map and three Codex review rounds (sessions 01a05b35-750b, 01a05b54-44ac). v3 folds in the
round-3 delta findings (cited as Dx) on top of the 21 round-2 findings (Cx).

Out of scope: STT model swap, on-device transcription, chrono hint, typed-composer migration,
OLD-126. Parse model (gpt-5.6-luna) and whisper-1 unchanged. Legacy actions
(`processVoiceReminderFast`, `processVoiceReminder`, `processTypedReminder`) stay byte-identical
this wave; the typed composer keeps its legacy flow INCLUDING the auto-open edit sheet (C8).

Hard constraints: live shared Convex deployment (additive-only server changes); no AI-provider
names in user copy; per-file coverage thresholds; new pure modules 100% covered and added to BOTH
`collectCoverageFrom` and `coverageThreshold` in jest.config.js (C15).

---

## 1. Server (convex/) — two new files (D1)

- `convex/creationJobs.ts` — DEFAULT runtime: all public/internal queries and mutations below.
- `convex/creationJobActions.ts` — `"use node"`: ONLY the worker action `run` (a "use node" file
  may contain actions only).

### 1.1 Schema (additive) — convex/schema.ts

Table `creationJobs` (every field validated; C5):

```
{
  deviceId: v.string(),
  creationId: v.string(),                  // client UUID, idempotency key
  status: "pending"|"transcribed"|"committed"|"failed"|"cancelled",
  generation: v.number(),                  // bumped on retry; all writes CAS on it (C1)
  attempts: v.number(),                    // cap 3
  transcript: v.optional(v.string()),
  audioStorageId: v.optional(v.id("_storage")),
  reminderIds: v.optional(v.array(v.id("reminders"))),
  errorCode: v.optional(v.string()),       // storage_missing|stt_failed|parse_failed|unparseable|internal
  ackedAt: v.optional(v.number()),         // client confirmed import (D5)
  localDate: v.string(), localTime: v.string(), timezone: v.string(),
  perf: v.optional(v.object({ storageGetMs, blobMs, whisperMs, parseMs, commitMs, totalMs — all v.optional(v.number()) })),
  createdAt: v.number(), updatedAt: v.number(),
}
```

`reminders` table gains `creationId: v.optional(v.string())`, stamped at commit (additive; legacy
rows simply lack it; D5).

Indexes: `by_device_creation` (deviceId, creationId); `by_status_updated` (status, updatedAt).
All public functions verify deviceId ownership (OLD-74 rule).

Lifecycle/GC (C13, D5 — committed jobs must outlive slow clients): sweep deletes `cancelled` jobs
>24h old; `failed` jobs >7d old; `committed` jobs only when `ackedAt` is set OR >7d old. Terminal
statuses never regress (C1); `failed` is retryable-terminal.

### 1.2 `begin` (public mutation) — in creationJobs.ts

Args `{ deviceId, creationId, audioStorageId, localDate, localTime, timezone }`.
- Existing (deviceId, creationId) → return `{ jobId, status, generation }` unchanged; do NOT
  schedule another worker (idempotent; covers lost-response re-begin).
- Else insert `{ status:"pending", generation:1, attempts:1, ... }` and
  `ctx.scheduler.runAfter(0, internal.creationJobActions.run, { jobId, generation: 1 })` — atomic
  with the insert (D1). Return `{ jobId, status:"pending", generation:1 }`.

### 1.3 Worker — internal action `run({ jobId, generation })` in creationJobActions.ts (Node)

Guard on entry and at EVERY write: internal mutation `casPatch({ jobId, generation, expectStatus:
[...], patch })` (in creationJobs.ts) applies only if `job.generation === generation` && status ∈
expectStatus, bumps updatedAt, returns applied|stale. A stale worker (generation mismatch, or job
missing / failed / committed / cancelled / already past the expected status) exits silently (C1).

Steps, each timed:
1. Read job. Not `pending` at this generation → exit.
2. `ctx.storage.get(audioStorageId)` (→ storageGetMs; first time measured). Missing blob →
   terminal fail `storage_missing`.
3. arrayBuffer (blobMs) → whisper-1 (whisperMs; transport error → `stt_failed`).
4. Milestone: `casPatch(pending→transcribed, { transcript })`. Stale → exit (the winner owns
   cleanup).
5. Parse gpt-5.6-luna (parseMs; invalid JSON → `parse_failed`).
6. **Job-only strict validator** — new pure module `convex/creationValidate.ts`. It performs
   DIRECT predicate checks and never calls the legacy planners/builders, because those
   intentionally repair garbage (C7, D8): trimmed title non-empty ≤200 chars; date matches
   `YYYY-MM-DD` and round-trips to a real calendar date; time matches 24h `HH:MM`; timezone
   resolves as an IANA zone (Intl.DateTimeFormat construction succeeds); recurrence must equal one
   of the enumerated supported shapes field-for-field (no missing, extra, or coerced fields — any
   input the legacy builders would default, clamp, or repair is REJECTED here); a one-off's
   resolved instant must be strictly > Date.now(). All N plans validated before ANY write; one
   invalid item fails the whole take (`unparseable`). Legacy planners stay untouched.
7. `commit` internal mutation (1.4).
8. Any failure → `casPatch({pending,transcribed}→failed, { errorCode, perf: preCommitTimings })`.
   Audio RETAINED on failed (retry reuses it); a failed job's blob is deleted only at discard
   (1.5) or GC (1.6).

`totalMs`/`commitMs`: after commit succeeds, one best-effort `perfPatch` mutation that only merges
perf fields, never touches status; failure swallowed (C5).

### 1.4 `commit` + reads + `ack` — in creationJobs.ts

`commit({ jobId, generation, plans, preCommitPerf })`: CAS transcribed→committed at the matching
generation; else no-op `stale`. In one transaction: insert all N reminder rows (same field shape
`reminders.create` produces, plus `creationId` stamp; D5), schedule all N TTS actions (unchanged
`generateReminderTtsForReminder`), schedule recording-blob delete (cleanup inside commit; C6),
patch job `{ status:"committed", reminderIds (insertion order), perf: preCommitPerf }`.

`get` (public query) `{ deviceId, creationId }` → `{ status, generation, transcript, errorCode,
reminderIds, perf, updatedAt } | null` (perf included so the client can log server timings from
the watched doc; D7). This is the doc the client watches.

`getReminders` (public query) `{ deviceId, creationId }` (C14): requires job committed and
deviceId match, else null. Rows in `reminderIds` order, `_id` mapped to `id`, **`creationId`
included on every row** (N1), every schedule field, `audioStatus`/`audioExtrasStatus`, resolved
audio URLs exactly like existing public reads. Deleted rows → `{ id, deleted: true }`
placeholders.

`ack` (public mutation) `{ deviceId, creationId }`: committed → set `ackedAt` (idempotent);
anything else → no-op. Called by the client after a fully persisted import (2.4); releases the job
for GC (D5).

### 1.5 `cancel` / `retry` / `discard` (public mutations) — in creationJobs.ts

`cancel({ deviceId, creationId, orphanStorageId? })`:
- pending|transcribed → CAS → cancelled; schedule audio delete. `{ status:"cancelled" }`.
- committed → `{ status:"committed", reminderIds }` (cancel lost; client imports; committed rows
  are only deleted through the existing removal flow, and overflow/user deletes wait until the
  row's `audioStatus ∈ {ready, failed}`; C6).
- failed|cancelled → return current status (idempotent).
- missing → if `orphanStorageId` given, schedule its delete; return `{ status:"not_found" }` (C4).

`retry({ deviceId, creationId, newStorageId? })` (C13):
- Only from `failed` with attempts < 3: bump generation & attempts, set pending; if
  `newStorageId` differs from the current `audioStorageId`, schedule delete of the old blob and
  swap (equal IDs → no swap, no delete; D-list); schedule worker at the new generation.
- failed at cap → `{ status:"failed", capReached:true }` (client offers re-record, fresh
  creationId).
- Other status / missing → return current status / not_found; no-op. (`cap_unverified` never
  calls `retry` — that job is committed; its retry is a local entitlement re-check.)

`discard({ deviceId, creationId })`: failed|cancelled → schedule blob delete, delete the job row.
Other statuses → no-op with status returned.

### 1.6 Sweep — separate cron (C20)

`keepWarm` stays byte-identical. New 5-minute cron → `internal.creationJobs.sweepStale`
(default runtime), one bounded batch (≤25 docs total): (a) pending|transcribed with
`updatedAt < Date.now() - 5 * 60_000` (D9) → CAS at the job's CURRENT generation → failed
`internal`; (b) GC per 1.1 retention, scheduling blob deletes for swept jobs. Blob-deletion
failures are logged, not retried — orphaned blobs are bounded and harmless.

---

## 2. Client — outbox, pending card, reconciliation

### 2.1 PendingTake outbox — new `lib/pendingTakes.ts` (own AsyncStorage key)

```
{
  creationId, phase: "recording_saved"|"uploading"|"processing"|"transcribed"
                   |"committing"|"failed"|"cancelling",
  transcript?, errorKind?: "network"|"unparseable"|"server"|"cap_unverified",
  recordingUri (documents-dir copy), fragileUri?: boolean,   // true when copy failed and we
                                                             // kept the cache URI (D10)
  audioStorageId?, serverErrorCode?,
  localDate/localTime/timezone snapshot, createdAt, attempts,
}
```

There is NO `cap_unverified` phase — that state is `phase:"failed", errorKind:"cap_unverified"`
(D3). Never a `Reminder`: excluded from the reminders store, cap counting, today membership,
gestures, startup alarm sync. Pure state machine + persistence, 100% tested.

Failure handling at each hop: stop OK but documents-copy fails → keep cache URI, set
`fragileUri` (D10); copy OK but persist fails → one retry then surface the legacy blocking error
path (nothing optimistic shown yet); upload OK but storageId persist fails → next reconcile
re-uploads (begin idempotent; orphan blob handed to `cancel.orphanStorageId`). A `fragileUri`
recording found missing when needed (upload or retry): if `audioStorageId` exists → proceed, the
server blob is the source; else → `failed("server")` card offering "Record again" (D10).

### 2.2 Stop-tap flow (app/index.tsx)

At stop-tap, synchronously: `stopRecording` → **claim-and-clear `uploadUrlRef` into this take**
(C11) → copy file → persist PendingTake (`recording_saved`) → close overlay (perf mark
`stopTap→cardVisible`, target <300ms). Then detached: upload (`uploading`) → `creationJobs.begin`
(`processing`) → subscribe (2.7). The legacy voice client path (app/index.tsx:823-935, incl. the
base64 fallback) is REPLACED; the `voice_fallback_base64` Sentry event retires with it (C18).
Typed composer path untouched (C8).

### 2.3 Pending card — new `components/PendingTakeCard.tsx` + pure `lib/pendingCardContent.ts`

Above the Today list. Phase → copy: recording_saved/uploading/processing → "Setting up…"
(shimmer); transcribed → the transcript words; committing → transcript (brief);
failed(network) → "Couldn't reach the server — tap to retry"; failed(unparseable) → "Couldn't
turn that into a reminder — tap to try again"; failed(server) → "Something went wrong — tap to
retry"; failed(cap_unverified) → copy derived from
`getCapGateBlockContent("blocked_unverified", limit)` — pinned shared strings, no new variant
(C16). **Cancel (X) lives on this card** in every non-terminal phase (C4). Failed cards: tap =
retry dispatch (2.6), swipe = discard. Otherwise non-tappable.

### 2.4 Import — `commitTake` in new `lib/takeCommit.ts` (voice-job path only, C8)

Runs under a **store-level creation lock**: a single async mutex in lib/store.ts that ALSO wraps
legacy `addReminder`'s check-and-write (behavior unchanged, now serialized; C9).

Inside the lock, given a committed job:
1. `getReminders`; drop `deleted:true` placeholders. Build local rows using the JOB's timezone
   snapshot (C14).
2. Allowance once for the whole take, tri-state: pro → all; **confirmed-free → apply the existing
   per-item premium decisions FIRST (`drop_premium` for interval schedules, exactly as
   `planTakeAllowance` does today at lib/voiceTake.ts:207), then cap capacity on the remainder**
   (D6); unknown → `phase:"failed", errorKind:"cap_unverified"` and stop — no import, no server
   deletes, no upsell (OLD-127). Its retry re-checks entitlement locally and re-enters here (C13).
3. Set `phase:"committing"` (durable marker), then **upsert rows by `convexId`** — a row whose
   convexId already exists in the store is updated in place, never appended (C3) — with ONE
   Zustand set + ONE AsyncStorage write. Every imported row persists its `creationId` (the local
   `Reminder` type gains `creationId?: string`; N1). The upsert itself is the replay-idempotency
   mechanism; there is no skip-list to get out of sync (D2). **If the batch AsyncStorage write
   fails, restore the pre-write Zustand snapshot** so memory never diverges from disk (C3/N3);
   phase stays committing and the next reconcile replays the whole step safely.
4. Overflow/premium-dropped rows (confirmed-free): per-row server deletion queue that fires only
   once that row's `audioStatus ∈ {ready, failed}` (C6), retry/backoff; overflow UX copy
   unchanged.
5. Remove PendingTake + delete recording copy, then call `creationJobs.ack` (fire-and-forget with
   one retry; D5). If PendingTake removal fails → next reconcile finds `committing`, re-runs the
   idempotent upsert, and completes cleanup. Then existing scheduling
   (`scheduleTakeReminders` via InteractionManager) and audio hydration. `armedAt` = all
   scheduling attempts SETTLED (success or logged failure) (C18).
No edit-sheet auto-open on this path; rows appear + LayoutAnimation + existing toast.

### 2.5 Reconciliation — draining queue (C12) in `lib/takeReconcile.ts`

FIFO queue, 2 workers, single-flight per creationId, drained until empty. Enqueued from: startup,
cross-platform AppState foreground listener (new), and subscription terminal events. **Load
barrier first**: await outbox load + `loadReminders` + `loadHistory` (C10).

Dispatch by (local phase, server `get` result). `undefined` from a watch means NOT LOADED YET —
never dispatch on it; only a loaded `null` (no doc) takes the null branch (D-watch):

| local \ server | null (loaded) | pending/transcribed | committed | failed | cancelled |
|---|---|---|---|---|---|
| recording_saved/uploading | resume: upload if needed → begin | subscribe | import 2.4 | failed card (sync errorKind from errorCode) | remove local |
| processing/transcribed | re-begin (idempotent) | subscribe | import 2.4 | failed card | remove local |
| committing | see below (D4) | invariant-violation → failed("server") card (status can't regress; defensive) | import 2.4 (replay-safe) | failed card | remove local |
| failed | dispatch per §2.6 by errorKind (D4) | subscribe (a retry won) | import 2.4 | failed card (sync errorKind) | remove local |
| cancelling | cancel(orphanStorageId?) → remove | cancel → remove | import 2.4 (lost race) | discard → remove | remove local |

`committing + null` (job GC'd or vanished mid-import; D4): `getReminders` is unavailable, so — if
the store holds ≥1 row stamped with this `creationId`, the import evidently persisted: finish
cleanup (remove PendingTake, delete recording). **Only durably persisted rows count** — the 2.4
rollback rule guarantees the in-memory store never holds a stamped row whose AsyncStorage write
failed, so the store check is durable by construction (N3). Else → `failed("server")` card
offering "Record again". A late terminal update after the 90s watchdog re-enqueues; single-flight prevents
double import. GC interaction (D5): committed jobs persist ≥7d unless acked, so an offline or
killed client reconciles within that window; a GC'd failed job surfaces as `failed + null` →
§2.6 → re-record.

### 2.6 Cancel & retry dispatch (single source of truth; 2.5 defers here for failed+null; D4)

Cancel (from the card): set `cancelling`, then per the 2.5 table. Upload finishing after cancel:
the uploader checks phase before `begin`; if `cancelling` OR the PendingTake row is already gone →
hand the storageId to `cancel.orphanStorageId` (fire-and-forget, 3 retries) and stop (C4).

Retry (failed card tap), dispatch by errorKind + observed server status:
- network, no `audioStorageId`, server null → resume from upload (recording retained; if
  `fragileUri` file missing → "Record again", D10).
- network, `audioStorageId` set, server null → re-`begin` (idempotent).
- server status failed with `errorCode:"storage_missing"` → `retry({ newStorageId })` after
  re-uploading the retained recording; recording missing → "Record again".
- server status failed, other codes → `creationJobs.retry` (reuse blob). `capReached` → "Record
  again?" (fresh creationId).
- cap_unverified → local entitlement re-check → re-enter 2.4 (never `creationJobs.retry`).
- server null with non-network errorKind (e.g. failed job GC'd) → "Record again".
Discard (swipe on a failed card): `creationJobs.discard` + remove local + delete recording.

### 2.7 Subscription helper — new `lib/creationJobWatch.ts` (C2)

`convexClient.watchQuery(api.creationJobs.get, { deviceId, creationId })`; read
`watch.localQueryResult()` immediately and inside the zero-arg `onUpdate` callback; **`undefined`
= not loaded yet — wait, take no action; `null` = loaded-and-missing — dispatch the null branch**
(D-watch). Every read wrapped in try/catch (a thrown query → failed("server")); handlers on a
serialized promise chain. Disposal: on `failed`/`cancelled`, dispose immediately; **on
`committed`, dispatch reconciliation immediately but RETAIN the watch until `perf.commitMs`/
`totalMs` arrive via the later `perfPatch`, or a 10s telemetry timeout expires — then log
whatever perf fields exist and dispose** (C5/C18/N2). 90s watchdog → failed("network") locally,
job left for reconcile. Disposal covered by tests.

---

## 3. P0 standalone pieces

### 3.1 Recording preset — new pure module `lib/recordingPreset.ts` (D11)

Exports the preset object consumed by lib/audio.ts (which keeps only the spread + metering):
- android: `{ extension: ".m4a", outputFormat: AndroidOutputFormat.MPEG_4, audioEncoder:
  AndroidAudioEncoder.AAC, sampleRate: 16000, numberOfChannels: 1, bitRate: 64000 }`
- ios: `{ extension: ".m4a", outputFormat: IOSOutputFormat.MPEG4AAC, audioQuality:
  IOSAudioQuality.HIGH, sampleRate: 16000, numberOfChannels: 1, bitRate: 64000 }`
- web: existing values.
`lib/recordingPreset.ts` goes in both coverage lists at 100% with a pinning test (C21, D11).
Release gate BEFORE the OTA: on-device EN + AR + code-switch recordings via the dev client; verify
actual encoded metadata (platforms may clamp) and whisper-1 transcript + parsed fields vs the old
preset.

### 3.2 Audio hydration goes reactive — lib/audioHydration.ts (C2, C17)

Same `watchQuery` mechanics as 2.7 on `api.reminders.get`, including the
`undefined`-means-loading rule (D-watch). Preserve existing contracts: public API
`hydrateReminderAudio` unchanged (`startHydration` stays the injected intake callback); dedupe by
(convexId, localId); base audio before extras; `onSuccess` once; absent extras status = terminal.
Terminals: `audioStatus:"failed"` → stop, row stays silent; row null (loaded-missing) → stop;
query error → one re-watch retry then stop; overall timeout preserved as watchdog; startup resume
kept as kill/restart recovery. Dedicated new test suite.

### 3.3 Perf & telemetry — lib/perf.ts (C18, D7)

New summary keyed by `creationId` (persisted in the PendingTake — restart-safe):
`stopTap→cardVisible`, `transcriptAt`, `committedAt`, `armedAt` (settled semantics). Legacy alias
mapping, emitted alongside for continuity with old logs (exact mapping): `audioStop` → same
measurement; `upload` → same; `convexAction` → begin-call-to-committed-observed;
`cardWrite` → import (2.4 step 3) duration; `total` → stopTap→committed. Server perf logged from
the watched job doc's `perf` field (exposed in `get`; D7) as `convex_perf`, same as today's shape
plus `storageGetMs`. Sentry: retire `voice_fallback_base64`; add content-free breadcrumbs/tags
only — stage transitions and errorKind, never transcript or reminder content.

---

## 4. Rollout (C19)

0. Gates before any push: `npx.cmd convex codegen` (commit generated files — new modules must
   appear in api.d.ts; internal cross-file references may need explicit return validators — treat
   codegen success as a hard gate), `npx.cmd tsc --noEmit` (D-19), full
   `npm.cmd run test:coverage`, and golden contract tests pinning args/return shape of the three
   legacy actions.
1. Push convex/ (additive; legacy byte-identical).
2. Old-build device spot check: legacy voice + typed creation still work.
3. OTA the client. Legacy voice client path is dead code for new bundles; legacy actions retired
   in a later wave after adoption.

## 5. Tests

- New pure modules at 100%, in BOTH jest.config.js lists: pendingTakes machine,
  pendingCardContent, creationValidate, takeCommit allowance/upsert logic, recordingPreset.
- **Adopt `convex-test` (devDependency)** for creationJobs races (C15): begin idempotency
  (double-begin → one worker), stale-generation CAS no-ops (worker vs sweep vs retry),
  cancel-vs-commit both orders, retry generation bump + equal-storageId no-op swap, sweep
  predicate boundary + bounded batch + GC/ack retention rules, commit atomicity (rows +
  creationId stamps + TTS schedules + status together), getReminders projection/ownership,
  ack idempotency.
- Client suites for the round-3 corrections (D-list): committing replay after crash (upsert
  idempotency, no skip-list), committing+null recovery via creationId stamps, watch
  `undefined`-vs-`null` handling, premium `drop_premium`-then-cap ordering, fragileUri
  missing-file recovery, GC-boundary reconciliation.
- Update the pinned suites: voiceTake.test (job-path split; tri-state), perf.test (aliases),
  usageGate.test (reused copy), store.test + reminderStatus.test (creation lock seam),
  typedTake.test (must stay green UNCHANGED — proves C8), multiReminder/onceAtTimezone/reminders
  convex tests (legacy planner untouched — green unchanged), gridExecution/nagChain (untouched).
- New integration suites: creationJobWatch serialization/disposal, reactive hydration, the 2.5
  dispatch table, cross-writer cap race (voice job vs typed under the lock).
- Gates: `npx.cmd tsc --noEmit` + `npm.cmd run test:coverage` (judge printed results, not the
  Windows exit code).
