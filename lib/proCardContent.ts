import { t } from "./i18n";
/**
 * What the Pro card in Settings says, and what tapping it does.
 *
 * Split out of the screen the same way lib/paywallContent owns the paywall's
 * strings: the free/Pro decision and its copy are then testable without a
 * renderer, which is the only way this repo's Jest setup can reach them.
 */

/**
 * Mirror of `ProStatus` in lib/purchases — declared here rather than imported
 * so this module never pulls the native purchases SDK into a test process.
 * The two unions are pinned to each other by __tests__/lib/proCardContent.test.
 */
export type ProStatus = "pro" | "free" | "unknown";

export type ProCardAction = "upgrade" | "manage" | "retry";

export type ProCardContent = {
  title: string;
  subtitle: string;
  action: ProCardAction;
};

/**
 * Three states, three cards — and the third one is the point.
 *
 * `unknown` means the store hasn't answered: the SDK is still starting up, or
 * the check failed. It used to collapse into the upgrade pitch, which quietly
 * asks a paying subscriber to buy their subscription a second time whenever the
 * network hiccups. It can't collapse into "Active" either — that would offer a
 * free user a subscription to manage that doesn't exist. So it says neither,
 * and its tap asks again instead of opening the paywall.
 *
 * @param status what we actually know, not what we'd guess.
 * @param productName the App Store display name — PRO_PRODUCT_NAME, never a
 *   second copy of the string.
 */
export function getProCardContent(
  status: ProStatus,
  productName: string
): ProCardContent {
  if (status === "pro") {
    return {
      title: productName,
      subtitle: t("proCard.pro.subtitle"),
      action: "manage",
    };
  }

  if (status === "unknown") {
    return {
      title: t("proCard.unknown.title"),
      subtitle: t("proCard.unknown.subtitle"),
      action: "retry",
    };
  }

  return {
    title: t("proCard.free.title"),
    subtitle: t("proCard.free.subtitle"),
    action: "upgrade",
  };
}

/** The three ways a restore can succeed at reaching the store. */
export type RestoreOutcome = "restored" | "expired" | "nothing_to_restore";

export type RestoreOutcomeContent = {
  /** What the card must say afterwards — including downward. */
  proStatus: ProStatus;
  title: string;
  message: string;
};

/**
 * What a completed restore means, for the alert and for the card underneath it.
 *
 * Two rules live here. First, restore reconciles in both directions: it is the
 * one moment the store gives a definitive answer, so an outcome with no active
 * entitlement has to clear a stale "Active" card, not just leave it standing.
 * Second, "expired" is not "nothing to restore" — telling someone whose plan
 * lapsed that no purchase was ever found reads as the store having lost it.
 */
export function getRestoreOutcomeContent(
  outcome: RestoreOutcome,
  productName: string
): RestoreOutcomeContent {
  if (outcome === "restored") {
    return {
      proStatus: "pro",
      title: t("restore.restored.title"),
      message: t("restore.restored.message", { product: productName }),
    };
  }

  if (outcome === "expired") {
    return {
      proStatus: "free",
      title: t("restore.expired.title"),
      message: t("restore.expired.message", { product: productName }),
    };
  }

  return {
    proStatus: "free",
    title: t("restore.nothing.title"),
    message: t("restore.nothing.message"),
  };
}
