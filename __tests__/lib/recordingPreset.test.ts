/**
 * Pinning test for the voice-take recording preset (spec §3.1, D11).
 *
 * These numbers decide what every recording sounds like on the way to
 * transcription, and nothing in the app reads them back — a typo would only
 * show up as a worse transcript weeks later. So they are pinned as literals,
 * and the expo-av enum members are pinned separately against the same literals
 * so a library bump that renumbers them cannot slip through as a silently
 * different container or encoder.
 *
 * expo-av cannot be imported under jest (its index reaches for the ExponentAV
 * native module and jest-expo has no mock for it), so `Audio` here is the real
 * RecordingConstants module — the actual enum values the app compiles against,
 * just without the native surface around them.
 */
jest.mock("expo-av", () => ({
  __esModule: true,
  Audio: jest.requireActual("expo-av/src/Audio/RecordingConstants"),
}));

import { Audio } from "expo-av";
import { RECORDING_PRESET } from "../../lib/recordingPreset";

describe("RECORDING_PRESET", () => {
  it("captures android as 16kHz mono AAC in an .m4a at 64kbps", () => {
    expect(RECORDING_PRESET.android).toEqual({
      extension: ".m4a",
      outputFormat: 2, // AndroidOutputFormat.MPEG_4
      audioEncoder: 3, // AndroidAudioEncoder.AAC
      sampleRate: 16000,
      numberOfChannels: 1,
      bitRate: 64000,
    });
  });

  it("captures ios as 16kHz mono MPEG4-AAC in an .m4a at 64kbps, HIGH quality", () => {
    expect(RECORDING_PRESET.ios).toEqual({
      extension: ".m4a",
      outputFormat: "aac ", // IOSOutputFormat.MPEG4AAC
      audioQuality: 0x60, // IOSAudioQuality.HIGH
      sampleRate: 16000,
      numberOfChannels: 1,
      bitRate: 64000,
    });
  });

  it("keeps the web values it inherited from HIGH_QUALITY", () => {
    expect(RECORDING_PRESET.web).toEqual({
      mimeType: "audio/webm",
      bitsPerSecond: 128000,
    });
  });

  it("names those numbers through the expo-av enums, not by hand", () => {
    expect(Audio.AndroidOutputFormat.MPEG_4).toBe(2);
    expect(Audio.AndroidAudioEncoder.AAC).toBe(3);
    expect(Audio.IOSOutputFormat.MPEG4AAC).toBe("aac ");
    expect(Audio.IOSAudioQuality.HIGH).toBe(0x60);

    expect(RECORDING_PRESET.android.outputFormat).toBe(Audio.AndroidOutputFormat.MPEG_4);
    expect(RECORDING_PRESET.android.audioEncoder).toBe(Audio.AndroidAudioEncoder.AAC);
    expect(RECORDING_PRESET.ios.outputFormat).toBe(Audio.IOSOutputFormat.MPEG4AAC);
    expect(RECORDING_PRESET.ios.audioQuality).toBe(Audio.IOSAudioQuality.HIGH);
  });

  it("leaves metering to the caller (lib/audio.ts adds it)", () => {
    expect(RECORDING_PRESET.isMeteringEnabled).toBeUndefined();
  });

  it("keeps HIGH_QUALITY's container while dropping its bitrate, rate and channel", () => {
    const high = Audio.RecordingOptionsPresets.HIGH_QUALITY;

    // What it replaced: 44.1kHz stereo at 128kbps.
    expect(high.android.sampleRate).toBe(44100);
    expect(high.android.numberOfChannels).toBe(2);
    expect(high.android.bitRate).toBe(128000);

    // Same container and codec, so nothing downstream has to change.
    expect(RECORDING_PRESET.android.extension).toBe(high.android.extension);
    expect(RECORDING_PRESET.android.outputFormat).toBe(high.android.outputFormat);
    expect(RECORDING_PRESET.ios.extension).toBe(high.ios.extension);
    expect(RECORDING_PRESET.ios.outputFormat).toBe(high.ios.outputFormat);
  });
});
