/**
 * The founder's take email, the pure half: one email per take that tells the
 * whole story (what the phone heard, what the server heard, what came of it,
 * and what the user saw), as HTML plus a plain-text fallback.
 *
 * convex/founderAlerts.ts `deliverTakeEmail` gathers the facts once the take
 * has settled (every failed attempt from `failedTakes`, the job, the reminders
 * a later attempt created) and calls in here. No Convex, no env, no network.
 *
 * Privacy, as in ./founderAlertsEmail.ts: the input carries `deviceTag`, never
 * the deviceId. Transcripts, titles and spoken lines are shown (the founder's
 * decision for failed takes, OLD-136), each cut to 300 characters, and every
 * value that reaches the HTML is escaped.
 */

import { languageName } from "../lib/languageNames";
import { HEARD_EMAIL_MAX, clip } from "./founderAlertsEmail";
import { needsMultilingualVoice, normalizeLanguageCode } from "./languages";
import { cardHeardLine, phoneCopyForServerFailure } from "./takeCardCopy";

// ─── input ───────────────────────────────────────────────────────────────────

/** Why one attempt failed, as its failedTakes row recorded it. */
export type StoryFailure = {
  errorCode?: string;
  errorDetail?: string;
  detectedLanguage?: string;
  /** The clock time a `past_time` take named, when the server sent one. */
  pastTime?: string;
  /** The parse model's raw answer (shown clipped in Details). */
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
 * The server got silence: the main transcriber gave nothing back and the
 * backup either gave nothing too or invented one of its stock phrases. Also any
 * attempt the server itself marked silent.
 */
export function attemptLooksSilent(attempt: StoryAttempt): boolean {
  const f = attempt.failure;
  if (f?.errorDetail === "silent" || f?.errorCode === "silent") return true;
  if (attempt.source !== "cloud" || !attempt.sttFallbackUsed) return false;
  return looksInvented(attempt.transcript);
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

// ─── small formatting helpers ────────────────────────────────────────────────

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** "Europe/Stockholm" → "Stockholm", "America/Argentina/Buenos_Aires" → "Buenos Aires". */
export function cityFromTimezone(timezone: string | undefined): string {
  if (!timezone) return "an unknown place";
  const last = timezone.split("/").pop() ?? "";
  const city = last.replace(/_/g, " ").trim();
  return city || timezone;
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

function quote(text: string | undefined): string | undefined {
  const cut = clip(text?.trim(), HEARD_EMAIL_MAX);
  return cut === undefined ? undefined : `"${cut}"`;
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

function ms(value: number | undefined): string | undefined {
  return typeof value === "number" ? `${Math.round(value)} ms` : undefined;
}

// ─── wording ─────────────────────────────────────────────────────────────────

function takeLanguage(input: TakeStoryInput): string | undefined {
  const fromReminder = input.reminders.find((r) => r.lang)?.lang;
  if (fromReminder) return languageLabel(fromReminder);
  for (let i = input.attempts.length - 1; i >= 0; i--) {
    const a = input.attempts[i];
    const code = a.language ?? a.failure?.detectedLanguage;
    if (code) return languageLabel(code);
  }
  return undefined;
}

function headline(verdict: StoryVerdict, input: TakeStoryInput, lang: string | undefined): string {
  if (verdict.kind === "worked") return input.firstTake ? "First take worked" : "Take worked";
  if (verdict.kind === "recovered") {
    return verdict.onServer ? "Recovered on server retry" : "Recovered on retry";
  }
  if (input.final === "cancelled") return "Cancelled after a failure";
  switch (verdict.reason) {
    case "not_understood":
      return "Couldn't understand";
    case "no_time":
      return "No time in it";
    case "unsupported_language":
      return lang ? `Doesn't speak ${lang} yet` : "Language not supported";
    case "past_time":
      return "Time already passed";
    case "silent":
      return "Silent recording";
    case "unparseable":
      return "Couldn't make a reminder";
    case "parse_failed":
      return "Parse failed";
    case "stt_failed":
      return "Transcription failed";
    case "storage_missing":
      return "Recording went missing";
    case "internal":
      return "Server error";
    default:
      return "Take failed";
  }
}

/** "couldn't understand it", for the summary sentence. */
function reasonPhrase(reason: FailReason, lang: string | undefined): string {
  switch (reason) {
    case "not_understood":
      return "couldn't understand it";
    case "no_time":
      return "heard no time in it";
    case "unsupported_language":
      return `doesn't speak ${lang ?? "that language"} yet`;
    case "past_time":
      return "heard a time that had already passed";
    case "silent":
      return "got a silent recording";
    case "unparseable":
      return "couldn't turn it into a reminder";
    case "parse_failed":
      return "got an unusable answer from the parse model";
    case "stt_failed":
      return "couldn't transcribe it";
    case "storage_missing":
      return "couldn't find the recording on the server";
    case "internal":
      return "hit a server error";
    default:
      return "failed";
  }
}

/** The "→ …" line for one failed attempt. */
function failureResult(attempt: StoryAttempt): string {
  const f = attempt.failure ?? {};
  const lang = languageLabel(f.detectedLanguage ?? attempt.language);
  switch (f.errorDetail) {
    case "not_understood":
      return "Rejected: not a reminder";
    case "no_time":
      return "Rejected: no time in it";
    case "unsupported_language":
      return `Rejected: language not supported${lang ? ` (${lang})` : ""}`;
    case "past_time":
      return `Rejected: the time had already passed${f.pastTime ? ` (${f.pastTime})` : ""}`;
  }
  switch (f.errorCode) {
    case "unparseable":
      return "Rejected: couldn't turn it into a reminder";
    case "parse_failed":
      return "Failed: the parse model's answer was unusable";
    case "stt_failed":
      return "Failed: transcription returned nothing";
    case "storage_missing":
      return "Failed: the recording was missing on the server";
    case "internal":
      return "Failed: server error or timed out";
    default:
      return `Failed${f.errorCode ? ` (${f.errorCode})` : ""}`;
  }
}

function reminderPhrase(reminder: StoryReminder, input: TakeStoryInput): string {
  const title = clip(reminder.title, HEARD_EMAIL_MAX) ?? "(untitled)";
  return `"${title}" for ${describeWhen(reminder, input.recordedAt, input.timezone)}`;
}

function remindersPhrase(input: TakeStoryInput): string {
  const r = input.reminders;
  if (r.length === 0) return "no reminders";
  if (r.length === 1) return reminderPhrase(r[0], input);
  return `${plural(r.length, "reminder")}: ${r.map((x) => reminderPhrase(x, input)).join("; ")}`;
}

// ─── the story, as lines with a little structure ─────────────────────────────

type AttemptBlock = {
  label: string;
  meta: string;
  heard: string;
  hint?: string;
  result: string;
  ok: boolean;
};

type Story = {
  subject: string;
  summary: string;
  attempts: AttemptBlock[];
  saw: { text: string; second?: string };
  reminders: Array<{ title: string; spokenLine?: string; fires: string; language: string; voice: string }>;
  details: string[];
};

function attemptBlock(input: TakeStoryInput, attempt: StoryAttempt, index: number): AttemptBlock {
  const n = index + 1;
  const next = input.attempts[index + 1];
  const isDevice = attempt.source === "device";

  const label = isDevice ? `${n}. 📱 Phone heard` : `${n}. ☁️ Server heard`;
  let meta: string;
  if (isDevice) {
    meta = `on-device, ${languageLabel(attempt.deviceSttLocale) ?? "unknown language"}`;
  } else {
    const lang = languageLabel(attempt.language ?? attempt.failure?.detectedLanguage);
    const model = attempt.sttModel
      ? `${attempt.sttFallbackUsed ? "fallback used: " : "model: "}${attempt.sttModel}`
      : attempt.sttFallbackUsed
        ? "fallback used"
        : "model unknown";
    meta = `language: ${lang ?? "unknown"}, ${model}`;
  }

  const quoted = quote(attempt.transcript);
  let heard: string;
  if (quoted) heard = quoted;
  else if (isDevice) heard = "(nothing)";
  else if (attempt.failure?.errorCode === "stt_failed") heard = "(no text came back)";
  else if (attempt.status === "running") heard = "(still working)";
  else heard = "(never got as far as transcribing)";

  let hint: string | undefined;
  if (!isDevice && attempt.sttFallbackUsed) {
    if (attemptLooksSilent(attempt) && quoted) {
      hint = "Server got silence; the backup invented this text.";
    } else if (!quoted) {
      hint = "Server got silence or nothing usable from both transcribers.";
    } else {
      hint = "The main transcriber returned nothing usable; this came from the backup.";
    }
  }

  let result: string;
  let ok = false;
  if (attempt.status === "committed") {
    result = `Created ${remindersPhrase(input)}`;
    ok = true;
  } else if (attempt.status === "running") {
    result = "Still running when this email went out";
  } else {
    result = failureResult(attempt);
    if (next) {
      result += next.source === "cloud" && isDevice ? " → retried on the server." : " → retried.";
    }
  }
  return { label, meta, heard, hint, result, ok };
}

function lastTranscript(attempts: StoryAttempt[]): string | undefined {
  for (let i = attempts.length - 1; i >= 0; i--) {
    if (attempts[i].transcript) return attempts[i].transcript;
  }
  return undefined;
}

function buildStory(input: TakeStoryInput): Story {
  const verdict = classifyStory(input);
  const lang = takeLanguage(input);
  const city = cityFromTimezone(input.timezone);

  // ── subject
  const head = headline(verdict, input, lang);
  const namesLanguage = verdict.kind === "failed" && verdict.reason === "unsupported_language" && !!lang;
  const place = `${city}${lang && !namesLanguage ? ` (${lang})` : ""}`;
  let who = "";
  if (input.newDevice && input.firstTake && verdict.kind !== "worked") who = ", new user's first try";
  else if (input.newDevice) who = ", new user";
  const emoji = verdict.kind === "worked" ? "✅" : verdict.kind === "recovered" ? "⚠️" : "❌";
  const subject = `Remi ${emoji} ${head} — ${place}${who}${input.followUp ? " (follow-up)" : ""}`;

  // ── what the phone showed
  const last = lastFailed(input.attempts);
  let saw: Story["saw"];
  if (input.final === "committed") {
    const titles = input.reminders.map((r) => `"${clip(r.title, HEARD_EMAIL_MAX) ?? "(untitled)"}"`);
    saw = {
      text:
        titles.length === 0
          ? "The take committed but made no reminders."
          : `${titles.length === 1 ? "Their new reminder" : "Their new reminders"}: ${titles.join(", ")}.`,
    };
  } else if (input.final === "cancelled") {
    saw = { text: "Nothing: they cancelled the take." };
  } else if (input.final === "running") {
    saw = { text: "A working card: Remi was still retrying." };
  } else {
    const f = last?.failure ?? {};
    const copy = phoneCopyForServerFailure({
      errorCode: f.errorCode,
      errorDetail: f.errorDetail,
      detectedLanguage: f.detectedLanguage,
      pastTime: f.pastTime,
    });
    saw = { text: copy, second: cardHeardLine(lastTranscript(input.attempts)) ?? undefined };
    if (input.final === "discarded") saw.second = `${saw.second ? `${saw.second} ` : ""}(then they swiped it away)`;
  }

  // ── summary sentence
  const time = localParts(input.timezone, input.recordedAt).hm;
  const user = input.newDevice ? "new user" : "user";
  let summary = `A ${user} in ${city}${lang ? ` (${lang})` : ""} recorded at ${time} their time${
    input.newDevice && input.firstTake ? ", their first take" : ""
  }.`;
  const failedCount = input.attempts.filter((a) => a.status === "failed").length;
  if (verdict.kind === "worked") {
    summary += ` It worked: they got ${remindersPhrase(input)}.`;
  } else if (verdict.kind === "recovered") {
    const first = input.attempts.find((a) => a.status === "failed");
    const why = first ? reasonPhrase(failReasonOf(first), lang) : "failed";
    summary +=
      ` The first try failed (Remi ${why}), Remi retried${verdict.onServer ? " on the server" : ""}` +
      ` and it worked: they got ${remindersPhrase(input)}.`;
  } else {
    const after = failedCount > 1 ? `After ${failedCount} attempts, Remi` : "Remi";
    const why = reasonPhrase(verdict.reason, lang);
    if (input.final === "cancelled") {
      summary += ` ${after} ${why}, and then they cancelled the take.`;
    } else if (input.final === "running") {
      summary += ` ${after} ${why} and was still retrying when this email went out.`;
    } else {
      summary += ` ${after} ${why}, and they saw: "${saw.text}".`;
      if (input.final === "discarded") summary += " Then they swiped the card away.";
    }
  }

  // ── reminders
  const reminders = input.reminders.map((r) => ({
    title: clip(r.title, HEARD_EMAIL_MAX) ?? "(untitled)",
    spokenLine: clip(r.spokenLine, HEARD_EMAIL_MAX),
    fires: describeWhen(r, input.recordedAt, input.timezone),
    language: languageLabel(r.lang) ?? "unknown",
    voice: voiceRouteLabel(r.lang),
  }));

  // ── details
  const details: string[] = [];
  const codes = input.attempts.map((a, i) => {
    if (a.status === "committed") return `#${i + 1} committed`;
    if (a.status === "running") return `#${i + 1} running`;
    const f = a.failure ?? {};
    return `#${i + 1} ${f.errorCode ?? "unknown"}${f.errorDetail ? `/${f.errorDetail}` : ""}`;
  });
  details.push(`Codes: ${codes.join(" · ") || "none"}`);
  details.push(`Take: ${input.creationId} (final: ${input.final})`);
  details.push(
    `Device: ${input.deviceTag} · build ${input.buildNumber ?? "?"} · update ${input.updateId ?? "?"} · iOS ${
      input.iosVersion ?? "?"
    } · locale ${input.locale ?? "?"} · tz ${input.timezone ?? "?"}`
  );
  details.push(`New device: ${input.newDevice ? "yes" : "no"} · first take: ${input.firstTake ? "yes" : "no"}`);
  input.attempts.forEach((a, i) => {
    const parts: string[] = [];
    if (a.source === "device") {
      parts.push(`on-device ${a.deviceSttEngine ?? "?"} ${a.deviceSttLocale ?? "?"}`);
      const d = ms(a.deviceSttMs);
      if (d) parts.push(`device stt ${d}`);
    } else {
      parts.push(`stt ${a.sttModel ?? "?"}${a.sttFallbackUsed ? " (fallback)" : ""}`);
      if (typeof a.audioSeconds === "number") parts.push(`audio ${a.audioSeconds.toFixed(1)} s`);
      const s = ms(a.sttMs);
      if (s) parts.push(`stt ${s}`);
    }
    const p = ms(a.parseMs);
    if (p) parts.push(`parse ${p}`);
    const t = ms(a.totalMs);
    if (t) parts.push(`total ${t}`);
    details.push(`#${i + 1} (gen ${a.generation}): ${parts.join(", ")}`);
    const raw = clip(a.failure?.parseRaw, HEARD_EMAIL_MAX);
    if (raw) details.push(`#${i + 1} parse answer: ${raw}`);
  });
  for (const [i, a] of input.attempts.entries()) {
    const id = a.failure?.failedTakeId;
    if (!id) continue;
    details.push(
      a.failure?.hasAudio
        ? `#${i + 1} audio: npx convex run failedTakes:audioUrl '{"id":"${id}"}'`
        : `#${i + 1} failedTakes id ${id} (no audio kept: ${
            a.source === "device" ? "on-device take" : "none was uploaded"
          })`
    );
  }

  return {
    subject,
    summary,
    attempts: input.attempts.map((a, i) => attemptBlock(input, a, i)),
    saw,
    reminders,
    details,
  };
}

// ─── rendering ───────────────────────────────────────────────────────────────

function renderText(story: Story): string {
  const lines: string[] = [story.summary, "", "TIMELINE"];
  for (const a of story.attempts) {
    lines.push(`${a.label} (${a.meta}): ${a.heard}`);
    if (a.hint) lines.push(`   ${a.hint}`);
    lines.push(`   → ${a.result}`);
  }
  lines.push("", "WHAT THEY SAW ON THE PHONE", story.saw.text);
  if (story.saw.second) lines.push(story.saw.second);
  if (story.reminders.length > 0) {
    lines.push("", story.reminders.length === 1 ? "REMINDER CREATED" : "REMINDERS CREATED");
    for (const r of story.reminders) {
      lines.push(`Title: ${r.title}`);
      if (r.spokenLine) lines.push(`Spoken line: "${r.spokenLine}"`);
      lines.push(`Fires: ${r.fires}`);
      lines.push(`Language: ${r.language} · voice: ${r.voice}`);
    }
  }
  lines.push("", "DETAILS", ...story.details);
  return lines.join("\n");
}

const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const H = `font-size:12px;font-weight:600;letter-spacing:.05em;text-transform:uppercase;color:#6b6b6b;margin:22px 0 8px`;

function renderHtml(story: Story): string {
  const e = escapeHtml;
  const out: string[] = [];
  out.push(
    `<div style="font-family:${FONT};font-size:15px;line-height:1.5;color:#1a1a1a;max-width:600px;margin:0 auto;padding:4px">`
  );
  out.push(`<p style="margin:0 0 4px;font-size:16px">${e(story.summary)}</p>`);

  out.push(`<div style="${H}">Timeline</div>`);
  for (const a of story.attempts) {
    const color = a.ok ? "#1b7f3b" : "#b3261e";
    out.push(`<div style="border-left:3px solid ${a.ok ? "#9fd8b0" : "#f0b4ae"};padding:2px 0 2px 12px;margin:0 0 14px">`);
    out.push(
      `<div style="font-weight:600">${e(a.label)} <span style="font-weight:400;color:#6b6b6b">(${e(a.meta)})</span></div>`
    );
    out.push(`<div dir="auto" style="margin:4px 0;font-size:16px">${e(a.heard)}</div>`);
    if (a.hint) {
      out.push(`<div style="margin:2px 0;font-size:13px;color:#8a5a00">${e(a.hint)}</div>`);
    }
    out.push(`<div style="color:${color}">→ ${e(a.result)}</div>`);
    out.push(`</div>`);
  }

  out.push(`<div style="${H}">What they saw on the phone</div>`);
  out.push(`<div style="background:#f2f2f5;border-radius:12px;padding:10px 14px">`);
  out.push(`<div dir="auto">${e(story.saw.text)}</div>`);
  if (story.saw.second) {
    out.push(`<div dir="auto" style="color:#6b6b6b;font-size:13px;margin-top:2px">${e(story.saw.second)}</div>`);
  }
  out.push(`</div>`);

  if (story.reminders.length > 0) {
    out.push(`<div style="${H}">${story.reminders.length === 1 ? "Reminder created" : "Reminders created"}</div>`);
    for (const r of story.reminders) {
      out.push(`<div style="margin:0 0 12px">`);
      out.push(`<div dir="auto" style="font-weight:600;font-size:16px">${e(r.title)}</div>`);
      if (r.spokenLine) out.push(`<div dir="auto">Spoken line: “${e(r.spokenLine)}”</div>`);
      out.push(`<div>Fires: ${e(r.fires)}</div>`);
      out.push(`<div style="color:#6b6b6b">Language: ${e(r.language)} · voice: ${e(r.voice)}</div>`);
      out.push(`</div>`);
    }
  }

  out.push(
    `<div style="margin-top:24px;padding-top:10px;border-top:1px solid #e3e3e3;color:#8a8a8a;font-size:12px;line-height:1.55;word-break:break-word">`
  );
  out.push(`<div style="font-weight:600;margin-bottom:4px">Details</div>`);
  for (const line of story.details) {
    const html = e(line).replace(
      /(npx convex run failedTakes:audioUrl .*)$/,
      '<code style="font-size:11px;background:#f2f2f5;padding:1px 4px;border-radius:4px">$1</code>'
    );
    out.push(`<div>${html}</div>`);
  }
  out.push(`</div>`);
  out.push(`</div>`);
  return out.join("\n");
}

// ─── public ──────────────────────────────────────────────────────────────────

export function buildTakeStorySubject(input: TakeStoryInput): string {
  return buildStory(input).subject;
}

export function buildTakeStoryEmail(input: TakeStoryInput): TakeEmail {
  const story = buildStory(input);
  return { subject: story.subject, body: renderText(story), html: renderHtml(story) };
}
