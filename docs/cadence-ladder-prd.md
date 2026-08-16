# Cadence Ladder PRD — assistant-style reminder cadence on iOS (AlarmKit)

**Date:** 2026-08-09. Follow-up to `docs/alarmkit-port-prd.md` (read it first — its five guards remain mandatory).

## North star

Mimic what a real assistant does: say the reminder **once**, go quiet, come back after a
break and say it **differently**, then stop. Only persistent/critical reminders keep
repeating insistently. Today's behavior (short wav looping back-to-back forever) is wrong
for every tier except persistent — and even persistent needs breath between utterances.

AlarmKit cannot do "ring once" or "pause between rings" inside a single alarm. We fake it
from our side with two knobs we do control:

1. **In-file audio shape** — what's inside the ≤30s wav controls what one ringing alarm sounds
   like. (Amended by OLD-103: one shape for every tier — utterance + 2s gap, repeated. The
   silence-tail shape shipped as ~25s of dead air per loop and is gone.)
2. **Sibling alarms** — 1–3 real AlarmKit alarms per occurrence, staggered minutes apart,
   each with a differently-worded variant line, are perceived as one assistant coming back.

## Frozen contract (all issues code against this; do not renegotiate mid-flight)

### Cadence policy (single source of truth: `variantCountForTier` in `convex/helpers.ts`)

| Tier | Rungs (alarms per occurrence) | In-file shape | Rung offsets from fire time T |
|------|------------------------------|---------------|-------------------------------|
| routine | 1 | utterance + 2s gap, repeated | T |
| notice | 2 | utterance + 2s gap, repeated | T, T+3min |
| urgent | 3 | utterance + 2s gap, repeated | T, T+3min, T+7min |
| persistent=true | 3 | utterance + 2s gap, repeated | T, T+2min, T+5min |

The in-file shape stopped varying by tier in OLD-103: the tier decides how many times the phone
comes back, not what one ring sounds like.

Offsets are exported constants in `lib/notificationDecisions.ts` (`LADDER_OFFSETS_MS`,
`LADDER_OFFSETS_PERSISTENT_MS`) — they will be re-tuned after the device test that measures
how long iOS rings an unattended AlarmKit alarm. Do not scatter magic numbers.

### WAV shaping (server)

- `buildAlarmWav(pcm: Uint8Array, sampleRate: number): Uint8Array` in `convex/helpers.ts`,
  composing on top of the existing `pcmToWav` wrapper.
  - `[line][2s zero-sample silence]` repeated until adding another pass would exceed
    `ALARM_WAV_TARGET_SECONDS = 28`.
  - Hard cap 29s (iOS rejects ≥30s; existing guard stays).
  - Silence for 16-bit mono PCM is zero bytes, 2 bytes/sample. If not even one line+gap pass
    fits, ship the line bare (existing length guard already throws over 30s).

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

## Amendment (2026-08-14): attention catches

The "ANY fixed opener dies" rule now applies to **model-generated payloads only**. A design
session concluded spoken reminders need a two-beat shape — attention catch, then payload,
like a person ("Heads up, Wahab — your meeting is starting"). Catches are **code-assembled**
at TTS time from an approved rotating pool (`convex/speechCatch.ts`; persona rule: the
assistant never forgets), on the first firing + heads-up only. Ladder rungs stay bare
payloads, and the model is still banned from writing any opener — the app owns those words
now. Rationale: catches address the person; labels ("Quick reminder") describe the message.
The first died for being robotic, the second stays dead.

## Amendment (2026-08-15): catches removed, one direct line (OLD-95)

**Reverses the amendment above.** Heard end to end, the two-beat shape read as small talk in
front of the point, and the name made it worse. The catch pool, the rotation state
(`convex/speechCatch.ts`, `speechCatchState`) and the TTS-time prepend are deleted: what is
stored is exactly what is spoken.

The voice is now ONE short present-tense sentence about the thing itself. Amended by
OLD-104 (2026-08-16): the three-register menu collapsed to exactly two shapes — actions are
a bare imperative ("Drink your water."), events are "[X] is right now." ("Your son's game
is right now."). No "right now" tail on actions, no polite requests, no clock times in the
line.
Openers, greetings, names and wellness commentary are all banned, in both languages
(`SPOKEN_LINE_RULE`, convex/helpers.ts). The catch wordings ("Heads up", "By the way",
"Don't forget") moved from exempt to banned — nothing prepends them any more, so the model
may not write them either.
