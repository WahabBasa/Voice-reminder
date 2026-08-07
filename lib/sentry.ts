import { Platform } from "react-native";
import * as Sentry from "@sentry/react-native";

// Separate Sentry projects per platform (org: oldowan). DSNs from
// sentry.io → Project Settings → Client Keys. Not secrets — they only let
// clients send events. Empty string = Sentry stays disabled on that platform.
const SENTRY_DSN_IOS =
  "https://d460fa5e20112f13113114bc3aeb256d@o4511867657715712.ingest.de.sentry.io/4511867869921360";
const SENTRY_DSN_ANDROID =
  "https://79d26ed8d2fb18232e3887b8df2b69d3@o4511867657715712.ingest.de.sentry.io/4511867870052432";

export function initSentry(): void {
  const dsn = Platform.OS === "ios" ? SENTRY_DSN_IOS : SENTRY_DSN_ANDROID;
  if (!dsn) return;
  Sentry.init({
    dsn,
    // Crash/error reporting only — no performance tracing noise.
    tracesSampleRate: 0,
    // Stream every console line (all [VR]/[AudioService] diagnostics) to
    // Sentry Logs so device behavior is readable without a cable or a Mac.
    enableLogs: true,
    integrations: [
      Sentry.consoleLoggingIntegration({ levels: ["log", "warn", "error"] }),
    ],
  });
}
