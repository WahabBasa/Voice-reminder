import { Platform } from "react-native";
import * as Sentry from "@sentry/react-native";

// Separate Sentry projects per platform (org: oldowan). DSNs from
// sentry.io → Project Settings → Client Keys. Not secrets — they only let
// clients send events. Empty string = Sentry stays disabled on that platform.
const SENTRY_DSN_IOS =
  "https://d460fa5e20112f13113114bc3aeb256d@o4511867657715712.ingest.de.sentry.io/4511867869921360";
const SENTRY_DSN_ANDROID =
  "https://79d26ed8d2fb18232e3887b8df2b69d3@o4511867657715712.ingest.de.sentry.io/4511867870052432";

// Console output carries user content (reminder titles, notification bodies,
// transcripts), so it only leaves the device on dev builds. Release builds send
// crashes and nothing else. Fallback is false so anything that isn't provably a
// dev build is treated as release.
const CAPTURE_CONSOLE = typeof __DEV__ !== "undefined" ? __DEV__ : false;

// Log bodies get truncated at this length before they're queued. The voice
// pipeline emits [VR PERF] JSON lines; the useful part is always the front.
const MAX_LOG_BODY_CHARS = 512;

// Log sources that are pure noise and would otherwise dominate the stream.
// [RevenueCat] fires from every catch handler in lib/purchases.ts while the iOS
// key is a placeholder — dozens of identical lines per session.
const LOG_NOISE_PREFIXES = ["[RevenueCat]"];

/**
 * One creation-pipeline stage transition, as a breadcrumb (spec §3.3).
 *
 * Content-free by construction: the stage name and, at most, an `errorKind`
 * from the fixed set the pending card knows about. No transcript, no reminder
 * title, no URI, no storage id — the creation path is the loudest carrier of
 * user content in the app, and this is the one channel that survives to
 * production.
 */
export function creationBreadcrumb(stage: string, errorKind?: string): void {
  Sentry.addBreadcrumb({
    category: "vr.creation",
    type: "info",
    level: "info",
    message: stage,
    ...(errorKind ? { data: { errorKind } } : {}),
  });
}

export function initSentry(): void {
  const dsn = Platform.OS === "ios" ? SENTRY_DSN_IOS : SENTRY_DSN_ANDROID;
  if (!dsn) return;
  Sentry.init({
    dsn,

    // ---- Performance instrumentation: OFF ----
    // `tracesSampleRate: 0` does NOT do this. The RN SDK gates every tracing
    // integration on `typeof tracesSampleRate === 'number'`, so 0 switched the
    // whole stack ON and merely threw the spans away at send time
    // (integrations/default.js: `const hasTracingEnabled = typeof
    // options.tracesSampleRate === 'number' || ...`). Worse, core still emits
    // `spanStart` for unsampled root spans (tracing/trace.js), so the listeners
    // kept firing. That bought us, for zero data: a 50ms setTimeout stall-poll
    // loop, native frame tracking on a display link, XHR patching that wrapped
    // every upload and Convex call, app-start/TTID/AppRegistry hooks — all of it
    // on the JS and main threads during the voice pipeline. Omitting the key
    // entirely is what actually disables tracing; the explicit flags below are
    // belt-and-braces in case a dependency ever sets a sampler.
    enableAutoPerformanceTracing: false,
    enableStallTracking: false,
    enableNativeFramesTracking: false,
    enableAppStartTracking: false,
    enableUserInteractionTracing: false,

    // Dev only: stream every console line (all [VR]/[AudioService] diagnostics)
    // to Sentry Logs so device behavior is readable without a cable or a Mac.
    // This is not optional convenience — the dev network blocks Metro from ever
    // reaching the phone (see updates/2026-08-10), so Sentry Logs is the only
    // window into a running build. Kept on; made cheap instead.
    enableLogs: CAPTURE_CONSOLE,
    // Runs before the log is serialized and buffered, so dropped lines cost
    // nothing downstream. `message` here becomes `body` on the wire.
    beforeSendLog: (log) => {
      const message = typeof log.message === "string" ? log.message : "";
      if (LOG_NOISE_PREFIXES.some((p) => message.startsWith(p))) return null;
      if (message.length > MAX_LOG_BODY_CHARS) {
        return {
          ...log,
          message: `${message.slice(0, MAX_LOG_BODY_CHARS)}…[+${message.length - MAX_LOG_BODY_CHARS} chars]`,
        };
      }
      return log;
    },

    // Screenshots and the view tree both render reminder text on screen.
    attachScreenshot: false,
    attachViewHierarchy: false,
    sendDefaultPii: false,

    // Every breadcrumb costs one synchronous native module call
    // (scopeSync.ts → NATIVE.addBreadcrumb) plus a copy of the whole breadcrumb
    // array into scope data on each captured log. 100 was the default; we only
    // ever read the last handful on a crash.
    maxBreadcrumbs: 30,

    integrations: [
      // Replaces the default Breadcrumbs integration (a user instance wins over
      // the default one of the same name).
      //
      // `console: false` unconditionally. Two reasons, in order of weight:
      // (1) cost — every console line became a blocking JS→native hop, and the
      //     voice pipeline is the loudest path in the app; (2) privacy — the
      //     default would staple the last console lines onto every crash report,
      //     reminder text included. Nothing is lost: console output still
      //     streams to Sentry Logs in dev via consoleLoggingIntegration below,
      //     which is where we actually read it.
      // Network breadcrumbs stay on — method/URL/status only, no bodies.
      Sentry.breadcrumbsIntegration({ console: false }),
      ...(CAPTURE_CONSOLE
        ? [Sentry.consoleLoggingIntegration({ levels: ["log", "warn", "error"] })]
        : []),
    ],
  });
}
