/**
 * The splash overlay's exit timing (components/AnimatedSplash).
 *
 * The overlay can't be rendered in this suite, so the rule it runs on — how long
 * the splash stays up before animating out — is checked here instead.
 */

import {
  SPLASH_FALLBACK_MS,
  SPLASH_MIN_DISPLAY_MS,
  splashExitDelayMs,
} from '../../components/splashTiming';

describe('splashExitDelayMs', () => {
  it('waits while the app is not ready', () => {
    expect(splashExitDelayMs(false, 0)).toBeNull();
    expect(splashExitDelayMs(false, 10_000)).toBeNull();
  });

  it('holds the splash for the rest of the minimum display time', () => {
    expect(splashExitDelayMs(true, 0)).toBe(SPLASH_MIN_DISPLAY_MS);
    expect(splashExitDelayMs(true, 150)).toBe(SPLASH_MIN_DISPLAY_MS - 150);
  });

  it('exits immediately once the minimum has already passed', () => {
    expect(splashExitDelayMs(true, SPLASH_MIN_DISPLAY_MS)).toBe(0);
    expect(splashExitDelayMs(true, SPLASH_MIN_DISPLAY_MS + 5_000)).toBe(0);
  });

  it('never returns a negative delay', () => {
    for (const elapsed of [0, 1, 399, 400, 401, 100_000]) {
      const delay = splashExitDelayMs(true, elapsed);
      expect(delay).not.toBeNull();
      expect(delay!).toBeGreaterThanOrEqual(0);
    }
  });

  it('accepts a caller-supplied minimum', () => {
    expect(splashExitDelayMs(true, 100, 1_000)).toBe(900);
    expect(splashExitDelayMs(true, 100, 0)).toBe(0);
  });

  it('keeps the fallback well clear of the minimum, so it only fires on a stall', () => {
    expect(SPLASH_FALLBACK_MS).toBeGreaterThan(SPLASH_MIN_DISPLAY_MS);
  });
});
