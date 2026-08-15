/**
 * Paywall-scoped palette. The app's signature blue is `colors.accent` (#3D8BFF);
 * the paywall runs it a notch more saturated so the accents carry a full screen
 * of white space, while staying in the light register the rest of the app uses.
 * Scoped here on purpose — nothing outside `app/paywall.tsx` should pull these.
 *
 * One rule the whole screen obeys: **no gray text**. Every string renders in
 * `ink`, and hierarchy comes from size and weight instead of from lighter
 * shades. Only lines and non-text marks are allowed to fade out.
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
  /**
   * The one ink on this screen. Headlines, captions, disclosures, table rows —
   * all of it. Also the selected pricing-card border and the sticky CTA fill.
   */
  ink: "#111318",
  /** Hairline dividers: feature-table rows. Lines may fade; text may not. */
  hairline: "#E4E8ED",
  /** Unselected card border. */
  cardBorder: "#E3E7EC",
  /** Muted non-text marks only — the FREE check circle, the laurel strokes. */
  muted: "#9AA0A6",
  surface: colors.card,
};

/** Hero backdrop: tinted at the top, white by the time the pricing cards start. */
export const paywallHeroGradient: [string, string, string] = [
  "#DCE9FF",
  paywallColors.accentWash,
  colors.card,
];

/** Horizontal page gutter, shared by the scroll body and the sticky footer. */
export const PAYWALL_GUTTER = 22;

/** Generous card corner, the way the reference screens round theirs. */
export const PAYWALL_CARD_RADIUS = 24;

/**
 * The weight ladder. With a single ink, weight is half of the hierarchy (size
 * is the other half), so the values live here rather than being typed inline.
 */
export const paywallWeight = {
  regular: "400",
  semibold: "600",
  bold: "700",
} as const;
