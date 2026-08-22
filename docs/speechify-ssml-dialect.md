# Speechify SSML dialect (simba-3.2, beatrice_32)

Probed empirically 2026-08-21 against `POST https://api.speechify.ai/v1/audio/stream`
(payload `{input, voice_id, model}`, SSML in `input`). Applies to script narration and
the voice-loop TTS path.

- `<break time="Nms"/>` — honored, but lands at roughly **half** the requested value.
  Request 2x what you want. Trailing breaks at the very end of the input are trimmed
  entirely — never test SSML support with an end-of-input break.
- `<prosody rate="NN%">` — a bare percentage **speeds up** (treated as a boost, not a
  target): `rate="60%"` made audio ~1.5x faster. To slow down use **negative**
  values: `rate="-12%"` ≈ gentle, `-15%` noticeably deliberate. Keyword `rate="slow"`
  ≈ `-20%`.
- `<prosody pitch="+N%">` — works as expected; `+4%` is a subtle question-lift.
- Paragraph-level pacing is more reliable as **inserted PCM silence between separate
  requests** (24 kHz mono s16le, headerless) than as in-SSML breaks.
- **`Accept: audio/pcm` is mandatory** for raw PCM. Any other Accept (e.g. `audio/*`)
  silently returns **MP3** — wrap that in a WAV header and you get pure static.
  Sanity check: PCM at 24 kHz mono s16le is exactly 48,000 bytes/second; if
  bytes/duration doesn't match, you're holding compressed audio.

Working renderer example: the session scratchpad `tts_quarter.py` pattern — chunk per
paragraph, per-chunk SSML, PCM silence joins, wrap as WAV (24000 Hz, mono, 16-bit).
