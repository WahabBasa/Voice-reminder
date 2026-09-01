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

/**
 * The creation-job summary (spec §3.3).
 *
 * The job pipeline has no single trace id: a take outlives the screen that
 * started it and can be finished by a reconciliation pass that never saw the
 * microphone. Its `creationId` is the only key that spans all of that, so the
 * summary hangs off that instead — and the legacy alias line is emitted
 * alongside it so old device logs and new ones can be read against each other
 * through the rollout.
 */
describe("creation summary", () => {
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

  function lines(prefix: string): string[] {
    return logSpy.mock.calls.map((c) => String(c[0])).filter((line) => line.startsWith(prefix));
  }

  /** One take, end to end, with a controllable clock. */
  function runTake(creationId: string, advance: (ms: number) => void, stopTapAt?: number) {
    perf.markCreation(creationId, "stopTap", stopTapAt);
    advance(120);
    perf.markCreation(creationId, "stopRecordingDone");
    advance(80);
    perf.markCreation(creationId, "cardVisible");
    perf.markCreation(creationId, "uploadStart");
    advance(400);
    perf.markCreation(creationId, "uploadDone");
    perf.markCreation(creationId, "beginCalled");
    advance(1500);
    perf.markCreation(creationId, "transcriptAt");
    advance(500);
    perf.markCreation(creationId, "committedAt");
    perf.markCreation(creationId, "importStart");
    advance(30);
    perf.markCreation(creationId, "importDone");
    advance(70);
    perf.markCreation(creationId, "armedAt");
  }

  it("emits exactly one summary per take, at armedAt, measured from stop-tap", () => {
    let now = 1_000_000;
    jest.spyOn(Date, "now").mockImplementation(() => now);
    runTake("take_a", (ms) => {
      now += ms;
    });

    const summaries = lines("[VR CREATION SUMMARY]");
    expect(summaries).toHaveLength(1);
    expect(summaries[0]).toContain("cardVisible=200ms");
    expect(summaries[0]).toContain("transcriptAt=2100ms");
    expect(summaries[0]).toContain("committedAt=2600ms");
    expect(summaries[0]).toContain("armedAt=2700ms");
    expect(summaries[0]).toContain("creation=take_a");
  });

  it("emits the legacy alias line alongside it, mapped exactly as the spec says", () => {
    let now = 1_000_000;
    jest.spyOn(Date, "now").mockImplementation(() => now);
    runTake("take_b", (ms) => {
      now += ms;
    });

    const legacy = lines("[VR PERF SUMMARY]");
    expect(legacy).toHaveLength(1);
    // audioStop = stopTap → stopRecordingDone
    expect(legacy[0]).toContain("audioStop=120ms");
    // upload = uploadStart → uploadDone
    expect(legacy[0]).toContain("upload=400ms");
    // convexAction = begin-call → committed-observed
    expect(legacy[0]).toContain("convexAction=2000ms");
    // cardWrite = the import itself (2.4 step 3)
    expect(legacy[0]).toContain("cardWrite=30ms");
    // total = stopTap → committed
    expect(legacy[0]).toContain("total=2600ms");
    expect(legacy[0]).toContain("path=job");
    expect(legacy[0]).toContain("trace=take_b");
  });

  it("takes the stop-tap timestamp from the overlay, which is the only place it exists", () => {
    let now = 1_000_000;
    jest.spyOn(Date, "now").mockImplementation(() => now);

    perf.markCreation("take_c", "stopTap", now - 300);
    perf.markCreation("take_c", "armedAt");

    expect(lines("[VR CREATION SUMMARY]")[0]).toContain("armedAt=300ms");
  });

  it("keeps the first mark — a replayed stage cannot rewrite history", () => {
    let now = 1_000_000;
    jest.spyOn(Date, "now").mockImplementation(() => now);

    perf.markCreation("take_d", "stopTap");
    now += 500;
    perf.markCreation("take_d", "stopTap");
    now += 100;
    perf.markCreation("take_d", "armedAt");

    expect(lines("[VR CREATION SUMMARY]")[0]).toContain("armedAt=600ms");
  });

  it("omits stages it never saw instead of printing NaN", () => {
    let now = 1_000_000;
    jest.spyOn(Date, "now").mockImplementation(() => now);

    perf.markCreation("take_e", "stopTap");
    now += 40;
    perf.markCreation("take_e", "armedAt");

    const summary = lines("[VR CREATION SUMMARY]")[0];
    expect(summary).not.toContain("NaN");
    expect(summary).not.toContain("transcriptAt=");
    expect(summary).toContain("armedAt=40ms");
    expect(lines("[VR PERF SUMMARY]")[0]).toContain("total=?");
  });

  it("forgets a take that will never arm", () => {
    let now = 1_000_000;
    jest.spyOn(Date, "now").mockImplementation(() => now);

    perf.markCreation("take_f", "stopTap");
    perf.dropCreationRun("take_f");
    now += 50;
    perf.markCreation("take_f", "armedAt");

    // The run restarted from armedAt alone: no stopTap, so no spans at all.
    const summary = lines("[VR CREATION SUMMARY]")[0];
    expect(summary).toContain("creation=take_f");
    expect(summary).not.toContain("armedAt=");
  });

  it("keeps concurrent takes apart", () => {
    let now = 1_000_000;
    jest.spyOn(Date, "now").mockImplementation(() => now);

    perf.markCreation("run_1", "stopTap");
    perf.markCreation("run_2", "stopTap");
    now += 50;
    perf.markCreation("run_1", "armedAt");
    now += 250;
    perf.markCreation("run_2", "armedAt");

    const summaries = lines("[VR CREATION SUMMARY]");
    expect(summaries).toHaveLength(2);
    expect(summaries[0]).toContain("armedAt=50ms");
    expect(summaries[1]).toContain("armedAt=300ms");
  });

  it("does not grow unboundedly when takes never arm", () => {
    let now = 1_000_000;
    jest.spyOn(Date, "now").mockImplementation(() => now);

    for (let i = 0; i < 200; i++) {
      perf.markCreation(`abandoned_${i}`, "stopTap");
      now += 1;
    }
    perf.markCreation("take_g", "stopTap");
    now += 75;
    perf.markCreation("take_g", "armedAt");

    const summaries = lines("[VR CREATION SUMMARY]");
    expect(summaries).toHaveLength(1);
    expect(summaries[0]).toContain("armedAt=75ms");
  });

  it("logs the server's own timings as convex_perf, under the creationId", () => {
    perf.logCreationServerPerf("take_h", { whisperMs: 900, parseMs: 700, totalMs: 2400 });

    const line = logSpy.mock.calls
      .map((c) => String(c[0]))
      .find((l) => l.includes("convex_perf"));
    expect(line).toBeDefined();
    expect(line).toContain('"traceId":"take_h"');
    expect(line).toContain('"whisperMs":900');
  });

  it("stays silent when perf logging is disabled", () => {
    process.env.EXPO_PUBLIC_VR_PERF_LOGS = "0";
    jest.resetModules();
    const quiet = require("../../lib/perf");
    quiet.markCreation("take_i", "stopTap");
    quiet.markCreation("take_i", "armedAt");
    expect(lines("[VR CREATION SUMMARY]")).toHaveLength(0);
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
