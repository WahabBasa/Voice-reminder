/**
 * When the splash overlay is allowed to leave.
 *
 * The overlay itself is untestable here (no renderer in this suite), so the
 * timing it depends on lives in this module and is checked from that side.
 */

/** Floor on visible time, so a warm start doesn't flash the splash for one frame. */
export const SPLASH_MIN_DISPLAY_MS = 400;

/** Ceiling from mount: the splash exits even if the ready signal never arrives. */
export const SPLASH_FALLBACK_MS = 4000;

/**
 * Delay before the exit animation starts, or `null` while the app is still
 * loading — in which case only the fallback timer can end the splash.
 */
export function splashExitDelayMs(
  ready: boolean,
  elapsedMs: number,
  minDisplayMs: number = SPLASH_MIN_DISPLAY_MS
): number | null {
  if (!ready) return null;
  return Math.max(0, minDisplayMs - elapsedMs);
}
