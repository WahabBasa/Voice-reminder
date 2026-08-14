/**
 * Two-beat reminder speech: a short attention catch, then the payload.
 *
 * The model never writes the catch. Its prompt bans opener formulas outright
 * (SPOKEN_OPENER_RULE in ./helpers.ts) and keeps writing bare payloads; the
 * catch is assembled here, in code, so it is deterministic, testable and
 * rotatable. It exists only in the text handed to TTS — the stored description
 * is untouched, so cards keep showing the payload alone.
 *
 * Persona rule: this assistant never forgets. Remembering is the whole job, so
 * no catch may imply fallible memory ("Before I forget" was rejected for
 * exactly that). "Remember" and "Don't forget" stay in — they hand the memory
 * to the user rather than confessing to losing it.
 *
 * First firing only: the pre-reminder heads-up and the main line each draw
 * their own catch. Escalation-ladder replays get none — a rung that re-opens
 * with "Heads up" stops being heard as a new attempt, and the same holds for
 * the utterances a dense alarm wav repeats inside one ring.
 */

export type CatchLanguage = "en" | "ar";

export type SpeechCatch = {
  /** Stable: this is what gets persisted as a device's last-used catch. */
  id: string;
  language: CatchLanguage;
  /** Fully punctuated prefix. `{name}` takes the user's address term. */
  text: string;
  weight: number;
};

/** Ordinary catch. */
const WEIGHT_PLAIN = 2;
/** Approved, but must not become the house voice. */
const WEIGHT_QUIET = 1;
/** Name-bearing catches: an address term the user set is worth using. */
const WEIGHT_NAMED = 5;

/** Marker a name-bearing catch carries; also how name forms are recognized. */
export const CATCH_NAME_SLOT = "{name}";

/**
 * The approved pools. Adding to them is a product decision, not a code one —
 * see the persona rule above before proposing a line.
 */
export const SPEECH_CATCHES: SpeechCatch[] = [
  // ── English, address-free ──
  { id: "en.heads-up", language: "en", text: "Heads up —", weight: WEIGHT_PLAIN },
  { id: "en.just-a-heads-up", language: "en", text: "Just a heads up —", weight: WEIGHT_PLAIN },
  { id: "en.by-the-way", language: "en", text: "By the way,", weight: WEIGHT_PLAIN },
  { id: "en.just-so-you-know", language: "en", text: "Just so you know,", weight: WEIGHT_PLAIN },
  { id: "en.real-quick", language: "en", text: "Real quick —", weight: WEIGHT_PLAIN },
  { id: "en.quick-thing", language: "en", text: "Quick thing —", weight: WEIGHT_PLAIN },
  { id: "en.small-thing", language: "en", text: "Small thing —", weight: WEIGHT_PLAIN },
  { id: "en.one-thing", language: "en", text: "One thing —", weight: WEIGHT_PLAIN },
  { id: "en.remember", language: "en", text: "Remember,", weight: WEIGHT_PLAIN },
  { id: "en.dont-forget", language: "en", text: "Don't forget,", weight: WEIGHT_QUIET },

  // ── Arabic, address-free ──
  { id: "ar.intabih", language: "ar", text: "انتبه،", weight: WEIGHT_PLAIN },
  { id: "ar.ala-fikra", language: "ar", text: "على فكرة،", weight: WEIGHT_PLAIN },
  { id: "ar.bil-munasaba", language: "ar", text: "بالمناسبة،", weight: WEIGHT_PLAIN },
  { id: "ar.lahza", language: "ar", text: "لحظة،", weight: WEIGHT_PLAIN },
  { id: "ar.daqiqa", language: "ar", text: "دقيقة،", weight: WEIGHT_PLAIN },
  { id: "ar.tathakkar", language: "ar", text: "تذكر،", weight: WEIGHT_PLAIN },
  // Arabic counterpart of "Don't forget" — held to the same lower weight.
  { id: "ar.la-tansa", language: "ar", text: "لا تنسى،", weight: WEIGHT_QUIET },

  // ── English, name-bearing (drawn only when an address term is set) ──
  { id: "en.name", language: "en", text: "{name} —", weight: WEIGHT_NAMED },
  { id: "en.name-heads-up", language: "en", text: "Heads up, {name} —", weight: WEIGHT_NAMED },
  { id: "en.name-by-the-way", language: "en", text: "By the way, {name} —", weight: WEIGHT_NAMED },
  { id: "en.name-quick-thing", language: "en", text: "Quick thing, {name} —", weight: WEIGHT_NAMED },

  // ── Arabic, name-bearing ──
  { id: "ar.name", language: "ar", text: "يا {name}،", weight: WEIGHT_NAMED },
  { id: "ar.name-intabih", language: "ar", text: "يا {name}، انتبه،", weight: WEIGHT_NAMED },
  { id: "ar.name-ala-fikra", language: "ar", text: "على فكرة يا {name}،", weight: WEIGHT_NAMED },
  { id: "ar.name-tathakkar", language: "ar", text: "يا {name}، تذكر،", weight: WEIGHT_NAMED },
];

/**
 * Arabic block (U+0600-U+06FF) plus the Arabic Supplement (U+0750-U+077F) —
 * enough to spot Arabic text; the range ends are literal here.
 */
const ARABIC_SCRIPT = /[؀-ۿݐ-ݿ]/g;

/** The other side of the count. Latin letters only — digits sit in both. */
const LATIN_SCRIPT = /[A-Za-z]/g;

const countMatches = (text: string, pattern: RegExp): number =>
  (text.match(pattern) ?? []).length;

/**
 * Catch language follows the payload, not the device — but by MAJORITY script,
 * not by "contains any Arabic". A bilingual user whose address term is Arabic
 * («وهاب») gets that term woven into English lines verbatim, and one Arabic
 * word does not make an English line Arabic: an Arabic catch in front of it
 * reads as two languages glued together, with the name said twice. So the
 * address term is removed from the payload before the count (it is the model's
 * to weave in, never a language signal), and a tie goes to English.
 */
export function catchLanguageFor(
  payload: unknown,
  addressTerm?: string
): CatchLanguage {
  const text = String(payload ?? "");
  const term = String(addressTerm ?? "").trim();
  // Verbatim removal, every occurrence: the prompt asks for the term exactly as
  // the user wrote it, so a literal split is the whole job — no regex escaping.
  const counted = term ? text.split(term).join(" ") : text;
  return countMatches(counted, ARABIC_SCRIPT) > countMatches(counted, LATIN_SCRIPT)
    ? "ar"
    : "en";
}

/** Catches drawable for a payload: its language, name forms only when named. */
export function eligibleCatches(
  language: CatchLanguage,
  addressTerm?: string
): SpeechCatch[] {
  const named = String(addressTerm ?? "").trim().length > 0;
  return SPEECH_CATCHES.filter(
    (entry) =>
      entry.language === language &&
      (named || !entry.text.includes(CATCH_NAME_SLOT))
  );
}

/**
 * Weighted shuffle without replacement (Efraimidis-Spirakis): sorting by
 * `random ^ (1/weight)` descending yields the whole preference order from one
 * pass, so a caller can take the first pick that isn't a repeat without
 * redrawing.
 */
export function weightedCatchOrder(
  candidates: SpeechCatch[],
  random: () => number = Math.random
): string[] {
  return candidates
    .map((entry) => {
      // A 0 draw would key every weight to 0 and lose the ordering.
      const u = Math.min(Math.max(random(), Number.EPSILON), 1);
      const weight = entry.weight > 0 ? entry.weight : Number.EPSILON;
      return { id: entry.id, key: Math.pow(u, 1 / weight) };
    })
    .sort((a, b) => b.key - a.key)
    .map((entry) => entry.id);
}

/** Preference order of the catch ids this payload may be spoken with. */
export function catchCandidateOrder(args: {
  payload: string;
  addressTerm?: string;
  random?: () => number;
}): string[] {
  const candidates = eligibleCatches(
    catchLanguageFor(args.payload, args.addressTerm),
    args.addressTerm
  );
  return weightedCatchOrder(candidates, args.random);
}

/**
 * The first `count` ids of a preference order that do not repeat the last catch
 * this device heard. Distinctness is free — the order is a permutation — so the
 * heads-up and the main line never share a catch either. A pool that holds
 * nothing but the last catch repeats it rather than going silent.
 */
export function selectCatchIds(
  orderedIds: string[],
  lastCatchId: string | null | undefined,
  count: number
): string[] {
  if (count <= 0) return [];
  const fresh = orderedIds.filter((id) => id !== lastCatchId);
  const pool = fresh.length > 0 ? fresh : orderedIds;
  return pool.slice(0, count);
}

/** Spoken text of one catch id, or "" for an unknown id or a missing name. */
export function renderCatch(id: string | undefined, addressTerm?: string): string {
  const entry = SPEECH_CATCHES.find((candidate) => candidate.id === id);
  if (!entry) return "";
  if (!entry.text.includes(CATCH_NAME_SLOT)) return entry.text;
  const name = String(addressTerm ?? "").trim();
  return name ? entry.text.split(CATCH_NAME_SLOT).join(name) : "";
}

/**
 * Catch, then payload. The payload is model text and is joined verbatim — each
 * catch carries its own closing punctuation, so nothing here needs to guess at
 * casing or add separators.
 */
export function applySpeechCatch(payload: unknown, catchText: string): string {
  const line = String(payload ?? "").trim();
  const prefix = String(catchText ?? "").trim();
  if (!line || !prefix) return line;
  return `${prefix} ${line}`;
}

/** Spoken form of one first-firing line; an unusable catch id leaves it bare. */
export function withSpeechCatch(
  payload: unknown,
  catchId: string | undefined,
  addressTerm?: string
): string {
  return applySpeechCatch(payload, renderCatch(catchId, addressTerm));
}
