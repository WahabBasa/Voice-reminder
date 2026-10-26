/**
 * Update prompt language order: the app's UI language, then the iPhone's
 * preferred languages, then English.
 */
let mockUiLocale: string | undefined = "en";
let mockDeviceTags: string[] = [];

jest.mock("../../lib/i18n", () => ({
  getUiLocale: () => {
    if (mockUiLocale === undefined) throw new Error("not ready");
    return mockUiLocale;
  },
}));
jest.mock("expo-localization", () => ({
  getLocales: () => mockDeviceTags.map((languageTag) => ({ languageTag })),
}));

import { getUpdatePromptLanguages } from "../../lib/appUpdateLocale";
import { pickPromptLanguage } from "../../lib/appUpdatePrompt";

test("the UI language wins over the iPhone's", () => {
  mockUiLocale = "ar";
  mockDeviceTags = ["fr-FR", "en-US"];
  expect(getUpdatePromptLanguages()).toEqual(["ar", "fr-FR", "en-US"]);
  expect(pickPromptLanguage(getUpdatePromptLanguages())).toBe("ar");
});

test("an English UI on a German iPhone speaks English (the UI language)", () => {
  mockUiLocale = "en";
  mockDeviceTags = ["de-DE"];
  expect(pickPromptLanguage(getUpdatePromptLanguages())).toBe("en");
});

test("no UI language: the iPhone's list, in order, then English", () => {
  mockUiLocale = undefined;
  mockDeviceTags = ["xx-XX", "pt-BR", "en-US"];
  expect(getUpdatePromptLanguages()).toEqual(["xx-XX", "pt-BR", "en-US"]);
  expect(pickPromptLanguage(getUpdatePromptLanguages())).toBe("pt");
  mockDeviceTags = [];
  expect(pickPromptLanguage(getUpdatePromptLanguages())).toBe("en");
});
