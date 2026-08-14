"""Voice-loop latency skeleton: wake -> Claude -> streamed TTS, with per-hop timings.

Wires the two proven modules together:

  * brain.VoiceSession  -- one warm Claude CLI subprocess, yields sentences as they close
  * speak.Speaker       -- one persistent WASAPI RawOutputStream + byte ring

The spine per exchange:

    earcon()  ->  t0 = utterance sent  ->  sentence 1 closes  ->  TTS request
              ->  first PCM byte       ->  first audible sample   [HEADLINE]

Sentences are queued, not spoken inline. Each queued sentence gets its own fetch
thread that starts pulling PCM from Speechify *immediately*, while the previous
sentence is still playing, and a single player thread that drains them into the
speaker in order. So sentence 2's ~600 ms TTS TTFB is paid underneath sentence 1's
audio instead of after it.

Speaker.speak() cannot do that on its own: it holds _speak_lock from request through
drain, so the next request can't start until the current audio has finished. Rather
than change a module that is already proven live, SentencePipeline below reuses
Speaker's ring internals (_reset/_feed/_drain) and does the HTTP itself.

Clocks: everything in this file is time.perf_counter(). Sentence arrival is stamped
here, the moment the async generator hands it over, rather than trusting brain's
time.monotonic() stamps -- the only monotonic value used is last_first_delta_t, which
is converted with a paired clock read and marked approximate.

Run:
    ptc run c:\\Dev\\VR\\voice-loop\\skeleton.py --auto     # three canned utterances
    ptc run c:\\Dev\\VR\\voice-loop\\skeleton.py            # interactive

Needs SPEECHIFY_API_KEY in the environment (PTC injects it).
"""

from __future__ import annotations

import argparse
import asyncio
import os
import queue
import sys
import threading
import time

from brain import VoiceSession
from speak import BYTES_PER_FRAME, MODEL, STREAM_URL, VOICE_ID, Speaker

AUTO_UTTERANCES = [
    ("greeting", "Hey Claude, good morning."),
    ("number", "How many minutes are there in a day?"),
    ("open", "What's a good way to spend a rainy Saturday afternoon?"),
]


def _ms(a: float | None, b: float | None) -> float | None:
    """Elapsed a->b in ms, or None if either end is missing."""
    if a is None or b is None:
        return None
    return round((b - a) * 1000.0, 1)


def _fmt(v: float | None) -> str:
    return "--" if v is None else f"{v:.0f}"


class Job:
    """One sentence on its way to the speaker."""

    __slots__ = (
        "index", "text", "t_sentence", "chunks", "t_fetch_start", "t_first_byte",
        "t_fetch_done", "t_play_start", "t_first_sample", "t_done", "nbytes",
        "silence_ms", "error",
    )

    def __init__(self, index: int, text: str, t_sentence: float):
        self.index = index
        self.text = text
        self.t_sentence = t_sentence
        self.chunks: queue.Queue = queue.Queue()  # bytes..., then None = EOF
        self.t_fetch_start: float | None = None
        self.t_first_byte: float | None = None
        self.t_fetch_done: float | None = None
        self.t_play_start: float | None = None
        self.t_first_sample: float | None = None
        self.t_done: float | None = None
        self.nbytes = 0
        self.silence_ms = 0.0
        self.error: str | None = None

    @property
    def audio_s(self) -> float:
        return round(self.nbytes / BYTES_PER_FRAME / 24000.0, 2)

    @property
    def prefetched(self) -> bool:
        """True if the whole utterance was already downloaded when playback started."""
        return (
            self.t_fetch_done is not None
            and self.t_play_start is not None
            and self.t_fetch_done <= self.t_play_start
        )


class SentencePipeline:
    """Queue sentences; fetch them one ahead of playback, play them in order.

    Two worker threads, one HTTP request in flight at a time. The Speechify plan
    caps concurrency at 1 (a second simultaneous POST returns 429
    concurrency_limit_reached), so the fetcher is a serial FIFO -- but a download
    finishes far faster than the audio plays, so sentence 2 is still fully
    downloaded while sentence 1 is still in the speaker. That's where the overlap
    comes from; it does not need parallel requests.
    """

    def __init__(self, speaker: Speaker, session=None):
        self.sp = speaker
        # Separate HTTP session from Speaker._http so a prefetch can never contend
        # with anything speak() might be doing.
        import requests

        self._http = session or requests.Session()
        self._fetch_q: queue.Queue = queue.Queue()
        self._play_q: queue.Queue = queue.Queue()
        self._n = 0
        self._fetcher = threading.Thread(target=self._fetch_loop, daemon=True)
        self._fetcher.start()
        self._player = threading.Thread(target=self._play_loop, daemon=True)
        self._player.start()

    # ------------------------------------------------------------------ warm

    def warm(self) -> None:
        """Open the TLS connection to the TTS host so the first sentence isn't cold."""
        try:
            self._http.get(STREAM_URL, timeout=(5.0, 5.0))
        except Exception:
            pass

    # --------------------------------------------------------------- enqueue

    def enqueue(self, text: str, t_sentence: float) -> Job:
        job = Job(self._n, text, t_sentence)
        self._n += 1
        self._fetch_q.put(job)
        self._play_q.put(job)
        return job

    def wait_idle(self, timeout: float = 120.0) -> None:
        self._play_q.join()

    def close(self) -> None:
        self._fetch_q.put(None)
        self._play_q.put(None)
        self._fetcher.join(timeout=5.0)
        self._player.join(timeout=5.0)
        self._http.close()

    # ----------------------------------------------------------------- fetch

    def _fetch_loop(self) -> None:
        while True:
            job = self._fetch_q.get()
            if job is None:
                return
            self._fetch(job)

    def _fetch(self, job: Job, attempts: int = 3) -> None:
        job.t_fetch_start = time.perf_counter()
        try:
            for attempt in range(attempts):
                try:
                    self._stream_one(job)
                    break
                except RuntimeError as exc:
                    # 429 concurrency_limit_reached: the previous request hasn't
                    # been released yet. Serial fetching makes this rare; back off
                    # briefly rather than dropping a sentence on the floor.
                    if "429" in str(exc) and attempt < attempts - 1:
                        job.nbytes = 0
                        job.t_first_byte = None
                        time.sleep(0.25 * (attempt + 1))
                        continue
                    raise
        except Exception as exc:  # noqa: BLE001 - surfaced in the table
            job.error = f"{type(exc).__name__}: {exc}"
        finally:
            job.t_fetch_done = time.perf_counter()
            job.chunks.put(None)

    def _stream_one(self, job: Job) -> None:
        with self._http.post(
            STREAM_URL,
            headers={
                "Authorization": f"Bearer {self.sp._api_key}",
                "Accept": "audio/pcm",
                "Content-Type": "application/json",
            },
            json={"input": job.text, "voice_id": VOICE_ID, "model": MODEL},
            stream=True,
            timeout=self.sp.timeout,
        ) as r:
            if r.status_code != 200:
                raise RuntimeError(f"Speechify {r.status_code}: {r.text[:200]}")
            for chunk in r.iter_content(chunk_size=None):
                if not chunk:
                    continue
                if job.t_first_byte is None:
                    job.t_first_byte = time.perf_counter()
                job.nbytes += len(chunk)
                job.chunks.put(chunk)

    # ------------------------------------------------------------------ play

    def _play_loop(self) -> None:
        while True:
            job = self._play_q.get()
            if job is None:
                self._play_q.task_done()
                return
            try:
                self._play(job)
            finally:
                self._play_q.task_done()

    def _play(self, job: Job) -> None:
        sp = self.sp
        with sp._speak_lock:
            job.t_play_start = time.perf_counter()
            sp._reset()
            while True:
                chunk = job.chunks.get()
                if chunk is None:
                    break
                sp._feed(chunk)
            sp._eos = True
            if not sp._open:
                sp._open = True  # utterance shorter than the 150 ms prebuffer
            if job.nbytes:
                sp._drain()
            job.t_done = time.perf_counter()
            sp._open = False
            job.t_first_sample = sp._first_sample_t
            job.silence_ms = round(sp._silence_frames / sp.samplerate * 1000.0, 1)


class Exchange:
    """Timings for one wake -> reply -> audio cycle."""

    def __init__(self, label: str, utterance: str):
        self.label = label
        self.utterance = utterance
        self.t_wake: float | None = None
        self.t0: float | None = None
        self.t_first_delta: float | None = None
        self.t_first_sentence: float | None = None
        self.t_text_done: float | None = None
        self.t_audio_done: float | None = None
        self.reply = ""
        self.jobs: list[Job] = []

    # headline hops -------------------------------------------------------
    @property
    def first_job(self) -> Job | None:
        return self.jobs[0] if self.jobs else None

    @property
    def input_to_first_delta(self):
        return _ms(self.t0, self.t_first_delta)

    @property
    def input_to_first_sentence(self):
        return _ms(self.t0, self.t_first_sentence)

    @property
    def sentence_to_ttfb(self):
        j = self.first_job
        return _ms(j.t_sentence, j.t_first_byte) if j else None

    @property
    def ttfb_to_audible(self):
        j = self.first_job
        return _ms(j.t_first_byte, j.t_first_sample) if j else None

    @property
    def input_to_first_audible(self):
        j = self.first_job
        return _ms(self.t0, j.t_first_sample) if j else None

    @property
    def input_to_audio_done(self):
        return _ms(self.t0, self.t_audio_done)

    @property
    def speech_lead(self):
        """How far the first spoken sample lands ahead of the end of the text turn."""
        j = self.first_job
        if not j or j.t_first_sample is None or self.t_text_done is None:
            return None
        return round((self.t_text_done - j.t_first_sample) * 1000.0, 1)

    # rendering -----------------------------------------------------------
    def print_table(self) -> None:
        print()
        print(f"  --- {self.label}: {self.utterance!r}")
        print(f"  reply: {self.reply}")
        rows = [
            ("earcon -> input sent", _ms(self.t_wake, self.t0)),
            ("input -> first text delta (approx)", self.input_to_first_delta),
            ("input -> first sentence closed", self.input_to_first_sentence),
            ("sentence -> TTS first byte", self.sentence_to_ttfb),
            ("TTS first byte -> first audible sample", self.ttfb_to_audible),
            ("INPUT -> FIRST AUDIBLE SAMPLE", self.input_to_first_audible),
            ("input -> reply text complete", _ms(self.t0, self.t_text_done)),
            ("input -> audio complete", self.input_to_audio_done),
            ("audio started ahead of end-of-turn by", self.speech_lead),
        ]
        width = max(len(r[0]) for r in rows)
        for name, value in rows:
            mark = "  <<<" if name.startswith("INPUT") else ""
            print(f"    {name:<{width}}  {_fmt(value):>6} ms{mark}")

        print(f"    {'sentences':<{width}}")
        head = (f"      {'#':>2} {'@ms':>6} {'ttfb':>6} {'audible@':>9} "
                f"{'audio':>6} {'sil':>5} {'pre':>4}  text")
        print(head)
        prev_done = None
        for pos, j in enumerate(self.jobs, 1):
            gap = _ms(prev_done, j.t_first_sample)
            prev_done = j.t_done
            txt = j.text if len(j.text) <= 46 else j.text[:43] + "..."
            print(
                f"      {pos:>2} {_fmt(_ms(self.t0, j.t_sentence)):>6} "
                f"{_fmt(_ms(j.t_fetch_start, j.t_first_byte)):>6} "
                f"{_fmt(_ms(self.t0, j.t_first_sample)):>9} "
                f"{j.audio_s:>6.2f} {j.silence_ms:>5.0f} "
                f"{('yes' if j.prefetched else 'no'):>4}  {txt}"
                + (f"  [gap {_fmt(gap)} ms]" if gap is not None else "")
                + (f"  ERROR {j.error}" if j.error else "")
            )


def summary_markdown(exchanges: list[Exchange]) -> str:
    """The three-run table, as markdown (also what gets pasted into Linear)."""
    cols = [
        ("hop (ms)", None),
    ] + [(e.label, e) for e in exchanges]
    rows = [
        ("input -> first text delta", lambda e: e.input_to_first_delta),
        ("input -> first sentence", lambda e: e.input_to_first_sentence),
        ("sentence -> TTS first byte", lambda e: e.sentence_to_ttfb),
        ("TTS first byte -> first audible", lambda e: e.ttfb_to_audible),
        ("**input -> first audible**", lambda e: e.input_to_first_audible),
        ("input -> reply text complete", lambda e: _ms(e.t0, e.t_text_done)),
        ("input -> audio complete", lambda e: e.input_to_audio_done),
        ("sentences spoken", lambda e: len(e.jobs)),
        ("inserted silence (ms)", lambda e: round(sum(j.silence_ms for j in e.jobs), 1)),
    ]
    out = ["| " + " | ".join(c[0] for c in cols) + " |"]
    out.append("|" + "|".join(["---"] * len(cols)) + "|")
    for name, get in rows:
        cells = [name]
        for _, e in cols[1:]:
            v = get(e)
            cells.append("--" if v is None else (f"{v:.0f}" if isinstance(v, float) else str(v)))
        out.append("| " + " | ".join(cells) + " |")
    return "\n".join(out)


async def run_exchange(session: VoiceSession, pipe: SentencePipeline,
                       label: str, utterance: str,
                       t_wake: float | None = None) -> Exchange:
    """One full cycle. Pass t_wake if the earcon already fired (interactive wake)."""
    ex = Exchange(label, utterance)

    if t_wake is None:
        ex.t_wake = time.perf_counter()
        pipe.sp.earcon()
    else:
        ex.t_wake = t_wake

    mono_ref = time.monotonic()
    perf_ref = time.perf_counter()
    ex.t0 = perf_ref

    async for kind, chunk, _t in session.ask(utterance):
        now = time.perf_counter()
        if kind == "sentence":
            if ex.t_first_sentence is None:
                ex.t_first_sentence = now
            ex.jobs.append(pipe.enqueue(chunk, now))
        else:  # "done"
            ex.t_text_done = now
            ex.reply = chunk

    if session.last_first_delta_t is not None:
        ex.t_first_delta = session.last_first_delta_t + (perf_ref - mono_ref)

    await asyncio.to_thread(pipe.wait_idle)
    ex.t_audio_done = max((j.t_done for j in ex.jobs if j.t_done), default=None)
    ex.print_table()
    return ex


async def interactive(session: VoiceSession, pipe: SentencePipeline) -> None:
    print("\ninteractive: Enter = wake (earcon), then type the utterance. "
          "'q' + Enter quits.\n")
    n = 0
    while True:
        try:
            line = (await asyncio.to_thread(
                input, "[Enter=wake | type an utterance] > ")).strip()
        except EOFError:
            return  # no terminal attached (e.g. `ptc run` without -i)
        if line.lower() in {"q", "quit", "exit"}:
            return
        if not line:
            # wake stand-in: ack now, then take the dictation line
            t_wake = time.perf_counter()
            pipe.sp.earcon()
            try:
                line = (await asyncio.to_thread(input, "you: ")).strip()
            except EOFError:
                return
            if line.lower() in {"q", "quit", "exit"}:
                return
            if not line:
                continue
            await run_exchange(session, pipe, f"turn {n + 1}", line, t_wake=t_wake)
        else:
            await run_exchange(session, pipe, f"turn {n + 1}", line)
        n += 1


async def main() -> None:
    ap = argparse.ArgumentParser(description="voice-loop latency skeleton")
    ap.add_argument("--auto", action="store_true",
                    help="run three canned utterances and print the summary table")
    ap.add_argument("--model", default=None, help="claude model override")
    args = ap.parse_args()

    # Replies contain em dashes; the Windows console is cp1252 by default.
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

    # `ptc run` swallows script arguments (no passthrough), so --auto is also
    # selectable by env, and is the default whenever stdin isn't a terminal --
    # interactive mode has nothing to read in that case anyway.
    auto = args.auto or os.environ.get("VL_AUTO") == "1" or not sys.stdin.isatty()
    if os.environ.get("VL_INTERACTIVE") == "1":
        auto = False

    sp = Speaker()
    print(f"speaker: device={sp.device} host_api={sp.host_api} "
          f"buffer={float(sp.stream.latency) * 1000:.1f} ms")
    pipe = SentencePipeline(sp)
    threading.Thread(target=pipe.warm, daemon=True).start()  # TLS handshake off the path

    t = time.perf_counter()
    session = VoiceSession(model=args.model)
    await session.connect()
    print(f"brain: connected in {(time.perf_counter() - t) * 1000:.0f} ms")

    exchanges: list[Exchange] = []
    try:
        if auto:
            for label, utterance in AUTO_UTTERANCES:
                exchanges.append(await run_exchange(session, pipe, label, utterance))
            print("\n=== three-run summary (ms) ===\n")
            print(summary_markdown(exchanges))
            print()
        else:
            await interactive(session, pipe)
    finally:
        await session.close()
        pipe.close()
        sp.close()


if __name__ == "__main__":
    asyncio.run(main())
