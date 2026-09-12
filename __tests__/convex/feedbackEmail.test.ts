/**
 * The founder-notification email builder (convex/feedbackEmail.ts) is a pure
 * function, so it is tested with plain jest — no backend, no mocks. What matters:
 * the subject truncates, the body copies ONLY the whitelisted context keys, the
 * deviceId never appears, and the founder's dashboard command is present.
 */

import {
  buildFeedbackEmail,
  buildFeedbackSubject,
  buildFeedbackBody,
} from "../../convex/feedbackEmail";

describe("buildFeedbackSubject", () => {
  it("uses the last 6 of the id and the first 60 chars of the text", () => {
    const subject = buildFeedbackSubject("k1234567890abcdef123456", "a".repeat(100));
    expect(subject).toBe(`Remi feedback #123456: ${"a".repeat(60)}`);
  });

  it("does not truncate a short text", () => {
    expect(buildFeedbackSubject("abcdef", "ring failed")).toBe(
      "Remi feedback #abcdef: ring failed"
    );
  });
});

describe("buildFeedbackBody", () => {
  const context = {
    kind: "reminder",
    reminderTitle: "Water",
    reminderDescription: "Drink water",
    schedule: { type: "grid", days: { kind: "everyday" } },
    errorKind: "no_ring",
    serverErrorCode: "stt_failed",
    creationId: "take_9",
    sttSource: "device",
    buildNumber: 42,
    updateId: "upd_1",
    iosVersion: "18.2",
    timezone: "Asia/Dubai",
    localTime: "10:00",
    // Not whitelisted — must be dropped.
    deviceId: "SECRET_DEVICE_ID",
    secretField: "nope",
  };

  it("starts with the full report text", () => {
    const body = buildFeedbackBody("id_abcdef", "the reminder didn't ring", context);
    expect(body.startsWith("the reminder didn't ring")).toBe(true);
  });

  it("copies every whitelisted key, stringifying the schedule", () => {
    const body = buildFeedbackBody("id_abcdef", "report", context);
    expect(body).toContain("kind: reminder");
    expect(body).toContain("reminderTitle: Water");
    expect(body).toContain("reminderDescription: Drink water");
    expect(body).toContain(`schedule: ${JSON.stringify(context.schedule)}`);
    expect(body).toContain("errorKind: no_ring");
    expect(body).toContain("serverErrorCode: stt_failed");
    expect(body).toContain("creationId: take_9");
    expect(body).toContain("sttSource: device");
    expect(body).toContain("buildNumber: 42");
    expect(body).toContain("updateId: upd_1");
    expect(body).toContain("iosVersion: 18.2");
    expect(body).toContain("timezone: Asia/Dubai");
    expect(body).toContain("localTime: 10:00");
  });

  it("drops non-whitelisted keys and never leaks the deviceId value", () => {
    const body = buildFeedbackBody("id_abcdef", "report", context);
    expect(body).not.toContain("secretField");
    expect(body).not.toContain("nope");
    expect(body).not.toContain("deviceId");
    expect(body).not.toContain("SECRET_DEVICE_ID");
  });

  it("ends with the founder's dashboard command carrying the id", () => {
    const body = buildFeedbackBody("id_abcdef", "report", context);
    expect(body).toContain(
      'Set status: Dashboard → feedback:setStatus {"id":"id_abcdef","status":"looking"|"fixed","note":"..."}'
    );
  });

  it("omits the context block entirely when there is no context", () => {
    const body = buildFeedbackBody("id_abcdef", "just text");
    expect(body).toContain("just text");
    expect(body).toContain('feedback:setStatus {"id":"id_abcdef"');
    // No stray key lines between the text and the dashboard command.
    expect(body).toBe(
      'just text\n\nSet status: Dashboard → feedback:setStatus {"id":"id_abcdef","status":"looking"|"fixed","note":"..."}'
    );
  });

  it("skips keys whose value is null or undefined", () => {
    const body = buildFeedbackBody("id_abcdef", "report", {
      kind: "reminder",
      reminderTitle: null,
      creationId: undefined,
    });
    expect(body).toContain("kind: reminder");
    expect(body).not.toContain("reminderTitle");
    expect(body).not.toContain("creationId");
  });
});

describe("buildFeedbackEmail", () => {
  it("returns the subject and body together", () => {
    const { subject, body } = buildFeedbackEmail({
      id: "id_abcdef",
      text: "ring failed",
      context: { kind: "reminder" },
    });
    expect(subject).toBe("Remi feedback #abcdef: ring failed");
    expect(body).toContain("ring failed");
    expect(body).toContain("kind: reminder");
  });
});
