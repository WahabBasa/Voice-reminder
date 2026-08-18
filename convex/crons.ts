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

export default crons;
