/**
 * The spoken language, read off the writing system (OLD-139).
 *
 * The parse model tags every take with an ISO 639-1 `lang`, and it gets that
 * tag wrong in one systematic way: text in a script it associates with one
 * famous language comes back as that language. In the 2026-10-06 STT bake-off
 * (outputs/stt-bakeoff2), correctly transcribed Hindi, Urdu, Persian and
 * Hebrew were all tagged "ar". The tag picks the voice and the guard's verdict,
 * so a wrong one costs the user the reminder.
 *
 * Many scripts name their language outright: Hebrew letters are Hebrew, Hangul
 * is Korean, kana is Japanese. For those, the script is a better witness than
 * the model, and it costs nothing — no network, no model call, no latency. This
 * module counts the letters of the transcript (plus the reminder's own title
 * and line), finds the dominant script, and names the language that script
 * implies. Where the script cannot say — Latin and Cyrillic are written by
 * dozens of languages — it says nothing and the model's tag stands.
 *
 * Pure: no Convex, no network. Safe to import from either runtime.
 */

import { normalizeLanguageCode } from "./languages";

/**
 * A script that names its language, and the other languages written in it
 * that the model may still pick. The script's own language wins over any
 * other tag; an alternate wins only when the model itself said it, because
 * the letters alone cannot tell it apart (Marathi from Hindi, say).
 */
type ScriptRule = { script: RegExp; lang: string; alternates?: readonly string[] };

const SCRIPT_RULES: readonly ScriptRule[] = [
  { script: /\p{Script=Hebrew}/u, lang: "he", alternates: ["yi"] },
  { script: /\p{Script=Devanagari}/u, lang: "hi", alternates: ["mr", "ne"] },
  { script: /\p{Script=Bengali}/u, lang: "bn", alternates: ["as"] },
  { script: /\p{Script=Gurmukhi}/u, lang: "pa" },
  { script: /\p{Script=Gujarati}/u, lang: "gu" },
  { script: /\p{Script=Tamil}/u, lang: "ta" },
  { script: /\p{Script=Telugu}/u, lang: "te" },
  { script: /\p{Script=Kannada}/u, lang: "kn" },
  { script: /\p{Script=Malayalam}/u, lang: "ml" },
  { script: /\p{Script=Thai}/u, lang: "th" },
  { script: /\p{Script=Hangul}/u, lang: "ko" },
  { script: /\p{Script=Greek}/u, lang: "el" },
  { script: /\p{Script=Georgian}/u, lang: "ka" },
  { script: /\p{Script=Armenian}/u, lang: "hy" },
];

// Scripts read with a closer look than one letter at a time.
const ARABIC = /\p{Script=Arabic}/u;
const HAN = /\p{Script=Han}/u;
const KANA = /[\p{Script=Hiragana}\p{Script=Katakana}]/u;
/** Many languages, one alphabet: these never override the model. */
const AMBIGUOUS = /[\p{Script=Latin}\p{Script=Cyrillic}]/u;

/**
 * Letters only Urdu writes among the three big Arabic-script languages:
 * ٹ ڈ ڑ ں ے ۓ ھ ہ ۂ. Persian never uses them, and Arabic never does either.
 */
const URDU_LETTERS = /[ٹڈڑںےۓھہۂ]/u;
/**
 * Letters Persian and Urdu share and standard Arabic does not: پ چ ژ گ, and
 * the keheh/Farsi-yeh spellings ک ی of Arabic's ك ي.
 */
const PERSO_URDU_LETTERS = /[پچژگکی]/u;
/** Spellings only Arabic uses: ة ك ي ى. */
const ARABIC_ONLY_LETTERS = /[ةكيى]/u;
/** Other Arabic-script languages the letters cannot tell from these three. */
const ARABIC_SCRIPT_ALTERNATES: readonly string[] = ["ps", "sd", "ku", "ug"];

/** What the letters say, plus the model tags they still allow. */
type ScriptVerdict = { lang: string; alternates: readonly string[] };

/** Every letter of every string in `texts` (non-strings are skipped). */
function lettersOf(texts: readonly unknown[]): string[] {
  const letters: string[] = [];
  for (const text of texts) {
    if (typeof text !== "string") continue;
    for (const ch of text) if (/\p{L}/u.test(ch)) letters.push(ch);
  }
  return letters;
}

/** Arabic, Persian or Urdu, from the letters each one alone writes. */
function arabicScriptLanguage(letters: readonly string[]): string {
  let urdu = 0;
  let persoUrdu = 0;
  let arabicOnly = 0;
  for (const ch of letters) {
    if (URDU_LETTERS.test(ch)) urdu++;
    else if (PERSO_URDU_LETTERS.test(ch)) persoUrdu++;
    else if (ARABIC_ONLY_LETTERS.test(ch)) arabicOnly++;
  }
  // Mostly Arabic spellings, a stray loan letter or two: Arabic.
  if (urdu + persoUrdu <= arabicOnly) return "ar";
  return urdu > 0 ? "ur" : "fa";
}

/**
 * The language the dominant script of `texts` names, or null when no script
 * dominates or the dominant one is shared by many languages (Latin, Cyrillic,
 * or anything not listed here).
 *
 * Han and kana count as one script, Japanese if any kana appears and Chinese
 * otherwise; Arabic script is split into Arabic, Persian and Urdu by the
 * letters each one alone writes.
 */
export function scriptVerdict(texts: readonly unknown[]): ScriptVerdict | null {
  const letters = lettersOf(texts);
  // One tally per candidate. Order is the tiebreak; Latin/Cyrillic first, so a
  // tie with them leaves the model's tag alone.
  const tallies = new Map<string, number>([["ambiguous", 0], ["cjk", 0], ["arabic", 0]]);
  let kana = false;
  for (const ch of letters) {
    if (AMBIGUOUS.test(ch)) tallies.set("ambiguous", tallies.get("ambiguous")! + 1);
    else if (ARABIC.test(ch)) tallies.set("arabic", tallies.get("arabic")! + 1);
    else if (KANA.test(ch)) {
      kana = true;
      tallies.set("cjk", tallies.get("cjk")! + 1);
    } else if (HAN.test(ch)) tallies.set("cjk", tallies.get("cjk")! + 1);
    else {
      const rule = SCRIPT_RULES.find((r) => r.script.test(ch));
      if (rule) tallies.set(rule.lang, (tallies.get(rule.lang) ?? 0) + 1);
    }
  }

  let winner: string | null = null;
  let best = 0;
  for (const [key, count] of tallies) {
    if (count > best) {
      winner = key;
      best = count;
    }
  }
  if (winner === null || winner === "ambiguous") return null;
  if (winner === "cjk") {
    // A take written in kanji alone can still be Japanese, when the model says so.
    return kana ? { lang: "ja", alternates: [] } : { lang: "zh", alternates: ["ja"] };
  }
  if (winner === "arabic") {
    return { lang: arabicScriptLanguage(letters), alternates: ARABIC_SCRIPT_ALTERNATES };
  }
  const rule = SCRIPT_RULES.find((r) => r.lang === winner)!;
  return { lang: rule.lang, alternates: rule.alternates ?? [] };
}

/**
 * The language a take or reminder was spoken in: the model's `modelLang`,
 * overruled by the script of `texts` wherever that script is unambiguous.
 *
 *   - Latin, Cyrillic, no letters, or a script not listed: the model's tag
 *     (normalized), or undefined when it gave none.
 *   - A script that names its language: that language, unless the model said
 *     one of the script's listed alternates (Marathi for Devanagari, Pashto
 *     for Arabic script, ...) — then the model's.
 *
 * `texts` is the transcript first, then whatever the model wrote in the same
 * language (title, spoken line); non-strings are ignored.
 */
export function correctLanguageByScript(
  modelLang: unknown,
  texts: readonly unknown[]
): string | undefined {
  const tagged = normalizeLanguageCode(modelLang);
  const verdict = scriptVerdict(texts);
  if (verdict === null) return tagged;
  if (tagged !== undefined && verdict.alternates.includes(tagged)) return tagged;
  return verdict.lang;
}
