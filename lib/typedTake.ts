import { extractTakeItems, type TakeItem } from "./voiceTake";

/**
 * The typed composer's half of a take (OLD-101).
 *
 * A typed sentence is a voice take that skipped the microphone: it runs the
 * same server parse and comes back in the same result shape, so everything
 * after this point — allowance, intake, hydration, scheduling — is the loop in
 * lib/voiceTake.ts, untouched. What lives here is only what the typed path adds:
 * cleaning the text the user wrote, and the device-clock context the parse needs
 * to read "in ten minutes" the way the user meant it.
 *
 * Dependency-free on purpose (the action arrives injected), so the composer's
 * path is testable without Convex or a device.
 */

/** Longest sentence the composer sends. A reminder is one sentence, not an essay. */
export const MAX_COMPOSER_CHARS = 300;

/** Shortest sentence worth sending to the parse. */
const MIN_COMPOSER_CHARS = 2;

/** What actually goes over the wire: whitespace collapsed, trimmed, capped. */
export function normalizeComposerText(raw: string): string {
  return raw.replace(/\s+/g, " ").trim().slice(0, MAX_COMPOSER_CHARS);
}

/** Whether the send affordance is live. */
export function canSubmitComposerText(raw: string): boolean {
  return normalizeComposerText(raw).length >= MIN_COMPOSER_CHARS;
}

/** The user's own clock, as the parse prompt wants it. */
export type DeviceClock = {
  deviceLocalDate: string;
  deviceLocalTime: string;
  deviceTimezone: string;
};

function pad(n: number): string {
  return n.toString().padStart(2, "0");
}

/**
 * Local date/time strings for the parse. LOCAL, never UTC — the whole point is
 * that "tomorrow at 8" resolves against the device's own calendar day.
 */
export function deviceClock(now: Date, timezone: string): DeviceClock {
  return {
    deviceLocalDate: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`,
    deviceLocalTime: `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`,
    deviceTimezone: timezone,
  };
}

/** Exactly the args `actions.processTypedReminder` takes. */
export type TypedTakeArgs = DeviceClock & {
  deviceId: string;
  text: string;
  traceId?: string;
};

export type TypedTakeParams = {
  text: string;
  deviceId: string;
  now: Date;
  timezone: string;
  traceId?: string;
};

export function buildTypedTakeArgs(params: TypedTakeParams): TypedTakeArgs {
  return {
    deviceId: params.deviceId,
    text: normalizeComposerText(params.text),
    traceId: params.traceId,
    ...deviceClock(params.now, params.timezone),
  };
}

export type TypedTakeOutcome = {
  /** The action result, in the same shape a voice take returns. */
  result: any;
  /** The reminders it holds — one typed sentence can still ask for several. */
  items: TakeItem[];
};

/**
 * Send one typed sentence to the parse and hand back its take.
 *
 * Nothing is swallowed: an action that throws throws through, because the
 * composer keeps the user's text on screen when the round trip fails.
 */
export async function submitTypedTake(
  params: TypedTakeParams & { runAction: (args: TypedTakeArgs) => Promise<any> }
): Promise<TypedTakeOutcome> {
  if (!canSubmitComposerText(params.text)) {
    throw new Error("Composer text is empty");
  }

  const result = await params.runAction(buildTypedTakeArgs(params));
  return { result, items: extractTakeItems(result) };
}
