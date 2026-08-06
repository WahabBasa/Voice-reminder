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
// When addressTerm is set, the urgent hook uses it verbatim (may be Arabic);
// when unset, urgent lines stay address-free (no 'Sir', no invented names).
export function buildDescriptionInstruction(addressTerm?: string): string {
  const term = String(addressTerm ?? "").trim();
  const urgentHook = term
    ? `'${term} —' when the user needs to act right now (meeting starting, time to leave) — use the address term '${term}' verbatim, exactly as the user wrote it (it may be Arabic), and you may also weave it into firmer phrasings`
    : `an address-free urgent hook like 'It's time —' when the user needs to act right now (meeting starting, time to leave) — never address the user by any name or title (no 'Sir', no invented names)`;
  const urgentExample = term
    ? `'${term} — you need to get to your meeting.'`
    : `'It's time — you need to leave for your meeting now.'`;
  return `the sentence spoken aloud when the reminder fires. Structure: attention hook, then the task with whatever time/place context the user gave. Hooks (pick by urgency, in the input's language): ${urgentHook}; 'Heads up —' for advance notice of something coming; 'Quick reminder —' for routine tasks. One sentence, roughly 5-12 words after the hook, phrased so it is true at the moment the reminder fires. Examples: ${urgentExample} / 'Heads up — the kids' football game starts in 20 minutes.' / 'Quick reminder — time to take your medicine.'`;
}

// Instruction block for the parse prompt's pre-reminder (heads-up) fields.
export function buildPreReminderInstruction(): string {
  return `PRE-REMINDER RULES (automatic heads-up before the event):
- "preReminderMinutes": 10-15 for hard-start events the user must be somewhere for or start on time (meetings, appointments, flights, games, classes, calls). 0 for ambient/routine tasks (drink water, take medicine, generic todos).
- If the user explicitly asks for a heads-up ("give me a 20 minute warning"), use that many minutes.
- "preDescription": ONLY when preReminderMinutes > 0. A short spoken line, under 12 words, phrased "Heads up — <event> in <N> minutes" in the input's language (Arabic input gets an Arabic line). Omit the field entirely when preReminderMinutes is 0.`;
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

// Economize policy: urgent-tier and persistent reminders get the full ladder,
// notice gets a middle amount, routine gets a single extra variant.
export function variantCountForTier(urgency: Urgency, persistent: boolean): number {
  if (persistent || urgency === "urgent") return MAX_REPLAY_VARIANTS;
  if (urgency === "notice") return 2;
  return 1;
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
// variants). When addressTerm is set, firmer variants may weave it in verbatim.
export function buildVariantInstruction(addressTerm?: string): string {
  const term = String(addressTerm ?? "").trim();
  const firmNote = term
    ? `firmer variants may open with or weave in the address term '${term}' verbatim, exactly as the user wrote it (it may be Arabic)`
    : `never address the user by any name or title in any variant (no 'Sir', no invented names)`;
  return `ASSISTANT REPLAY RULES (escalating follow-up lines for ignored reminders):
- "urgency": the hook tier the description uses — "urgent" for the urgent hook, "notice" for 'Heads up —', "routine" for 'Quick reminder —'.
- "persistent": true ONLY when missing the task would be harmful (medicine regimens, flights, picking up children). Otherwise false or omit.
- "variants": alternative spoken lines used when the reminder is ignored, in the input's language. Each one rewords the task differently — never repeat the description or another variant verbatim — and they escalate in firmness from gentle nudge to insistent; ${firmNote}. One sentence each, roughly 5-14 words. Provide ${MAX_REPLAY_VARIANTS} variants when urgency is "urgent" or persistent is true, 2 when urgency is "notice", otherwise 1.`;
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
