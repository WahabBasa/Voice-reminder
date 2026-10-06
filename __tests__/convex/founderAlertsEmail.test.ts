/**
 * The founder-alert pure functions (convex/founderAlertsEmail.ts): subjects and
 * bodies, the device tag, outcome classification and the hello throttle. Plain
 * jest — no backend. What matters most: no email ever carries a deviceId.
 */

import { webcrypto } from "crypto";
import {
  DAY_MS,
  HOUR_MS,
  HEARD_EMAIL_MAX,
  buildDailySummaryEmail,
  buildNewDeviceEmail,
  classifyOutcome,
  cleanField,
  clip,
  deviceTagFor,
  helloShouldWrite,
  localTimeIn,
  validDeviceId,
} from "../../convex/founderAlertsEmail";

const subtle = webcrypto.subtle as unknown as SubtleCrypto;
const DEVICE_ID = "0123456789abcdef0123456789abcdef";
// 2026-10-05 12:00:00 UTC
const AT = Date.UTC(2026, 9, 5, 12, 0, 0);

describe("deviceTagFor", () => {
  it("is the first 8 hex of SHA-256", async () => {
    // SHA-256("abc") = ba7816bf8f01cfea414140de5dae2223...
    expect(await deviceTagFor("abc", subtle)).toBe("ba7816bf");
  });

  it("is stable, 8 lowercase hex, and does not contain the id", async () => {
    const a = await deviceTagFor(DEVICE_ID, subtle);
    const b = await deviceTagFor(DEVICE_ID, subtle);
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{8}$/);
    expect(DEVICE_ID.includes(a)).toBe(false);
    expect(await deviceTagFor("another", subtle)).not.toBe(a);
  });
});

describe("hello validation + throttle", () => {
  it("writes when never seen, or seen an hour or more ago", () => {
    expect(helloShouldWrite(undefined, AT)).toBe(true);
    expect(helloShouldWrite(0, AT)).toBe(true);
    expect(helloShouldWrite(AT - HOUR_MS, AT)).toBe(true);
  });

  it("does not write when seen under an hour ago", () => {
    expect(helloShouldWrite(AT - HOUR_MS + 1, AT)).toBe(false);
    expect(helloShouldWrite(AT, AT)).toBe(false);
  });

  it("accepts real ids and rejects junk", () => {
    expect(validDeviceId(` ${DEVICE_ID} `)).toBe(DEVICE_ID);
    expect(validDeviceId("")).toBeNull();
    expect(validDeviceId("a".repeat(129))).toBeNull();
    expect(validDeviceId("has space")).toBeNull();
    expect(validDeviceId("semi;colon")).toBeNull();
  });

  it("cleans strings: strips control chars, trims, caps, drops empties and non-strings", () => {
    expect(cleanField("  sv-SE\n")).toBe("sv-SE");
    expect(cleanField("x".repeat(100))).toHaveLength(64);
    expect(cleanField("x".repeat(100), 10)).toHaveLength(10);
    expect(cleanField("   ")).toBeUndefined();
    expect(cleanField(42)).toBeUndefined();
    expect(cleanField(undefined)).toBeUndefined();
  });
});

describe("classifyOutcome", () => {
  const fresh = { seeded: false, firstSeenAt: AT - DAY_MS };

  it("a new device's first committed take is announced as worked", () => {
    expect(
      classifyOutcome({ status: "committed", device: fresh, hasPriorOutcome: false, now: AT })
    ).toEqual({ newDevice: true, firstTake: true, notify: "first_take_worked" });
  });

  it("a later committed take is silent", () => {
    expect(
      classifyOutcome({ status: "committed", device: fresh, hasPriorOutcome: true, now: AT })
    ).toEqual({ newDevice: true, firstTake: false, notify: null });
  });

  it("a seeded device is never new, and its successes are silent", () => {
    expect(
      classifyOutcome({
        status: "committed",
        device: { seeded: true, firstSeenAt: AT },
        hasPriorOutcome: false,
        now: AT,
      })
    ).toEqual({ newDevice: false, firstTake: true, notify: null });
  });

  it("a device first seen more than 7 days ago is not new", () => {
    expect(
      classifyOutcome({
        status: "committed",
        device: { seeded: false, firstSeenAt: AT - 8 * DAY_MS },
        hasPriorOutcome: false,
        now: AT,
      }).newDevice
    ).toBe(false);
  });

  it("every failure notifies, whoever it is", () => {
    expect(
      classifyOutcome({ status: "failed", device: null, hasPriorOutcome: true, now: AT })
    ).toEqual({ newDevice: false, firstTake: false, notify: "failed" });
    expect(
      classifyOutcome({ status: "failed", device: fresh, hasPriorOutcome: false, now: AT })
    ).toEqual({ newDevice: true, firstTake: true, notify: "failed" });
  });
});

describe("buildNewDeviceEmail", () => {
  const email = buildNewDeviceEmail({
    deviceTag: "ba7816bf",
    timezone: "Europe/Stockholm",
    locale: "sv-SE",
    buildNumber: "8",
    updateId: "upd-1",
    iosVersion: "26.0",
    at: AT,
  });

  it("has a scannable subject", () => {
    expect(email.subject).toBe("Remi: new device (Europe/Stockholm, sv-SE)");
  });

  it("carries the facts, with the device's local time", () => {
    expect(email.body).toContain("time zone: Europe/Stockholm");
    expect(email.body).toContain("locale: sv-SE");
    expect(email.body).toContain("build: 8");
    expect(email.body).toContain("iOS: 26.0");
    // 12:00 UTC is 14:00 in Stockholm in October (CEST).
    expect(email.body).toContain("local time: 2026-10-05 14:00 (Europe/Stockholm)");
    expect(email.body).toContain("device: ba7816bf");
  });

  it("falls back cleanly when the client sent nothing", () => {
    const bare = buildNewDeviceEmail({ deviceTag: "ba7816bf", at: AT });
    expect(bare.subject).toBe("Remi: new device (unknown tz, unknown locale)");
    expect(bare.body).toContain("local time: 2026-10-05 12:00 UTC");
  });
});

describe("localTimeIn", () => {
  it("falls back to UTC for an unusable zone", () => {
    expect(localTimeIn("Not/AZone", AT)).toBe("2026-10-05 12:00 UTC");
  });
});

describe("clip (OLD-136)", () => {
  it("keeps short strings, cuts long ones with an ellipsis, drops empties", () => {
    expect(clip("hej", 10)).toBe("hej");
    expect(clip("abcdef", 4)).toBe("abc…");
    expect(clip("line one\nline two", 100)).toBe("line one\nline two");
    expect(clip("", 10)).toBeUndefined();
    expect(clip(42, 10)).toBeUndefined();
    expect(HEARD_EMAIL_MAX).toBe(300);
  });
});

describe("buildDailySummaryEmail", () => {
  const base = {
    since: AT - DAY_MS,
    until: AT,
    newDevices: [],
    activeDevices: 0,
    committed: 0,
    failed: 0,
    failedByCode: {},
    newDeviceFailures: [],
  };

  it("sends a one-line quiet-day email when nothing happened", () => {
    const email = buildDailySummaryEmail(base);
    expect(email.subject).toBe("Remi daily 2026-10-04: quiet day");
    expect(email.body.split("\n")).toHaveLength(1);
    expect(email.body).toMatch(/^Quiet day/);
  });

  it("summarises devices and takes by error code", () => {
    const email = buildDailySummaryEmail({
      ...base,
      newDevices: [{ deviceTag: "ba7816bf", timezone: "Europe/Stockholm", locale: "sv-SE", buildNumber: "8" }],
      activeDevices: 3,
      committed: 5,
      failed: 3,
      failedByCode: { stt_failed: 1, unparseable: 2 },
      newDeviceFailures: [{ deviceTag: "ba7816bf", errorCode: "unparseable", errorDetail: "not_understood", timezone: "Europe/Stockholm" }],
    });
    expect(email.subject).toBe("Remi daily 2026-10-04: 1 new, 3 active, 8 takes (3 failed)");
    expect(email.body).toContain("New devices: 1");
    expect(email.body).toContain("ba7816bf  Europe/Stockholm  sv-SE  build 8");
    expect(email.body).toContain("Active devices: 3");
    expect(email.body).toContain("Takes: 5 committed, 3 failed");
    // Most frequent code first.
    expect(email.body.indexOf("unparseable: 2")).toBeLessThan(email.body.indexOf("stt_failed: 1"));
    expect(email.body).toContain("Failed takes from new devices: 1");
    expect(email.body).toContain("unparseable/not_understood");
  });
});

describe("privacy: no builder can leak a deviceId", () => {
  it("never prints the deviceId even when one is smuggled in as an extra field", () => {
    const smuggled = { deviceId: DEVICE_ID, transcript: "secret words", title: "Water" };
    const emails = [
      buildNewDeviceEmail({ deviceTag: "ba7816bf", at: AT, ...(smuggled as any) }),
      buildDailySummaryEmail({
        since: AT - DAY_MS,
        until: AT,
        newDevices: [{ deviceTag: "ba7816bf", ...(smuggled as any) }],
        activeDevices: 1,
        committed: 1,
        failed: 0,
        failedByCode: {},
        newDeviceFailures: [],
      }),
    ];
    for (const { subject, body } of emails) {
      const text = `${subject}\n${body}`;
      expect(text).not.toContain(DEVICE_ID);
      expect(text).not.toContain("secret words");
      expect(text).not.toContain("Water");
    }
  });
});
