# Loop-owned Claude session: SDK vs `claude -p --resume`

Research for OLD-86. Verified 2026-08-14 against live docs on `code.claude.com`
(`docs.claude.com/en/docs/claude-code/*` 301-redirects there now) plus one local
experiment on this machine (Windows 10, `claude.exe` v2.1.71).

---

## Verdict

**Use the Python Agent SDK with a long-lived `ClaudeSDKClient`, `include_partial_messages=True`,
and speak on `text_delta` events. Do not spawn `claude -p --resume` per exchange.**

Why, in order of impact on time-to-first-sentence (TTFS):

1. **No process spawn per turn.** `ClaudeSDKClient` holds one CLI subprocess open across
   `client.query()` calls ([sessions](https://code.claude.com/docs/en/agent-sdk/sessions#python-claudesdkclient)).
   Every `claude -p --resume` invocation instead re-pays: binary boot, settings/hooks/plugin/MCP
   discovery, CLAUDE.md load, transcript replay from disk, new TLS connection. That is dead time
   before the first token on *every* utterance.
2. **Token-level deltas.** Both routes can stream, but the SDK gives typed `StreamEvent` objects
   with no `--verbose` requirement and no NDJSON parsing of your own
   ([streaming output](https://code.claude.com/docs/en/agent-sdk/streaming-output)).
3. **Live control without restarting.** `set_model()`, `set_permission_mode()`, `interrupt()` are
   methods on the live client ([python reference](https://code.claude.com/docs/en/agent-sdk/python)),
   so a barge-in ("stop talking") is one `await client.interrupt()` rather than killing a process.

The CLI is not wrong, it is just the same thing with more moving parts: the SDK *is* a wrapper
around a `claude` subprocess driven with `--input-format stream-json --output-format stream-json`.
If you ever shell out, shell out **once** to a persistent process on that flag pair — never
per exchange.

### Minimal sketch

```python
# pip install claude-agent-sdk
import asyncio, re
from claude_agent_sdk import ClaudeSDKClient, ClaudeAgentOptions, ResultMessage
from claude_agent_sdk.types import StreamEvent

VOICE_PROMPT = """You are a spoken voice assistant. Every reply is read aloud by a
text-to-speech engine, so:
- Answer in 1-3 short spoken sentences. No lists, no markdown, no code blocks, no URLs.
- Lead with the answer. Do not open with a preamble about what you are about to do.
- If the real answer is long or is code, write it to a file and say only where it went,
  e.g. "Wrote it to notes slash plan dot md."
- Never read a file path character by character; say it naturally."""

SENTENCE_END = re.compile(r"(?<=[.!?])\s+")

options = ClaudeAgentOptions(
    system_prompt={"type": "preset", "preset": "claude_code", "append": VOICE_PROMPT},
    include_partial_messages=True,       # -> StreamEvent text deltas
    tools=["Read", "Write", "Edit", "Glob", "Grep"],   # hard tool surface
    allowed_tools=["Read", "Write", "Edit", "Glob", "Grep"],  # auto-approve, never prompt
    permission_mode="dontAsk",           # no interactive prompt can ever block the loop
    thinking={"type": "disabled"},       # thinking deltas would land before the first text
    effort="low",
    setting_sources=["project"],         # loads CLAUDE.md; see "standing prompt" below
    cwd=r"C:\Dev\VR",
    max_turns=6,
    env={"CLAUDECODE": ""},              # see "Windows caveats" - nested-session guard
)

async def main(utterances, speak):
    async with ClaudeSDKClient(options=options) as client:   # one subprocess, kept alive
        async for text in utterances:                        # from wake word + Wispr
            await client.query(text)
            buf = ""
            async for msg in client.receive_response():      # ends at ResultMessage
                if isinstance(msg, StreamEvent):
                    ev = msg.event
                    if ev.get("type") == "content_block_delta":
                        d = ev.get("delta", {})
                        if d.get("type") == "text_delta":
                            buf += d.get("text", "")
                            # flush whole sentences to TTS as soon as they close
                            while (m := SENTENCE_END.search(buf)):
                                speak(buf[:m.start() + 1]); buf = buf[m.end():]
                elif isinstance(msg, ResultMessage):
                    if buf.strip():
                        speak(buf.strip())
                    print(msg.session_id, msg.total_cost_usd)

asyncio.run(main(...))
```

Event order is fixed and documented: `message_start` → `content_block_start` →
`content_block_delta` … → `content_block_stop` → … → `AssistantMessage` → `ResultMessage`
([streaming output § message flow](https://code.claude.com/docs/en/agent-sdk/streaming-output)).
The TypeScript type carries `ttft_ms` on `message_start`; use `message_start` arrival as your
own TTFS probe in Python.

### TTFS levers, ranked

| Lever | Effect |
| --- | --- |
| Persistent client instead of per-turn spawn | Removes the whole startup path from every utterance |
| `thinking={"type": "disabled"}` | Thinking blocks stream *before* text; leaving them on delays the first spoken word by the full thinking budget |
| `effort="low"` | Documented as "minimal reasoning, fast responses" ([agent loop § effort](https://code.claude.com/docs/en/agent-sdk/agent-loop)) |
| Small `tools` list | Tool definitions sit in the system prompt layer; fewer tools = smaller prefix, and fewer tool round-trips before text |
| Standing prompt says "answer first, then write files" | Text blocks stream ahead of `tool_use` blocks in the same turn, so an answer-first instruction gets audio started while the file write still happens |
| Flush on sentence boundary, not on `AssistantMessage` | The whole point: TTS starts at the first `.` |
| Keep the session warm (see cost section) | A cache-warm turn skips reprocessing the entire history |

---

## Session persistence and resume

**Where sessions live.** `~/.claude/projects/<encoded-cwd>/<session-id>.jsonl` — on Windows,
`%USERPROFILE%\.claude\projects\...`, or under `$CLAUDE_CONFIG_DIR/projects/` if set. The encoding
replaces every non-alphanumeric character in the absolute cwd with `-`, so `C:\Dev\VR` becomes
`c--Dev-VR` ([sessions](https://code.claude.com/docs/en/agent-sdk/sessions#resume-by-id)). Verified
on this machine: `C:\Users\AtheA\.claude\projects\c--Dev-VR\<uuid>.jsonl`.

**In-process.** `ClaudeSDKClient` tracks the session id internally; each `client.query()`
continues the same session with no id handling. Nothing to do while the loop is up.

**Across loop restarts.** Two options:

- Pin the id yourself. Generate a UUID once, pass `session_id=<uuid>` on first start and
  `resume=<uuid>` on every subsequent start. Deterministic, no lookup.
- Or capture `ResultMessage.session_id` after each turn, persist it to a small state file, and
  pass it to `resume` next boot. `ResultMessage.session_id` is present on every result regardless
  of success or error.

`continue_conversation=True` resumes the most recent session in the cwd without an id — simpler,
but it will silently attach to whatever else last ran in that directory, including your
interactive terminal session. Since the whole point of this design is a *dedicated* session,
use an explicit id.

**Caveats.**
- Resume is same-machine only; the `.jsonl` has to exist locally.
- Cross-project id lookup ("search every project on this machine") landed in v2.1.223. The CLI
  installed here is **2.1.71**, so id lookup is scoped to the current project directory and its
  git worktrees. Keep `cwd` stable across restarts.
- `fork_session=True` starts a new id from a copy of the history — useful if you want a
  "start a fresh thread but keep what we just discussed" voice command.
- `--no-session-persistence` (CLI) / `CLAUDE_CODE_SKIP_PROMPT_HISTORY` (Python `env`) suppress
  transcript writes if you'd rather nothing hit disk. That also kills restart-resume.

---

## Standing voice system prompt

**The SDK default is not Claude Code's prompt.** With no `system_prompt` set, the SDK uses a
minimal tool-calling prompt — unlike `claude -p`, which uses the full Claude Code prompt
([modifying system prompts](https://code.claude.com/docs/en/agent-sdk/modifying-system-prompts)).
For a voice assistant that still reads and writes files in a repo, the preset-plus-append form is
the right starting point:

```python
system_prompt={"type": "preset", "preset": "claude_code", "append": VOICE_PROMPT}
```

CLI equivalent: `--append-system-prompt "<text>"` (append) or `--system-prompt "<text>"` (replace).

**It does not persist across resume — on either route.** The system prompt is rebuilt per process
from flags/options; the transcript stores only messages. Verified structurally: dumping the
top-level keys of every line in a real session `.jsonl` on this machine yields only
`user` / `assistant` / `attachment` / `queue-operation` records, and the only prompt-ish keys are
`promptId`, `promptSource`, `lastPrompt`. No system prompt field exists. The docs agree from the
other direction — the comparison table lists `systemPrompt` with append as **Persistence: session
only**, versus CLAUDE.md and output styles which are files.

Practical consequence: **re-supply the voice prompt on every process start**, and if you ever do
shell out, on every single `claude -p --resume` invocation.

**Compaction erodes it too.** "Compaction replaces older messages with a summary, so specific
instructions from early in the conversation may not be preserved. Persistent rules belong in
CLAUDE.md … because CLAUDE.md content is re-injected on every request"
([agent loop § automatic compaction](https://code.claude.com/docs/en/agent-sdk/agent-loop)). The
system prompt itself survives compaction, but for a session that runs for hours the belt-and-braces
move is to put the voice rules in **both**: `append` on the system prompt *and* a
`.claude/CLAUDE.md` in the voice session's `cwd`, loaded via `setting_sources=["project"]`.

Note that CLAUDE.md is read once at session start and held in memory — editing it mid-session
changes nothing until restart ([prompt caching § editing CLAUDE.md](https://code.claude.com/docs/en/prompt-caching)).

**Size limit.** A string `system_prompt` is passed as one argv entry to the CLI subprocess, and
**Windows caps the whole command line at roughly 32 KB**, so a long prompt fails at process spawn
before any API call. Past a few KB use `system_prompt={"type": "file", "path": "..."}`
([SystemPromptFile](https://code.claude.com/docs/en/agent-sdk/python)). The append form inside the
preset object has the same argv exposure.

---

## Restricting tools for the voice session

Three distinct knobs, and they are not interchangeable:

| Knob | What it does |
| --- | --- |
| `tools=[...]` (CLI `--tools`) | **Restricts which built-in tools exist at all.** `""` disables all, `"default"` for all. Does not affect MCP tools. This is the one that shrinks the system prompt. |
| `allowed_tools=[...]` | Auto-approves listed tools. Unlisted tools still exist and would need a permission decision. |
| `disallowed_tools=[...]` | Deny rules. A bare tool name **removes** the tool from context; a scoped rule like `Bash(rm *)` leaves the tool and denies only matching calls. |
| `permission_mode` | `"dontAsk"` never prompts: pre-approved tools run, everything else is denied. Correct for a headless voice loop — a hard deny beats a silent hang waiting on a prompt nobody can see. |

For this loop: `tools=["Read","Write","Edit","Glob","Grep"]` + the same list in `allowed_tools`
+ `permission_mode="dontAsk"`. Leave `Bash` out unless you want it; leave `WebSearch`/`WebFetch`
out unless voice questions need the web (they add latency and tool round-trips before speech).
Avoid `bypassPermissions` — you gain nothing over `dontAsk` here and lose the guardrail.

Watch the cache: adding or removing a bare-name deny rule, or connecting/disconnecting an MCP
server whose tools load into the prefix, **invalidates the entire cache** because tool definitions
sit in the system prompt layer. Decide the tool surface once at startup and don't touch it.

---

## Auth in a background process

The SDK spawns the `claude` CLI, so CLI auth precedence applies
([authentication](https://code.claude.com/docs/en/authentication)):

1. Cloud provider (`CLAUDE_CODE_USE_BEDROCK` / `_VERTEX` / `_FOUNDRY`)
2. `ANTHROPIC_AUTH_TOKEN`
3. `ANTHROPIC_API_KEY` — **in `-p` mode the key is always used when present**, no prompt
4. `apiKeyHelper`
5. `CLAUDE_CODE_OAUTH_TOKEN`
6. Anthropic profile / federation credentials
7. Subscription OAuth from `/login`

So: **yes, a background process inherits your logged-in CLI credentials** — stored on Windows at
`%USERPROFILE%\.claude\.credentials.json`, protected by your user profile's ACLs — provided no
`ANTHROPIC_API_KEY` is set in the loop's environment. If one leaks in from a shell profile, the
key silently wins and you bill the API instead of the subscription. Scrub it explicitly in the
loop's env.

Three traps for an always-on process:

- **`--bare` forfeits your login.** It's the documented way to cut startup time (skips hooks,
  skills, plugins, MCP, auto memory, CLAUDE.md), but "in bare mode, Claude Code never reads OAuth
  credentials or the system keychain" and it does not read `CLAUDE_CODE_OAUTH_TOKEN` either — it
  needs `ANTHROPIC_API_KEY` or an `apiKeyHelper` ([headless § bare mode](https://code.claude.com/docs/en/headless)).
  Startup only matters once per loop lifetime with a persistent client, so this trade is not worth
  taking. (Also: `--bare` does not exist in the v2.1.71 CLI installed here.)
- **Logins expire.** A subscription login shows a warning three days out and then fails every
  request with `Login expired · Please run /login`. The docs call this out specifically for
  unattended sessions. Handle it: surface auth failures as spoken errors rather than silence, and
  consider `claude setup-token` → `CLAUDE_CODE_OAUTH_TOKEN` (one-year token, subscription-backed,
  model requests only) so the loop doesn't depend on interactive re-login.
- **Terms.** The SDK quickstart states: "Unless previously approved, Anthropic does not allow third
  party developers to offer claude.ai login or rate limits for their products, including agents
  built on the Claude Agent SDK." That is aimed at shipping a product to other people. A personal
  loop on your own machine using your own subscription is you using Claude Code; if this ever
  ships to anyone else, it needs API-key auth.

---

## Cost of an ever-growing session

Mechanics ([prompt caching](https://code.claude.com/docs/en/prompt-caching)): the model is
stateless, so every turn re-sends system prompt + project context + full history + the new
message. Prompt caching matches the **prefix**; on a normal turn the entire previous request is
the prefix, only the latest exchange is new. Cache reads bill at **roughly 10% of the standard
input rate** (`cache_read_input_tokens`), writes at the write rate (`cache_creation_input_tokens`).

Numbers to plan around:

- **On a Claude subscription, Claude Code requests the one-hour cache TTL automatically.** So a
  voice session survives gaps of up to an hour cheaply. On an API key the default is five minutes;
  `ENABLE_PROMPT_CACHING_1H=1` opts in.
- Voice exchanges are small — a couple of hundred tokens per turn — so the *marginal* cost per
  utterance is roughly (10% × growing history) + (100% × new exchange). This is cheap for a long
  time, and then it isn't: history grows monotonically and every turn pays 10% of all of it.
- **Auto-compaction** fires near the context limit and emits `SystemMessage` with subtype
  `"compact_boundary"`. It invalidates the conversation layer by design. In a voice loop this shows
  up as one long, silent pause — bad UX.
- **The worst single request you can send is the first turn back into a long resumed session after
  a Claude Code upgrade**: "Resuming a session after an upgrade reprocesses the entire conversation
  history with no cache hits… the first turn back into a long session can be the most expensive
  request you send." An always-on loop against an auto-updating CLI will hit this.

**Recommendation: start fresh, deliberately and often.** A voice assistant almost never needs
yesterday's transcript.

- Rotate the session on a policy — e.g. new session id after N exchanges (~30), or after an idle
  gap longer than the cache TTL, or on an explicit "new topic" voice command. A cold small session
  is cheaper *and* lower-latency than a warm huge one.
- Watch `ResultMessage.usage.cache_read_input_tokens` climb; when it crosses a threshold you pick,
  rotate rather than let auto-compaction decide.
- Rotate proactively on idle: if the last turn was over an hour ago (subscription TTL), the cache
  is cold anyway, so there is no saving left in the old session — only the cost of carrying it.
- Set `max_budget_usd` as a backstop. Hitting it yields `error_max_budget_usd`.
- Anything worth keeping goes to a file (which the standing prompt already mandates), not into the
  transcript.

Also note the cache is scoped to machine **and directory**, and "sequential sessions share the
prefix only when the git status snapshot at startup matches, since the system prompt also captures
branch and recent commits." Running the voice session inside an active git repo means every branch
switch or new commit cold-starts the prefix on the next restart. If the loop doesn't need repo
context, point `cwd` at a stable non-git scratch directory and use `add_dirs` to reach the repo.

---

## Windows caveats

**1. The nested-session guard — the one that will bite first.** Verified on this machine: launching
`claude -p` from inside a Claude Code session fails in ~0.3 s with

```
Error: Claude Code cannot be launched inside another Claude Code session.
Nested sessions share runtime resources and will crash all active sessions.
To bypass this check, unset the CLAUDECODE environment variable.
```

The loop is a *separate* Claude session by design, so this is fine in normal operation — but if
you ever start the loop from a terminal that Claude Code spawned, or test it from inside a Claude
Code session, it dies instantly. Scrub `CLAUDECODE` (and `CLAUDE_CODE_ENTRYPOINT`) from the child
env in your loop's process launch. Same applies to the SDK, which spawns the same binary.

**2. Bash tool needs Git for Windows.** `Claude Code on Windows requires either Git for Windows
(for bash) or PowerShell`. Claude Code looks for `bash.exe` in `C:\Program Files\Git` and
`C:\Program Files (x86)\Git`, then the `git` on PATH; override with
`CLAUDE_CODE_GIT_BASH_PATH="C:\Program Files\Git\bin\bash.exe"` (env or the `env` block of
`settings.json`). Moot if you exclude `Bash` from the voice session's tool list, which is the
recommendation above.

**3. ~32 KB command-line cap.** Covered in the system-prompt section — use the file form for any
substantial standing prompt.

**4. ARM64 Windows wheels.** "If pip installs the Python SDK's source distribution instead of a
platform wheel, for example on ARM64 Windows, no binary is bundled" — then you must install Claude
Code natively and the SDK finds it on PATH. This box is x64, so the bundled binary applies; the SDK
carries **its own** Claude Code build, which will not be the v2.1.71 on PATH. Two consequences:
the loop gets newer features than the interactive CLI here, and an SDK upgrade is a Claude Code
upgrade for cache purposes (see cost section). Pin `claude-agent-sdk` and upgrade deliberately.

**5. stdin.** "If Claude Code can't read stdin, for example because the process that started it
disconnected its end, Claude Code prints a warning to stderr and continues" — and before v2.1.211
"an unreadable stdin on Windows crashed the session or made it exit silently with no output." The
installed 2.1.71 is on the wrong side of that fix. A daemonized loop with no console is exactly the
shape that triggers it. Either let the SDK own stdin (it does), or upgrade the CLI.

**6. Wire up `stderr`.** Pass `stderr=lambda line: log(line)` in `ClaudeAgentOptions` — otherwise
subprocess failures on Windows are invisible and the loop just goes quiet.

**7. PowerShell `.ps1` shims.** Existing project gotcha (see `CLAUDE.md`): use `npm.cmd` / `npx.cmd`.
Irrelevant if you install the SDK via pip, which is the recommendation.

---

## If you must shell out anyway

Not recommended, but for completeness — do it as **one persistent process**, not per exchange:

```
claude -p --input-format stream-json --output-format stream-json --verbose \
       --include-partial-messages --replay-user-messages \
       --session-id <uuid> --append-system-prompt "<voice prompt>" \
       --tools "Read,Write,Edit,Glob,Grep" --permission-mode dontAsk
```

Write one JSON object per line to stdin per utterance:
`{"type":"user","message":{"role":"user","content":"<text>"},"parent_tool_use_id":null}` and read
NDJSON off stdout. Filter for `.type == "stream_event" and .event.delta.type == "text_delta"` and
concatenate `.event.delta.text` — the documented jq one-liner is
`jq -rj 'select(.type == "stream_event" and .event.delta.type? == "text_delta") | .event.delta.text'`
([headless § stream responses](https://code.claude.com/docs/en/headless)).

Notes: `--include-partial-messages` **requires** `--print` and `--output-format stream-json`, and
the docs pair it with `--verbose`. The last line of a turn is a `result` message carrying
`session_id`, cost, and usage. `system`/`init` is the first event and reports model, tools, MCP
servers. `system`/`api_retry` events tell you a request is being retried — surface that as "one
moment" rather than dead air. This is precisely what the SDK does for you, with types.

The per-exchange `claude -p --resume <id>` shape is the one to avoid: full cold start, settings
discovery, and transcript replay in front of every single spoken answer.

---

## Sources

- https://code.claude.com/docs/en/cli-reference
- https://code.claude.com/docs/en/headless
- https://code.claude.com/docs/en/agent-sdk/python
- https://code.claude.com/docs/en/agent-sdk/sessions
- https://code.claude.com/docs/en/agent-sdk/streaming-output
- https://code.claude.com/docs/en/agent-sdk/streaming-input
- https://code.claude.com/docs/en/agent-sdk/agent-loop
- https://code.claude.com/docs/en/agent-sdk/modifying-system-prompts
- https://code.claude.com/docs/en/agent-sdk/quickstart
- https://code.claude.com/docs/en/authentication
- https://code.claude.com/docs/en/prompt-caching
- https://code.claude.com/docs/en/troubleshoot-install

Local checks: `claude --version` → 2.1.71; `claude --help` flag inventory; nested-session guard
reproduced; `~/.claude/projects/c--Dev-VR/*.jsonl` key structure inspected.
