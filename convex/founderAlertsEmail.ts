/**
 * Founder alerts (OLD-135), the pure half: email subjects/bodies, the device tag,
 * outcome classification and the hello throttle.
 *
 * No Convex, no network, no env — like `feedbackEmail.ts`, this file exists so
 * the shaping can be unit-tested without a backend. `convex/devices.ts` and
 * `convex/founderAlerts.ts` gather the facts and call in here.
 *
 * Privacy is enforced by the input types: no builder takes a deviceId, a
 * transcript, a reminder title or any other user content. The only per-device
 * handle an email ever carries is `deviceTag` — the first 8 hex of the SHA-256
 * of the deviceId, enough to correlate two emails, useless for addressing the
 * install.
 */

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

export type Email = { subject: string; body: string };

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

export type OutcomeEmailInput = {
  notify: Exclude<OutcomeNotify, null>;
  deviceTag: string;
  creationId: string;
  newDevice: boolean;
  firstTake: boolean;
  reminderCount?: number;
  errorCode?: string;
  errorDetail?: string;
  sttSource?: string;
  deviceSttLocale?: string;
  timezone?: string;
  buildNumber?: string;
  at: number;
};

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

export function buildOutcomeSubject(input: OutcomeEmailInput): string {
  if (input.notify === "first_take_worked") {
    return `Remi: first take worked — ${plural(input.reminderCount ?? 0, "reminder")} (new user)`;
  }
  const code = or(input.errorCode, "unknown");
  const detail = input.errorDetail ? `/${short(input.errorDetail, 40)}` : "";
  const who =
    input.newDevice && input.firstTake
      ? " (new user, first take)"
      : input.newDevice
        ? " (new user)"
        : "";
  return `Remi: take failed — ${code}${detail}${who}`;
}

export function buildOutcomeBody(input: OutcomeEmailInput): string {
  const lines: string[] = [];
  if (input.notify === "first_take_worked") {
    lines.push(`A new device's first take worked: ${plural(input.reminderCount ?? 0, "reminder")}.`);
  } else {
    lines.push(
      input.newDevice && input.firstTake
        ? "A take failed. It was this new device's FIRST take."
        : input.newDevice
          ? "A take failed on a device first seen this week."
          : "A take failed."
    );
    lines.push("");
    lines.push(`errorCode: ${or(input.errorCode, "unknown")}`);
    lines.push(`errorDetail: ${or(input.errorDetail, "none")}`);
  }
  lines.push("");
  lines.push(`device: ${input.deviceTag}`);
  lines.push(`take: ${input.creationId}`);
  lines.push(`new device: ${input.newDevice ? "yes" : "no"}`);
  lines.push(`first take: ${input.firstTake ? "yes" : "no"}`);
  lines.push(`stt: ${or(input.sttSource, "cloud")}`);
  lines.push(`device stt locale: ${or(input.deviceSttLocale, "n/a")}`);
  lines.push(`time zone: ${or(input.timezone, "unknown")}`);
  lines.push(`local time: ${localTimeIn(input.timezone, input.at)}`);
  lines.push(`build: ${or(input.buildNumber, "unknown")}`);
  return lines.join("\n");
}

export function buildOutcomeEmail(input: OutcomeEmailInput): Email {
  return { subject: buildOutcomeSubject(input), body: buildOutcomeBody(input) };
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
    return {
      subject: `Remi daily ${day}: quiet day`,
      body: `Quiet day: no new devices, no active devices, no takes (${window}).`,
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

  return { subject, body: lines.join("\n") };
}
