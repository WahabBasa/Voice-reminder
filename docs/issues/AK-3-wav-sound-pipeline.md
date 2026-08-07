# AK-3: Alarm-ready WAV pipeline (ElevenLabs → Convex → Library/Sounds)

**Read first:** `docs/alarmkit-port-prd.md` (Sound pipeline section). Current TTS flow lives in `convex/helpers.ts`; client download in `lib/audioHydration.ts` (read, don't edit).

## Problem

Alarm sounds must be wav/aiff/caf named resources in the app's `Library/Sounds`; our TTS files are mp3 in `documentDirectory`. Nothing today produces an alarm-compatible file.

## Owns (do not touch other files)

- `convex/helpers.ts` — the TTS generation function ONLY (do not touch parse/prompt logic)
- `lib/alarmSounds.ts` (new) — all client-side wav placement/cleanup
- `__tests__/convex/helpers.test.ts` — extend existing suite for the wav path

## Tasks

- [ ] Convex: request PCM output from ElevenLabs (`output_format=pcm_22050` or similar supported rate for `eleven_v3`) for the base spoken line; wrap with a standard 44-byte WAV header in the action; store as a second storage file alongside the existing mp3 (keep mp3 — in-app playback and Android are untouched). Return/persist `wavStorageId` + `wavUrl` on the reminder document without breaking existing schema consumers (additive optional fields).
- [ ] Keep total added latency near zero: derive the wav from the SAME PCM response — do not call ElevenLabs twice.
- [ ] `lib/alarmSounds.ts`: `ensureAlarmSound(reminderId, wavUrl): Promise<string | null>` — iOS only: download to `Library/Sounds/reminder_{id}.wav` (create dir if missing; expo-file-system can address it via `FileSystem.documentDirectory` sibling — verify the exact reachable path for Library on iOS and document it), return the bare filename for the native `soundName`. Android/no-url: return null. Plus `removeAlarmSound(reminderId)` for deletion flows.
- [ ] File size guard: PCM/WAV of a 3–8s line at 22.05kHz mono ≈ 130–350 KB — assert lines stay ≤ 30s server-side (truncate prompt-side is already enforced; just guard).
- [ ] Tests: WAV header correctness (RIFF magic, sizes, sample rate), ensureAlarmSound platform gating with mocked FS.

## Acceptance

- 405 existing tests still pass; new tests green.
- A newly created reminder's Convex doc carries `wavUrl`; fetching it and inspecting bytes shows a valid WAV header.
- `ensureAlarmSound` on iOS (mocked FS in tests) writes `Library/Sounds/reminder_{id}.wav` and returns the filename.

## Out of scope

Calling `ensureAlarmSound` from scheduling flows (AK-4 wires it). Variant/pre-reminder wav files (ladder v2). Any change to mp3 handling.
