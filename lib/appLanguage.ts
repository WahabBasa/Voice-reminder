/**
 * Which language Remi is in: the UI catalog it shows and the spoken-language
 * hint it records with.
 *
 * Resolution, for the UI:
 *   1. the language the user picked (Settings › Language, the first-run step);
 *   2. the device's preferred languages, in order, mapped onto a catalog:
 *      pt-* → pt-BR, es-* → es-MX, zh-Hans/CN/SG → zh-Hans, zh-Hant/TW/HK/MO →
 *      zh-Hant, no → nb, fil → tl, any other language → its catalog if one is
 *      registered in locales/index.ts;
 *   3. English.
 * Right-to-left languages (ar, he, fa, ur) get the English UI for now — there is
 * no RTL layout yet — but stay selectable, because the pick also sets the voice.
 *
 * Picking a language sets both halves at once: the UI catalog and the spoken
 * hint (lib/spokenLanguage.ts), so the first recording in the new language is
 * transcribed in it instead of being misdetected.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useSyncExternalStore } from "react";
import { UI_CATALOGS, SOURCE_LOCALE } from "../locales";
import { setUiLocale } from "./i18n";
import { KNOWN_LANGUAGE_CODES } from "./languageNames";
import { chooseSpokenLanguage, normalizeSpokenLang } from "./spokenLanguage";

const STORAGE_KEY = "vr.appLanguage";

/** Shown with an English UI (no RTL layout yet), still selectable for the voice. */
export const RTL_LANGUAGES: readonly string[] = ["ar", "he", "fa", "ur"];

/**
 * Each wheel choice in its own name. A choice is a language code, except
 * Chinese, which is offered per script (zh-Hans / zh-Hant) because the UI
 * catalogs are; both are the voice language "zh". pt and es name the variant
 * the UI catalog is written in.
 */
export const ENDONYMS: Readonly<Record<string, string>> = {
  ar: "العربية",
  bn: "বাংলা",
  cs: "Čeština",
  da: "Dansk",
  de: "Deutsch",
  el: "Ελληνικά",
  en: "English",
  es: "Español (México)",
  fa: "فارسی",
  fi: "Suomi",
  fr: "Français",
  he: "עברית",
  hi: "हिन्दी",
  hu: "Magyar",
  id: "Bahasa Indonesia",
  it: "Italiano",
  ja: "日本語",
  ko: "한국어",
  ms: "Bahasa Melayu",
  nb: "Norsk bokmål",
  nl: "Nederlands",
  no: "Norsk",
  pl: "Polski",
  pt: "Português (Brasil)",
  ro: "Română",
  ru: "Русский",
  sv: "Svenska",
  sw: "Kiswahili",
  th: "ไทย",
  tl: "Tagalog",
  tr: "Türkçe",
  uk: "Українська",
  ur: "اردو",
  vi: "Tiếng Việt",
  "zh-Hans": "简体中文",
  "zh-Hant": "繁體中文",
};

export type LanguageOption = { code: string; endonym: string };

/** Latin-script names first, A→Z, then the other scripts — like iOS's own list. */
function sortKey(name: string): string {
  return /^[A-Za-zÀ-ɏ]/.test(name) ? `0${name}` : `1${name}`;
}

/** The wheel's choices: every voice language, Chinese split by script. */
const CHOICE_IDS: readonly string[] = KNOWN_LANGUAGE_CODES.flatMap((code) =>
  code === "zh" ? ["zh-Hans", "zh-Hant"] : [code]
);

/** Every language the app knows, each in its own name, in wheel order. */
export const LANGUAGE_OPTIONS: readonly LanguageOption[] = CHOICE_IDS.map((code) => ({
  code,
  endonym: ENDONYMS[code] ?? code,
})).sort((a, b) => (sortKey(a.endonym) < sortKey(b.endonym) ? -1 : 1));

/** "zh-Hant-TW" → { base: "zh", script: "Hant" }; aliases folded (fil → tl). Null for junk. */
function parseTag(tag: string | null | undefined): { base: string; script: "Hans" | "Hant" } | null {
  if (typeof tag !== "string") return null;
  const parts = tag.trim().replace(/_/g, "-").split("-");
  let base = parts[0].toLowerCase();
  if (base === "fil") base = "tl";
  if (!/^[a-z]{2}$/.test(base)) return null;
  const rest = parts.slice(1).map((p) => p.toLowerCase());
  const traditional =
    rest.includes("hant") || (!rest.includes("hans") && rest.some((p) => p === "tw" || p === "hk" || p === "mo"));
  return { base, script: traditional ? "Hant" : "Hans" };
}

/**
 * A wheel choice for a stored pick or a device tag: "pt-BR" → "pt",
 * "zh-TW" → "zh-Hant", "fil-PH" → "tl". Null when the app doesn't offer it.
 */
export function choiceFor(tag: string | null | undefined): string | null {
  const parsed = parseTag(tag);
  if (!parsed) return null;
  const id = parsed.base === "zh" ? `zh-${parsed.script}` : parsed.base;
  return ENDONYMS[id] ? id : null;
}

/** The voice language a choice sets: "zh-Hant" → "zh", "pt" → "pt". */
export function voiceLanguageFor(choice: string): string | null {
  return normalizeSpokenLang(choice);
}

/** The wheel's index for a choice; English's when it isn't listed. */
export function indexOfLanguage(code: string | null | undefined): number {
  const choice = choiceFor(code);
  const index = LANGUAGE_OPTIONS.findIndex((option) => option.code === choice);
  if (index >= 0) return index;
  return Math.max(0, LANGUAGE_OPTIONS.findIndex((option) => option.code === "en"));
}

/** The endonym for a choice ("pt" → "Português (Brasil)"), or the code itself. */
export function endonymFor(code: string | null | undefined): string {
  const choice = choiceFor(code);
  return (choice && ENDONYMS[choice]) || String(code ?? "");
}

/**
 * The UI catalog for a language or locale tag, or null when none is registered.
 * An exact tag wins ("es-MX"); Chinese goes by script; otherwise any catalog of
 * the same base language ("pt-PT" → "pt-BR", "no" → "nb"). RTL → English.
 */
export function uiLocaleFor(tag: string | null | undefined): string | null {
  const parsed = parseTag(tag);
  if (!parsed) return null;
  if (RTL_LANGUAGES.includes(parsed.base)) return SOURCE_LOCALE;
  const tags = Object.keys(UI_CATALOGS);
  if (parsed.base === "zh") {
    const wantedScript = `zh-${parsed.script}`;
    return tags.find((t) => t === wantedScript) ?? null;
  }
  const base = parsed.base === "no" ? "nb" : parsed.base;
  const wanted = String(tag).trim().replace(/_/g, "-").toLowerCase();
  return (
    tags.find((t) => t.toLowerCase() === wanted) ??
    tags.find((t) => t.split("-")[0].toLowerCase() === base) ??
    null
  );
}

/** The UI catalog to show: the pick, else the first device language with a catalog, else English. */
export function resolveUiLocale(
  chosen: string | null | undefined,
  deviceLocales: readonly string[]
): string {
  if (chosen) return uiLocaleFor(chosen) ?? SOURCE_LOCALE;
  for (const tag of deviceLocales) {
    const ui = uiLocaleFor(tag);
    if (ui) return ui;
  }
  return SOURCE_LOCALE;
}

/** The wheel's preselection: the pick, else the first device language the app knows, else English. */
export function defaultLanguageChoice(
  chosen: string | null | undefined,
  deviceLocales: readonly string[]
): string {
  const pick = choiceFor(chosen);
  if (pick) return pick;
  for (const tag of deviceLocales) {
    const choice = choiceFor(tag);
    if (choice) return choice;
  }
  return "en";
}

/** The device's preferred languages, best first. Empty when the platform can't say. */
export function getDeviceLanguageTags(): string[] {
  try {
    // Required lazily: a native module, absent in some test environments.
    const { getLocales } = require("expo-localization") as typeof import("expo-localization");
    return getLocales()
      .map((l) => l.languageTag)
      .filter((tag): tag is string => typeof tag === "string" && tag.length > 0);
  } catch {
    return [];
  }
}

// ─── state ───────────────────────────────────────────────────────────────────

let chosenLanguage: string | null = null;
let loaded = false;
let loading: Promise<string | null> | null = null;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of [...listeners]) listener();
}

/** The language the user picked, or null when they never did (or it isn't loaded yet). */
export function getChosenLanguage(): string | null {
  return chosenLanguage;
}

/** Whether the stored pick has been read (so null really means "never picked"). */
export function hasLoadedLanguage(): boolean {
  return loaded;
}

export function subscribeChosenLanguage(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** The picked language, re-rendering on change. */
export function useChosenLanguage(): string | null {
  return useSyncExternalStore(subscribeChosenLanguage, getChosenLanguage, getChosenLanguage);
}

/** Show the device's language right away (synchronous, before the stored pick is read). */
export function applyDeviceLanguage(deviceLocales: readonly string[] = getDeviceLanguageTags()): void {
  setUiLocale(resolveUiLocale(chosenLanguage, deviceLocales));
}

/** Read the stored pick once and apply it. Never throws. */
export function loadAppLanguage(
  deviceLocales: readonly string[] = getDeviceLanguageTags()
): Promise<string | null> {
  if (!loading) {
    loading = (async () => {
      try {
        const stored = choiceFor(await AsyncStorage.getItem(STORAGE_KEY));
        if (chosenLanguage === null && stored) chosenLanguage = stored;
      } catch {
        // No storage: the device language stands.
      }
      loaded = true;
      setUiLocale(resolveUiLocale(chosenLanguage, deviceLocales));
      emit();
      return chosenLanguage;
    })();
  }
  return loading;
}

/**
 * The user picked a language: switch the UI (English when there is no catalog,
 * or for RTL), make it the spoken hint, persist it. `pushToServer` tells the
 * server (lib/spokenLanguage.ts `pushSpokenLanguageChoice`); it is fired, not
 * awaited, and its failure changes nothing here.
 */
export async function chooseAppLanguage(
  code: string,
  pushToServer?: (lang: string) => Promise<unknown>
): Promise<boolean> {
  const choice = choiceFor(code);
  const voice = choice ? voiceLanguageFor(choice) : null;
  if (!choice || !voice) return false;
  chosenLanguage = choice;
  loaded = true;
  setUiLocale(uiLocaleFor(choice) ?? SOURCE_LOCALE);
  emit();
  await chooseSpokenLanguage(voice);
  try {
    await AsyncStorage.setItem(STORAGE_KEY, choice);
  } catch {
    // Memory has it for this launch.
  }
  if (pushToServer) void pushToServer(voice).catch(() => {});
  return true;
}

/** Test seam. */
export function __resetAppLanguageForTests(): void {
  chosenLanguage = null;
  loaded = false;
  loading = null;
  listeners.clear();
}
