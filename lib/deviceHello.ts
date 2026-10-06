import { api } from "../convex/_generated/api";
import { getDeviceId } from "./deviceId";
import { getDeviceLocales } from "./deviceStt";
import { getRuntimeInfo } from "./feedbackContext";
import { rememberSpokenLanguage, spokenLangFromResponse } from "./spokenLanguage";

/**
 * The once-per-launch check-in behind the founder's new-device alerts
 * (OLD-135, convex/devices.ts `hello`).
 *
 * Fire-and-forget by contract: it resolves on every path, never throws, and
 * nothing waits on it. The server throttles to one write an hour per device, so
 * a launch that lands inside that hour costs one indexed read and nothing else.
 *
 * The answer carries the language the server has learned this install speaks
 * in (OLD-140), which is kept for the recognizer and the cloud hint
 * (./spokenLanguage.ts).
 */

/** The one ConvexReactClient method this needs — and all a test needs to fake. */
export type HelloClient = {
  mutation: (ref: typeof api.devices.hello, args: HelloArgs) => Promise<unknown>;
};

export type HelloArgs = {
  deviceId: string;
  buildNumber?: string;
  updateId?: string;
  locale?: string;
  timezone?: string;
  iosVersion?: string;
};

function str(value: unknown): string | undefined {
  if (value === null || value === undefined) return undefined;
  const s = String(value);
  return s.length > 0 ? s : undefined;
}

/** What `hello` is sent. Exported for the test. */
export async function buildHelloArgs(): Promise<HelloArgs> {
  const info = getRuntimeInfo();
  return {
    deviceId: await getDeviceId(),
    buildNumber: str(info.buildNumber),
    updateId: str(info.updateId),
    locale: str(getDeviceLocales()[0]),
    timezone: str(info.timezone),
    iosVersion: str(info.iosVersion),
  };
}

let sentThisLaunch = false;

export async function sendDeviceHello(client: HelloClient): Promise<void> {
  if (sentThisLaunch) return;
  sentThisLaunch = true;
  try {
    const response = await client.mutation(api.devices.hello, await buildHelloArgs());
    await rememberSpokenLanguage(spokenLangFromResponse(response));
  } catch (e) {
    console.log("[VR] deviceHello: check-in failed (ignored):", e);
  }
}

/** Test seam: forget that this launch already said hello. */
export function __resetDeviceHelloForTests(): void {
  sentThisLaunch = false;
}
