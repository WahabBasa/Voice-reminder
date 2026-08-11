import { Dimensions, Platform } from "react-native";

/**
 * Estimated display corner radius in points, for nesting floating cards
 * concentrically inside the screen's rounded corners.
 *
 * iOS exposes no public API for this (`_displayCornerRadius` is private), so
 * this is a lookup keyed on the screen's point height — each iPhone display
 * generation has a distinct one. Values are the community-documented dumps of
 * the private constant. A wrong guess degrades gracefully: the card's curve is
 * off by a few points, not broken.
 *
 * Square-corner devices (home-button iPhones, insets.bottom === 0) return 0 —
 * callers should fall back to their own default radius.
 */
const IOS_CORNER_RADIUS_BY_SCREEN_HEIGHT: Record<number, number> = {
  812: 44, // X/XS/11 Pro (39) and 12/13 mini (44) share this size; favor the minis
  844: 47.33, // 12, 12 Pro, 13, 13 Pro, 14
  852: 55, // 14 Pro, 15, 15 Pro, 16
  874: 62, // 16 Pro
  896: 41.5, // XR, 11, XS Max, 11 Pro Max
  926: 53.33, // 12/13 Pro Max, 14 Plus
  932: 55, // 14 Pro Max, 15 Plus, 15 Pro Max, 16 Plus
  956: 62, // 16 Pro Max
};

export function estimateScreenCornerRadius(insetsBottom: number): number {
  if (Platform.OS !== "ios") return 0;
  if (insetsBottom === 0) return 0; // home-button device, square corners

  const { width, height } = Dimensions.get("screen");
  const pointHeight = Math.round(Math.max(width, height));
  return IOS_CORNER_RADIUS_BY_SCREEN_HEIGHT[pointHeight] ?? 47;
}

/**
 * Radius for a floating card inset `gap` points from the screen edge, so its
 * corners run concentric with the display's. Falls back to `fallback` on
 * square-corner screens (where concentricity is meaningless).
 */
export function concentricCardRadius(
  gap: number,
  insetsBottom: number,
  fallback: number
): number {
  const screenRadius = estimateScreenCornerRadius(insetsBottom);
  if (screenRadius <= gap) return fallback;
  return screenRadius - gap;
}
