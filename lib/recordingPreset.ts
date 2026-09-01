import { Audio } from "expo-av";

/**
 * The recording options every voice take is captured with.
 *
 * Split out of lib/audio.ts so the numbers are pinned by a test instead of
 * living inline next to the metering wiring (D11). lib/audio.ts keeps only the
 * spread and `isMeteringEnabled`.
 *
 * These used to be `Audio.RecordingOptionsPresets.HIGH_QUALITY`: 44.1kHz,
 * stereo, 128kbps. Speech headed for transcription needs none of that — the
 * model downsamples to 16kHz mono anyway — and the extra bytes were paid for
 * twice, once encoding on the device and once uploading. Same container and
 * codec (`.m4a` / AAC), a quarter of the bitrate.
 *
 * Note the platforms may clamp: an encoder that will not do 16kHz mono picks
 * the nearest thing it supports rather than failing, so the release gate is an
 * on-device check of the *encoded* metadata, not of this object.
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
    bitRate: 64000,
  },
  web: {
    mimeType: "audio/webm",
    bitsPerSecond: 128000,
  },
};
