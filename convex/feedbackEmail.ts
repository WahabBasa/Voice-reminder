/**
 * The founder-notification email for one feedback report, as pure functions.
 *
 * No Convex, no network, no env — the only reason this is its own file is so the
 * subject/body shaping can be unit-tested without a backend. `convex/feedback.ts`
 * `notify` reads the row, calls `buildFeedbackEmail`, and POSTs the result to
 * Resend. The deviceId is deliberately NOT a parameter here: it must never reach
 * the email, and the way to guarantee that is to give this builder no way to see
 * it.
 */

/**
 * The only `context` keys that are ever copied into the email body. Anything the
 * client attaches beyond these — the deviceId included — is dropped. Ordered as
 * they should appear in the body.
 */
export const FEEDBACK_CONTEXT_KEYS = [
  "kind",
  "reminderTitle",
  "reminderDescription",
  "schedule",
  "errorKind",
  "serverErrorCode",
  "creationId",
  "sttSource",
  "buildNumber",
  "updateId",
  "iosVersion",
  "timezone",
  "localTime",
] as const;

/** `Remi feedback #<last 6 of id>: <first 60 chars of text>`. */
export function buildFeedbackSubject(id: string, text: string): string {
  return `Remi feedback #${id.slice(-6)}: ${text.slice(0, 60)}`;
}

/**
 * The plain-text body: the full report, a blank line, the whitelisted context
 * block (only the keys present, `schedule` stringified), then the founder's
 * dashboard command. Never contains the deviceId — the input carries none.
 */
export function buildFeedbackBody(id: string, text: string, context?: unknown): string {
  const lines: string[] = [];
  if (context && typeof context === "object") {
    const ctx = context as Record<string, unknown>;
    for (const key of FEEDBACK_CONTEXT_KEYS) {
      const value = ctx[key];
      if (value === undefined || value === null) continue;
      lines.push(key === "schedule" ? `schedule: ${JSON.stringify(value)}` : `${key}: ${String(value)}`);
    }
  }

  const dashboardLine =
    `Set status: Dashboard → feedback:setStatus ` +
    `{"id":"${id}","status":"looking"|"fixed","note":"..."}`;

  let body = `${text}\n\n`;
  if (lines.length > 0) body += `${lines.join("\n")}\n\n`;
  body += dashboardLine;
  return body;
}

/** Subject + body together, the shape `notify` POSTs to Resend. */
export function buildFeedbackEmail(input: {
  id: string;
  text: string;
  context?: unknown;
}): { subject: string; body: string } {
  return {
    subject: buildFeedbackSubject(input.id, input.text),
    body: buildFeedbackBody(input.id, input.text, input.context),
  };
}
