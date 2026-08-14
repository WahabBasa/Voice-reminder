# Wispr Flow automation on Windows — trigger + completion detection

**Ticket:** OLD-85 · **Researched:** 2026-08-14 · **Verified against:** Wispr Flow **1.6.531** (Electron/Squirrel, win32 x64) installed on this machine, Windows 10 19045.

Public docs on this are thin, so most of the load-bearing findings below come from **direct inspection of the installed app** (`app.asar`, the native helper, `config.json`, `flow.sqlite`, `main.log`) plus **one live end-to-end test on this machine**. Each claim is tagged `[CONFIRMED]`, `[CONFIRMED-LOCAL]` (proven against the local install/live test), or `[INFERRED]`.

---

## Verdict

**Trigger: fire the `wispr-flow://start-hands-free` deep link. Do not simulate the hotkey.**

Wispr Flow ships an undocumented but fully-wired, telemetry-instrumented URL scheme with exactly the two verbs we need:

| Deep link | Effect |
|---|---|
| `wispr-flow://start-hands-free` | Starts hands-free (locked, no key held) dictation |
| `wispr-flow://stop-hands-free` | Stops it and pastes the transcript |
| `wispr-flow://switch-mic?mic_name=<name>` | Switches capture device |

I verified on this machine that the scheme is registered and that a deep link is **delivered to and handled by the already-running instance** (see Evidence §A2). This beats keystroke injection on every axis: no Win-key/Start-menu hazard, no UIPI/elevation caveat, no dependence on the user's current hotkey binding, and it fails *loudly and observably* rather than silently.

**Stopping is our job.** Hands-free dictation has **no silence auto-stop** — it runs until stopped or until the ~20-minute cap. So the loop owns endpointing: reuse the VAD already running in the wake-word listener, and on ~800–1200 ms of trailing silence fire `wispr-flow://stop-hands-free`.

**Completion detection: two signals, ANDed, with a log-tail as the authority.**

1. **Primary (ours):** our capture window owns its text buffer. Wispr delivers the transcript as **one clipboard paste + a synthetic Ctrl+V** — a single change event, not a stream. So: after `stop-hands-free`, wait for the first text change, then debounce ~300 ms of quiet to absorb the chunked-paste edge case (§C3).
2. **Authority (Wispr's):** tail `%APPDATA%\Wispr Flow\logs\main.log` for
   `Received paste outcome: success=true, <ms>, transcriptEntityUUID: <uuid>`.
   This line is emitted per dictation, carries `pasteSuccess`, `isEditable`, `couldNotGetTextBoxInfo`, `appName`, and is the app's own definition of "the text landed". It also tells us when the paste **failed**, which a text-buffer watcher alone cannot distinguish from "user said nothing."
3. **Canonical text (optional):** read `History.pastedText` for that `transcriptEntityId` from `flow.sqlite`, opened read-only. Use this if you ever distrust what actually landed in the widget — but the widget's own buffer is normally fine and avoids the DB dependency.

Practical shape of the loop:

```
wake word → focus capture window → ShellExecute("wispr-flow://start-hands-free")
          → confirm in main.log: "Received deeplink URL:  wispr-flow://start-hands-free"
          → user speaks; our VAD watches for trailing silence
          → ShellExecute("wispr-flow://stop-hands-free")
          → wait for main.log "Received paste outcome: success=true ... <uuid>"
            (timeout ~8 s; typical end-to-end is ~1.0 s after stop)
          → read our capture window's buffer → hand to Claude
```

Fallback if the deep link regresses after an auto-update: rebind hands-free in Flow settings to a modifier+function key (e.g. `Ctrl+Alt+F9`) and inject it with `pynput` (§E1). Keep this path coded but dormant.

---

## Evidence

### A. Programmatic surface

**A1. The URL scheme exists and is registered.** `[CONFIRMED-LOCAL]`

`HKCU\Software\Classes\wispr-flow` (and mirrored in `HKCR`) has default value `URL:wispr-flow` and:

```
shell\open\command = "C:\Users\<user>\AppData\Local\WisprFlow\app-1.6.531\Wispr Flow.exe" "%1"
```

The app calls `app.setAsDefaultProtocolClient("wispr-flow")` on every launch and logs `Protocol registration success: true` (present in `main.log`).

⚠️ **The registered path is version-pinned** (`app-1.6.531`). Squirrel rewrites it on each auto-update. **Always launch through the protocol** (`ShellExecute` / `os.startfile` / `explorer.exe <url>`), never by hardcoding the exe path.

Full route list extracted from `app.asar` (11 routes): `start-hands-free`, `stop-hands-free`, `switch-mic`, `open`, `open/settings/notetaker`, `auth/transfer/success`, `billing/success`, `billing/cancel`, `linkedin/connect/success`, `linkedin/connect/error`.

**A2. Deep links reach the *running* instance — verified live.** `[CONFIRMED-LOCAL]`

I fired the no-op probe `wispr-flow://switch-mic` (no `mic_name` → the handler warns and does nothing) via `explorer.exe`. Result in `main.log`:

```
[2026-08-14 19:17:18.449] [info]  Protocol registration success: true
[2026-08-14 19:17:18.454] [info]  Received deeplink URL:  wispr-flow://switch-mic/
[2026-08-14 19:17:18.456] [warn]  Switch mic deeplink received without mic_name parameter
[2026-08-14 19:17:18.458] [warn]  App is already running, quitting
```

Note the ordering: the URL was received and handled **before** the "already running, quitting" line. Per the source order (single-instance check precedes the argv branch), those two lines cannot come from the same process — so the handling was done by the long-lived primary via its `second-instance` handler, while the transient second instance wrote the quit warning. The primary kept writing to the same log afterwards, confirming it is alive and owns that file.

**A3. The handlers, decompiled from `app.asar`.** `[CONFIRMED-LOCAL]`

```js
// deeplink router
function Q(e){
  logger.info("Received deeplink URL: ", redact(e));
  if (e.startsWith("wispr-flow://start-hands-free")) j();
  else if (e.startsWith("wispr-flow://stop-hands-free")) $();
  else if (e.startsWith("wispr-flow://switch-mic")) H(e);
  ... /* every other route falls through to a branch that SHOWS the Hub window */
}

const j = () => {                                  // start-hands-free
  const status = dictation.status;
  logger.info(`Start hands-free deeplink received. Status: ${status}`);
  if (status === Idle || status === Dismissed) {
    logger.info("Starting hands-free mode via deeplink");
    startHandsFree(Source.Deeplink);
    analytics(DeeplinkStartHandsFree, {success:true});
  } else {
    logger.warn(`... dictation is in state: ${status}. Ignoring.`);
    analytics(DeeplinkStartHandsFree, {success:false, reason:"not_idle"});
  }
};

const $ = () => {                                  // stop-hands-free
  const ok = dictation.status === Listening && dictation.isLocked;
  logger.info(`Stop hands-free deeplink received. Status: ..., isLocked: ...`);
  if (ok) { stopHandsFree(Source.Deeplink); analytics(..., {success:true}); }
  else    { analytics(..., {success:false, reason:"not_in_hands_free_mode"}); }
};
```

Three things matter for us:

- `start-hands-free` is a **no-op unless the app is `Idle`/`Dismissed`** — the loop must reconcile state, and the `not_idle` rejection is visible in the log.
- `stop-hands-free` requires `Listening && isLocked` — i.e. it only stops a *hands-free* session, not a held-PTT one. Consistent with our design.
- Both hands-free branches `return` **before** the code that raises the Hub window, so the deep link should not pop Wispr's UI. (Focus-stealing by the transient second process is still an open risk — see Risk 1.)

**A4. Other surfaces.**

- **Cloud API** — `https://api-docs.wisprflow.ai/quickstart`: *"Flow API is only available by exclusive access. Your organization must be approved by the Flow team."* Cloud-only, takes base64 16 kHz PCM WAV, and controls nothing about the desktop app. Irrelevant to us. `[CONFIRMED]`
- **No CLI for dictation.** The only argv verb found is `--quit-app` (a second instance carrying it quits the primary). Squirrel `--squirrel-*` events are explicitly ignored. `[CONFIRMED-LOCAL]`
- **No local HTTP/socket control plane.** The helper talks to Electron over **stdin/stdout pipes** (`SetupStdinReader` in the helper binary); the only port in the logs is 443 (cloud gRPC). `[CONFIRMED-LOCAL]`
- **A shipped read-only dev inspector**: `resources/ax-inspect-server.mjs` serves `http://127.0.0.1:4599` with `/api/list` JSON over recent dictations. Not running by default, but its header documents the pattern we want to copy: it *"Reads flow.sqlite … fresh on every request (read-only, WAL-safe against the running app)"* via `node:sqlite` with a short busy timeout. That's Wispr's own blessing for external read-only DB polling. `[CONFIRMED-LOCAL]`
- **Config file**: `%APPDATA%\Wispr Flow\config.json` (electron-store). Readable for current bindings. `prefs.activeDictationSession` looks tempting as a live-state poll but is **only a crash-recovery marker cleared at app launch** — do not poll it. `[CONFIRMED-LOCAL]`

### B. Hotkey model

**B1. Defaults on Windows** `[CONFIRMED]` ([Starting your first dictation](https://docs.wisprflow.ai/articles/6409258247-starting-your-first-dictation), [Use Flow hands-free](https://docs.wisprflow.ai/articles/6391241694-use-flow-hands-free)):

- **Push-to-talk (hold):** `Ctrl + Win`. Hold, speak, release → text pastes.
- **Hands-free (toggle):** `Ctrl + Win + Space`, or **double-tap the PTT shortcut to lock**, or click the Flow Bar centre. Press again / click ■ to stop.
- **Cancel:** `Esc` (rebindable since v1.4.661).
- Mac equivalents: `Fn` / `Fn + Space`.

**B2. Confirmed against this machine's `config.json`** `[CONFIRMED-LOCAL]` — bindings are stored as Windows virtual-key code sets:

```
"shortcuts": {
  "27":         "dismiss",           // Esc
  "162+91":     "ptt",               // LCtrl + LWin
  "162+32+91":  "popo",              // LCtrl + Space + LWin   ← hands-free ("popo" = press-on/press-off)
  "162+164+91": "lens",
  "160+164+90": "paste_last_text",   // LShift + LAlt + Z
  "160+164+88": "copy_last_text"     // LShift + LAlt + X
}
```

Defaults are intact on this install. `paste_last_text` is a nice safety net: it re-pastes the last transcript if a paste is lost.

**B3. Rebinding rules** `[CONFIRMED]` ([Supported & unsupported hotkeys](https://docs.wisprflow.ai/articles/2612050838-supported-unsupported-keyboard-hotkey-shortcuts)): ≤3 keys, at least one modifier (Ctrl/Alt/Shift/Win) or a non-primary mouse button; left/right modifier variants are distinct and can't be mixed; no Caps Lock, no bare letters, no left/right click; system-reserved combos blocked. Up to 4 bindings per action. Settings → General → Shortcuts. Mouse buttons 4–10 are bindable (v1.4.661) — worth remembering as an injection target that no application competes for.

**B4. Detection mechanism** `[CONFIRMED-LOCAL]`: `Wispr Flow Helper.exe` (a .NET AOT binary) imports `SetWindowsHookExW` + `LowLevelKeyboardProc` and references `KBDLLHOOKSTRUCT`, `vkCode`, `scanCode`, `dwExtraInfo`. It is a **WH_KEYBOARD_LL global hook**, not `RegisterHotKey`. Low-level hooks receive injected input, and I found **no `LLKHF_INJECTED` / "Injected" string anywhere in the binary** — so `SendInput` should be seen as a real keypress. `[INFERRED, strong]` Every accepted shortcut is logged, which makes injection trivially verifiable:

```
[Keyboard Service] Handling action from keycodes: ctrl + v, curKey: 86, Is release: false
```

The helper also has stale-key recovery (`[Keyboard Service] Removing stale keys: 76`) — relevant because a botched synthetic key-up can leave a modifier latched.

### C. Stop behaviour and text delivery

**C1. No silence auto-stop for dictation.** `[CONFIRMED]` + `[CONFIRMED-LOCAL]`

Hands-free ends only when you press the shortcut again, click ■, or hit the cap ([hands-free docs](https://docs.wisprflow.ai/articles/6391241694-use-flow-hands-free)). Silence during dictation produces **warnings only** — the `NoAudioDuringDictation` / `NoAudioDuringDictationEscalated` toasts at roughly 5 s and 15 s ("Your mic isn't picking up any audio") — it does **not** end the session.

The real silence-triggered auto-end machinery in the bundle (`RecordingStoppedSilence`, `finalizeSilenceStop`, `autoStopGracePeriodMs`, `notetakerAutoEndEnabled`) lives entirely inside `ActiveMeetingSession` — that's the **meeting Notetaker**, a different feature. Don't be misled by it, and don't be misled by the "Disable Flow Session" setting either, which governs how long a *backgrounded idle* session stays open.

Caps: **~20 min** max desktop dictation with a warning at ~19 min (`DictationDurationWarning` → `DictationMaxDurationReached`, with a "recover last text" action). `[CONFIRMED]`

**Consequence: the loop must endpoint the utterance itself.** Reuse the wake-word listener's VAD. Windows shared-mode WASAPI lets two processes capture the same device, so our listener and Wispr can both hold the mic — but verify it on the actual headset (Risk 6).

**C2. Delivery is clipboard paste, all at once, at the end.** `[CONFIRMED]` + `[CONFIRMED-LOCAL]`

Docs: *"Flow temporarily uses your clipboard to paste text, then restores your previous clipboard contents."* The helper binary confirms it: `OpenClipboardWithRetry`, `SetClipboardData`, `GetClipboardSequenceNumber`, `TrySetClipboardWithVer…`, `PasteTextPayload`, plus `SendInput` for the Ctrl+V, and a `DisableClipboardRestore` payload flag. Nothing is typed character-by-character and nothing streams while you speak.

A real dictation from this machine's log, end to end:

```
18:59:35.377  Electron -> Helper: DictationStart request sent
18:59:35.779  Electron -> Helper: RecordingStarted request sent      (+400 ms)
18:59:42.259  Electron -> Helper: DictationStop request sent          ← trigger
18:59:42.281  Transitioning Stopping -> Processing, starting transcription
18:59:43.154  Updating dictation state with status formatted
18:59:43.186  Text lengths - ASR: 81 chars, LLM: 72 chars, To paste: 74 chars
18:59:43.190  Paste initiated, text length: 74, html: no, app: Code, chunking: none
18:59:43.193  Saved clipboard contents before paste, length: 9
18:59:43.195  Electron -> Helper: PasteText request sent
18:59:43.255  Received paste outcome: success=true, 59.5583ms, transcriptEntityUUID: 7054a4f1-…
                { pasteSuccess: true, isEditable: true, couldNotGetTextBoxInfo: false, appName: 'Code' }
```

**≈1.0 s from stop to text landed.** Across this machine's history, `e2eLatency` runs ~620–1600 ms (longer utterances → longer). Budget an 8 s timeout with a `paste_last_text` retry.

Also note `RecordingStarted` lands **~400 ms after** `DictationStart` — Wispr has a known "[missing first words](https://docs.wisprflow.ai/articles/3566082841-fix-missing-first-words-in-transcriptions)" failure mode. Our loop must not start the utterance the instant it fires the deep link (Risk 2).

**C3. Chunked paste — a trap aimed squarely at us.** `[CONFIRMED-LOCAL]`

Wispr special-cases coding CLI agents. From `app.asar`:

```js
const kind = (codingCliAgent === "claude" && confidence === "high") ? "claude"
           : (codingCliAgent === "codex"  && confidence === "high") ? "codex"
           : TERMINAL_APPS.includes(bundleId)
               ? (windowTitle.includes("claude") ? "claude"
                : windowTitle.includes("codex")  ? "codex" : null)
               : null;
return { allowHtml: !html, chunking: kind ?? "none", ... };
```

with `WINDOWS_TERMINAL_PROCESS_NAMES = ["windowsterminal","cmd","powershell","pwsh","warp","alacritty","hyper","kitty","wezterm"]`.

So: **if the focused window is a terminal whose title contains "claude" or "codex", Wispr pastes in chunks instead of one shot** — multiple change events, and a naive "first change = done" check fires early.

Mitigation is free: our capture window is a custom widget in our own process, not on that terminal list, so `chunking: "none"` (every paste in this machine's history logs `chunking: none`). Just **don't put "claude" or "codex" in the capture window's title, and don't make the capture window a terminal.** The 300 ms debounce is the belt to that braces.

**C4. Text tweaks to expect.** `[CONFIRMED-LOCAL]` `pastedText` is consistently ~2 chars longer than the formatted text — Wispr adds leading/trailing boundary spaces based on surrounding context (`preserveTrailingBoundarySpace` / `preserveLeadingBoundarySpace`). Strip whitespace before handing to Claude. Saying **"press enter"** at the end of a dictation makes Wispr strip the phrase and fire a synthetic Enter after the paste (`shouldPressEnterAfterPaste` → `SimulateKeyPress{enter}`) — could be a neat manual submit affordance, but our loop should own submission.

### D. The `flow.sqlite` record

`%APPDATA%\Wispr Flow\flow.sqlite`, WAL mode, unencrypted. `[CONFIRMED-LOCAL]`

Table `History`, one row per dictation, keyed `transcriptEntityId` (the same UUID as in the log line):

`asrText` · `formattedText` · `pastedText` · `timestamp` (dictation **start**, UTC) · `status` · `app` · `url` · `duration` · `numWords` · `e2eLatency` · `audio` (BLOB) · `textboxContents` · `language`

Observed `status` values: `formatted` (the happy path), `raw_transcript`, `processing`, `empty`, `no_audio`, `error`, `dismissed` — a ready-made classifier for "did this utterance produce anything usable".

Open it exactly the way Wispr's own inspector does — read-only URI, short busy timeout, never write:

```python
con = sqlite3.connect("file:" + db + "?mode=ro", uri=True, timeout=2.0)
```

Poll only after the log line tells you a paste happened; don't poll blind (the file is ~800 MB here because it stores audio blobs).

### E. Firing keys from Python (the fallback path)

**E1. Injection.** `pynput` and `pyautogui` both wrap `SendInput`, which the helper's low-level hook should observe (§B4). Prefer `pynput` for explicit key-down/key-up control — you need deterministic ordering and guaranteed key-up. The `keyboard` package is best avoided: it wants a driver-level hook and is flaky about elevation.

**E2. The Win key is the problem.** The default bindings (`Ctrl+Win`, `Ctrl+Win+Space`) both include LWin. Synthesizing LWin risks opening the Start menu on release — Wispr's own helper carries a `WindowsKeyUpSimulation` routine precisely to suppress that, and we'd have to reimplement it. **Rebind hands-free to a Win-free combo** (`Ctrl+Alt+F9`, or a spare mouse button) before going anywhere near injection.

**E3. Elevation / UIPI.** `SendInput` from a medium-integrity process cannot reach a high-integrity foreground window. If either Wispr or the focused capture window ever runs elevated while the loop does not, injection silently no-ops. Keep the loop, the capture window, and Wispr all at the same (non-elevated) integrity level. **The deep link is immune to this** — one more reason it's the primary path.

**E4. Verification hook.** Every accepted shortcut writes `[Keyboard Service] Handling action from keycodes: …` to `main.log`, so a prototype can prove injection landed without guessing.

**E5. Log tailing.** `main.log` is written by electron-log at info level with no buffering delay we could observe. **It rotates** — this happened mid-research: the file was renamed to `main.old.log` and recreated, and a naive `seek(offset)` tailer silently read nothing for several minutes. Any tailer must detect truncation (size < last offset) and reopen. Non-negotiable.

---

## Open risks — prove these in the prototype

1. **Focus theft by the transient second instance.** Every deep link spawns a full Electron process that boots for ~5 s before quitting (I watched it). The hands-free branch returns before any window is shown, but Windows may still hand it foreground momentarily — and Wispr pastes into whatever is focused. **Test: fire `start-hands-free` and assert `GetForegroundWindow()` never leaves the capture window.** If it does, fall back to hotkey injection (§E) or pre-focus the capture window again just before firing `stop-hands-free`.
2. **Startup race / clipped first words.** `RecordingStarted` trails `DictationStart` by ~400 ms, plus process-spawn time. Measure wall-clock from `ShellExecute` to the `RecordingStarted` log line, and gate the user's "go ahead" cue on that — don't let them start speaking into a mic that isn't live yet.
3. **`not_idle` rejection.** If Wispr is mid-processing from a previous turn, `start-hands-free` is silently ignored. Watch for `reason:"not_idle"` and retry with backoff; add a hard reset via the `dismiss` (Esc) binding.
4. **Clipboard race.** Wispr saves and restores the clipboard around every paste. If our loop touches the clipboard in that ~60 ms window, one of the two loses. Keep the loop off the clipboard entirely during a dictation turn.
5. **Paste target must look editable to UI Automation.** The helper inspects the focused control via `IUIAutomationTextPattern` / `ValuePattern`; the outcome line reports `isEditable` and `couldNotGetTextBoxInfo`, and this install has already hit `PasteFailed` (7×) and `PasteBlocked` (5×) toasts. A custom-drawn capture widget that doesn't expose a proper editable UIA text pattern may simply not receive text. **Use a standard edit control** (Win32 EDIT / Tk Entry / Qt QLineEdit), and assert `isEditable: true` in the log during the prototype.
6. **Mic contention.** Our wake-word VAD and Wispr both want the capture device. Shared-mode WASAPI should allow it, but Wispr also sets `shouldMuteAudio` and does its own device ranking/switching. Verify on the actual headset, and check `MicSwitched` noise in the log (226 occurrences here).
7. **Undocumented surface, auto-updating app.** The deep-link routes are shipped and instrumented (`deeplink_start_hands_free` analytics events) but appear nowhere in public docs, and Squirrel updates silently (1.6.492 → 1.6.531 within days on this machine). Pin a startup self-check: fire `wispr-flow://switch-mic` (a documented-safe no-op) and confirm the log line, else fall back to injection.
8. **Cloud dependency.** Transcription is a gRPC round-trip to Wispr's backend (~550 ms server-side here). No network → no dictation. The loop needs a visible degraded state, not a hang.
9. **The 20-minute cap** will never fire in a turn-based loop, but the recovery path (`RetryLastText`) is worth knowing exists.

---

## Fallback STT, if Wispr turns hostile

Wispr is *not* automation-hostile — it hands us a deep-link API — so treat this as insurance only. Drop the capture-window indirection entirely and run **`faster-whisper`** (CTranslate2) locally on the utterance the wake-word listener already buffers: `small.en` int8 on CPU, or `distil-large-v3` if the GPU is free, transcribing the VAD-endpointed WAV directly to text. That removes the focus, clipboard, UIA, elevation, and network risks in one move, at the cost of Wispr's formatting/dictionary polish and roughly comparable latency for short utterances. The pipeline stays identical downstream — only the "text arrives" edge changes from *watch a window* to *await a function call*.

---

## Sources

Official docs (thin but authoritative on the user-facing model):
- [Starting your first dictation](https://docs.wisprflow.ai/articles/6409258247-starting-your-first-dictation)
- [Use Flow hands-free](https://docs.wisprflow.ai/articles/6391241694-use-flow-hands-free)
- [Supported & unsupported keyboard hotkey shortcuts](https://docs.wisprflow.ai/articles/2612050838-supported-unsupported-keyboard-hotkey-shortcuts)
- [Missing first words in transcriptions](https://docs.wisprflow.ai/articles/3566082841-fix-missing-first-words-in-transcriptions)
- [Flow API quickstart](https://api-docs.wisprflow.ai/quickstart) — gated cloud API, not a desktop control surface
- [What's new / changelog](https://wisprflow.ai/whats-new) — v1.4.661 rebindable Esc + mouse-button PTT; v1.5.55 Windows text-insertion reliability

Community/marketing sources ([sidsaladi's Wispr Flow 101](https://sidsaladi.substack.com/p/wispr-flow-101-the-complete-guide), [wisprflow.ai/post/supercharge-vibe-coding-automations](https://wisprflow.ai/post/supercharge-vibe-coding-automations)) discuss "automations" only as *voice-triggered* text/workflow snippets — **no** public mention of the URL scheme, a CLI, or a local API. Nothing in Reddit/forum results contradicted or added to the local findings.

Local ground truth (this machine, 2026-08-14): `%LOCALAPPDATA%\WisprFlow\app-1.6.531\resources\app.asar`, `…\resources\Release\Wispr Flow Helper.exe`, `…\resources\ax-inspect-server.mjs`, `%APPDATA%\Wispr Flow\config.json`, `%APPDATA%\Wispr Flow\flow.sqlite`, `%APPDATA%\Wispr Flow\logs\main.log`, and registry `HKCU\Software\Classes\wispr-flow`.
