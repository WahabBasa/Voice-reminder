# Cadence Ladder PRD — assistant-style reminder cadence on iOS (AlarmKit)

**Date:** 2026-08-09. Follow-up to `docs/alarmkit-port-prd.md` (read it first — its five guards remain mandatory).

## North star

Mimic what a real assistant does: say the reminder **once**, go quiet, come back after a
break and say it **differently**, then stop. Only persistent/critical reminders keep
repeating insistently. Today's behavior (short wav looping back-to-back forever) is wrong
for every tier except persistent — and even persistent needs breath between utterances.

AlarmKit cannot do "ring once" or "pause between rings" inside a single alarm. We fake it
from our side with two knobs we do control:

1. **In-file audio shape** — what's inside the ≤30s wav (one utterance + silence tail, or
   dense repeats) controls what one ringing alarm sounds like.
2. **Sibling alarms** — 1–3 real AlarmKit alarms per occurrence, staggered minutes apart,
   each with a differently-worded variant line, are perceived as one assistant coming back.

## Frozen contract (all issues code against this; do not renegotiate mid-flight)

### Cadence policy (single source of truth: `variantCountForTier` in `convex/helpers.ts`)

| Tier | Rungs (alarms per occurrence) | In-file shape | Rung offsets from fire time T |
|------|------------------------------|---------------|-------------------------------|
| routine | 1 | one utterance + silence tail | T |
| notice | 2 | one utterance + silence tail | T, T+3min |
| urgent | 3 | one utterance + silence tail | T, T+3min, T+7min |
| persistent=true | 3 | **dense**: utterance + 2s gap, repeated | T, T+2min, T+5min |

Offsets are exported constants in `lib/notificationDecisions.ts` (`LADDER_OFFSETS_MS`,
`LADDER_OFFSETS_PERSISTENT_MS`) — they will be re-tuned after the device test that measures
how long iOS rings an unattended AlarmKit alarm. Do not scatter magic numbers.

### WAV shaping (server)

- `buildAlarmWav(pcm: Uint8Array, sampleRate: number, opts: { dense: boolean }): Uint8Array`
  in `convex/helpers.ts`, composing on top of the existing `pcmToWav` wrapper.
  - normal: `[line][zero-sample silence]` padded to `ALARM_WAV_TARGET_SECONDS = 28`.
  - dense: `[line][2s silence]` repeated until adding another pass would exceed 28s.
  - Hard cap 29s (iOS rejects ≥30s; existing guard stays).
  - Silence for 16-bit mono PCM is zero bytes, 2 bytes/sample. If the line alone exceeds
    28s, ship it unpadded (existing length guard already throws over 30s).

### Storage / schema (additive, optional — never break existing consumers)

- `reminders.variantWavStorageIds: v.optional(v.array(v.id("_storage")))`, index-aligned
  with `variants` / `variantAudioStorageIds`.
- Queries (`get` / `list`) expose `variantWavUrls: (string | null)[]` alongside `wavUrl`.
- Each variant's wav derives from the SAME ElevenLabs PCM response as that variant's mp3 —
  never call ElevenLabs twice per line. Variant count stays capped by `variantCountForTier`.

### Rung identity and metadata

- appKey scheme is UNCHANGED: `reminder_<id>_<timestamp>` — each rung uses its own fire
  timestamp. `parseAlarmAppKey` keeps working with zero changes.
- Metadata additions (string values only, flowing through the existing metadata dict):
  - `rung`: `"0" | "1" | "2"`
  - `rungCount`: `"1" | "2" | "3"`
  - `siblings`: comma-joined appKeys of the OTHER rungs of this occurrence (may be empty).
    Never includes snooze follow-up keys.
- Rung sounds: rung 0 → `reminder_<id>.wav` (base). Rung k≥1 → `reminder_<id>_v<k>.wav`
  (variant k−1). A missing variant wav falls back to the base wav, never to `.default`.

### Acknowledgment semantics

- **Done (VRStopIntent)** on any rung: after the existing guards pass, cancel every appKey
  in that rung's `siblings` metadata natively (rotation-aware, via the scheduler registry).
  JS reconciliation on app-open remains the backstop.
- **Later (VRSnoozeIntent)** on any rung: cancel siblings the same way, then schedule the
  follow-up exactly as today (single alarm, existing follow-up key convention). Snooze
  supersedes the ladder.
- **Spurious-stop guard 2 interplay**: a spurious StopIntent inside an active snooze guard
  must not cancel anything — sibling-cancel runs only when the stop is accepted as real.
- **In-app acknowledge / delete reminder**: JS cancels all rungs of the occurrence.
- **Ignored to the end**: ladder runs out naturally; next occurrence reschedules on
  reconcile (existing behavior, now expecting N alarms instead of 1).

### Phrasing (kills the canned hooks — this is a product decision, not a style pass)

`buildDescriptionInstruction` and `buildVariantInstruction` in `convex/helpers.ts` must no
longer offer ANY fixed opener ("It's time —", "Heads up —", "Quick reminder —" all die).
New instruction contract:

- One natural sentence, in the input's language, phrased the way a human assistant would
  say it aloud — the task plus whatever time/place context the user gave. No template
  openers, no quoted hook menu, roughly 5–14 words.
- Address term set → weave it in verbatim (it may be Arabic). Unset → never address the
  user by any name or title.
- Variants escalate in firmness/urgency across the ladder, never repeat the same wording.
- Pre-reminder lines keep their factual advance-notice content, phrased naturally.
- True at the moment it fires (rung 2 fires minutes after T — wording must not claim
  "starts in 10 minutes" when the schedule math says otherwise; keep wording time-robust).

### Pre-req bugfix in the same batch

In-flight de-dup keyed by appKey in the AlarmKit scheduling path (`lib/notifications.ts`)
— the gap_resync-vs-create race from the 2026-08-07 devlog double-schedules the same
appKey ~20ms apart. With 3× alarms per occurrence this bug triples; it lands first.

## Out of scope

SwiftUI pivot (post-v1 decision — do not start), Convex deploy (human step after review),
EAS builds, Android behavior changes (mp3/Notifee replay ladder untouched), gap tuning
(needs the unattended-ring device measurement), snooze-follow-up ladders (follow-up stays
a single alarm).

## Issues

- `docs/issues/CL-1-server-audio-and-phrasing.md` — convex/*
- `docs/issues/CL-2-native-sibling-intents.md` — plugins/*
- `docs/issues/CL-3-js-ladder-and-dedup.md` — lib/*
