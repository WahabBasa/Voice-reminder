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
import * as Sentry from "@sentry/react-native";
import { getRecording, setMeteringListener, startRecording, stopRecording } from "../../lib/audio";
import { perfLog } from "../../lib/perf";
import { RECORDING_PRESET } from "../../lib/recordingPreset";

const createAsync = jest.mocked(Audio.Recording.createAsync);
const recorder = new Error("Prepare encountered an error: recorder not prepared.");
const prepareError = Object.assign(recorder, { code: "E_AUDIO_RECORDERNOTCREATED" });

beforeEach(() => {
  jest.clearAllMocks();
  createAsync.mockReset();
});

afterEach(async () => {
  setMeteringListener(null);
  await stopRecording();
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

it("does not retry an audio mode rejection", async () => {
  const error = new Error("Audio mode failed");
  jest.mocked(Audio.setAudioModeAsync).mockRejectedValueOnce(error);
  await expect(startRecording()).rejects.toBe(error);
  expect(createAsync).not.toHaveBeenCalled();
  expect(getRecording()).toBeNull();
});
