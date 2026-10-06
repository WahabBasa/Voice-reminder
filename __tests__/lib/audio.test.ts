jest.mock("react-native", () => ({
  Platform: { OS: "ios" },
  AppState: { currentState: "active", addEventListener: jest.fn() },
}));
jest.mock("expo-av", () => ({
  __esModule: true,
  Audio: {
    ...jest.requireActual("expo-av/src/Audio/RecordingConstants"),
    setAudioModeAsync: jest.fn().mockResolvedValue(undefined),
    Recording: { createAsync: jest.fn() },
  },
}));
jest.mock("@sentry/react-native", () => ({
  addBreadcrumb: jest.fn(),
  captureException: jest.fn(),
}));
jest.mock("react-native-volume-manager", () => ({ VolumeManager: null }));
jest.mock("react-native-sound", () => ({ __esModule: true, default: null }));
jest.mock("../../lib/perf", () => ({ perfLog: jest.fn() }));

import { Audio } from "expo-av";
import { AppState, type AppStateStatus } from "react-native";
import * as Sentry from "@sentry/react-native";
import {
  getLastRecordingLevel,
  getRecording,
  setMeteringListener,
  startRecording,
  stopRecording,
} from "../../lib/audio";
import { perfLog } from "../../lib/perf";
import { RECORDING_PRESET } from "../../lib/recordingPreset";

const createAsync = jest.mocked(Audio.Recording.createAsync);
const addEventListener = jest.mocked(AppState.addEventListener);
const removeListener = jest.fn();
const appState = AppState as { currentState: AppStateStatus };
const recorder = new Error("Prepare encountered an error: recorder not prepared.");
const prepareError = Object.assign(recorder, { code: "E_AUDIO_RECORDERNOTCREATED" });

beforeEach(() => {
  jest.clearAllMocks();
  createAsync.mockReset();
  appState.currentState = "active";
  addEventListener.mockReturnValue({ remove: removeListener } as any);
});

afterEach(async () => {
  jest.useRealTimers();
  setMeteringListener(null);
  await stopRecording();
});

// Lets every queued promise continuation run, without advancing fake timers.
async function flushPromises() {
  for (let i = 0; i < 10; i++) await Promise.resolve();
}

describe("waiting for the app to be active (OLD-132)", () => {
  it("starts immediately when the app is already active", async () => {
    createAsync.mockResolvedValueOnce(successfulRecording());

    await startRecording();

    expect(addEventListener).not.toHaveBeenCalled();
    expect(createAsync).toHaveBeenCalledTimes(1);
  });

  it("holds the recorder until AppState reports active, then cleans up", async () => {
    jest.useFakeTimers();
    appState.currentState = "inactive";
    const result = successfulRecording();
    createAsync.mockResolvedValueOnce(result);

    const started = startRecording();
    await flushPromises();
    expect(addEventListener).toHaveBeenCalledWith("change", expect.any(Function));
    expect(Audio.setAudioModeAsync).not.toHaveBeenCalled();
    expect(createAsync).not.toHaveBeenCalled();

    // A duplicate tap during the wait is still deduped.
    await startRecording();
    expect(addEventListener).toHaveBeenCalledTimes(1);

    const onChange = addEventListener.mock.calls[0][1];
    onChange("background");
    await flushPromises();
    expect(createAsync).not.toHaveBeenCalled();

    onChange("active");
    await started;
    expect(createAsync).toHaveBeenCalledTimes(1);
    expect(getRecording()).toBe(result.recording);
    expect(removeListener).toHaveBeenCalledTimes(1);
    expect(jest.getTimerCount()).toBe(0);
  });

  it("proceeds after the timeout if active never arrives", async () => {
    jest.useFakeTimers();
    appState.currentState = "inactive";
    createAsync.mockResolvedValueOnce(successfulRecording());

    const started = startRecording();
    await flushPromises();
    jest.advanceTimersByTime(1999);
    await flushPromises();
    expect(createAsync).not.toHaveBeenCalled();

    jest.advanceTimersByTime(1);
    await started;
    expect(createAsync).toHaveBeenCalledTimes(1);
    expect(removeListener).toHaveBeenCalledTimes(1);
  });

  it("releases the preparing guard when a start after the wait fails", async () => {
    jest.useFakeTimers();
    appState.currentState = "inactive";
    const error = new Error("Audio mode failed");
    jest.mocked(Audio.setAudioModeAsync).mockRejectedValueOnce(error);

    const started = startRecording();
    await flushPromises();
    addEventListener.mock.calls[0][1]("active");
    await expect(started).rejects.toBe(error);

    appState.currentState = "active";
    createAsync.mockResolvedValueOnce(successfulRecording());
    await startRecording();
    expect(createAsync).toHaveBeenCalledTimes(1);
  });
});

function successfulRecording() {
  return {
    recording: {
      stopAndUnloadAsync: jest.fn().mockResolvedValue(undefined),
      getURI: jest.fn().mockReturnValue("file:///take.m4a"),
    } as unknown as Audio.Recording,
    status: { isRecording: true } as Audio.RecordingStatus,
  };
}

it("retries a rejected preset once with HIGH_QUALITY and preserves metering", async () => {
  const result = successfulRecording();
  const listener = jest.fn();
  setMeteringListener(listener);
  createAsync.mockRejectedValueOnce(prepareError).mockResolvedValueOnce(result);

  await expect(startRecording()).resolves.toBeUndefined();

  expect(createAsync).toHaveBeenCalledTimes(2);
  const callback = createAsync.mock.calls[0][1]!;
  expect(createAsync).toHaveBeenNthCalledWith(1, { ...RECORDING_PRESET, isMeteringEnabled: true }, callback, 80);
  expect(createAsync).toHaveBeenNthCalledWith(2, { ...Audio.RecordingOptionsPresets.HIGH_QUALITY, isMeteringEnabled: true }, callback, 80);
  callback({ isRecording: true, metering: -24 } as Audio.RecordingStatus);
  expect(listener).toHaveBeenCalledWith(-24);
  expect(getRecording()).toBe(result.recording);
  const data = { preset: "RECORDING_PRESET", code: prepareError.code, message: prepareError.message };
  expect(Sentry.addBreadcrumb).toHaveBeenCalledWith(expect.objectContaining({ data }));
  expect(perfLog).toHaveBeenCalledWith(expect.any(String), "device.recording", "preset_failed", data);
});

it("throws after both presets reject and allows a subsequent start", async () => {
  const fallbackError = new Error("Fallback failed");
  createAsync.mockRejectedValueOnce(prepareError).mockRejectedValueOnce(fallbackError);

  await expect(startRecording()).rejects.toBe(fallbackError);
  expect(createAsync).toHaveBeenCalledTimes(2);
  expect(getRecording()).toBeNull();

  const result = successfulRecording();
  createAsync.mockResolvedValueOnce(result);
  await startRecording();
  expect(createAsync).toHaveBeenCalledTimes(3);
  expect(getRecording()).toBe(result.recording);
});

describe("the take's peak level (OLD-137)", () => {
  async function recordWith(samples: Array<Partial<Audio.RecordingStatus>>, traceId?: string) {
    createAsync.mockResolvedValueOnce(successfulRecording());
    await startRecording();
    const callback = createAsync.mock.calls[createAsync.mock.calls.length - 1][1]!;
    for (const sample of samples) callback(sample as Audio.RecordingStatus);
    await stopRecording(traceId);
    return getLastRecordingLevel();
  }

  it("keeps the loudest metering sample while recording, and still feeds the meter", async () => {
    const listener = jest.fn();
    setMeteringListener(listener);
    const level = await recordWith([
      { isRecording: true, metering: -160 },
      { isRecording: true, metering: -31 },
      { isRecording: true, metering: -48 },
      // Paused or stopped ticks are not the take.
      { isRecording: false, metering: -5 },
      { isRecording: true },
    ]);
    expect(level).toEqual({ peakDb: -31, samples: 3 });
    expect(listener).toHaveBeenCalledTimes(3);
  });

  it("starts every take from nothing", async () => {
    await recordWith([{ isRecording: true, metering: -10 }]);
    expect(await recordWith([])).toEqual({ peakDb: null, samples: 0 });
  });

  it("logs the peak with the stop's perf event", async () => {
    await recordWith(
      [
        { isRecording: true, metering: -70 },
        { isRecording: true, metering: -62 },
      ],
      "trace-1"
    );
    expect(perfLog).toHaveBeenCalledWith(
      "trace-1",
      "device.recording",
      "stopRecording_split",
      expect.objectContaining({ peakDb: -62, levelSamples: 2 })
    );
  });
});

it("does not retry an audio mode rejection", async () => {
  const error = new Error("Audio mode failed");
  jest.mocked(Audio.setAudioModeAsync).mockRejectedValueOnce(error);
  await expect(startRecording()).rejects.toBe(error);
  expect(createAsync).not.toHaveBeenCalled();
  expect(getRecording()).toBeNull();
});
