import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Keep the `"use node"` container hot (OLD-106).
//
// convex/actions.ts declares `"use node"`, so every parse runs in a Node
// container that Convex spins down once it is idle. A user who opens the app
// after a quiet hour pays that boot on their first reminder: the worst run we
// captured was 18.4s wall against a 1.5s action, i.e. ~17s spent before the
// handler's own clock started.
//
// Five minutes is chosen to sit under the idle-eviction window while staying
// cheap — 288 no-op invocations a day, no external calls, no writes.
crons.interval(
  "keep node runtime warm",
  { minutes: 5 },
  internal.actions.keepWarm,
  {}
);

// Creation jobs that lost their worker, and the ones nobody needs any more.
//
// Its own entry rather than a second call inside keepWarm (C20): keepWarm is a
// deliberate no-op whose whole value is that it does nothing but be invoked, and
// hanging database work off it would make a failing sweep look like a cold
// container. This one runs in the DEFAULT runtime, so it also does not care
// whether the Node container is up.
//
// Five minutes matches the staleness window it enforces (convex/creationJobs.ts
// STALE_AFTER_MS), so a job whose worker died is failed roughly within one
// window of going quiet — long enough that a slow Whisper call is never mistaken
// for a dead one.
crons.interval(
  "sweep stale creation jobs",
  { minutes: 5 },
  internal.creationJobs.sweepStale,
  {}
);

// Founder alerts (OLD-135). The daily summary fires at 05:00 UTC, which is
// 09:00 in the UAE where the founder reads it; it always sends, even on a quiet
// day, so a missing email means the cron is broken rather than nobody came.
crons.cron(
  "founder daily summary",
  "0 5 * * *",
  internal.founderAlerts.dailySummary,
  {}
);

// The take-outcome log keeps 30 days. Daily, ahead of the summary; a backlog
// larger than one batch reschedules itself until it is clear.
crons.cron(
  "prune take outcomes",
  "30 4 * * *",
  internal.founderAlerts.pruneOutcomes,
  {}
);

export default crons;
