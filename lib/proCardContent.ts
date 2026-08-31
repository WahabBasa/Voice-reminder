/**
 * What the Pro card in Settings says, and what tapping it does.
 *
 * Split out of the screen the same way lib/paywallContent owns the paywall's
 * strings: the free/Pro decision and its copy are then testable without a
 * renderer, which is the only way this repo's Jest setup can reach them.
 */

export type ProCardAction = "upgrade" | "manage";

export type ProCardContent = {
  title: string;
  subtitle: string;
  action: ProCardAction;
};

/**
 * `isPro === null` means the store hasn't answered yet, and has to read as the
 * upgrade pitch: guessing Pro would offer a free user a subscription they have
 * no way to manage.
 *
 * @param productName the App Store display name — PRO_PRODUCT_NAME, never a
 *   second copy of the string.
 */
export function getProCardContent(
  isPro: boolean | null,
  productName: string
): ProCardContent {
  if (isPro === true) {
    return {
      title: productName,
      subtitle: "Active · Unlimited reminders",
      action: "manage",
    };
  }

  return {
    title: "Upgrade to Pro",
    subtitle: "Unlimited active reminders",
    action: "upgrade",
  };
}
