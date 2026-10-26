/**
 * The languages the update prompt (components/UpdatePrompt.tsx) may speak in,
 * best first: the app's current UI language, then the iPhone's preferred
 * languages (expo-localization — never the keyboard). The prompt falls back
 * to English.
 */
import { getUiLocale } from "./i18n";

export function getUpdatePromptLanguages(): string[] {
  const out: string[] = [];
  try {
    const ui = getUiLocale();
    if (typeof ui === "string" && ui) out.push(ui);
  } catch {
    // No UI language yet: the device list below.
  }
  try {
    // Required lazily: a native module, absent in some test environments.
    const { getLocales } = require("expo-localization") as typeof import("expo-localization");
    for (const l of getLocales()) {
      if (typeof l.languageTag === "string" && l.languageTag) out.push(l.languageTag);
    }
  } catch {
    // No localization module: UI language (if any), then English.
  }
  return out;
}
