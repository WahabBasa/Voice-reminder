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

