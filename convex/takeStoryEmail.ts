/**
 * The founder's take email, the pure half: one email per take, short enough
 * to read on a phone in five seconds. Outcome, what the user saw, language and
 * time, what the phone and the server heard (with an English line when the
 * words weren't English), one sentence of why, and grey details at the foot.
 * HTML plus a plain-text fallback.
 *
 * convex/founderAlerts.ts `deliverTakeEmail` gathers the facts once the take
 * has settled; convex/takeEmailActions.ts `sendTakeEmail` adds the best-effort
 * translations (`addTranslations`) and calls `buildTakeStoryEmail`. No Convex,
 * no env, no network here.
 *
 * Privacy, as in ./founderAlertsEmail.ts: the input carries `deviceTag`, never
 * the deviceId. Transcripts and titles are shown (the founder's decision for
 * failed takes, OLD-136), each cut to 300 characters, and every value that
 * reaches the HTML is escaped (./emailHtml.ts).
 */

import { languageName } from "../lib/languageNames";
import {
  TEXT_RULE,
  detailsBlock,
  emailShell,
  escapeHtml,
  headline as htmlHeadline,
  kvTable,
  lead,
  paragraph,
  quoteBlock,
  sectionHeading,
} from "./emailHtml";
import { HEARD_EMAIL_MAX, clip } from "./founderAlertsEmail";
import { needsMultilingualVoice, normalizeLanguageCode } from "./languages";
import { askCardPrompt, phoneCopyForServerFailure } from "./takeCardCopy";

export { escapeHtml };

// ─── input ───────────────────────────────────────────────────────────────────

/** Why one attempt failed, as its failedTakes row recorded it. */
export type StoryFailure = {
  errorCode?: string;
  errorDetail?: string;
  /** Set by the guard only for `unsupported_language`. */
  detectedLanguage?: string;
  /** The clock time a `past_time` take named, when the server sent one. */
  pastTime?: string;
  /** The parse model's raw answer. Its `language` is the attempt's language. */
  parseRaw?: string;
  /** The failedTakes row id, for the audio command. */
  failedTakeId?: string;
  hasAudio?: boolean;
};

/** One worker run of the take (one generation). */
export type StoryAttempt = {
  generation: number;
  source: "device" | "cloud";
  status: "failed" | "committed" | "running";
  /** What this attempt worked from: the phone's transcript or the server's. */
  transcript?: string;
  /** The transcript in English, when it wasn't English (added by the sender). */
  translation?: string;
  deviceSttLocale?: string;
  deviceSttEngine?: string;
  deviceSttMs?: number;
  sttModel?: string;
  sttFallbackUsed?: boolean;
  /** The language the server reported (or the reminder's, for a success). */
  language?: string;
  audioSeconds?: number;
  sttMs?: number;
  parseMs?: number;
  totalMs?: number;
  failure?: StoryFailure;
};

export type StoryReminder = {
  title: string;
  spokenLine?: string;
  lang?: string;
  onceAt?: number;
  time?: string;
  date?: string;
  frequency?: string;
  days?: string[];
  tzid?: string;
};

/**
 * Where the take ended up:
 * - `committed` — the last attempt made reminders;
 * - `failed` — the job is still there, failed;
 * - `discarded` — the job is gone (the user swiped the failed card away);
 * - `cancelled` — the user cancelled the take after a failure;
 * - `running` — a retry was still running when the email had to go.
 */
export type StoryFinal = "committed" | "failed" | "discarded" | "cancelled" | "running";

export type TakeStoryInput = {
  creationId: string;
  deviceTag: string;
  timezone?: string;
  locale?: string;
  buildNumber?: string;
  updateId?: string;
  iosVersion?: string;
  /** When the user stopped recording (the job's createdAt). */
  recordedAt: number;
  newDevice: boolean;
  firstTake: boolean;
  /** When the install first said hello (devices.firstSeenAt), when known. */
  firstSeenAt?: number;
  /** A pre-launch install (devices.seeded): first seen "earlier", whatever the row says. */
  deviceSeeded?: boolean;
  /** Oldest first. */
  attempts: StoryAttempt[];
  final: StoryFinal;
  reminders: StoryReminder[];
  /** A second email for a take whose first email already went out. */
  followUp?: boolean;
};

export type TakeEmail = { subject: string; body: string; html: string };

// ─── classification ──────────────────────────────────────────────────────────

export type FailReason =
  | "not_understood"
  | "no_time"
  | "unsupported_language"
  | "past_time"
  | "silent"
  | "unparseable"
  | "parse_failed"
  | "stt_failed"
  | "storage_missing"
  | "internal"
  | "unknown";

export type StoryVerdict =
  | { kind: "worked" }
  | { kind: "recovered"; onServer: boolean }
  | { kind: "failed"; reason: FailReason };

const INVENTED_PHRASES = [
  "thank you for watching",
  "thanks for watching",
  "thank you so much for watching",
  "thank you for watching please subscribe",
  "please subscribe",
  "thank you",
  "thanks",
  "you",
  "bye",
  "subtitles by the amaraorg community",
  "شكرا للمشاهدة",
];

function normalizeForMatch(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Text a backup transcriber is known to invent for a silent recording
 * ("Thank you for watching.").
 */
export function looksInvented(transcript: string | undefined): boolean {
  if (!transcript) return false;
  const norm = normalizeForMatch(transcript);
  if (norm.startsWith("subtitles by")) return true;
  return INVENTED_PHRASES.includes(norm);
}

/**
 * The backup transcriber invented this attempt's text from silence (the main
 * one gave nothing back, the backup a stock phrase), or the server said so.
 */
export function attemptMadeUp(attempt: StoryAttempt): boolean {
  if (attempt.failure?.errorDetail === "made_up") return true;
  if (attempt.source !== "cloud" || !attempt.sttFallbackUsed) return false;
  return looksInvented(attempt.transcript);
}

/**
 * The server got silence: the main transcriber gave nothing back and the
 * backup either gave nothing too or invented one of its stock phrases. Also any
 * attempt the server itself marked silent.
 */
export function attemptLooksSilent(attempt: StoryAttempt): boolean {
  const f = attempt.failure;
  if (f?.errorDetail === "silent" || f?.errorCode === "silent") return true;
  return attemptMadeUp(attempt);
}

export function failReasonOf(attempt: StoryAttempt): FailReason {
  if (attemptLooksSilent(attempt)) return "silent";
  const f = attempt.failure ?? {};
  switch (f.errorDetail) {
    case "not_understood":
    case "no_time":
    case "unsupported_language":
    case "past_time":
      return f.errorDetail;
  }
  switch (f.errorCode) {
    case "unparseable":
    case "parse_failed":
    case "stt_failed":
    case "storage_missing":
    case "internal":
      return f.errorCode;
    default:
      return "unknown";
  }
}

function lastFailed(attempts: StoryAttempt[]): StoryAttempt | undefined {
  for (let i = attempts.length - 1; i >= 0; i--) {
    if (attempts[i].status === "failed") return attempts[i];
  }
  return undefined;
}

export function classifyStory(input: TakeStoryInput): StoryVerdict {
  const failed = input.attempts.filter((a) => a.status === "failed");
  if (input.final === "committed") {
    if (failed.length === 0) return { kind: "worked" };
    const winner = input.attempts[input.attempts.length - 1];
    const onServer =
      winner?.source === "cloud" && input.attempts.some((a) => a.source === "device");
    return { kind: "recovered", onServer };
  }
  const last = lastFailed(input.attempts);
  return { kind: "failed", reason: last ? failReasonOf(last) : "unknown" };
}

// ─── language ────────────────────────────────────────────────────────────────

/**
 * The `language` the parse model answered with ("sv"), from its raw JSON —
 * whole, or cut short (the row keeps ~4 KB). Undefined when there is none.
 */
export function languageFromParseRaw(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && typeof parsed.language === "string") {
      return normalizeLanguageCode(parsed.language);
    }
  } catch {
    // A truncated answer: look for the field by hand.
  }
  const match = /"language"\s*:\s*"([A-Za-z_-]{2,12})"/.exec(raw);
  return match ? normalizeLanguageCode(match[1]) : undefined;
}

/**
 * The language of what an attempt heard: what the server reported, else the
 * guard's detected language, else the parse model's answer.
 */
export function attemptLanguage(attempt: StoryAttempt): string | undefined {
  return (
    attempt.language ??
    attempt.failure?.detectedLanguage ??
    languageFromParseRaw(attempt.failure?.parseRaw)
  );
}

/** A language code as a name ("sv" → "Swedish"); the code itself when unknown. */
export function languageLabel(code: string | undefined): string | undefined {
  if (!code) return undefined;
  return languageName(code) ?? code;
}

/** Which voice reads a reminder's line in `lang` (mirrors actions.ts pickVoiceRoute). */
export function voiceRouteLabel(lang: string | undefined): string {
  if (needsMultilingualVoice(lang)) return "multilingual voice";
  if (normalizeLanguageCode(lang) === "ar") return "Arabic voice";
  return "English voice";
}

function lastCloud(attempts: StoryAttempt[]): StoryAttempt | undefined {
  for (let i = attempts.length - 1; i >= 0; i--) {
    if (attempts[i].source === "cloud") return attempts[i];
  }
  return undefined;
}

/** The take's spoken language for the subject: the reminder's, else the server's, else any attempt's. */
function takeLanguage(input: TakeStoryInput): string | undefined {
  const fromReminder = input.reminders.find((r) => r.lang)?.lang;
  if (fromReminder) return languageLabel(fromReminder);
  const cloud = lastCloud(input.attempts);
  const fromCloud = cloud ? attemptLanguage(cloud) : undefined;
  if (fromCloud) return languageLabel(fromCloud);
  for (let i = input.attempts.length - 1; i >= 0; i--) {
    const code = attemptLanguage(input.attempts[i]);
    if (code) return languageLabel(code);
  }
  return undefined;
}

// ─── translation (filled in by the sender, best-effort) ──────────────────────

/** Any letter outside ASCII: the text is probably not English. */
const NON_ASCII_LETTER = /(?![\u0000-\u007f])\p{L}/u;

/**
 * Should this attempt's words get an "In English:" line? Server text when its
 * language isn't English; the phone's only when it listened in another
 * language (rare). An unknown language counts when the text has non-ASCII
 * letters. Invented text ("Thank you for watching") never does.
 */
export function needsTranslation(attempt: StoryAttempt): boolean {
  const text = attempt.transcript?.trim();
  if (!text || attemptMadeUp(attempt)) return false;
  const code = normalizeLanguageCode(
    attempt.source === "device" ? attempt.deviceSttLocale : attemptLanguage(attempt)
  );
  if (code) return code !== "en";
  return NON_ASCII_LETTER.test(text);
}

/**
 * A model's translation made safe to show: trimmed, outer quotes dropped, cut
 * to 300 characters. Undefined when empty or the same as the original.
 */
export function cleanTranslation(raw: unknown, original: string): string | undefined {
  if (typeof raw !== "string") return undefined;
  const text = raw
    .trim()
    .replace(/^["“”'«»]+|["“”'«»]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!text) return undefined;
  if (normalizeForMatch(text) === normalizeForMatch(original)) return undefined;
  return clip(text, HEARD_EMAIL_MAX);
}

/**
 * The input with `translation` set on each attempt that needs one. `translate`
 * may fail or return nothing; that attempt just goes without. One call per
 * distinct text.
 */
export async function addTranslations(
  input: TakeStoryInput,
  translate: (text: string) => Promise<string | undefined>
): Promise<TakeStoryInput> {
  const wanted = new Map<string, Promise<string | undefined>>();
  for (const a of input.attempts) {
    if (!needsTranslation(a)) continue;
    const text = clip(a.transcript!.trim(), HEARD_EMAIL_MAX)!;
    if (!wanted.has(text)) {
      wanted.set(
        text,
        translate(text).then(
          (out) => cleanTranslation(out, text),
          () => undefined
        )
      );
    }
  }
  if (wanted.size === 0) return input;
  const attempts = await Promise.all(
    input.attempts.map(async (a) => {
      const text = a.transcript ? clip(a.transcript.trim(), HEARD_EMAIL_MAX) : undefined;
      const job = text ? wanted.get(text) : undefined;
      const translation = job ? await job : undefined;
      return translation ? { ...a, translation } : a;
    })
  );
  return { ...input, attempts };
}

// ─── time and place ──────────────────────────────────────────────────────────

/** "Europe/Stockholm" → "Stockholm", "America/Argentina/Buenos_Aires" → "Buenos Aires". */
export function cityFromTimezone(timezone: string | undefined): string {
  if (!timezone) return "an unknown place";
  const last = timezone.split("/").pop() ?? "";
  const city = last.replace(/_/g, " ").trim();
  return city || timezone;
}

type LocalParts = { ymd: string; hm: string; label: string };

/** Local date/time parts in `timezone`, or UTC when the zone is unusable. */
function localParts(timezone: string | undefined, at: number): LocalParts {
  const tryZone = (zone: string): LocalParts => {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: zone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(new Date(at));
    const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
    // Assembled from parts: engines disagree on the comma in "Fri, 9 Oct".
    const named = new Intl.DateTimeFormat("en-GB", {
      timeZone: zone,
      weekday: "short",
      day: "numeric",
      month: "short",
    }).formatToParts(new Date(at));
    const pick = (type: string) => named.find((p) => p.type === type)?.value ?? "";
    const label = `${pick("weekday")} ${pick("day")} ${pick("month")}`;
    return {
      ymd: `${get("year")}-${get("month")}-${get("day")}`,
      hm: `${get("hour")}:${get("minute")}`,
      label,
    };
  };
  if (timezone) {
    try {
      return tryZone(timezone);
    } catch {
      // fall through to UTC
    }
  }
  return tryZone("UTC");
}

function dayDiff(fromYmd: string, toYmd: string): number {
  const a = Date.parse(`${fromYmd}T00:00:00Z`);
  const b = Date.parse(`${toYmd}T00:00:00Z`);
  return Math.round((b - a) / 86_400_000);
}

/** "tomorrow 10:00", "today 17:00", "Fri 9 Oct 08:30", "every day at 08:00". */
export function describeWhen(
  reminder: StoryReminder,
  recordedAt: number,
  timezone: string | undefined
): string {
  const zone = reminder.tzid ?? timezone;
  if (typeof reminder.onceAt === "number") {
    const when = localParts(zone, reminder.onceAt);
    const now = localParts(zone, recordedAt);
    const diff = dayDiff(now.ymd, when.ymd);
    const day = diff === 0 ? "today" : diff === 1 ? "tomorrow" : when.label;
    return `${day} ${when.hm}`;
  }
  const time = reminder.time ?? "?";
  const freq = reminder.frequency ?? "";
  if (freq === "daily") return `every day at ${time}`;
  if (reminder.days && reminder.days.length > 0) return `every ${reminder.days.join(", ")} at ${time}`;
  if (reminder.date) return `${reminder.date} ${time}`;
  return freq ? `${freq} at ${time}` : time;
}

/**
 * "first seen today / this week / earlier", from the install's first hello,
 * in the user's own calendar. Undefined when nothing is known.
 */
export function firstSeenLabel(input: TakeStoryInput): string | undefined {
  if (input.deviceSeeded) return "first seen earlier";
  if (typeof input.firstSeenAt !== "number") return undefined;
  const seen = localParts(input.timezone, input.firstSeenAt);
  const now = localParts(input.timezone, input.recordedAt);
  const days = dayDiff(seen.ymd, now.ymd);
  if (days <= 0) return "first seen today";
  if (days < 7) return "first seen this week";
  return "first seen earlier";
}

// ─── wording ─────────────────────────────────────────────────────────────────

/** The outcome, as the subject and the headline say it. */
export function outcomeLabel(verdict: StoryVerdict): string {
  if (verdict.kind === "worked") return "✅ Created";
  if (verdict.kind === "recovered") return "⚠️ Recovered";
  switch (verdict.reason) {
    case "not_understood":
    case "unparseable":
      return "❌ Not understood";
    case "silent":
      return "❌ Silent";
    // Not failures the user saw: the card asked "When should I remind you?"
    // over the reminder it had heard (founder decision, 2026-10-06).
    case "no_time":
    case "past_time":
      return "⏳ Needs a time";
    case "unsupported_language":
      return "❌ Unsupported language";
    default:
      return "❌ Server error";
  }
}

/** One plain sentence (or two) on why an attempt failed. */
export function whyFailed(attempt: StoryAttempt): string {
  const f = attempt.failure ?? {};
  const reason = failReasonOf(attempt);
  switch (reason) {
    case "silent":
      return attemptMadeUp(attempt)
        ? "The recording was silent. The backup transcriber made this up from silence."
        : "The recording was silent.";
    case "not_understood":
      return "The parser decided this wasn't a reminder.";
    case "no_time":
      return "There was no time in it, so Remi asked when.";
    case "past_time":
      return f.pastTime
        ? `They said ${f.pastTime} but it had already passed.`
        : "The time they said had already passed.";
    case "unsupported_language": {
      const lang = languageLabel(attemptLanguage(attempt));
      return `Remi doesn't speak ${lang ?? "that language"} yet.`;
    }
    case "unparseable":
      return "The parser couldn't turn it into a reminder.";
    case "parse_failed":
      return "Server error: the parser's answer was unusable.";
    case "stt_failed":
      return "Server error: transcription returned nothing.";
    case "storage_missing":
      return "Server error: the recording was missing on the server.";
    case "internal":
      return "Server error, or the server timed out.";
    default:
      return `Server error${f.errorCode ? ` (${f.errorCode})` : ""}.`;
  }
}

function lowerFirst(text: string): string {
  return text.charAt(0).toLowerCase() + text.slice(1);
}

// ─── the story ───────────────────────────────────────────────────────────────

type Heard = { label: string; quote: string; translation?: string; note?: string };
type Created = { title: string; line: string };

type Story = {
  subject: string;
  outcome: string;
  saw: string;
  rows: Array<[string, string]>;
  heard: Heard[];
  why?: string;
  created: Created[];
  details: string[];
};

function quoted(text: string | undefined): string | undefined {
  const cut = clip(text?.trim(), HEARD_EMAIL_MAX);
  return cut === undefined ? undefined : `"${cut}"`;
}

function heardBlocks(input: TakeStoryInput): Heard[] {
  const seen = { device: 0, cloud: 0 };
  return input.attempts.map((a) => {
    const isDevice = a.source === "device";
    const n = ++seen[a.source];
    const base = isDevice ? "Phone heard" : "Server heard";
    const label = n > 1 ? `${base} (retry ${n - 1})` : base;

    let quote = quoted(a.transcript);
    if (!quote) {
      if (a.status === "running") quote = "(still working)";
      else if (isDevice) quote = "(nothing)";
      else if (a.failure?.errorCode === "stt_failed" || a.sttFallbackUsed) quote = "(nothing came back)";
      else quote = "(never got as far as transcribing)";
    }

    let note: string | undefined;
    if (!isDevice && a.sttFallbackUsed && a.transcript && !attemptMadeUp(a)) {
      note = "From the backup transcriber.";
    }
    const translation = a.translation ? `In English: "${a.translation}"` : undefined;
    return { label, quote, translation, note };
  });
}

function sawLine(input: TakeStoryInput): string {
  if (input.final === "committed") {
    const titles = input.reminders.map((r) => `"${clip(r.title, HEARD_EMAIL_MAX) ?? "(untitled)"}"`);
    if (titles.length === 0) return "They saw: no reminder (the take made none)";
    return `They saw: ${titles.length === 1 ? "their new reminder" : "their new reminders"} ${titles.join(", ")}`;
  }
  if (input.final === "cancelled") return "They saw: nothing, they cancelled the take";
  if (input.final === "running") return "They saw: a working card, Remi was still retrying";
  const f = lastFailed(input.attempts)?.failure ?? {};
  const copy =
    askCardPrompt(f.errorDetail, f.pastTime) ??
    phoneCopyForServerFailure({
      errorCode: f.errorCode,
      errorDetail: f.errorDetail,
      detectedLanguage: f.detectedLanguage,
      pastTime: f.pastTime,
    });
  const after = input.final === "discarded" ? ", then swiped it away" : "";
  return `They saw: "${copy}"${after}`;
}

function languageRow(input: TakeStoryInput): string {
  const cloud = lastCloud(input.attempts);
  const server = cloud ? languageLabel(attemptLanguage(cloud)) : undefined;
  const device = input.attempts.find((a) => a.source === "device");
  const phone = device ? languageLabel(device.deviceSttLocale) ?? "an unknown language" : undefined;
  const parts: string[] = [];
  if (server) parts.push(`${server} (server)`);
  else {
    const spoken = takeLanguage(input);
    if (spoken && spoken !== phone) parts.push(spoken);
  }
  if (phone) parts.push(`phone listened in ${phone}`);
  return parts.join(" · ") || "unknown";
}

function whenRow(input: TakeStoryInput): string {
  const time = localParts(input.timezone, input.recordedAt).hm;
  const where = input.timezone ? `${cityFromTimezone(input.timezone)} time` : "UTC";
  const seen = firstSeenLabel(input);
  return `${time} ${where}${seen ? ` · ${seen}` : ""}`;
}

function whySentence(verdict: StoryVerdict, input: TakeStoryInput): string | undefined {
  if (verdict.kind === "worked") return undefined;
  if (verdict.kind === "recovered") {
    const first = input.attempts.find((a) => a.status === "failed");
    const retry = verdict.onServer ? "The server retry made the reminder." : "The retry made the reminder.";
    return first ? `First try: ${lowerFirst(whyFailed(first))} ${retry}` : retry;
  }
  const last = lastFailed(input.attempts);
  let why = last ? whyFailed(last) : "Server error.";
  if (input.final === "cancelled") why += " Then they cancelled the take.";
  if (input.final === "running") why += " A retry was still running when this email went out.";
  return why;
}

/** Raw parse answers this short may go into the grey details. */
const DETAILS_PARSE_MAX = 120;

function detailLines(input: TakeStoryInput): string[] {
  const details: string[] = [];
  details.push(`Take ${input.creationId} · ${input.final}`);
  details.push(
    [
      `Device ${input.deviceTag}`,
      `build ${input.buildNumber ?? "?"}`,
      `iOS ${input.iosVersion ?? "?"}`,
      input.locale,
    ]
      .filter(Boolean)
      .join(" · ")
  );
  const codes = input.attempts.map((a, i) => {
    if (a.status === "committed") return `#${i + 1} committed`;
    if (a.status === "running") return `#${i + 1} running`;
    const f = a.failure ?? {};
    return `#${i + 1} ${f.errorCode ?? "unknown"}${f.errorDetail ? `/${f.errorDetail}` : ""}`;
  });
  if (codes.length > 0) details.push(`Codes ${codes.join(" · ")}`);
  input.attempts.forEach((a, i) => {
    if (a.source === "cloud" && (a.sttModel || a.sttFallbackUsed)) {
      const audio = typeof a.audioSeconds === "number" ? ` · audio ${a.audioSeconds.toFixed(1)} s` : "";
      details.push(`#${i + 1} transcriber ${a.sttModel ?? "?"}${a.sttFallbackUsed ? " (backup)" : ""}${audio}`);
    }
    const raw = a.failure?.parseRaw?.trim();
    if (raw && raw.length <= DETAILS_PARSE_MAX) details.push(`#${i + 1} parse ${raw}`);
  });
  input.attempts.forEach((a, i) => {
    const id = a.failure?.failedTakeId;
    if (!id) return;
    details.push(
      a.failure?.hasAudio
        ? `#${i + 1} audio: npx convex run failedTakes:audioUrl '{"id":"${id}"}'`
        : `#${i + 1} failedTakes ${id} (no audio: ${a.source === "device" ? "on-device take" : "none uploaded"})`
    );
  });
  return details;
}

function buildStory(input: TakeStoryInput): Story {
  const verdict = classifyStory(input);
  const outcome = outcomeLabel(verdict);
  const lang = takeLanguage(input);

  const subjectParts = [outcome, lang, input.timezone ? cityFromTimezone(input.timezone) : undefined].filter(
    (p): p is string => !!p
  );
  const subject = `Remi ${subjectParts.join(" · ")}${input.followUp ? " (follow-up)" : ""}`;

  const created = input.reminders.map((r) => ({
    title: `"${clip(r.title, HEARD_EMAIL_MAX) ?? "(untitled)"}"`,
    line: [
      describeWhen(r, input.recordedAt, input.timezone),
      languageLabel(r.lang) ?? "unknown language",
      voiceRouteLabel(r.lang),
    ].join(" · "),
  }));

  return {
    subject,
    outcome,
    saw: sawLine(input),
    rows: [
      ["Language", languageRow(input)],
      ["When", whenRow(input)],
    ],
    heard: heardBlocks(input),
    why: whySentence(verdict, input),
    created,
    details: detailLines(input),
  };
}

// ─── rendering ───────────────────────────────────────────────────────────────

function padLabel(label: string): string {
  return label.padEnd(13, " ");
}

function renderText(story: Story): string {
  const lines: string[] = [story.outcome, story.saw, ""];
  for (const [label, value] of story.rows) lines.push(`${padLabel(label)}${value}`);
  for (const h of story.heard) {
    lines.push("", h.label.toUpperCase(), h.quote);
    if (h.note) lines.push(h.note);
    if (h.translation) lines.push(h.translation);
  }
  if (story.created.length > 0) {
    lines.push("", "CREATED");
    for (const c of story.created) lines.push(c.title, c.line);
  }
  if (story.why) lines.push("", "WHY", story.why);
  lines.push("", TEXT_RULE, "Details", ...story.details);
  return lines.join("\n");
}

function renderHtml(story: Story): string {
  const out: string[] = [htmlHeadline(story.outcome), lead(story.saw), kvTable(story.rows)];
  for (const h of story.heard) {
    out.push(sectionHeading(h.label));
    out.push(quoteBlock(h.quote, [h.note, h.translation].filter((n): n is string => !!n)));
  }
  if (story.created.length > 0) {
    out.push(sectionHeading("Created"));
    for (const c of story.created) {
      out.push(paragraph(c.title, { bold: true }));
      out.push(paragraph(c.line, { muted: true }));
    }
  }
  if (story.why) {
    out.push(sectionHeading("Why"));
    out.push(paragraph(story.why));
  }
  out.push(detailsBlock(story.details));
  return emailShell(out.join("\n"));
}

// ─── public ──────────────────────────────────────────────────────────────────

export function buildTakeStorySubject(input: TakeStoryInput): string {
  return buildStory(input).subject;
}

export function buildTakeStoryEmail(input: TakeStoryInput): TakeEmail {
  const story = buildStory(input);
  return { subject: story.subject, body: renderText(story), html: renderHtml(story) };
}
