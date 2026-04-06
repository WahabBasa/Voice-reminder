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
