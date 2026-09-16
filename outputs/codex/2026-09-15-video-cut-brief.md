# Task: trim the App Review video to end right after the purchase succeeds

YOUR OUTPUT FOLDER: `C:/Users/AtheA/Downloads/LANDrop/codex`
Write everything you produce there. Never write into any other folder under LANDrop.

## Timing (this is a timed head-to-head)
- FIRST action, before anything else: write the current wall-clock time to `C:/Users/AtheA/Downloads/LANDrop/codex/started.txt`
  (run `date "+%Y-%m-%d %H:%M:%S"` or PowerShell `Get-Date -Format "yyyy-MM-dd HH:mm:ss"`).
- LAST action, after the final video is verified: write the time to `C:/Users/AtheA/Downloads/LANDrop/codex/finished.txt`.

## Source
- Video: `C:\Users\AtheA\Downloads\LANDrop\1000079342.mp4` (9m21s, HEVC, reported 1920x1080 @ 30fps, AAC audio).
  It is an iPhone screen recording, so check `ffprobe -show_streams` / side_data for a rotation tag before
  assuming orientation. Do NOT modify or move this file.
- A backup exists at `1000079342.orig-backup.mp4`. Do NOT touch it.

## What the cut is
The recording walks through the Remi app, including a sandbox subscription purchase. When the purchase
succeeds, two things happen on screen:
1. A toast slides in from the TOP saying something like "You're now a Pro user" / "Welcome to Remi Pro".
2. The "Pro" upsell banner in the TOP-RIGHT corner (the thing the user tapped to subscribe) disappears.

Cut point = exactly 1.0 second after the app shows that Pro state (banner gone / toast visible).
The output video is the source from 0.000 up to that cut point. Everything after is dropped.
No other edits: no speed ramps, no blurs, no audio changes, no trimming at the start. Keep the audio.
Quality: visually lossless is fine (e.g. libx264 crf 18 or better); match source resolution and fps.

If you cannot find a Pro toast or banner change at all, do not guess: stop, write what you found into
`report.md`, and finish with no `final.mp4`.

## Tools you should use
`C:\Dev\video-toolkit` (read its README.md first):
- `map.py <video> --out <dir>` -> map.json (scenes, audio events, static spans) + timestamp-burned contact
  sheets. Use it to find the purchase region fast instead of scrubbing 9 minutes by hand.
- `render.py <spec.json>` -> frame-exact, verified mp4 from an edit-spec JSON. See `examples/edit_spec_0820.json`
  for the schema (one segment `{"start": 0, "end": <cut>, "speed": 1, "audio": "follow"}` is all you need;
  no `blur.windows`). Set `source`, `workdir`, `output`, and `encode.width/height/fps` to match THIS video.
  `--plan-only` prints the frame plan without rendering.
- `point.py` (eyes tool) needs an OpenRouter key that may not be set; you can instead extract single frames
  with `ffmpeg -ss <t> -i <video> -frames:v 1 <png>` and look at them yourself.
- ffmpeg / ffprobe are on PATH.

Suggested flow: map -> read contact sheets around the purchase sheet / chime -> extract frames at fine
steps (e.g. every 0.1s) across the candidate window -> pin the first frame where the Pro state shows ->
cut = that time + 1.0s -> write spec -> render -> verify (duration == cut within one frame, last frame
shows the Pro state, first frame == source first frame, audio present).

## Delegation
You are the orchestrator. You judge; subagents grind. Delegate the mechanical steps (running map, frame
extraction and inspection sweeps, rendering, verification) to subagents. Keep the decision of WHERE the cut
lands with you, based on the evidence they bring back. Run independent steps in parallel where possible.

## Deliverables in `C:/Users/AtheA/Downloads/LANDrop/codex`
- `final.mp4` - the trimmed video.
- `edit_spec.json` - the spec you rendered from (or the exact ffmpeg command if you rendered another way).
- `map/` - map.json + contact sheets.
- `evidence/` - the frames that justify the cut (before / first Pro frame / cut frame), named with timestamps.
- `report.md` - cut timestamp and why, the frame timestamps you checked, output duration, how you verified,
  which subagents you spawned and what each did, and token usage if your runtime reports it.
- `started.txt`, `finished.txt` - wall-clock stamps as described above.
