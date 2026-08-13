type PerfData = Record<string, unknown>;

function isEnabled(): boolean {
  const flag = process.env.EXPO_PUBLIC_VR_PERF_LOGS;
  if (flag === "0") return false;
  if (flag === "1") return true;
  return typeof __DEV__ !== "undefined" ? __DEV__ : true;
}

export function createTraceId(prefix = "vr"): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function perfLog(traceId: string, scope: string, event: string, data?: PerfData): void {
  if (!isEnabled()) return;
  // Runs before the console call so a stage is recorded even if the line below
  // is later silenced. Cost is one Set lookup for events we don't care about.
  recordStage(traceId, event);
  const payload: PerfData = {
    t: Date.now(),
    traceId,
    scope,
    event,
    ...(data ?? {}),
  };
  console.log(`[VR PERF] ${JSON.stringify(payload)}`);
}

// ============ Voice pipeline stage summary (OLD-82) ============
// One line per voice reminder, printed when the card lands, so a device run
// yields before/after numbers without reading a wall of [VR PERF] JSON.
//
// Every timestamp below is already emitted by existing perfLog() call sites in
// components/RecordingOverlay.tsx and app/index.tsx — this listens rather than
// adding instrumentation, so it costs nothing beyond a Map write per stage.

const STAGE_EVENTS = new Set([
  "stop_tap", // user lifts finger off the mic
  "stopRecording_done", // expo-av stopAndUnload + audio-session restore
  "uri_ready", // recording file handed to the caller
  "handleRecordingComplete_start",
  "upload_start",
  "upload_done", // audio in Convex storage
  "processVoiceReminderFast_done", // Whisper + Gemini + row insert
  "processVoiceReminder_done", // base64 fallback equivalent
  "local_addReminder_done", // card is in the store => visible
]);

const TERMINAL_EVENT = "local_addReminder_done";
const MAX_TRACKED_RUNS = 8;
const RUN_TTL_MS = 120_000;

type StageMarks = Record<string, number>;
const runs = new Map<string, StageMarks>();

function recordStage(traceId: string, event: string): void {
  if (!STAGE_EVENTS.has(event)) return;

  let marks = runs.get(traceId);
  if (!marks) {
    // Bound the map: drop the oldest run rather than grow without limit if a
    // pipeline ever fails before its terminal event.
    if (runs.size >= MAX_TRACKED_RUNS) {
      const oldest = runs.keys().next().value;
      if (oldest !== undefined) runs.delete(oldest);
    }
    marks = {};
    runs.set(traceId, marks);
  }
  // First write wins, so a retried stage can't rewrite history.
  if (marks[event] === undefined) marks[event] = Date.now();

  if (event === TERMINAL_EVENT) {
    emitSummary(traceId, marks);
    runs.delete(traceId);
    sweepStaleRuns();
  }
}

function sweepStaleRuns(): void {
  const cutoff = Date.now() - RUN_TTL_MS;
  for (const [id, marks] of runs) {
    const first = marks.stop_tap ?? marks.handleRecordingComplete_start;
    if (first !== undefined && first < cutoff) runs.delete(id);
  }
}

function span(marks: StageMarks, from: string, to: string): number | null {
  const a = marks[from];
  const b = marks[to];
  if (a === undefined || b === undefined) return null;
  return b - a;
}

function emitSummary(traceId: string, marks: StageMarks): void {
  const actionDone =
    marks.processVoiceReminderFast_done !== undefined
      ? "processVoiceReminderFast_done"
      : "processVoiceReminder_done";
  const path = marks.processVoiceReminderFast_done !== undefined ? "fast" : "base64";

  const stages: Array<[string, number | null]> = [
    // Splits the audio-session teardown out of the mic-stop wait: the
    // setAudioModeAsync category switch in lib/audio.ts is a co-suspect.
    ["audioStop", span(marks, "stop_tap", "stopRecording_done")],
    ["uriReady", span(marks, "stopRecording_done", "uri_ready")],
    ["handoff", span(marks, "uri_ready", "upload_start")],
    ["upload", span(marks, "upload_start", "upload_done")],
    ["convexAction", span(marks, "upload_done", actionDone)],
    ["cardWrite", span(marks, actionDone, TERMINAL_EVENT)],
  ];

  const start = marks.stop_tap ?? marks.handleRecordingComplete_start;
  const total = start !== undefined ? marks[TERMINAL_EVENT] - start : null;

  const parts = stages
    .filter(([, ms]) => ms !== null)
    .map(([name, ms]) => `${name}=${ms}ms`)
    .join(" ");

  console.log(
    `[VR PERF SUMMARY] micStop→card total=${total === null ? "?" : `${total}ms`} ${parts} path=${path} trace=${traceId}`
  );
}

// ============ JS Stall Monitor ============
// Tracks when the JS event loop stalls for > STALL_THRESHOLD_MS

const STALL_THRESHOLD_MS = 100;
let lastLoopTime = 0;
let stallMonitorActive = false;
let lastTapTraceId: string | null = null;
let lastTapTime = 0;

export function recordTap(traceId: string): void {
  lastTapTraceId = traceId;
  lastTapTime = Date.now();
}

function checkStall(): void {
  if (!isEnabled() || !stallMonitorActive) return;

  const now = Date.now();
  if (lastLoopTime > 0) {
    const delta = now - lastLoopTime;
    if (delta > STALL_THRESHOLD_MS) {
      const msSinceLastTap = lastTapTime > 0 ? now - lastTapTime : -1;
      perfLog(
        lastTapTraceId || "no_tap",
        "stall_monitor",
        "js_stall_detected",
        {
          stallMs: delta,
          msSinceLastTap,
          threshold: STALL_THRESHOLD_MS,
        }
      );
    }
  }
  lastLoopTime = now;
  requestAnimationFrame(checkStall);
}

export function startStallMonitor(): void {
  // Opt-in. This is a self-rescheduling requestAnimationFrame loop — a callback
  // every frame, forever, on the thread whose latency we're chasing. Useful
  // while hunting a stall, pure overhead the rest of the time, so it now needs
  // EXPO_PUBLIC_VR_STALL_MONITOR=1 rather than defaulting on in dev.
  if (process.env.EXPO_PUBLIC_VR_STALL_MONITOR !== "1") return;
  if (stallMonitorActive) return;
  stallMonitorActive = true;
  lastLoopTime = Date.now();
  requestAnimationFrame(checkStall);
  if (isEnabled()) {
    console.log("[VR PERF] Stall monitor started (threshold: " + STALL_THRESHOLD_MS + "ms)");
  }
}

export function stopStallMonitor(): void {
  stallMonitorActive = false;
}
