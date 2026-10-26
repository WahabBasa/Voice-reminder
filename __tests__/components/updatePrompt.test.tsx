/**
 * The update prompt's wiring that the pure suite cannot see: which installed
 * version it reports, and the server function it calls by name (so it works in
 * app versions whose generated api predates it).
 */
let mockRuntimeVersion: unknown = "1.0.1";
let mockConfigVersion: unknown = "9.9.9";

jest.mock("expo-updates", () => ({
  get runtimeVersion() {
    return mockRuntimeVersion;
  },
}));
jest.mock("expo-constants", () => ({
  __esModule: true,
  default: {
    get expoConfig() {
      return { version: mockConfigVersion };
    },
  },
}));
jest.mock("convex/react", () => ({ useConvex: () => ({ query: jest.fn() }) }));
jest.mock("expo-router", () => ({ usePathname: () => "/" }));
jest.mock("../../lib/deviceId", () => ({ getDeviceId: async () => "device-1" }));
jest.mock("../../lib/appUpdateLocale", () => ({ getUpdatePromptLanguages: () => ["en"] }));

import { getFunctionName } from "convex/server";
import { CHECK, installedAppVersion } from "../../components/UpdatePrompt";

test("calls appUpdate:check by name", () => {
  expect(getFunctionName(CHECK)).toBe("appUpdate:check");
});

test("the installed version is the runtime version (native app version), config as fallback", () => {
  mockRuntimeVersion = "1.0.1";
  expect(installedAppVersion()).toBe("1.0.1");
  mockRuntimeVersion = undefined;
  mockConfigVersion = "1.0.2";
  expect(installedAppVersion()).toBe("1.0.2");
  mockConfigVersion = undefined;
  expect(installedAppVersion()).toBeNull();
});
