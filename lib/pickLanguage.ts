/**
 * The one call the language wheel makes: switch the UI and the voice hint
 * (lib/appLanguage.ts) and tell the server, through the app's Convex client.
 * Kept apart from appLanguage so that module stays free of the client.
 */
import { convex } from "./convexClient";
import { getDeviceId } from "./deviceId";
import {
  chooseAppLanguage,
  defaultLanguageChoice,
  getChosenLanguage,
  getDeviceLanguageTags,
  markReturnToSettings,
  resolveUiLocale,
} from "./appLanguage";
import { getUiLocale } from "./i18n";
import { pushSpokenLanguageChoice } from "./spokenLanguage";
import { useSettingsStore } from "./settingsStore";

export async function pickLanguage(
  code: string,
  options: { returnToSettings?: boolean } = {}
): Promise<boolean> {
  // Marked BEFORE the switch: the remount it triggers can mount the new Home
  // before this function resumes.
  if (options.returnToSettings && resolveUiLocale(code, []) !== getUiLocale()) {
    markReturnToSettings();
  }
  const ok = await chooseAppLanguage(code, (lang) => pushSpokenLanguageChoice(convex, getDeviceId, lang));
  // A forced on-device language (Settings › Voice language: English/Arabic)
  // would override the pick for the on-device pass; "Automatic" follows it.
  if (ok && useSettingsStore.getState().settings.voiceLanguage !== "auto") {
    await useSettingsStore.getState().setVoiceLanguage("auto").catch(() => {});
  }
  return ok;
}

/** What the wheel opens on: the pick, else the device language, else English. */
export function currentLanguageChoice(): string {
  return defaultLanguageChoice(getChosenLanguage(), getDeviceLanguageTags());
}
