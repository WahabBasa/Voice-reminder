/**
 * Coverage for the voice-pipeline stage summary (OLD-82).
 *
 * The summary is assembled by listening to perfLog() calls that already exist
 * in components/RecordingOverlay.tsx and app/index.tsx, so these tests replay
 * that exact call sequence and assert on the single summary line.
 */

describe("perf stage summary", () => {
  let logSpy: jest.SpyInstance;
  let perf: typeof import("../../lib/perf");

  beforeEach(() => {
    jest.resetModules();
    process.env.EXPO_PUBLIC_VR_PERF_LOGS = "1";
    logSpy = jest.spyOn(console, "log").mockImplementation(() => {});
    perf = require("../../lib/perf");
  });

  afterEach(() => {
    logSpy.mockRestore();
    delete process.env.EXPO_PUBLIC_VR_PERF_LOGS;
  });

  function summaryLines(): string[] {
    return logSpy.mock.calls
      .map((c) => String(c[0]))
      .filter((line) => line.startsWith("[VR PERF SUMMARY]"));
  }

  function runFastPath(traceId: string, advance: (ms: number) => void) {
    perf.perfLog(traceId, "device.recording", "stop_tap");
    advance(120);
    perf.perfLog(traceId, "device.recording", "stopRecording_done");
    advance(10);
    perf.perfLog(traceId, "device.recording", "uri_ready");
    advance(5);
    perf.perfLog(traceId, "device.processing", "handleRecordingComplete_start");
    perf.perfLog(traceId, "device.processing", "upload_start");
    advance(400);
    perf.perfLog(traceId, "device.processing", "upload_done");
    advance(2000);
    perf.perfLog(traceId, "device.processing", "processVoiceReminderFast_done");
    advance(30);
    perf.perfLog(traceId, "device.processing", "local_addReminder_done");
  }

  it("emits exactly one summary line per run, at the terminal event", () => {
    let now = 1_000_000;
    jest.spyOn(Date, "now").mockImplementation(() => now);
    runFastPath("trace_a", (ms) => {
      now += ms;
    });

    const lines = summaryLines();
    expect(lines).toHaveLength(1);
  });

  it("reports per-stage deltas and the mic-stop -> card total", () => {
    let now = 1_000_000;
    jest.spyOn(Date, "now").mockImplementation(() => now);
    runFastPath("trace_b", (ms) => {
      now += ms;
    });

    const line = summaryLines()[0];
    expect(line).toContain("total=2565ms");
    expect(line).toContain("audioStop=120ms");
    expect(line).toContain("uriReady=10ms");
    expect(line).toContain("handoff=5ms");
    expect(line).toContain("upload=400ms");
    expect(line).toContain("convexAction=2000ms");
    expect(line).toContain("cardWrite=30ms");
    expect(line).toContain("path=fast");
    expect(line).toContain("trace=trace_b");
  });

  it("labels the base64 fallback path", () => {
    let now = 1_000_000;
    jest.spyOn(Date, "now").mockImplementation(() => now);

    perf.perfLog("trace_c", "device.recording", "stop_tap");
    now += 100;
    perf.perfLog("trace_c", "device.processing", "upload_done");
    now += 900;
    perf.perfLog("trace_c", "device.processing", "processVoiceReminder_done");
    now += 20;
    perf.perfLog("trace_c", "device.processing", "local_addReminder_done");

    const line = summaryLines()[0];
    expect(line).toContain("path=base64");
    expect(line).toContain("convexAction=900ms");
  });

  it("keeps concurrent runs separate", () => {
    let now = 1_000_000;
    jest.spyOn(Date, "now").mockImplementation(() => now);

    perf.perfLog("run_1", "device.recording", "stop_tap");
    perf.perfLog("run_2", "device.recording", "stop_tap");
    now += 50;
    perf.perfLog("run_1", "device.processing", "local_addReminder_done");
    now += 250;
    perf.perfLog("run_2", "device.processing", "local_addReminder_done");

    const lines = summaryLines();
    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain("total=50ms");
    expect(lines[0]).toContain("trace=run_1");
    expect(lines[1]).toContain("total=300ms");
    expect(lines[1]).toContain("trace=run_2");
  });

  it("omits stages whose endpoints never fired instead of printing NaN", () => {
    let now = 1_000_000;
    jest.spyOn(Date, "now").mockImplementation(() => now);

    perf.perfLog("trace_d", "device.processing", "handleRecordingComplete_start");
    now += 40;
    perf.perfLog("trace_d", "device.processing", "local_addReminder_done");

    const line = summaryLines()[0];
    expect(line).not.toContain("NaN");
    expect(line).not.toContain("upload=");
    expect(line).toContain("total=40ms");
  });

  it("does not grow unboundedly when runs never reach the terminal event", () => {
    let now = 1_000_000;
    jest.spyOn(Date, "now").mockImplementation(() => now);

    // Far more abandoned runs than the tracked-run cap.
    for (let i = 0; i < 200; i++) {
      perf.perfLog(`abandoned_${i}`, "device.recording", "stop_tap");
      now += 1;
    }
    // A completed run afterwards must still summarize correctly.
    perf.perfLog("trace_e", "device.recording", "stop_tap");
    now += 75;
    perf.perfLog("trace_e", "device.processing", "local_addReminder_done");

    const lines = summaryLines();
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain("total=75ms");
  });

  it("stays silent when perf logging is disabled", () => {
    process.env.EXPO_PUBLIC_VR_PERF_LOGS = "0";
    jest.resetModules();
    const quiet = require("../../lib/perf");
    quiet.perfLog("trace_f", "device.recording", "stop_tap");
    quiet.perfLog("trace_f", "device.processing", "local_addReminder_done");
    expect(summaryLines()).toHaveLength(0);
  });
});

describe("stall monitor gating", () => {
  afterEach(() => {
    jest.resetModules();
    delete process.env.EXPO_PUBLIC_VR_STALL_MONITOR;
    delete process.env.EXPO_PUBLIC_VR_PERF_LOGS;
  });

  it("does not start the per-frame loop unless explicitly opted in", () => {
    process.env.EXPO_PUBLIC_VR_PERF_LOGS = "1";
    jest.resetModules();
    const raf = jest.fn();
    (global as any).requestAnimationFrame = raf;

    const quiet = require("../../lib/perf");
    quiet.startStallMonitor();
    expect(raf).not.toHaveBeenCalled();
  });

  it("starts when EXPO_PUBLIC_VR_STALL_MONITOR=1", () => {
    process.env.EXPO_PUBLIC_VR_PERF_LOGS = "1";
    process.env.EXPO_PUBLIC_VR_STALL_MONITOR = "1";
    jest.resetModules();
    const raf = jest.fn();
    (global as any).requestAnimationFrame = raf;

    const loud = require("../../lib/perf");
    loud.startStallMonitor();
    expect(raf).toHaveBeenCalledTimes(1);
  });
});
