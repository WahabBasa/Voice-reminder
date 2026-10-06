/**
 * The language a device speaks in (OLD-140): the rule that learns it.
 *
 * Every take the server understood tells it which language its user spoke in:
 * a committed take through its reminders' `lang`, and a take turned away for
 * want of a time (`no_time` / `past_time`) through the plans it kept. That
 * language is remembered on the device's `devices` row (`spokenLang`) and sent
 * back to the phone, which then listens in it on-device and hints it to the
 * cloud transcriber. A Swedish speaker on an English iPhone stops losing an
 * attempt to an English recognizer on every take.
 *
 * The rule:
 *   - the first language heard is taken at once;
 *   - the same language again only refreshes `spokenLangAt`;
 *   - a different language becomes the candidate, and replaces the stored one
 *     only when SWITCH_AFTER takes in a row agree on it. One English take from
 *     a Swedish speaker does not undo the streak;
 *   - a take counts once, however many outcomes it records (a `no_time` take
 *     the user then answers is seen twice);
 *   - a take with no language (a failure, an old parse) changes nothing.
 *
 * Pure: no Convex, no clock of its own. convex/devices.ts applies it.
 */

import { normalizeLanguageCode } from "./languages";

/** Takes in a row a new language needs before it replaces the stored one. */
export const SWITCH_AFTER = 2;

/** The `devices` columns this rule reads and writes. */
export type SpokenLangState = {
  spokenLang?: string;
  spokenLangAt?: number;
  spokenLangCandidate?: string;
  spokenLangCandidateCount?: number;
  spokenLangLastCreationId?: string;
};

/**
 * The language most of a take's reminders were spoken in. Ties go to the one
 * that came first; entries that are not a language code are ignored.
 */
export function majorityLang(langs: readonly unknown[]): string | undefined {
  const counts = new Map<string, number>();
  for (const raw of langs) {
    const code = normalizeLanguageCode(raw);
    if (code) counts.set(code, (counts.get(code) ?? 0) + 1);
  }
  let best: string | undefined;
  let bestCount = 0;
  // Map iteration is insertion order, so `>` keeps the first of a tie.
  for (const [code, count] of counts) {
    if (count > bestCount) {
      best = code;
      bestCount = count;
    }
  }
  return best;
}

/**
 * The patch one understood take makes to a device's language state, or null
 * when it changes nothing.
 */
export function nextSpokenLang(
  state: SpokenLangState,
  take: { lang: string | undefined; creationId: string },
  now: number
): SpokenLangState | null {
  const lang = normalizeLanguageCode(take.lang);
  if (!lang) return null;
  if (state.spokenLangLastCreationId === take.creationId) return null;

  const counted = { spokenLangLastCreationId: take.creationId };

  if (!state.spokenLang || state.spokenLang === lang) {
    return {
      ...counted,
      spokenLang: lang,
      spokenLangAt: now,
      spokenLangCandidate: undefined,
      spokenLangCandidateCount: undefined,
    };
  }

  const count =
    state.spokenLangCandidate === lang ? (state.spokenLangCandidateCount ?? 0) + 1 : 1;
  if (count >= SWITCH_AFTER) {
    return {
      ...counted,
      spokenLang: lang,
      spokenLangAt: now,
      spokenLangCandidate: undefined,
      spokenLangCandidateCount: undefined,
    };
  }
  return { ...counted, spokenLangCandidate: lang, spokenLangCandidateCount: count };
}
