/**
 * Home header fit: the title, the "Get Pro" pill and the + button share one
 * row, and some catalogs are much longer than English ("Erinnerungen",
 * "Muistutukset", "Υπενθυμίσεις", "یاد دہانیاں"). Rules, in order:
 *   1. there is always HEADER_GAP between the title and the pill, PILL_GAP
 *      between the pill and the +;
 *   2. when the title and the full pill don't both fit, the pill compacts to
 *      crown + "Pro";
 *   3. a title still too wide shrinks (adjustsFontSizeToFit, down to
 *      TITLE_MIN_SCALE) instead of colliding;
 *   4. when even the shrunk title and the compact pill don't fit, the title
 *      takes its own line and the date + pill + "+" row goes under it.
 * English ("Reminders" + "Get Pro") fits with room to spare, so it is unchanged.
 */
export const HEADER_GAP = 12;
export const PILL_GAP = 10;
export const ADD_BUTTON_SIZE = 36;
/** The pill never grows past this; its label shrinks down to PILL_MIN_SCALE first. */
export const PILL_MAX_WIDTH = 150;
export const PILL_MIN_SCALE = 0.85;
export const TITLE_MIN_SCALE = 0.85;

export type PillMode = "full" | "compact" | "stacked";

export type HeaderMeasures = {
  /** Width of the row (header minus its side padding). 0 = not measured yet. */
  rowWidth: number;
  /** The title's natural one-line width at full size. 0 = not measured yet. */
  titleWidth: number;
  /** The full pill's natural width (crown + label + padding). 0 = not measured yet. */
  pillFullWidth: number;
  /** The compact pill's width (crown + "Pro"); 0 = unknown (never stacks). */
  pillCompactWidth?: number;
};

export function proPillMode({
  rowWidth,
  titleWidth,
  pillFullWidth,
  pillCompactWidth = 0,
}: HeaderMeasures): PillMode {
  // Until everything is measured, render as before (no flash for English).
  if (rowWidth <= 0 || titleWidth <= 0 || pillFullWidth <= 0) return "full";
  const fullPill = Math.min(pillFullWidth, PILL_MAX_WIDTH);
  // The label can't fit the pill even shrunk: it would truncate.
  const labelFits = pillFullWidth * PILL_MIN_SCALE <= PILL_MAX_WIDTH;
  if (labelFits && titleWidth + HEADER_GAP + fullPill + PILL_GAP + ADD_BUTTON_SIZE <= rowWidth) {
    return "full";
  }
  const shrunkTitle = titleWidth * TITLE_MIN_SCALE;
  if (
    pillCompactWidth > 0 &&
    shrunkTitle + HEADER_GAP + pillCompactWidth + PILL_GAP + ADD_BUTTON_SIZE > rowWidth
  ) {
    return "stacked";
  }
  return "compact";
}
