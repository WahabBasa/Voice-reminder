import Constants from "expo-constants";
import { Platform } from "react-native";
import * as Updates from "expo-updates";
import type { FeedbackContext } from "./feedbackOutbox";

/**
 * The technical envelope stapled to every feedback note.
 *
 * The entrance supplies the interesting half (which reminder, which failed take,
 * or just "settings"); this adds the build/runtime facts that make a report
 * actionable — which build, which OTA, which iOS — plus the user's clock so a
 * "it fired at the wrong time" report can be read against their timezone.
 *
 * The whole thing is capped: the backend rejects a context over 8 KB, so long
 * strings (a reminder's spoken line, a stringified schedule) are truncated
 * before they ever reach the wire.
 */

const MAX_CONTEXT_BYTES = 8 * 1024;
const MAX_STRING_FIELD = 800;

/** UTF-8 byte length without Buffer (React Native has no global Buffer). */
function byteLength(value: string): number {
  try {
    return unescape(encodeURIComponent(value)).length;
  } catch {
    return value.length;
  }
}

function truncate(value: string, max: number): string {
  if (value.length <= max) return value;
  return `${value.slice(0, max - 1)}…`;
}

/** Local time as ISO-8601 WITH the device's UTC offset (not a UTC "Z" stamp). */
function localISOWithOffset(date: Date): string {
  const pad = (n: number) => String(Math.floor(Math.abs(n))).padStart(2, "0");
  const offsetMin = -date.getTimezoneOffset();
  const sign = offsetMin >= 0 ? "+" : "-";
  const offset = `${sign}${pad(offsetMin / 60)}:${pad(offsetMin % 60)}`;
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}${offset}`
  );
}

function resolveTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone ?? "";
  } catch {
    return "";
  }
}

function resolveBuildNumber(): string | number | null {
  // expo-application isn't installed, so fall straight to Constants — the same
  // read the Settings version footer uses.
  const nativeBuild = (Constants as any).nativeBuildVersion;
  if (nativeBuild != null) return nativeBuild;
  const configBuild = (Constants as any).expoConfig?.ios?.buildNumber;
  return configBuild ?? null;
}

function resolveUpdateId(): string {
  try {
    return (Updates as any).updateId ?? "embedded";
  } catch {
    return "embedded";
  }
}

/** Cap every string value, then guarantee the whole context is under the byte limit. */
function clamp(context: FeedbackContext): FeedbackContext {
  const clamped: FeedbackContext = {};
  for (const [key, value] of Object.entries(context)) {
    if (value === undefined) continue;
    clamped[key] = typeof value === "string" ? truncate(value, MAX_STRING_FIELD) : value;
  }

  // Belt and braces: if it somehow still exceeds the cap, hard-trim the longest
  // string fields until it fits.
  let guard = 0;
  while (byteLength(JSON.stringify(clamped)) > MAX_CONTEXT_BYTES && guard < 20) {
    guard += 1;
    let longestKey: string | null = null;
    let longestLen = 0;
    for (const [key, value] of Object.entries(clamped)) {
      if (typeof value === "string" && value.length > longestLen) {
        longestKey = key;
        longestLen = value.length;
      }
    }
    if (!longestKey) break;
    clamped[longestKey] = truncate(clamped[longestKey] as string, Math.floor(longestLen / 2));
  }

  return clamped;
}

export function buildFeedbackContext(base: FeedbackContext): FeedbackContext {
  const now = new Date();
  return clamp({
    ...base,
    buildNumber: resolveBuildNumber(),
    updateId: resolveUpdateId(),
    iosVersion: Platform.Version,
    timezone: resolveTimezone(),
    localTime: localISOWithOffset(now),
  });
}
