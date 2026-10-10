/**
 * The wheel's one call (lib/pickLanguage.ts): apply the pick, tell the server,
 * drop a forced on-device voice language, and come back to Settings after the
 * remount a Settings pick causes.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import { api } from "../../convex/_generated/api";

const mockMutation = jest.fn(async (..._args: unknown[]) => ({ ok: true }));
jest.mock("../../lib/convexClient", () => ({ convex: { mutation: (...args: unknown[]) => mockMutation(...args) } }));
jest.mock("../../lib/deviceId", () => ({ getDeviceId: async () => "dev_1" }));
jest.mock("expo-localization", () => ({ getLocales: () => [{ languageTag: "es-MX" }] }));

import { currentLanguageChoice, pickLanguage } from "../../lib/pickLanguage";
import {
  __resetAppLanguageForTests,
  consumeReturnToSettings,
  getChosenLanguage,
} from "../../lib/appLanguage";
import { __resetUiLocaleForTests, getUiLocale } from "../../lib/i18n";
import { __resetSpokenLanguageForTests, getSpokenLanguage } from "../../lib/spokenLanguage";
import { useSettingsStore } from "../../lib/settingsStore";

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(() => {
  (AsyncStorage as any)._reset();
  __resetAppLanguageForTests();
  __resetSpokenLanguageForTests();
  __resetUiLocaleForTests();
  mockMutation.mockClear();
  useSettingsStore.setState({ settings: { aiConsentAcceptedAt: null, voiceLanguage: "auto" } });
});

afterAll(() => __resetUiLocaleForTests());

it("preselects the device language", () => {
  expect(currentLanguageChoice()).toBe("es");
});

it("applies the pick and tells the server", async () => {
  await expect(pickLanguage("pt")).resolves.toBe(true);
  await flush();
  expect(getUiLocale()).toBe("pt-BR");
  expect(getChosenLanguage()).toBe("pt");
  expect(getSpokenLanguage()).toBe("pt");
  expect(mockMutation).toHaveBeenCalledWith(api.devices.chooseSpokenLang, { deviceId: "dev_1", lang: "pt" });
  expect(consumeReturnToSettings()).toBe(false);
});

it("puts a forced on-device voice language back on Automatic", async () => {
  useSettingsStore.setState({ settings: { aiConsentAcceptedAt: null, voiceLanguage: "en" } });
  await pickLanguage("ja");
  expect(useSettingsStore.getState().settings.voiceLanguage).toBe("auto");
});

it("marks the return to Settings only when the UI language changes", async () => {
  await pickLanguage("en", { returnToSettings: true });
  expect(consumeReturnToSettings()).toBe(false);
  await pickLanguage("de", { returnToSettings: true });
  expect(consumeReturnToSettings()).toBe(true);
});

it("refuses a code the wheel doesn't offer", async () => {
  await expect(pickLanguage("xx")).resolves.toBe(false);
  expect(mockMutation).not.toHaveBeenCalled();
});
