import { Audio } from "expo-av";

/**
 * The preferred recording options for voice takes.
 *
 * Split out of lib/audio.ts so the numbers are pinned by a test instead of
 * living inline next to the metering wiring (D11).
 *
 * These used to be `Audio.RecordingOptionsPresets.HIGH_QUALITY`: 44.1kHz,
 * stereo, 128kbps. Speech headed for transcription needs none of that — the
 * model downsamples to 16kHz mono anyway — and the extra bytes were paid for
 * twice, once encoding on the device and once uploading. Same container and
 * codec (`.m4a` / AAC), at 32kbps on iOS and 64kbps on Android.
 *
 * iOS does not clamp unsupported settings: recorder preparation fails instead.
 * lib/audio.ts therefore retries with HIGH_QUALITY if this preset fails.
 * The release gate still checks the encoded metadata on-device.
 *
 * Web is carried over from HIGH_QUALITY untouched — there is no web build; it
 * exists because the type requires it.
 */
export const RECORDING_PRESET: Audio.RecordingOptions = {
  android: {
    extension: ".m4a",
    outputFormat: Audio.AndroidOutputFormat.MPEG_4,
    audioEncoder: Audio.AndroidAudioEncoder.AAC,
    sampleRate: 16000,
    numberOfChannels: 1,
    bitRate: 64000,
  },
  ios: {
    extension: ".m4a",
    outputFormat: Audio.IOSOutputFormat.MPEG4AAC,
    audioQuality: Audio.IOSAudioQuality.HIGH,
    sampleRate: 16000,
    numberOfChannels: 1,
    bitRate: 32000,
  },
  web: {
    mimeType: "audio/webm",
    bitsPerSecond: 128000,
  },
};

export const RECORDING_FALLBACK_PRESET = Audio.RecordingOptionsPresets.HIGH_QUALITY;
