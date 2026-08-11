# CL-1: Server — tier-shaped alarm WAVs, variant WAVs, natural phrasing

**Read first:** `docs/cadence-ladder-prd.md` (frozen contract). Current wav path:
`synthesizeAlarmWav` in `convex/actions.ts`, `pcmToWav` in `convex/helpers.ts`.

## Problem

1. The alarm wav is the bare spoken line, so AlarmKit's looping plays it back-to-back with
   no pause — wrong for every tier except persistent.
2. Only the base line gets a wav; ladder rungs need variant wavs.
3. The parse prompt hands the model canned openers ("It's time —" etc.) — user rejected
   them; lines must read like a human assistant, not a template.

## Owns (do not touch other files)

- `convex/schema.ts`, `convex/helpers.ts`, `convex/actions.ts`, `convex/reminders.ts`
- Test files under `__tests__/` that cover convex modules (extend in place; create new
  files if a module has none)

## Tasks

- [ ] `buildAlarmWav(pcm, sampleRate, { dense })` in helpers.ts per PRD: silence-tail pad
      to 28s (normal) or utterance+2s-gap repeats ≤28s (dense); hard cap 29s; compose on
      `pcmToWav`, don't fork it. 16-bit mono zero-byte silence.
- [ ] `synthesizeAlarmWav` grows a `dense` argument; callers pick dense when the reminder
      is persistent-tier (`normalizePersistent` / `normalizeUrgency` already exist).
- [ ] Variant wavs: wherever variant mp3s are synthesized, derive a wav from the SAME PCM
      response (no second ElevenLabs call), shaped by the same tier rule. Schema:
      `variantWavStorageIds` (optional array, index-aligned). Persist through create /
      setAudio / updateAudio paths; expose `variantWavUrls` on get/list.
- [ ] Delete/cleanup paths that remove variant mp3 storage must also remove variant wavs.
- [ ] Phrasing: rewrite `buildDescriptionInstruction` + `buildVariantInstruction` +
      pre-reminder instruction per the PRD contract — no canned openers anywhere, natural
      single-sentence utterance, address-term rules preserved, variants escalate firmness,
      wording time-robust. Update the embedded examples to match (keep an Arabic example).
- [ ] Tests: buildAlarmWav shape math (durations, dense pass count, cap), variant wav
      persistence, and prompt-instruction snapshots updated — assert the canned hooks are
      GONE (a test that fails if "It's time" reappears in the instruction text).

## Acceptance

- `npx.cmd tsc --noEmit` clean; full jest suite passes (508 baseline).
- A synthesized normal-tier wav is ~28s with the line at the head; a dense wav contains
  multiple passes with 2s gaps; both under 29s.
- Instruction text contains no fixed opener strings for any tier.

## Out of scope

Client hydration/staging of variant wavs (CL-3). Native sound resolution (CL-2). Convex
deploy (human step). Android mp3 handling.
