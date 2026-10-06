/**
 * Founder alerts (OLD-135), the pure half: email subjects/bodies, the device tag,
 * outcome classification and the hello throttle.
 *
 * No Convex, no network, no env — like `feedbackEmail.ts`, this file exists so
 * the shaping can be unit-tested without a backend. `convex/devices.ts` and
 * `convex/founderAlerts.ts` gather the facts and call in here.
 *
 * Privacy is enforced by the input types: no builder takes a deviceId. The only
 * per-device handle an email ever carries is `deviceTag` — the first 8 hex of
 * the SHA-256 of the deviceId, enough to correlate two emails, useless for
 * addressing the install.
 *
 * The per-take email (./takeStoryEmail.ts) deliberately carries user content
 * (OLD-136): what the phone and the server transcribed, each cut to 300
 * characters, and the reminder a retry created — because the founder cannot
 * fix a failure without knowing what was said.
 */

import { emailShell, headline, kvTable, lead, paragraph, sectionHeading } from "./emailHtml";

export const MINUTE_MS = 60_000;
export const HOUR_MS = 60 * MINUTE_MS;
export const DAY_MS = 24 * HOUR_MS;

/** `hello` writes at most once per device per hour (a public endpoint). */
export const HELLO_THROTTLE_MS = HOUR_MS;
/** A non-seeded device counts as "new" for this long after its first hello. */
export const NEW_DEVICE_WINDOW_MS = 7 * DAY_MS;

// ─── device tag ──────────────────────────────────────────────────────────────

type DigestOnly = Pick<SubtleCrypto, "digest">;

/**
 * First 8 hex chars of SHA-256(deviceId). Web Crypto, which the Convex default
 * runtime provides; `subtle` is injectable so a test runner without a global
 * `crypto.subtle` can pass Node's.
 */
export async function deviceTagFor(
  deviceId: string,
  subtle: DigestOnly = (globalThis as any).crypto.subtle
): Promise<string> {
  const digest = await subtle.digest("SHA-256", new TextEncoder().encode(deviceId));
  let hex = "";
  for (const byte of new Uint8Array(digest).slice(0, 4)) {
    hex += byte.toString(16).padStart(2, "0");
  }
  return hex;
}

// ─── hello: validation + throttle ────────────────────────────────────────────

/** Max length of a deviceId `hello` accepts. Real ids are 32 hex chars. */
export const MAX_DEVICE_ID_LENGTH = 128;
/** Every other client-supplied string is cut to this. */
export const MAX_FIELD_LENGTH = 64;

/**
 * A client string made safe to store: strings only, control characters
 * stripped, trimmed, capped. Anything empty or not a string becomes undefined.
 */
export function cleanField(value: unknown, max: number = MAX_FIELD_LENGTH): string | undefined {
  if (typeof value !== "string") return undefined;
  // eslint-disable-next-line no-control-regex
  const cleaned = value.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, max);
  return cleaned.length > 0 ? cleaned : undefined;
}

/** The deviceId `hello` will key a row on, or null when it is not acceptable. */
export function validDeviceId(value: string): string | null {
  const id = value.trim();
  if (id.length === 0 || id.length > MAX_DEVICE_ID_LENGTH) return null;
  if (!/^[A-Za-z0-9_-]+$/.test(id)) return null;
  return id;
}

/**
 * Whether a `hello` should write. A device seen under an hour ago is a no-op —
 * no read-modify-write, no email — so a hot loop on a public endpoint costs one
 * indexed read per call.
 */
export function helloShouldWrite(lastSeenAt: number | undefined, now: number): boolean {
  if (lastSeenAt === undefined) return true;
  return now - lastSeenAt >= HELLO_THROTTLE_MS;
}

// ─── outcome classification ──────────────────────────────────────────────────

export type OutcomeStatus = "committed" | "failed";

export type OutcomeNotify = "failed" | "first_take_worked" | null;

/**
 * What one take's outcome means for the founder.
 *
 * - `newDevice`: the device is not a pre-launch (seeded) install and first said
 *   hello within the last seven days.
 * - `firstTake`: no outcome was recorded for this device before this one.
 * - `notify`: every failure emails; a success emails only when it is a new
 *   device's first take.
 */
export function classifyOutcome(input: {
  status: OutcomeStatus;
  device: { seeded: boolean; firstSeenAt: number } | null;
  hasPriorOutcome: boolean;
  now: number;
}): { newDevice: boolean; firstTake: boolean; notify: OutcomeNotify } {
  const newDevice =
    input.device !== null &&
    !input.device.seeded &&
    input.now - input.device.firstSeenAt <= NEW_DEVICE_WINDOW_MS;
  const firstTake = !input.hasPriorOutcome;
  let notify: OutcomeNotify = null;
  if (input.status === "failed") notify = "failed";
  else if (newDevice && firstTake) notify = "first_take_worked";
  return { newDevice, firstTake, notify };
}

// ─── formatting helpers ──────────────────────────────────────────────────────

function or(value: string | undefined | null, fallback: string): string {
  return value === undefined || value === null || value === "" ? fallback : value;
}

function short(value: string, max: number): string {
  return value.length <= max ? value : `${value.slice(0, max - 1)}…`;
}

/** `2026-10-05 14:03 (Europe/Stockholm)`, or the UTC stamp when the zone is unusable. */
export function localTimeIn(timezone: string | undefined, at: number): string {
  const iso = new Date(at).toISOString();
  if (!timezone) return `${iso.slice(0, 16).replace("T", " ")} UTC`;
  try {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(new Date(at));
    const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
    return `${get("year")}-${get("month")}-${get("day")} ${get("hour")}:${get("minute")} (${timezone})`;
  } catch {
    return `${iso.slice(0, 16).replace("T", " ")} UTC`;
  }
}

export type Email = { subject: string; body: string; html?: string };

// ─── new device ──────────────────────────────────────────────────────────────

export type NewDeviceInput = {
  deviceTag: string;
  timezone?: string;
  locale?: string;
  buildNumber?: string;
  updateId?: string;
  iosVersion?: string;
  at: number;
};

export function buildNewDeviceEmail(input: NewDeviceInput): Email {
  const subject = `Remi: new device (${or(input.timezone, "unknown tz")}, ${or(input.locale, "unknown locale")})`;
  const body = [
    "A new device opened Remi.",
    "",
    `device: ${input.deviceTag}`,
    `time zone: ${or(input.timezone, "unknown")}`,
    `locale: ${or(input.locale, "unknown")}`,
    `local time: ${localTimeIn(input.timezone, input.at)}`,
    `build: ${or(input.buildNumber, "unknown")}`,
    `update: ${or(input.updateId, "unknown")}`,
    `iOS: ${or(input.iosVersion, "unknown")}`,
  ].join("\n");
  return { subject, body };
}

// ─── take outcome ────────────────────────────────────────────────────────────

/** Each transcript in a failure email is cut to this many characters. */
export const HEARD_EMAIL_MAX = 300;
/** A failedTakes row keeps at most this much of the parse model's raw answer. */
export const PARSE_RAW_MAX = 4096;
/** A failedTakes row keeps at most this much of either transcript. */
export const TRANSCRIPT_STORE_MAX = 4096;

/**
 * A string cut to `max` characters, with an ellipsis when it was cut. Unlike
 * `cleanField` it keeps newlines and inner whitespace: it is for content the
 * founder reads as-is (a transcript, a raw JSON answer), not for a label.
 */
export function clip(value: unknown, max: number): string | undefined {
  if (typeof value !== "string") return undefined;
  if (value.length === 0) return undefined;
  return value.length <= max ? value : `${value.slice(0, max - 1)}…`;
}

// The take email itself (one per take, the whole story) is built in
// ./takeStoryEmail.ts.

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

// ─── daily summary ───────────────────────────────────────────────────────────

export type DailySummaryInput = {
  since: number;
  until: number;
  newDevices: Array<{ deviceTag: string; timezone?: string; locale?: string; buildNumber?: string }>;
  activeDevices: number;
  committed: number;
  failed: number;
  failedByCode: Record<string, number>;
  newDeviceFailures: Array<{ deviceTag: string; errorCode?: string; errorDetail?: string; timezone?: string }>;
};

function isQuiet(input: DailySummaryInput): boolean {
  return (
    input.newDevices.length === 0 &&
    input.activeDevices === 0 &&
    input.committed === 0 &&
    input.failed === 0
  );
}

export function buildDailySummaryEmail(input: DailySummaryInput): Email {
  const day = new Date(input.since).toISOString().slice(0, 10);
  const window =
    `${new Date(input.since).toISOString().slice(0, 16).replace("T", " ")} → ` +
    `${new Date(input.until).toISOString().slice(0, 16).replace("T", " ")} UTC`;

  if (isQuiet(input)) {
    const body = `Quiet day: no new devices, no active devices, no takes (${window}).`;
    return {
      subject: `Remi daily ${day}: quiet day`,
      body,
      html: emailShell([headline("Quiet day"), lead(body)].join("\n")),
    };
  }

  const takes = input.committed + input.failed;
  const subject =
    `Remi daily ${day}: ${input.newDevices.length} new, ${input.activeDevices} active, ` +
    `${plural(takes, "take")} (${input.failed} failed)`;

  const lines: string[] = [`Window: ${window}`, ""];

  lines.push(`New devices: ${input.newDevices.length}`);
  for (const d of input.newDevices) {
    lines.push(
      `  ${d.deviceTag}  ${or(d.timezone, "unknown tz")}  ${or(d.locale, "unknown locale")}  build ${or(d.buildNumber, "?")}`
    );
  }
  lines.push("");
  lines.push(`Active devices: ${input.activeDevices}`);
  lines.push("");
  lines.push(`Takes: ${input.committed} committed, ${input.failed} failed`);
  const codes = Object.entries(input.failedByCode).sort((a, b) => b[1] - a[1]);
  for (const [code, count] of codes) {
    lines.push(`  ${code}: ${count}`);
  }
  lines.push("");
  lines.push(`Failed takes from new devices: ${input.newDeviceFailures.length}`);
  for (const f of input.newDeviceFailures) {
    const detail = f.errorDetail ? `/${short(f.errorDetail, 60)}` : "";
    lines.push(`  ${f.deviceTag}  ${or(f.errorCode, "unknown")}${detail}  ${or(f.timezone, "unknown tz")}`);
  }

  return { subject, body: lines.join("\n"), html: dailySummaryHtml(input, day, window, codes) };
}

/** The same summary, laid out like the take emails. Same content as the text. */
function dailySummaryHtml(
  input: DailySummaryInput,
  day: string,
  window: string,
  codes: Array<[string, number]>
): string {
  const out: string[] = [headline(`Remi daily ${day}`), lead(`Window: ${window}`)];
  out.push(
    kvTable([
      ["New devices", String(input.newDevices.length)],
      ["Active devices", String(input.activeDevices)],
      ["Takes", `${input.committed} committed, ${input.failed} failed`],
    ])
  );
  if (input.newDevices.length > 0) {
    out.push(sectionHeading("New devices"));
    for (const d of input.newDevices) {
      out.push(
        paragraph(
          `${d.deviceTag} · ${or(d.timezone, "unknown tz")} · ${or(d.locale, "unknown locale")} · build ${or(d.buildNumber, "?")}`
        )
      );
    }
  }
  if (codes.length > 0) {
    out.push(sectionHeading("Failed takes by code"));
    out.push(kvTable(codes.map(([code, count]): [string, string] => [code, String(count)]), { marginTop: 0 }));
  }
  out.push(sectionHeading(`Failed takes from new devices: ${input.newDeviceFailures.length}`));
  for (const f of input.newDeviceFailures) {
    const detail = f.errorDetail ? `/${short(f.errorDetail, 60)}` : "";
    out.push(paragraph(`${f.deviceTag} · ${or(f.errorCode, "unknown")}${detail} · ${or(f.timezone, "unknown tz")}`));
  }
  return emailShell(out.join("\n"));
}
