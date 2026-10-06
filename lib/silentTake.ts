import type { PendingTake } from "./pendingTakes";

/**
 * Catching a silent recording on the phone (OLD-137).
 *
 * A take whose microphone heard nothing used to be uploaded anyway. The server
 * transcribed silence, a fallback model invented a sentence for it ("Thank you
 * for watching."), and the take failed with a reason that pointed nowhere near
 * the microphone. The recorder already meters the input for the live level
 * meter, so the phone can tell a dead take before it spends an upload.
 *
 * Pure on purpose: the tracker folds the recorder's status samples, and the
 * decision reads the result. lib/audio.ts feeds the first, the stop-tap in
 * app/index.tsx asks the second.
 */

/**
 * The loudest a take may get and still count as silence, in dBFS.
 *
 * expo-av reports the recorder's average power per status tick, from -160
 * (nothing at all) up to 0. A dead or muted microphone sits at the floor, and a
 * quiet room with nobody talking sits around -50 to -60. Speech at phone
 * distance averages well above -35, a soft voice included. -45 sits between
 * the two with room to spare on the speech side: a take is only called silent
 * when its single loudest moment never reached it, so a false positive needs a
 * whole recording quieter than a quiet room.
 */
export const SILENCE_PEAK_DBFS = -45;

/**
 * Fewer level samples than this and the meter has not said enough to judge
 * (status ticks every 80ms, so this is about a quarter of a second). Such a take
 * goes through the normal path, never blocked for missing metering.
 */
export const MIN_LEVEL_SAMPLES = 3;

export type RecordingLevel = {
  /** The loudest sample of the take, in dBFS. Null when no sample arrived. */
  peakDb: number | null;
  /** How many level samples were folded in. */
  samples: number;
};

export const EMPTY_RECORDING_LEVEL: RecordingLevel = { peakDb: null, samples: 0 };

/** Fold one metering sample into the take's level. Non-finite samples are ignored. */
export function foldLevelSample(level: RecordingLevel, db: unknown): RecordingLevel {
  if (typeof db !== "number" || !Number.isFinite(db)) return level;
  return {
    peakDb: level.peakDb === null ? db : Math.max(level.peakDb, db),
    samples: level.samples + 1,
  };
}

/**
 * True only when the meter spoke enough and never rose above the threshold.
 * Missing, empty or thin metering always answers false: the take goes through.
 */
export function isSilentRecording(level: RecordingLevel | null | undefined): boolean {
  if (!level || level.peakDb === null) return false;
  if (level.samples < MIN_LEVEL_SAMPLES) return false;
  return level.peakDb <= SILENCE_PEAK_DBFS;
}

/**
 * What the stop-tap does with a freshly made take. A silent one is persisted
 * already failed (`errorKind: "silent"`), and nothing is uploaded and no job is
 * begun. Anything else carries on unchanged.
 */
export function planStopTap(
  take: PendingTake,
  level: RecordingLevel | null | undefined
): { take: PendingTake; upload: boolean } {
  if (!isSilentRecording(level)) return { take, upload: true };
  // A fresh take may always fail (recording_saved -> failed), so this is the
  // state machine's own move, spelled out without a branch that cannot happen.
  return { take: { ...take, phase: "failed", errorKind: "silent" }, upload: false };
}
