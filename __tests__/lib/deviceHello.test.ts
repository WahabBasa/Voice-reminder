/**
 * The launch check-in (lib/deviceHello.ts): what it sends, that it sends once
 * per launch, and that a failure never escapes — start-up must not care.
 */

jest.mock("../../lib/deviceId", () => ({ getDeviceId: jest.fn(async () => "dev_123") }));
jest.mock("../../lib/deviceStt", () => ({ getDeviceLocales: jest.fn(() => ["sv-SE", "en-US"]) }));
jest.mock("../../lib/feedbackContext", () => ({
  getRuntimeInfo: jest.fn(() => ({
    buildNumber: 8,
    updateId: "upd-1",
    iosVersion: "26.0",
    timezone: "Europe/Stockholm",
  })),
}));

import { api } from "../../convex/_generated/api";
import {
  __resetDeviceHelloForTests,
  buildHelloArgs,
  sendDeviceHello,
} from "../../lib/deviceHello";
import { __resetSpokenLanguageForTests, getSpokenLanguage } from "../../lib/spokenLanguage";

beforeEach(() => {
  __resetDeviceHelloForTests();
});

it("sends stringified runtime facts and the first preferred locale", async () => {
  expect(await buildHelloArgs()).toEqual({
    deviceId: "dev_123",
    buildNumber: "8",
    updateId: "upd-1",
    locale: "sv-SE",
    timezone: "Europe/Stockholm",
    iosVersion: "26.0",
  });
});

it("calls devices.hello once per launch", async () => {
  const mutation = jest.fn(async () => ({ result: "new" }));
  await sendDeviceHello({ mutation });
  await sendDeviceHello({ mutation });
  expect(mutation).toHaveBeenCalledTimes(1);
  expect(mutation).toHaveBeenCalledWith(api.devices.hello, expect.objectContaining({ deviceId: "dev_123" }));
});

it("keeps the spoken language hello answers with (OLD-140)", async () => {
  __resetSpokenLanguageForTests();
  await sendDeviceHello({ mutation: jest.fn(async () => ({ result: "updated", spokenLang: "sv" })) });
  expect(getSpokenLanguage()).toBe("sv");

  // An answer without one never clears it.
  __resetDeviceHelloForTests();
  await sendDeviceHello({ mutation: jest.fn(async () => ({ result: "throttled" })) });
  expect(getSpokenLanguage()).toBe("sv");
});

it("swallows a failed call", async () => {
  const log = jest.spyOn(console, "log").mockImplementation(() => {});
  const mutation = jest.fn(async () => {
    throw new Error("offline");
  });
  await expect(sendDeviceHello({ mutation })).resolves.toBeUndefined();
  log.mockRestore();
});
