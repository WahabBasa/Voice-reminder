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
  const payload: PerfData = {
    t: Date.now(),
    traceId,
    scope,
    event,
    ...(data ?? {}),
  };
  console.log(`[VR PERF] ${JSON.stringify(payload)}`);
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
