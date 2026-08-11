/**
 * Pure helper functions extracted from convex/actions.ts for testability.
 * No Convex, OpenAI, or network dependencies.
 */

export function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

export function normalizeReminderDescription(input: unknown): string {
  const text = String(input ?? "").trim();
  if (!text) return "";

  // Strip common greetings the model/user might include at the start.
  // English: "Hey!", "Hey there,", "Hello -", "Hi:"
  // Arabic: "مرحبا", "أهلاً", "السلام عليكم"
  let normalized = text.replace(
    /^(hey|hi|hello)\b(?:\s+(there|friend))?[\s,:\-!]+/i,
    ""
  );
  normalized = normalized.replace(
    /^(مرحبا|أهلاً|أهلا|السلام عليكم)[\s,،:\-!]*/,
    ""
  );

  return normalized.trim();
}

export function normalizeDay(value: unknown): string | null {
  const token = String(value ?? "").toLowerCase().trim();
  const map: Record<string, string> = {
    sun: "sun", su: "sun", sunday: "sun",
    mon: "mon", mo: "mon", monday: "mon",
    tue: "tue", tu: "tue", tues: "tue", tuesday: "tue",
    wed: "wed", we: "wed", weds: "wed", wednesday: "wed",
    thu: "thu", th: "thu", thur: "thu", thurs: "thu", thursday: "thu",
    fri: "fri", fr: "fri", friday: "fri",
    sat: "sat", sa: "sat", saturday: "sat",
  };
  return map[token] ?? null;
}

export function getCurrentTimeHM(currentTime: string): string {
  const match = String(currentTime).match(/^(\d{1,2}):(\d{2})/);
  if (!match) return "09:00";
  return `${match[1].padStart(2, "0")}:${match[2]}`;
}

// Instruction text for the parse prompt's "description" field.
// No opener templates: the line has to read like something a person would say
// out loud, not a notification. When addressTerm is set the model weaves it in
// verbatim (it may be Arabic); when unset the line stays address-free (no
// 'Sir', no invented names). Single-quoted throughout — this string is embedded
// inside a double-quoted JSON field in the prompt.
export function buildDescriptionInstruction(addressTerm?: string): string {
  const term = String(addressTerm ?? "").trim();
  const addressRule = term
    ? `Weave in the address term '${term}' verbatim, exactly as the user wrote it (it may be Arabic)`
    : `Never address the user by any name or title (no 'Sir', no invented names)`;
  const example = term
    ? `'${term}, your meeting with Ahmed is starting.'`
    : `'Your meeting with Ahmed is starting.'`;
  return `the sentence spoken aloud when the reminder fires, in the input's language. Say it the way a human assistant would say it out loud: the task plus whatever time or place context the user gave. One natural sentence, roughly 5-14 words, with no set opening formula and no greeting — start with the substance. ${addressRule}. The wording must still be true if it is heard a few minutes late, so avoid countdowns like 'in 10 minutes'. Examples: ${example} / 'Time to take your evening medicine.' / 'حان وقت أخذ دوائك المسائي.'`;
}

// Instruction block for the parse prompt's pre-reminder (heads-up) fields.
// The advance-notice line keeps its factual content (event + how far off) but,
// like the description, gets no template opener.
export function buildPreReminderInstruction(): string {
  return `PRE-REMINDER RULES (automatic heads-up before the event):
- "preReminderMinutes": 10-15 for hard-start events the user must be somewhere for or start on time (meetings, appointments, flights, games, classes, calls). 0 for ambient/routine tasks (drink water, take medicine, generic todos).
- If the user explicitly asks for a heads-up ("give me a 20 minute warning"), use that many minutes.
- "preDescription": ONLY when preReminderMinutes > 0. The spoken advance-notice line, in the input's language (Arabic input gets an Arabic line), under 12 words: name the event and how far off it is, phrased naturally with no set opening formula — 'Your flight leaves in 40 minutes.', 'اجتماعك يبدأ بعد ربع ساعة.'. Omit the field entirely when preReminderMinutes is 0.`;
}

// ─── Assistant-style replays (OLD-53) ───────────────────────────────────────

// Hard cap on stored/TTS'd replay variants per reminder. Mirrored client-side
// in lib/notificationDecisions.ts (MAX_REPLAY_VARIANTS).
export const MAX_REPLAY_VARIANTS = 3;

export type Urgency = "urgent" | "notice" | "routine";

export function normalizeUrgency(value: unknown): Urgency {
  const token = String(value ?? "").toLowerCase().trim();
  if (token === "urgent" || token === "notice" || token === "routine") return token;
  return "routine";
}

export function normalizePersistent(value: unknown): boolean {
  if (value === true) return true;
  const token = String(value ?? "").toLowerCase().trim();
  return token === "true" || token === "1";
}

// One fitting emoji for the reminder card chip. Keeps only the first emoji
// cluster the model returned (ZWJ sequences / skin tones stay intact) and
// rejects plain text so a chatty model can't put words in the chip.
export function normalizeEmoji(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  // No ASCII letters/digits/punctuation — chips hold pictographs only.
  if (/[\x20-\x7E]/.test(trimmed)) return undefined;
  // First grapheme cluster only (a full emoji, incl. ZWJ joins + modifiers).
  // ️ = variation selector, ‍ = zero-width joiner.
  const match = trimmed.match(
    /^\p{Extended_Pictographic}(?:️|\p{Emoji_Modifier}|‍\p{Extended_Pictographic}(?:️|\p{Emoji_Modifier})?)*/u
  );
  return match ? match[0] : undefined;
}

// Economize policy: urgent-tier and persistent reminders get the full ladder,
// notice gets a middle amount, routine gets a single extra variant.
export function variantCountForTier(urgency: Urgency, persistent: boolean): number {
  if (persistent || urgency === "urgent") return MAX_REPLAY_VARIANTS;
  if (urgency === "notice") return 2;
  return 1;
}

/**
 * In-file audio shape for a tier (cadence-ladder PRD table). Only persistent
 * reminders get the dense utterance+gap wav that keeps nagging while a single
 * alarm rings; every other tier says its line once and goes quiet, and comes
 * back as a later rung instead.
 */
export function useDenseAlarmWav(persistent: boolean): boolean {
  return persistent;
}

/**
 * Sanitize the model's replay variants: normalize each line, drop empties,
 * drop verbatim repeats of the base description or of earlier variants
 * (no spoken line may repeat back-to-back), cap at maxCount.
 */
export function normalizeVariants(
  raw: unknown,
  maxCount: number,
  baseDescription: string
): string[] {
  if (!Array.isArray(raw) || maxCount <= 0) return [];
  const baseKey = normalizeReminderDescription(baseDescription).toLowerCase();
  const seen = new Set<string>();
  const variants: string[] = [];
  for (const item of raw) {
    if (variants.length >= maxCount) break;
    const line = normalizeReminderDescription(item);
    if (!line) continue;
    const key = line.toLowerCase();
    if (key === baseKey || seen.has(key)) continue;
    seen.add(key);
    variants.push(line);
  }
  return variants;
}

// Instruction block for the parse prompt's replay fields (urgency, persistent,
// variants). Variants are spoken minutes after the description was ignored, so
// they must stay true when heard late. When addressTerm is set, firmer variants
// may weave it in verbatim.
export function buildVariantInstruction(addressTerm?: string): string {
  const term = String(addressTerm ?? "").trim();
  const firmNote = term
    ? `firmer variants may weave in the address term '${term}' verbatim, exactly as the user wrote it (it may be Arabic)`
    : `never address the user by any name or title in any variant (no 'Sir', no invented names)`;
  return `ASSISTANT REPLAY RULES (the follow-up lines an assistant would use when the first one is ignored):
- "urgency": how hard the reminder has to push — "urgent" when the user must act right now (meeting starting, time to leave), "notice" for advance warning of something coming up, "routine" for ordinary everyday tasks.
- "persistent": true ONLY when missing the task would be harmful (medicine regimens, flights, picking up children). Otherwise false or omit.
- "variants": the follow-up spoken lines, in the input's language, said several minutes after the description went unanswered. Each one rewords the task differently — never repeat the description or another variant verbatim — and they escalate in firmness from gentle nudge to insistent; ${firmNote}. One natural sentence each, roughly 5-14 words, with no set opening formula, and still true when heard minutes late (no countdowns). Provide ${MAX_REPLAY_VARIANTS} variants when urgency is "urgent" or persistent is true, 2 when urgency is "notice", otherwise 1.`;
}

// Upper bound keeps a mis-parsed lead time from scheduling a heads-up hours early.
export const MAX_PRE_REMINDER_MINUTES = 120;

export function normalizePreReminder(
  minutesRaw: unknown,
  descriptionRaw: unknown
): { preReminderMinutes: number; preDescription: string } {
  const minutes = Number(minutesRaw ?? 0);
  let preReminderMinutes =
    Number.isFinite(minutes) && minutes > 0 ? Math.round(minutes) : 0;
  if (preReminderMinutes > MAX_PRE_REMINDER_MINUTES) {
    preReminderMinutes = MAX_PRE_REMINDER_MINUTES;
  }
  const preDescription =
    preReminderMinutes > 0 ? normalizeReminderDescription(descriptionRaw) : "";
  return { preReminderMinutes, preDescription };
}

// ─── Alarm WAV pipeline (AK-3) ──────────────────────────────────────────────
//
// iOS AlarmKit plays a *named audio resource* from Library/Sounds and follows
// UNNotificationSound rules: wav/aiff/caf only, <= 30s. Our TTS lines ship as
// mp3, which AlarmKit cannot use. ElevenLabs can return raw PCM instead of
// mp3 (`output_format=pcm_<rate>`: signed 16-bit little-endian, mono, headerless),
// so the alarm-ready wav is just that same response with a 44-byte RIFF header
// in front — no transcoding, no second synthesis call.
//
// Tier note: pcm_16000 / pcm_22050 / pcm_24000 are available on the paid tiers
// we use; pcm_44100 needs Pro. Convex has no ffmpeg-class dependency available,
// so PCM-in / header-out is the only viable server-side route.

/** UNNotificationSound / AlarmKit hard limit for a named alarm sound. */
export const MAX_ALARM_SOUND_SECONDS = 30;

/** ElevenLabs PCM is always mono signed 16-bit little-endian. */
export const ALARM_WAV_CHANNELS = 1;
export const ALARM_WAV_BITS_PER_SAMPLE = 16;

/** 22.05 kHz mono 16-bit ≈ 44 KB/s — a 3-8s line lands at 130-350 KB. */
export const DEFAULT_ALARM_WAV_SAMPLE_RATE = 22050;

/** `output_format` to request from ElevenLabs for the alarm-ready line. */
export const ALARM_PCM_OUTPUT_FORMAT = `pcm_${DEFAULT_ALARM_WAV_SAMPLE_RATE}`;

/**
 * Sample rate encoded in an ElevenLabs `output_format` value, or null when the
 * format is not PCM (mp3/opus/ulaw responses cannot be wrapped as WAV).
 */
export function parsePcmSampleRate(outputFormat: unknown): number | null {
  const match = String(outputFormat ?? "").trim().toLowerCase().match(/^pcm_(\d+)$/);
  if (!match) return null;
  const rate = Number(match[1]);
  return rate > 0 ? rate : null;
}

/** Playback length of a headerless PCM buffer, in seconds. */
export function pcmDurationSeconds(
  byteLength: number,
  sampleRate: number = DEFAULT_ALARM_WAV_SAMPLE_RATE
): number {
  const bytesPerSecond =
    sampleRate * ALARM_WAV_CHANNELS * (ALARM_WAV_BITS_PER_SAMPLE / 8);
  if (!(bytesPerSecond > 0) || !(byteLength > 0)) return 0;
  return byteLength / bytesPerSecond;
}

/**
 * Standard 44-byte canonical WAV/RIFF header for a PCM payload.
 * Little-endian throughout; sizes are the ones AVFoundation validates.
 */
export function buildWavHeader(
  dataLength: number,
  sampleRate: number = DEFAULT_ALARM_WAV_SAMPLE_RATE
): Uint8Array {
  const header = new Uint8Array(44);
  const view = new DataView(header.buffer);
  const blockAlign = ALARM_WAV_CHANNELS * (ALARM_WAV_BITS_PER_SAMPLE / 8);
  const writeAscii = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i++) {
      header[offset + i] = text.charCodeAt(i);
    }
  };

  writeAscii(0, "RIFF");
  view.setUint32(4, 36 + dataLength, true); // file size minus the 8-byte RIFF preamble
  writeAscii(8, "WAVE");
  writeAscii(12, "fmt ");
  view.setUint32(16, 16, true); // PCM fmt chunk length
  view.setUint16(20, 1, true); // audioFormat 1 = uncompressed PCM
  view.setUint16(22, ALARM_WAV_CHANNELS, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true); // byte rate
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, ALARM_WAV_BITS_PER_SAMPLE, true);
  writeAscii(36, "data");
  view.setUint32(40, dataLength, true);

  return header;
}

/**
 * Wrap an ElevenLabs PCM response as a playable WAV. Throws rather than storing
 * an alarm sound iOS would silently reject (bad rate, empty body, over 30s).
 */
export function pcmToWav(
  pcm: Uint8Array,
  sampleRate: number = DEFAULT_ALARM_WAV_SAMPLE_RATE
): Uint8Array {
  if (!Number.isFinite(sampleRate) || sampleRate <= 0) {
    throw new Error(`Invalid PCM sample rate: ${sampleRate}`);
  }
  if (pcm.length === 0) {
    throw new Error("Cannot build alarm WAV from an empty PCM buffer");
  }
  const seconds = pcmDurationSeconds(pcm.length, sampleRate);
  if (seconds > MAX_ALARM_SOUND_SECONDS) {
    throw new Error(
      `Alarm WAV is ${seconds.toFixed(1)}s, over the ${MAX_ALARM_SOUND_SECONDS}s limit`
    );
  }

  const wav = new Uint8Array(44 + pcm.length);
  wav.set(buildWavHeader(pcm.length, sampleRate), 0);
  wav.set(pcm, 44);
  return wav;
}

// ─── Alarm WAV shaping (cadence ladder) ─────────────────────────────────────
//
// AlarmKit has no "ring once" and no "pause between rings": it loops the sound
// file for as long as the alarm rings. So what a single ringing alarm sounds
// like is decided entirely by what is inside the file. A bare 4s line loops
// back-to-back forever; the same line padded out to ~28s of silence is heard as
// one utterance followed by quiet, which is what a real assistant does.

/** Shaped length of an alarm wav: the line, then silence out to here. */
export const ALARM_WAV_TARGET_SECONDS = 28;

/**
 * Ceiling the shaping math stays under. iOS rejects anything from 30s up, and
 * a padded file never needs to run that close to the edge. A line that is
 * already longer than the target ships bare instead — `pcmToWav`'s existing
 * 30s guard is what catches a genuinely oversized utterance.
 */
export const ALARM_WAV_MAX_SECONDS = 29;

/** Breath between utterances inside a dense (persistent-tier) alarm wav. */
export const ALARM_WAV_DENSE_GAP_SECONDS = 2;

/** Byte length of `seconds` of PCM, truncated to a whole 16-bit sample. */
function pcmByteLength(seconds: number, sampleRate: number): number {
  const bytesPerSample = ALARM_WAV_CHANNELS * (ALARM_WAV_BITS_PER_SAMPLE / 8);
  const bytes = Math.floor(seconds * sampleRate * bytesPerSample);
  return bytes - (bytes % bytesPerSample);
}

/**
 * Shape a spoken line into the alarm wav for its tier and wrap it as WAV.
 *
 * - normal: `[line][silence]` padded to ALARM_WAV_TARGET_SECONDS — one
 *   utterance per ring, then quiet.
 * - dense: `[line][2s gap]` repeated as many whole passes as fit in the target
 *   — insistent nagging for persistent reminders.
 *
 * Silence is zero bytes: that is the midpoint of signed 16-bit PCM, so a
 * zero-filled buffer is literal silence, not a click. A line that already
 * fills the target ships unpadded rather than being trimmed.
 */
export function buildAlarmWav(
  pcm: Uint8Array,
  sampleRate: number,
  opts: { dense: boolean }
): Uint8Array {
  // Unusable input takes the plain path so callers see pcmToWav's own errors.
  if (!Number.isFinite(sampleRate) || sampleRate <= 0 || pcm.length === 0) {
    return pcmToWav(pcm, sampleRate);
  }

  const targetBytes = pcmByteLength(ALARM_WAV_TARGET_SECONDS, sampleRate);
  const passBytes = pcm.length + pcmByteLength(ALARM_WAV_DENSE_GAP_SECONDS, sampleRate);
  // Dense stops before the pass that would overrun the target; normal is one
  // pass by definition. Zero passes means the line alone fills the budget.
  const passes = opts.dense ? Math.floor(targetBytes / passBytes) : 1;
  if (pcm.length >= targetBytes || passes < 1) {
    return pcmToWav(pcm, sampleRate);
  }

  const body = new Uint8Array(opts.dense ? passes * passBytes : targetBytes);
  for (let pass = 0; pass < passes; pass++) {
    body.set(pcm, pass * passBytes);
  }
  return pcmToWav(body, sampleRate);
}

/**
 * Variant wav storage ids ride index-aligned with `variants`, and a Convex
 * `v.array(v.id("_storage"))` cannot hold holes. So the first variant whose wav
 * failed to synthesize ends the array: every later rung falls back to the base
 * wav rather than to some other variant's line.
 */
export function alignVariantWavIds<T>(wavIds: (T | null | undefined)[]): T[] {
  const aligned: T[] = [];
  for (const id of wavIds) {
    if (id === null || id === undefined) break;
    aligned.push(id);
  }
  return aligned;
}
