# Chunked-stream audio playback on Windows, from Python (2026-08-14)

How do we play Speechify's `/v1/audio/stream` response while it is still downloading, from a
long-running Python process on Windows 10? Compared: sounddevice/PortAudio fed raw PCM, PyAudio,
miniaudio's streaming MP3 decode, and piping to `ffplay`.

Unlike `docs/speechify-tts-research.md`, **most numbers below were measured on this machine**, not
read off a doc page: Windows 10 Home 19045, Python 3.12.5, `sounddevice` 0.5.5 (PortAudio
`V19.7.0-devel`), `miniaudio` 1.71, `ffplay` 8.0.1. Default output device was `Headset (EarPods)`
running at 44100/48000 Hz. Benchmarks played ±1 LSB noise so nothing was audible. Where a number is
from a doc instead of a run, the URL is inline.

---

## Verdict

**Ask Speechify for `Accept: audio/pcm` and push the bytes straight into one persistent
`sounddevice.RawOutputStream` in callback mode, opened on the WASAPI host API with
`WasapiSettings(auto_convert=True)`, behind a small byte ring with a ~150 ms prebuffer.**

The hypothesis in the ticket is confirmed, with one non-obvious catch that will bite immediately if
it is not handled: **PortAudio's default host API on Windows is MME, and WASAPI shared mode flatly
refuses 24000 Hz unless you pass `auto_convert=True`.** Measured on this box:

| path | opens at 24 kHz? | device buffer | overhead on a 1.000 s clip |
|---|---|---|---|
| MME (PortAudio's default), `latency='low'` | yes | 93.3 ms | **+135.1 ms** |
| MME, `latency='high'` | yes | 182.0 ms | +250.4 ms |
| DirectSound, `latency='low'` | yes | 120.0 ms | not benchmarked |
| WASAPI shared, no extra_settings | **no** — `Invalid sample rate [PaErrorCode -9997]` | — | — |
| WASAPI shared + `auto_convert=True` | yes | **24.8 ms** | **+8.5 ms** |
| WASAPI **exclusive** | **no** — `Invalid sample rate [-9997]` | — | — |
| WDM-KS | **no** — `Blocking API not supported yet [-9999]` | — | — |

So the difference between "just use sounddevice" and "use sounddevice correctly" is ~110 ms of
startup latency and ~70 ms of standing buffer, on every utterance. That is a third of Speechify's
entire advertised 300 ms TTFB budget, thrown away by a default.

End-to-end against a mock chunked-transfer endpoint (300 ms TTFB, audio generated 2× realtime,
`requests` → `iter_content(chunk_size=None)` → ring → callback):

| prebuffer | first sample handed to device, after first HTTP byte | gaps |
|---|---|---|
| 0 ms | **5.0 ms** | 0 |
| 150 ms | **44.9 ms** | 0 |
| 300 ms | 129.9 ms | 0 |

Add the 24.8 ms device buffer for the moment it is actually audible. With a 150 ms prebuffer,
**total wall time from "we sent the POST" to "sound leaves the speaker" is Speechify's TTFB + ~70 ms.**
Nothing else on the list gets close: `ffplay` adds ~284 ms of dead time around a clip even when
told not to probe its input, and miniaudio's streaming decoder blocks until 64 KB has arrived.

Fallback if PortAudio cannot open a device on some machine: **`ffplay` subprocess with
`-probesize 32 -analyzeduration 0`**. Rejected: PyAudio, miniaudio-for-MP3, mpv.

---

## Minimal code sketch

This is a trimmed version of the script that produced the E2E table above — it ran, it played, it
reported zero gaps. `scratchpad/e2e_player.py` has the instrumented original.

```python
import collections, threading, time
import requests, sounddevice as sd

SR = 24000  # Speechify PCM is audio/L16; rate=24000; channels=1, s16le, headerless


def _pick_output():
    """WASAPI + auto_convert if available (24.8 ms buffer), else PortAudio's default (93 ms)."""
    for ha in sd.query_hostapis():
        if "WASAPI" in ha["name"] and ha["default_output_device"] >= 0:
            try:
                extra = sd.WasapiSettings(auto_convert=True)   # needs sounddevice >= 0.5.0
            except TypeError:
                return None, None
            dev = ha["default_output_device"]
            try:
                sd.check_output_settings(device=dev, samplerate=SR, channels=1,
                                         dtype="int16", extra_settings=extra)
                return dev, extra
            except sd.PortAudioError:
                pass
    return None, None   # PortAudio default (MME on Windows) resamples 24 kHz fine


class StreamPlayer:
    """One persistent output stream + a byte ring. Construct once per process."""

    def __init__(self, samplerate=SR, prebuffer_ms=150):
        self.prebuffer = int(samplerate * prebuffer_ms / 1000) * 2
        self.dq, self.lock, self.level = collections.deque(), threading.Lock(), 0
        self.eos, self.started = threading.Event(), threading.Event()
        self.silence_frames = 0
        dev, extra = _pick_output()
        self.stream = sd.RawOutputStream(
            samplerate=samplerate, channels=1, dtype="int16",
            device=dev, extra_settings=extra,
            latency="low", blocksize=0, callback=self._cb)

    def _cb(self, outdata, frames, time_info, status):
        need = frames * 2
        out = bytearray()
        with self.lock:
            while self.dq and len(out) < need:
                c = self.dq.popleft()
                take = min(len(c), need - len(out))
                out += c[:take]
                if take < len(c):
                    self.dq.appendleft(c[take:])
                self.level -= take
        if len(out) < need:
            if not out and self.eos.is_set():
                raise sd.CallbackStop                 # clean end, no click
            self.silence_frames += (need - len(out)) // 2
            out += b"\x00" * (need - len(out))        # ride out the gap, never block here
        outdata[:] = bytes(out)

    def feed(self, data: bytes):
        with self.lock:
            self.dq.append(data)
            self.level += len(data)
            level = self.level
        if not self.started.is_set() and level >= self.prebuffer:
            self.stream.start()                       # start only once we have a cushion
            self.started.set()

    def finish(self, timeout=30):
        if not self.started.is_set():                 # utterance shorter than the prebuffer
            self.stream.start(); self.started.set()
        self.eos.set()
        deadline = time.perf_counter() + timeout
        while self.stream.active and time.perf_counter() < deadline:
            time.sleep(0.005)
        self.stream.stop()


def speak(text: str, api_key: str, voice_id: str = "beatrice_32"):
    player = StreamPlayer()
    with requests.post(
        "https://api.speechify.ai/v1/audio/stream",
        headers={"Authorization": f"Bearer {api_key}", "Accept": "audio/pcm"},
        json={"input": text, "voice_id": voice_id, "model": "simba-3.2"},
        stream=True, timeout=(5, 30),
    ) as r:
        r.raise_for_status()
        # chunk_size=None + stream=True => "read data as it arrives in whatever size the
        # chunks are received" -- do NOT pass an int, that makes requests wait for a full
        # chunk_size bytes before yielding.
        for chunk in r.iter_content(chunk_size=None):
            if chunk:
                player.feed(chunk)
    player.finish()
```

Two details in there that are load-bearing and easy to get wrong:

- **`iter_content(chunk_size=None)`.** With `stream=True`, `None` means "reads data as it arrives in
  whatever size the chunks are received"; an integer makes requests accumulate that many bytes
  first ([requests API docs](https://requests.readthedocs.io/en/latest/api/)). Passing
  `chunk_size=8192` (the copy-paste default everyone uses) adds a full buffer of latency at the top
  of every utterance.
- **The callback never blocks and never allocates unboundedly.** It zero-fills a short read rather
  than waiting for data. A blocking call inside a PortAudio callback is how you get a hard glitch.

Odd bytes: PCM frames are 2 bytes, and an HTTP chunk boundary can land mid-frame. The ring above is
byte-oriented and hands out exactly `frames * 2` bytes, so a split frame is reassembled across
callbacks for free. Do not switch it to a "list of numpy arrays" design without handling that.

---

## Buffering and underruns

PortAudio's callback contract is "fill this buffer, now". Whatever you do not fill is whatever was
in memory. So there are exactly two strategies, and the choice is the whole design:

1. **Zero-fill on starvation** (recommended, and what the sketch does). A gap becomes a short
   silence in the middle of the sentence. No click, no exception, stream stays open, playback
   resumes cleanly when bytes arrive.
2. **Let PortAudio underrun.** With blocking `write()` there is no third option. Worse — see below,
   its underflow reporting does not work here.

### Measured: how much prebuffer buys how much stall tolerance

50 ms chunks, 6.000 s clip, one artificial network stall injected mid-clip. **Worst case, arrival
exactly at realtime** (i.e. the TTS backend generates no faster than you play):

| prebuffer | stall | silence inserted | gaps |
|---|---|---|---|
| 0 ms | none | 70 ms | 2 |
| 50 ms | none | 20 ms | 1 |
| 100 ms | none | **0 ms** | 0 |
| 200 ms | none | 0 ms | 0 |
| 100 ms | 300 ms | 270 ms | 1 |
| 200 ms | 300 ms | 170 ms | 1 |
| 400 ms | 300 ms | **0 ms** | 0 |
| 200 ms | 500 ms | 370 ms | 1 |
| 400 ms | 500 ms | 170 ms | 2 |
| 400 ms | 1000 ms | 670 ms | 2 |
| 800 ms | 1000 ms | 270 ms | 2 |
| 1000 ms | 1000 ms | 70 ms | 1 |

The model is boringly linear: **silence ≈ stall − prebuffer** (plus ~70 ms of scheduling slop).
When arrival is exactly realtime the prebuffer is spent once and never rebuilt, so it is pure
insurance.

**Realistic case, arrival at 2× realtime** — which is what a TTS endpoint actually does, since it
generates faster than you can listen:

| prebuffer | stall | silence inserted |
|---|---|---|
| 0 ms | none | 50 ms |
| 0 ms | 1000 ms | 40 ms |
| 100 ms | 1000 ms | **0 ms** |
| 100 ms | 2000 ms | 970 ms |
| 100 ms | 3000 ms | 1970 ms |
| 200 ms | 3000 ms | 1890 ms |

This is the number that matters. **The real protection is not the prebuffer, it is the surplus that
accumulates because generation outruns playback.** A 100 ms prebuffer plus a 2× generator absorbed a
full one-second network stall with zero inserted silence. The prebuffer only has to cover the first
few hundred milliseconds, before that surplus exists.

**Recommendation: 150 ms prebuffer.** It costs ~45 ms of added startup at 2× arrival (measured), it
eliminates the 20–70 ms of ragged silence seen at 0–50 ms, and past the first moment the ring's own
growth does the rest. Do not go to 400–800 ms "to be safe" — it is 130+ ms of dead air on every
reply and it buys nothing that the surplus does not already buy.

### Do not trust `write()`'s underflow flag

The docs say blocking `write()` returns `underflowed`, "`True` if additional output data was
inserted after the previous call and before this call"
([sounddevice API](https://python-sounddevice.readthedocs.io/en/0.5.2/api/streams.html)). On this
machine, on WASAPI, **a deliberate 500 ms mid-stream stall produced `underflowed == False` on every
call.** In callback mode `status.output_underflow` was likewise never set — because the callback
always fills the buffer, so from PortAudio's point of view nothing ever went wrong.

Conclusion: **the ring level is the only honest health signal.** Track `self.level` and log/count
`silence_frames`; treat inserted silence as the metric, not PortAudio's flags.

### Other operational notes

- **Construct the stream once, at process start.** Stream construction measured 10–18 ms warm
  (67 ms in a cold process, including `Pa_Initialize`); `start()` is 0.2–0.6 ms. Per-utterance
  open/close throws that away for nothing.
- **An idle open stream is free.** 3 s idle with the stream open: 0 ms CPU (0.00% of one core).
  There is no reason to close it between utterances.
- **PortAudio caches the device list at init.** Plugging in a headset after start will not show up
  in `query_devices()`. `sd._terminate(); sd._initialize()` re-enumerates — needed if the loop
  should follow device changes. A stream already open on a device that disappears will error;
  catch `PortAudioError` around `feed()` and rebuild the player.
- **`latency='low'` is right here.** `'high'` doubled the buffer (93 → 182 ms on MME) for no benefit
  at these chunk sizes; zero underruns were observed at `'low'` in every run.
- **`blocksize=0`** (let PortAudio choose) gave 240-frame callbacks (~10 ms) on WASAPI. The
  sounddevice docs recommend `0` as the most stable choice across host APIs. Leave it.

---

## The instant earcon

**Answer: reuse the same persistent output stream. Keep the earcon decoded to raw int16 at 24000 Hz
in memory at startup, and `feed()` it.** Measured, on the already-running stream:

| approach | trigger → first sample | notes |
|---|---|---|
| **persistent stream, `feed(preloaded_pcm)`** | **1.1 / 8.9 / 10.3 ms** (min/med/max) | + 24.8 ms device buffer → **audible in ~35 ms worst case** |
| open + start + write + close per play | 23.7 / 28.4 / 50.4 ms | pure device-open overhead, before any sound |
| `winsound.PlaySound(SND_FILENAME\|SND_ASYNC)` | 0.2 / 0.2 / 4.8 ms **to return** | the call returning is not the sound starting — see below |

The `winsound` number is a trap. `SND_ASYNC` means "return immediately"; it says nothing about when
audio reaches the DAC, and `PlaySound` opens its own `waveOut` device on each call, which is exactly
the 24–50 ms of per-play open cost measured in row 2. It also has three hard limitations, all
confirmed against the [stdlib docs](https://docs.python.org/3/library/winsound.html) and one of them
confirmed by exception here:

- **WAV files only.** No MP3, no raw PCM.
- **`SND_MEMORY` cannot be combined with `SND_ASYNC`** — "this module does not support playing from
  a memory image asynchronously". Attempting it raised
  `RuntimeError: Cannot play asynchronously from memory`. So the only non-blocking `winsound` path
  reads a file from disk on every play.
- **Each async call preempts the previous one**, and `PlaySound(None, ...)` stops playback. Two
  earcons in quick succession clip each other.

`winsound` will not cut off the PortAudio TTS stream (separate device handles, mixed by the Windows
engine), so it is not *dangerous* — it is just slower, less controllable, and a second code path for
no gain.

Practical shape: at startup, load the earcon WAV once, strip the header, resample to 24000 Hz mono
int16 if needed (do it offline — ship the asset already at 24 kHz mono), hold it as `bytes`. On
wake, `player.feed(earcon_pcm)`. Because it is the same ring, an earcon that arrives mid-utterance
queues behind the speech rather than talking over it — which is usually what you want for a wake
ack. If you need it to *interrupt*, add a priority slot the callback checks before the main ring,
or mix it in (`np.clip(a + b)`); do not open a second stream.

`winsound.MessageBeep(-1)` remains a fine zero-dependency panic fallback if PortAudio fails to
initialize at all.

---

## Fallback: `ffplay` subprocess

Keep this as the escape hatch for machines where PortAudio cannot open an output device, and as the
only easy way to play `audio/mpeg` / `audio/ogg` / `audio/aac` without adding a decoder.

Feeding a 2.000 s s16le clip to `ffplay` stdin at realtime, overhead = wall time − clip length:

| flags | overhead |
|---|---|
| `-nodisp -autoexit` (plain), 3 runs | **+1152.9 / +1147.3 / +1142.0 ms** |
| `+ -probesize 32 -analyzeduration 0` | **+283.9 ms** |
| `+ -fflags nobuffer -flags low_delay -infbuf` | exited after 1.100 s of a 2.000 s clip — **dropped audio** |

Plain `ffplay` spends over a second probing an input it was already told the format of. Capping
`-probesize`/`-analyzeduration` recovers most of it, but ~284 ms is still worse than the entire
sounddevice path including Speechify's TTFB. And the aggressive low-latency flag set silently
truncated playback, which is the worst possible failure for a voice assistant.

The working invocation on **ffplay 8.0.1** — note this changed:

```python
subprocess.Popen([
    "ffplay", "-hide_banner", "-loglevel", "error", "-nodisp", "-autoexit",
    "-probesize", "32", "-analyzeduration", "0",
    "-f", "s16le", "-sample_rate", "24000", "-ch_layout", "mono",
    "-i", "pipe:0",
], stdin=subprocess.PIPE)
```

**ffmpeg 8 removed `ffplay`'s `-ac` and `-ar` options.** Every snippet on the internet uses them,
and the failure mode is nasty: ffplay exits before reading stdin, so Python raises
`BrokenPipeError: [Errno 32]` and the actual cause
(`Failed to set value '1' for option 'ac': Option not found`) only appears on the child's stderr,
which most code discards. Use the pcm demuxer options `-sample_rate` and `-ch_layout mono` instead.

Other costs: ffmpeg is a ~100 MB external install not on PyPI (it happens to be present on this
machine at `C:\Users\AtheA\AppData\Local\ffmpeg\bin`), you get no device selection, no ring-level
telemetry, no way to stop mid-sentence except killing the process, and a second process per
utterance. `mpv` was not benchmarked — not installed here, and it is a larger dependency than
ffmpeg with the same architectural drawbacks.

---

## Rejected

### PyAudio — rejected

`PyAudio` 0.2.14, released 2023-11-07, with win_amd64 wheels through cp313
([PyPI](https://pypi.org/project/PyAudio/)). It is the same PortAudio underneath, so the ceiling is
identical. The disqualifier is the floor: **PyAudio exposes no host-API-specific stream settings**,
so there is no way to set `paWinWasapiAutoConvert`. On this machine that means a 24000 Hz WASAPI
stream cannot be opened at all, leaving MME at 93.3 ms — the +135 ms row of the first table — or
resampling 24 k → 48 k in Python before every write. sounddevice does the same job with numpy
interop, `WasapiSettings`, `check_output_settings` for capability probing, and a maintained release
(0.5.5, 2026-01-23) versus PyAudio's ~2.5-year-old beta. No reason to pick it.

### miniaudio for streaming MP3 — rejected, and it fails harder than expected

The idea was good: `Accept: audio/mpeg` is ~4× fewer bytes than PCM, and `miniaudio.stream_any()`
takes a `StreamableSource` explicitly described as being for "any source of encoded audio data
(such as a network stream)". Two measurements killed it.

**1. It demands 64 KB before it will produce a single sample.** Instrumenting the source's `read()`
calls, `stream_any()` requested `10` bytes and then **`65536`** bytes, and consumed the entire test
file before returning the generator. Fed at 16 KB/s (2× a 64 kbps MP3), `stream_any()` **blocked for
4049 ms**. At 64 kbps, 64 KB is roughly *eight seconds of audio* that must arrive before anything is
audible. That is the exact opposite of the design goal.

**2. Short reads are treated as EOF, not as backpressure.** A source that returns whatever has
arrived so far — the natural streaming behaviour — fails immediately:

```
requested=[10]  returned=[2]
miniaudio.DecodeError: ('failed to init decoder', -203)
```

So `StreamableSource.read(n)` must block until it can return exactly `n` bytes. There is no
`buffer_size` or read-granularity parameter on `stream_any()` to lower the 64 KB demand
(signature: `stream_any(source, source_format, output_format, nchannels, sample_rate,
frames_to_read, dither, seek_frame)`), so this is not tunable — the low-latency path does not exist.

Two smaller gotchas found along the way, worth recording since miniaudio survives as a fallback:
`PlaybackDevice.start()` drives the generator with `gen.send(framecount)`, so any wrapper generator
must be primed with `next()` first or you get
`TypeError: can't send non-None value to a just-started generator`; and `PlaybackDevice` reported
backend `WASAPI` with a ~40–97 ms constructor.

miniaudio 1.71 (2026-04-29) does have clean win_amd64 wheels for 3.10–3.14 and no compiler
requirement ([PyPI](https://pypi.org/project/miniaudio/)), and as a *raw PCM* sink it is a
perfectly good second choice. But it brings nothing sounddevice lacks, and its one differentiator —
streaming decode — is the part that does not work.

### WASAPI exclusive mode, and WDM-KS — rejected

Both refuse 24 kHz outright on this hardware (`Invalid sample rate [-9997]`;
`Blocking API not supported yet [-9999]`), and exclusive mode would take the sound device away from
every other app on the machine, which is unacceptable for something that runs all day.

---

## Windows install friction

Everything needed is a pure `pip install` with prebuilt win_amd64 wheels. No MSVC, no ffmpeg, no
`vcpkg`, nothing to put on `PATH`.

| package | version | Windows wheels | notes |
|---|---|---|---|
| `sounddevice` | 0.5.5 (2026-01-23) | win_amd64 / win32 / win_arm64, **bundles PortAudio** in the wheel (365 KB vs 33 KB pure) | needs `cffi`. Python ≥ 3.7 ([PyPI](https://pypi.org/project/sounddevice/)) |
| `numpy` | any | yes | optional — `RawOutputStream` takes plain `bytes`; numpy only helps for mixing/earcons |
| `requests` | already in use | n/a | `stream=True` + `iter_content(chunk_size=None)` |

**One version floor matters: `sounddevice >= 0.5.0`.** `WasapiSettings` gained `auto_convert` in
0.5.0 — in 0.4.6 the signature is `WasapiSettings(exclusive=False)`, with no auto-convert at all
([0.4.6 docs](https://python-sounddevice.readthedocs.io/en/0.4.6/api/platform-specific-settings.html)
vs [0.5.0 docs](https://python-sounddevice.readthedocs.io/en/0.5.0/api/platform-specific-settings.html)).
Pin `sounddevice>=0.5.0`. The `_pick_output()` helper above degrades to the MME default rather than
crashing if it is older, but the latency cost is the +135 ms row.

## Sample rate and device selection

Speechify's PCM stream is `audio/L16; rate=24000; channels=1` — "Raw 16-bit signed little-endian
samples, no container or header"
([streaming docs](https://docs.speechify.ai/build/guides/text-to-speech/streaming)) — which maps
exactly onto `RawOutputStream(samplerate=24000, channels=1, dtype='int16')`. No header parsing, no
conversion, no numpy required.

24000 Hz is not a rate any consumer sound card runs natively, so *something* resamples to the
device's 44.1/48 kHz mix rate. Where that happens is the whole story:

- **MME / DirectSound**: the Windows audio engine resamples transparently. `check_output_settings`
  accepted 24000, 22050 and 48000 mono int16 without complaint. Costs 93–120 ms of buffer.
- **WASAPI shared without `auto_convert`**: no resampler is inserted, so the stream must match the
  engine's mix format exactly — hence `Invalid sample rate` for 24000 against a 48000 Hz device.
- **WASAPI shared with `auto_convert=True`**: PortAudio sets
  `AUDCLNT_STREAMFLAGS_AUTOCONVERTPCM | AUDCLNT_STREAMFLAGS_SRC_DEFAULT_QUALITY`
  ([pa_win_wasapi.h](https://files.portaudio.com/docs/v19-doxydocs/pa__win__wasapi_8h_source.html)).
  `AUTOCONVERTPCM` means "a channel matrixer and a sample rate converter are inserted as necessary
  to convert between the uncompressed format supplied to `IAudioClient::Initialize` and the audio
  engine mix format", and `SRC_DEFAULT_QUALITY` — despite the name — selects "a sample rate
  converter with **better quality than the default** conversion but with a higher performance cost
  … This should be used if the audio is ultimately intended to be heard by humans"
  ([AUDCLNT_STREAMFLAGS_XXX](https://learn.microsoft.com/en-us/windows/win32/coreaudio/audclnt-streamflags-xxx-constants)).
  So this path gets the *better* engine resampler, at 24.8 ms of buffer instead of MME's 93 ms.
  That combination is why it is the recommendation.

Mono → stereo is handled by the same matrixer; do not duplicate channels in Python.

Device selection: `sd.query_hostapis()[i]['default_output_device']` gives the Windows default output
*for that host API* — WASAPI index 19 vs MME index 6 pointed at the same physical `Headset (EarPods)`
here. Prefer that over `sd.default.device`, which follows PortAudio's default host API (MME, index
0). If the loop ever needs a user-chosen device, `sd.query_devices()` names are the selector and
`sd.check_output_settings(device=…, samplerate=24000, channels=1, dtype='int16',
extra_settings=…)` is the capability probe — it is cheap and it is how `_pick_output()` avoids
guessing.

---

## Open questions

1. **Resampler quality.** On paper this is settled — Microsoft explicitly recommends
   `SRC_DEFAULT_QUALITY` for audio "intended to be heard by humans", and it is what PortAudio sets.
   But nobody has actually listened to 24 kHz speech through it on this box. Confirm by ear; if it
   disappoints, the only real lever is resampling in Python (CPU + latency), since
   `/v1/audio/stream` is fixed at 24000 Hz.
2. **Barge-in / interruption.** Not benchmarked. Stopping mid-sentence means clearing the ring and
   either letting the callback zero-fill or calling `abort()`. `abort()` cuts immediately and may
   click; clearing the ring gives a ~25 ms fade to silence. The ring-clear is almost certainly the
   right answer for a voice loop but should be confirmed by ear.
3. **Device change while running.** Untested — I could not unplug the headset from here. The
   mitigation (catch `PortAudioError`, `sd._terminate()`/`sd._initialize()`, rebuild the player) is
   theory until someone yanks a USB headset mid-sentence.
4. **Speechify's real chunk cadence.** The E2E numbers above used a mock server at a synthetic 2×
   generation rate, because we still have no API key (same blocker as
   `docs/speechify-tts-research.md`). If Speechify actually delivers near realtime rather than 2×,
   the honest prebuffer number moves from the second table to the first, and 150 ms may need to
   become 300–400 ms. **Re-run the stall matrix against the live endpoint once a key exists** — it
   is the one number in this document that a mock cannot settle.
