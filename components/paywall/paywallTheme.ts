/**
 * Paywall-scoped palette. The app's signature blue is `colors.accent` (#3D8BFF);
 * the paywall runs it a notch more saturated so the accents carry a full screen
 * of white space, while staying in the light register the rest of the app uses.
 * Scoped here on purpose — nothing outside `app/paywall.tsx` should pull these.
 */

import { colors } from "../../lib/theme";

export const paywallColors = {
  /** Signature blue, nudged more vibrant. Checks, pills and the trial CTA accent. */
  accent: "#2A7BFF",
  /** Pressed / border variant of the same blue. */
  accentDeep: "#1B5FD9",
  /** Card and check-circle fills. */
  accentTint: "#E6F0FF",
  /** Faintest wash — hero gradient midpoint, table container. */
  accentWash: "#F4F8FF",
  /** Near-black used for the selected pricing card border and the sticky CTA. */
  ink: "#111318",
  /** Hairline dividers inside the feature table. */
  hairline: "#ECEFF3",
  /** Unselected card border. */
  cardBorder: "#E3E7EC",
  surface: colors.card,
  textPrimary: colors.textPrimary,
  textHeading: colors.textHeading,
  textSecondary: colors.textSecondary,
  textTertiary: colors.textTertiary,
};

/** Hero backdrop: tinted at the top, white by the time the pricing cards start. */
export const paywallHeroGradient: [string, string, string] = [
  "#DCE9FF",
  paywallColors.accentWash,
  colors.card,
];

/** Horizontal page gutter, shared by the scroll body and the sticky footer. */
export const PAYWALL_GUTTER = 22;
