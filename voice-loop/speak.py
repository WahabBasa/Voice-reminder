"""TTS playback for the voice loop: Speechify /v1/audio/stream -> WASAPI, streamed.

Design follows docs/voice-loop/stream-playback-windows.md exactly:

  * ONE persistent sounddevice.RawOutputStream (24000 Hz, mono, int16), opened on the
    WASAPI host API with WasapiSettings(auto_convert=True) -- without auto_convert WASAPI
    shared mode refuses 24 kHz outright, and falling back to PortAudio's default (MME)
    costs ~110 ms of startup and ~70 ms of standing buffer on every utterance.
  * Callback mode, never blocking inside the callback: a short read is zero-filled, so a
    network stall becomes a short silence rather than a click or an exception.
  * A byte-oriented ring, so an HTTP chunk boundary landing mid-frame is reassembled for
    free (PCM frames are 2 bytes).
  * 150 ms prebuffer gate per utterance.
  * PortAudio's underflow reporting is not trusted -- the ring level is the only honest
    health signal, so inserted silence is counted directly and reported as silence_ms.

The stream is started once in __init__ and left running for the life of the process. An
idle stream costs ~0% CPU, start() is only 0.2-0.6 ms but it is 0.2-0.6 ms on the latency
path, and keeping the device open also keeps it awake (no first-word clipping from a
sleeping endpoint). Playback is gated by a flag the callback checks, not by start/stop.

Usage:
    from speak import Speaker
    sp = Speaker()          # once per process
    sp.earcon()             # non-blocking ack blip
    t = sp.speak("hello")   # blocks until the audio has finished playing

Requires SPEECHIFY_API_KEY in the environment (PTC injects it: `ptc run speak.py`).
"""

from __future__ import annotations

import array
import collections
import math
import os
import threading
import time

import requests
import sounddevice as sd

SR = 24000  # Speechify PCM is audio/L16; rate=24000; channels=1, s16le, headerless
BYTES_PER_FRAME = 2
PREBUFFER_MS = 150

STREAM_URL = "https://api.speechify.ai/v1/audio/stream"
VOICE_ID = "beatrice_32"
MODEL = "simba-3.2"


def _pick_output(samplerate: int = SR):
    """WASAPI + auto_convert if available (24.8 ms buffer), else PortAudio's default."""
    for ha in sd.query_hostapis():
        if "WASAPI" in ha["name"] and ha["default_output_device"] >= 0:
            try:
                extra = sd.WasapiSettings(auto_convert=True)  # needs sounddevice >= 0.5.0
            except TypeError:
                return None, None
            dev = ha["default_output_device"]
            try:
                sd.check_output_settings(
                    device=dev, samplerate=samplerate, channels=1,
                    dtype="int16", extra_settings=extra,
                )
                return dev, extra
            except sd.PortAudioError:
                pass
    return None, None  # PortAudio default (MME on Windows) resamples 24 kHz fine


def _make_earcon(samplerate: int = SR, ms: int = 120, freq: float = 880.0,
                 amplitude: float = 0.28) -> bytes:
    """A ~120 ms sine blip with raised-cosine edges, as raw s16le bytes."""
    n = int(samplerate * ms / 1000)
    edge = max(1, int(samplerate * 0.010))  # 10 ms fade in/out, else it clicks
    peak = int(amplitude * 32767)
    buf = array.array("h", [0]) * n
    for i in range(n):
        env = 1.0
        if i < edge:
            env = 0.5 - 0.5 * math.cos(math.pi * i / edge)
        elif i >= n - edge:
            j = n - 1 - i
            env = 0.5 - 0.5 * math.cos(math.pi * j / edge)
        buf[i] = int(peak * env * math.sin(2 * math.pi * freq * i / samplerate))
    return buf.tobytes()


class Speaker:
    """Persistent output stream + byte ring. Construct once per process."""

    def __init__(self, samplerate: int = SR, prebuffer_ms: int = PREBUFFER_MS,
                 api_key: str | None = None, voice_id: str = VOICE_ID,
                 model: str = MODEL, connect_timeout: float = 5.0,
                 read_timeout: float = 30.0):
        self.samplerate = samplerate
        self.voice_id = voice_id
        self.model = model
        self.timeout = (connect_timeout, read_timeout)
        self._api_key = api_key or os.environ.get("SPEECHIFY_API_KEY")

        self.prebuffer_bytes = int(samplerate * prebuffer_ms / 1000) * BYTES_PER_FRAME

        self._ring: collections.deque[bytes] = collections.deque()
        self._lock = threading.Lock()
        self._level = 0            # bytes queued
        self._open = False         # gate: may the callback consume from the ring?
        self._eos = True           # no utterance in flight
        self._first_sample_t = None
        self._silence_frames = 0
        self._speak_lock = threading.Lock()

        self._earcon_pcm = _make_earcon(samplerate)

        self.device, extra = _pick_output(samplerate)
        self.host_api = (
            sd.query_hostapis(sd.query_devices(self.device)["hostapi"])["name"]
            if self.device is not None else "portaudio-default"
        )
        self.stream = sd.RawOutputStream(
            samplerate=samplerate, channels=1, dtype="int16",
            device=self.device, extra_settings=extra,
            latency="low", blocksize=0, callback=self._cb,
        )
        self.stream.start()  # persistent: started once, never stopped between utterances

        # HTTP session reused so TLS/TCP setup is not on the per-utterance latency path.
        self._http = requests.Session()

    # ---------------------------------------------------------------- audio

    def _cb(self, outdata, frames, time_info, status):
        need = frames * BYTES_PER_FRAME
        out = bytearray()
        if self._open:
            with self._lock:
                while self._ring and len(out) < need:
                    c = self._ring.popleft()
                    take = min(len(c), need - len(out))
                    out += c[:take]
                    if take < len(c):
                        self._ring.appendleft(c[take:])
                    self._level -= take
            if out and self._first_sample_t is None:
                self._first_sample_t = time.perf_counter()
        if len(out) < need:
            # Never block in here. Ride out the gap with silence; count it, because
            # PortAudio's own underflow flags stay False on WASAPI even during a stall.
            if self._open and not self._eos:
                self._silence_frames += (need - len(out)) // BYTES_PER_FRAME
            out += b"\x00" * (need - len(out))
        outdata[:] = bytes(out)

    def _feed(self, data: bytes):
        with self._lock:
            self._ring.append(data)
            self._level += len(data)
            level = self._level
        if not self._open and level >= self.prebuffer_bytes:
            self._open = True  # cushion is in; let the callback start pulling

    def _reset(self):
        with self._lock:
            self._ring.clear()
            self._level = 0
        self._open = False
        self._eos = False
        self._first_sample_t = None
        self._silence_frames = 0

    def _drain(self, timeout: float = 60.0) -> bool:
        """Wait until the ring is empty and the device buffer has flushed."""
        deadline = time.perf_counter() + timeout
        while time.perf_counter() < deadline:
            with self._lock:
                level = self._level
            if level == 0:
                break
            time.sleep(0.002)
        else:
            return False
        # The last bytes handed to PortAudio are still in the device buffer.
        time.sleep(float(self.stream.latency) + 0.010)
        return True

    # ---------------------------------------------------------------- public

    def earcon(self):
        """Play the ack blip through the same stream. Non-blocking, ~1-10 ms to first sample."""
        self._eos = True          # not an utterance; do not count its tail as starvation
        self._feed(self._earcon_pcm)
        self._open = True         # no prebuffer needed, the whole blip is already in memory

    def speak(self, text: str) -> dict:
        """Stream Speechify TTS to the speaker. Blocks until playback is done."""
        if not self._api_key:
            raise RuntimeError("SPEECHIFY_API_KEY not set in environment")

        with self._speak_lock:
            self._reset()
            t0 = time.perf_counter()
            t_request = time.time()
            ttfb = None
            headers_t = None
            total = 0

            with self._http.post(
                STREAM_URL,
                headers={
                    "Authorization": f"Bearer {self._api_key}",
                    "Accept": "audio/pcm",
                    "Content-Type": "application/json",
                },
                json={"input": text, "voice_id": self.voice_id, "model": self.model},
                stream=True, timeout=self.timeout,
            ) as r:
                headers_t = time.perf_counter()
                if r.status_code != 200:
                    body = r.text[:400]
                    self._eos = True
                    self._open = False
                    raise RuntimeError(f"Speechify {r.status_code}: {body}")
                # chunk_size=None => yield bytes as they arrive. An int makes requests wait
                # for that many bytes first, which is a full buffer of added latency.
                for chunk in r.iter_content(chunk_size=None):
                    if not chunk:
                        continue
                    if ttfb is None:
                        ttfb = time.perf_counter()
                    total += len(chunk)
                    self._feed(chunk)

            self._eos = True
            fed_t = time.perf_counter()
            if not self._open:
                self._open = True  # utterance shorter than the prebuffer
            drained = self._drain()
            done_t = time.perf_counter()
            self._open = False

            first_sample_ms = (
                (self._first_sample_t - t0) * 1000.0
                if self._first_sample_t is not None else None
            )
            return {
                "t_request": t_request,
                "ttfb_ms": round((ttfb - t0) * 1000.0, 1) if ttfb else None,
                "first_sample_ms": round(first_sample_ms, 1) if first_sample_ms else None,
                "done_ms": round((done_t - t0) * 1000.0, 1),
                "audio_s": round(total / BYTES_PER_FRAME / self.samplerate, 3),
                # extras -- diagnostics, not part of the core contract
                "headers_ms": round((headers_t - t0) * 1000.0, 1) if headers_t else None,
                "download_ms": round((fed_t - t0) * 1000.0, 1),
                "silence_ms": round(self._silence_frames / self.samplerate * 1000.0, 1),
                "bytes": total,
                "drained": drained,
                "host_api": self.host_api,
            }

    def stop(self):
        """Barge-in: drop whatever is queued. The callback fades to silence, no click."""
        with self._lock:
            self._ring.clear()
            self._level = 0
        self._eos = True
        self._open = False

    def close(self):
        try:
            self.stream.stop()
            self.stream.close()
        except Exception:
            pass
        self._http.close()

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        self.close()


if __name__ == "__main__":
    import json

    sp = Speaker()
    print(f"device={sp.device} host_api={sp.host_api} "
          f"latency={float(sp.stream.latency) * 1000:.1f}ms "
          f"prebuffer={sp.prebuffer_bytes} bytes")

    t = time.perf_counter()
    sp.earcon()
    print(f"earcon() returned in {(time.perf_counter() - t) * 1000:.2f} ms")
    time.sleep(0.4)

    timings = sp.speak("Reminder set for four thirty. I'll ping you then.")
    print(json.dumps(timings, indent=2))
    sp.close()
