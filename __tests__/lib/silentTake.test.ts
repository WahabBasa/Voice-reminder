/**
 * Catching a silent recording on the phone (OLD-137).
 *
 * The decision is the contract: a take whose meter never rose above the
 * threshold fails locally with no upload, a take that rose above it goes
 * through, and a take the meter said nothing (or too little) about always goes
 * through. Blocking a real take for missing metering would be worse than the
 * bug this fixes.
 */
import {
  EMPTY_RECORDING_LEVEL,
  MIN_LEVEL_SAMPLES,
  SILENCE_PEAK_DBFS,
  foldLevelSample,
  isSilentRecording,
  planStopTap,
  type RecordingLevel,
} from "../../lib/silentTake";
import { newPendingTake } from "../../lib/pendingTakes";

const fold = (samples: unknown[]): RecordingLevel =>
  samples.reduce<RecordingLevel>((level, db) => foldLevelSample(level, db), EMPTY_RECORDING_LEVEL);

const freshTake = () =>
  newPendingTake({
    creationId: "c-1",
    recordingUri: "file:///cache/take.m4a",
    fragileUri: true,
    localDate: "2026-10-06",
    localTime: "09:00",
    timezone: "Europe/Stockholm",
    createdAt: 1,
  });

describe("the threshold", () => {
  it("is -45 dBFS: above a quiet room, well below speech", () => {
    expect(SILENCE_PEAK_DBFS).toBe(-45);
  });
});

describe("foldLevelSample", () => {
  it("keeps the loudest sample and counts every one", () => {
    expect(fold([-160, -50, -20, -38])).toEqual({ peakDb: -20, samples: 4 });
  });

  it("ignores samples that are not finite numbers", () => {
    expect(fold([undefined, NaN, Infinity, "loud", -60])).toEqual({ peakDb: -60, samples: 1 });
  });

  it("starts empty", () => {
    expect(EMPTY_RECORDING_LEVEL).toEqual({ peakDb: null, samples: 0 });
  });
});

describe("isSilentRecording", () => {
  it("calls a take silent when its peak never rose above the threshold", () => {
    expect(isSilentRecording(fold([-160, -160, -160, -160]))).toBe(true);
    expect(isSilentRecording(fold([-70, -58, -52]))).toBe(true);
    expect(isSilentRecording(fold([-60, SILENCE_PEAK_DBFS, -70]))).toBe(true);
  });

  it("lets a take through the moment its peak rises above the threshold", () => {
    expect(isSilentRecording(fold([-160, -44.9, -160]))).toBe(false);
    expect(isSilentRecording(fold([-60, -25, -60]))).toBe(false);
  });

  it("never blocks a take the meter said nothing about", () => {
    expect(isSilentRecording(EMPTY_RECORDING_LEVEL)).toBe(false);
    expect(isSilentRecording(null)).toBe(false);
    expect(isSilentRecording(undefined)).toBe(false);
  });

  it("never blocks on too few samples to judge", () => {
    const thin = fold(Array(MIN_LEVEL_SAMPLES - 1).fill(-160));
    expect(isSilentRecording(thin)).toBe(false);
    const enough = fold(Array(MIN_LEVEL_SAMPLES).fill(-160));
    expect(isSilentRecording(enough)).toBe(true);
  });
});

describe("the stop-tap's wiring in app/index", () => {
  // No renderer for the home screen, so the source is the evidence — same
  // pattern as usageGate.test and takeReconcile.test.
  const index = require("fs").readFileSync(
    require("path").resolve(__dirname, "../..", "app/index.tsx"),
    "utf8"
  ) as string;

  it("plans every stop-tap from the recorder's level and logs it", () => {
    expect(index).toContain("const level = getLastRecordingLevel();");
    expect(index).toContain("const { take, upload } = planStopTap(fresh, level);");
    expect(index).toMatch(/"take_level",\s*\{[^}]*peakDb: level\.peakDb/);
  });

  it("returns before the copy, the upload and the job for a silent take", () => {
    const stop = index.indexOf("if (!upload) {");
    expect(stop).toBeGreaterThan(-1);
    expect(stop).toBeLessThan(index.indexOf("copyRecordingToDocuments(creationId, audioUri)"));
    const block = index.slice(stop, index.indexOf("}", stop));
    expect(block).toContain("return;");
  });

  it("sends the failed card's report with the take's transcript", () => {
    expect(index).toContain("feedbackUi.openComposer(failedTakeFeedbackContext(take)");
  });
});

describe("planStopTap", () => {
  it("fails a silent take on the phone, with nothing to upload", () => {
    const take = freshTake();
    const plan = planStopTap(take, fold([-160, -160, -160, -160]));
    expect(plan.upload).toBe(false);
    expect(plan.take).toEqual({ ...take, phase: "failed", errorKind: "silent" });
  });

  it("sends a take with a voice in it exactly as it was", () => {
    const take = freshTake();
    expect(planStopTap(take, fold([-160, -22, -40]))).toEqual({ take, upload: true });
  });

  it("sends a take with no metering exactly as it was", () => {
    const take = freshTake();
    expect(planStopTap(take, EMPTY_RECORDING_LEVEL)).toEqual({ take, upload: true });
    expect(planStopTap(take, undefined)).toEqual({ take, upload: true });
  });
});
