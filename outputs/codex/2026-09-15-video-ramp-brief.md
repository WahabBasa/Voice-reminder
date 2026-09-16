# Round 2: speed up the wait between setting the reminder and the alarm firing

YOUR OUTPUT FOLDER: `C:/Users/AtheA/Downloads/LANDrop/codex/round2` (create it). Write everything you produce there.
Do NOT modify anything already in `C:/Users/AtheA/Downloads/LANDrop/codex` (round-1 deliverables stay as they are) and never write into any
other folder under LANDrop.

## Timing (timed head-to-head, round 2)
- FIRST action: write the current wall-clock time to `C:/Users/AtheA/Downloads/LANDrop/codex/round2/started.txt`.
- LAST action, after the final video is verified: write the time to `C:/Users/AtheA/Downloads/LANDrop/codex/round2/finished.txt`.

## Source
- Same source as round 1: `C:\Users\AtheA\Downloads\LANDrop\1000079342.mp4` (HEVC 1920x1080 coded, -90 deg display
  rotation => portrait 1080x1920, ~30fps with a few dropped slots, AAC 48k stereo). Do NOT modify it or the backup.
- Your round-1 map (`C:/Users/AtheA/Downloads/LANDrop/codex/map/`: map.json + contact sheets) is already on disk. Reuse it; do not re-run map.py
  unless you need different parameters.
- Round 1 established the END of the video: cut at source time 228.733333 s (1.0 s after the first Pro-state frame).
  That end point stays.

## What changes
Somewhere before the purchase, the recording shows the user creating a voice reminder and then WAITING until the
alarm fires. That waiting stretch is too long for App Review. Requirement: in the OUTPUT, the stretch from the
moment the reminder is set to the moment the alarm goes off must run in UNDER 30 seconds.

Define two source timestamps by looking at frames yourself:
- A = the first frame where the reminder is confirmed as set (its card/row appears on the list after the recording
  is submitted, or whatever the app shows as "reminder created"). Everything up to A plays at 1x with audio.
- B = the first frame where the alarm fires (the ring banner / alarm screen appears, or the spoken alarm starts,
  whichever shows first on screen). From B onward everything plays at 1x with audio, through to the 228.733333 s end.
- The A->B stretch plays at ONE constant speed factor chosen so that (B - A) / speed < 30 s in the output. Pick a
  clean factor (integer preferred, e.g. 4x, 6x, 8x) that lands comfortably under 30 s, not exactly on it.
  Audio inside A->B is MUTED (sped-up speech is not acceptable in a review video). Video only, no freeze frames,
  no cross-fades, no title cards.
- If the sped-up stretch would still be over 30 s at 8x, go higher; if the whole thing is already under 30 s, say so
  in report.md and produce the video with no ramp.

Everything else is unchanged from round 1: no blurs, no other trims, no start trim, quality visually lossless
(libx264 crf 18 is fine; use preset fast or medium - do not spend time on slow), portrait 1080x1920, 30 fps, audio
present outside the muted stretch.

## Tools
`C:\Dev\video-toolkit` (README.md). `render.py` exists for exactly this kind of spec (segments with `speed` and
`audio: "mute"`; see `examples/edit_spec_0820.json`). You may instead build the ramp directly with ffmpeg
(setpts / atempo-or-silence / concat) as long as the result is verified and the exact commands are recorded.
ffmpeg / ffprobe are on PATH. Extract frames with `ffmpeg -ss <t> -i <video> -frames:v 1 <png>` and look at them.

## Verification (must all be in report.md)
- Output total duration, and the output-time positions of A and B (so the ramp length is stated explicitly and is
  under 30 s).
- Speed factor used and the source length of A->B.
- Last frame shows the Pro state (same as round 1). First frame equals the source's first frame.
- Audio: present before A and after B, silent between (state how you checked, e.g. astats / volumedetect on
  the ramp window).
- No dropped/duplicated frames at the two seams beyond one frame of quantisation; state the seam timestamps.

## Delegation
You are the orchestrator; subagents grind. Delegate frame sweeps, rendering and verification. You decide A, B and
the speed factor from the evidence. Run independent steps in parallel where possible.

## Deliverables in `C:/Users/AtheA/Downloads/LANDrop/codex/round2`
- `final.mp4` - full video: 0 -> A at 1x, A -> B sped up + muted, B -> 228.733333 at 1x.
- `edit_spec.json` - the spec or the exact ffmpeg commands.
- `evidence/` - frames for A (before / first-set), B (before / first-fire), and the seams in the output.
- `report.md` - as described under Verification, plus which subagents ran and what each did, and token usage if known.
- `started.txt`, `finished.txt`.
