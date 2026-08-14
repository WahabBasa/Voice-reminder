"""Claude session module for the voice loop.

One long-lived ``ClaudeSDKClient`` subprocess, kept warm across utterances.
Text deltas are accumulated and flushed to the caller at sentence boundaries so
TTS can start speaking at the first full stop instead of at end-of-turn.

Design follows docs/voice-loop/claude-session-mechanics.md:
  - long-lived client (no process spawn per turn)
  - include_partial_messages=True -> StreamEvent text deltas
  - thinking disabled, effort low (thinking blocks stream *before* text)
  - no tools at all (pure chat: tool round-trips add latency variance)
  - system prompt re-supplied on every connect (it never survives resume)
  - CLAUDECODE / CLAUDE_CODE_ENTRYPOINT scrubbed from the child env, or the
    CLI refuses to launch nested inside another Claude Code session

Usage:

    session = VoiceSession()
    await session.connect()
    async for kind, text, t in session.ask("hey, what's up?"):
        if kind == "sentence":
            speak(text)          # t is time.monotonic() at sentence close
        elif kind == "done":
            log(text)            # full reply
    await session.close()
"""

from __future__ import annotations

import os
import re
import time
from collections.abc import AsyncIterator, Callable
from typing import Any

from claude_agent_sdk import (
    AssistantMessage,
    ClaudeAgentOptions,
    ClaudeSDKClient,
    ResultMessage,
    StreamEvent,
    TextBlock,
)

__all__ = ["VoiceSession", "VOICE_SYSTEM_PROMPT", "split_sentences"]

# Exact standing prompt for the voice channel. Supplied on every connect --
# the transcript stores messages only, so a resumed session has no system
# prompt unless the process re-supplies it.
VOICE_SYSTEM_PROMPT = (
    "You are Claude on a voice channel. Your reply will be spoken aloud by TTS. "
    "Answer in 1-3 short conversational sentences. Never use code blocks, bullet "
    "lists, headers, file paths, or URLs — say things in words. If an answer "
    "genuinely needs long-form detail, say you would write it to a file and give "
    "the one-line version. Keep numbers round and speakable."
)

VOICE_LOOP_DIR = r"C:\Dev\VR\voice-loop"

# A sentence closes on . ! ? (optionally followed by a closing quote/bracket)
# when the next character is whitespace. End-of-buffer is deliberately NOT a
# match while streaming -- a trailing "." may just be a half-arrived token --
# so the tail is flushed once at end of turn instead.
_SENTENCE_END = re.compile(r"[.!?]+[\"')\]]*(?=\s)")

# Don't flush fragments; "Sure." on its own is worse for TTS than waiting.
MIN_SENTENCE_CHARS = 15

# Env vars that make the CLI refuse to launch (nested-session guard).
_NESTED_GUARD_VARS = ("CLAUDECODE", "CLAUDE_CODE_ENTRYPOINT")


def scrub_nested_session_env() -> dict[str, str]:
    """Remove the nested-session guard vars from this process's environment.

    The SDK builds the child env from ``os.environ``, so clearing them here is
    what actually reaches the subprocess. Returns what was removed (for
    restore in tests). Safe to call repeatedly.
    """
    removed: dict[str, str] = {}
    for name in _NESTED_GUARD_VARS:
        value = os.environ.pop(name, None)
        if value is not None:
            removed[name] = value
    return removed


def split_sentences(buf: str, min_chars: int = MIN_SENTENCE_CHARS) -> tuple[list[str], str]:
    """Pull every complete sentence out of ``buf``.

    Returns ``(sentences, remainder)``. A candidate boundary shorter than
    ``min_chars`` is skipped and folded into the next sentence.
    """
    out: list[str] = []
    while True:
        match = None
        for candidate in _SENTENCE_END.finditer(buf):
            if len(buf[: candidate.end()].strip()) >= min_chars:
                match = candidate
                break
        if match is None:
            return out, buf
        cut = match.end()
        sentence = buf[:cut].strip()
        buf = buf[cut:].lstrip()
        if sentence:
            out.append(sentence)


class VoiceSession:
    """A warm Claude chat session driven by voice utterances."""

    def __init__(
        self,
        cwd: str = VOICE_LOOP_DIR,
        *,
        system_prompt: str = VOICE_SYSTEM_PROMPT,
        model: str | None = None,
        effort: str = "low",
        session_id: str | None = None,
        resume: str | None = None,
        max_turns: int = 2,
        min_sentence_chars: int = MIN_SENTENCE_CHARS,
        on_stderr: Callable[[str], None] | None = None,
    ) -> None:
        self.cwd = cwd
        self.system_prompt = system_prompt
        self.model = model
        self.effort = effort
        self.session_id = session_id
        self.resume = resume
        self.max_turns = max_turns
        self.min_sentence_chars = min_sentence_chars
        self.on_stderr = on_stderr

        self._client: ClaudeSDKClient | None = None
        self._busy = False

        # Populated after each turn, for the assembly slice's telemetry.
        self.last_send_t: float | None = None
        self.last_first_delta_t: float | None = None
        self.last_result: ResultMessage | None = None
        self.last_error: str | None = None
        self.stderr_lines: list[str] = []

    # ---------------------------------------------------------------- setup

    def _build_options(self) -> ClaudeAgentOptions:
        return ClaudeAgentOptions(
            # Pure chat. tools=[] emits `--tools ""`, which removes every
            # built-in tool from the system prompt -- smaller prefix, no tool
            # round-trips in front of the first spoken word.
            tools=[],
            allowed_tools=[],
            permission_mode="dontAsk",
            system_prompt=self.system_prompt,
            include_partial_messages=True,
            thinking={"type": "disabled"},
            effort=self.effort,
            model=self.model,
            cwd=self.cwd,
            max_turns=self.max_turns,
            session_id=self.session_id,
            resume=self.resume,
            # Don't load user/project settings: no CLAUDE.md, hooks, plugins
            # or MCP servers in the latency path.
            setting_sources=None,
            stderr=self._handle_stderr,
        )

    def _handle_stderr(self, line: str) -> None:
        self.stderr_lines.append(line)
        if len(self.stderr_lines) > 200:
            del self.stderr_lines[:-200]
        if self.on_stderr is not None:
            self.on_stderr(line)

    async def connect(self) -> "VoiceSession":
        """Start the CLI subprocess and hold it open."""
        if self._client is not None:
            return self
        scrub_nested_session_env()
        client = ClaudeSDKClient(options=self._build_options())
        await client.connect()
        self._client = client
        return self

    # ----------------------------------------------------------------- turn

    async def ask(self, text: str) -> AsyncIterator[tuple[str, str, float]]:
        """Send one utterance; yield sentences as they close, then the reply.

        Yields ``("sentence", sentence_text, t_monotonic)`` each time a
        sentence completes out of the accumulated text deltas, then exactly one
        ``("done", full_reply, t_monotonic)``.

        This is an async generator -- iterate it, don't await it::

            async for kind, chunk, t in session.ask("hello"):
                ...
        """
        if self._client is None:
            raise RuntimeError("VoiceSession.ask() called before connect()")
        if self._busy:
            raise RuntimeError("VoiceSession.ask() is already running a turn")

        client = self._client
        self._busy = True
        self.last_error = None
        self.last_result = None
        self.last_first_delta_t = None
        buf = ""
        spoken: list[str] = []
        saw_delta = False

        try:
            self.last_send_t = time.monotonic()
            await client.query(text)

            async for message in client.receive_response():
                if isinstance(message, StreamEvent):
                    event: dict[str, Any] = message.event or {}
                    if event.get("type") != "content_block_delta":
                        continue
                    delta = event.get("delta") or {}
                    if delta.get("type") != "text_delta":
                        continue
                    piece = delta.get("text") or ""
                    if not piece:
                        continue
                    if not saw_delta:
                        saw_delta = True
                        self.last_first_delta_t = time.monotonic()
                    buf += piece
                    sentences, buf = split_sentences(buf, self.min_sentence_chars)
                    for sentence in sentences:
                        spoken.append(sentence)
                        yield ("sentence", sentence, time.monotonic())

                elif isinstance(message, AssistantMessage):
                    # Fallback only: if partial messages never arrived (older
                    # CLI, or deltas disabled), take the whole block here so
                    # the caller still gets audio.
                    if saw_delta:
                        continue
                    for block in message.content:
                        if isinstance(block, TextBlock) and block.text:
                            buf += block.text
                            sentences, buf = split_sentences(buf, self.min_sentence_chars)
                            for sentence in sentences:
                                spoken.append(sentence)
                                yield ("sentence", sentence, time.monotonic())

                elif isinstance(message, ResultMessage):
                    self.last_result = message
                    if message.session_id:
                        self.session_id = message.session_id
                    if getattr(message, "is_error", False):
                        self.last_error = (
                            getattr(message, "subtype", None) or "result_error"
                        )

            tail = buf.strip()
            if tail:
                spoken.append(tail)
                yield ("sentence", tail, time.monotonic())

            yield ("done", " ".join(spoken).strip(), time.monotonic())
        finally:
            self._busy = False

    async def interrupt(self) -> None:
        """Barge-in: stop the in-flight turn without killing the session."""
        if self._client is not None:
            await self._client.interrupt()

    # ---------------------------------------------------------------- close

    async def close(self) -> None:
        """Shut the subprocess down."""
        client, self._client = self._client, None
        if client is not None:
            await client.disconnect()

    async def __aenter__(self) -> "VoiceSession":
        return await self.connect()

    async def __aexit__(self, *_exc: object) -> None:
        await self.close()
