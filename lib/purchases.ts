import Purchases, {
  LOG_LEVEL,
  PURCHASES_ERROR_CODE,
  CustomerInfo,
  PurchasesPackage,
  PurchasesOfferings,
} from 'react-native-purchases';
import { Linking, Platform } from 'react-native';

// RevenueCat public SDK keys. These are publishable by design (they only identify
// the app to RevenueCat), which is why they sit inline rather than in env.
const REVENUECAT_ANDROID_KEY: string | null = 'goog_CajJDmwNngamdqNKtBAJerwrxSV';
const REVENUECAT_IOS_KEY: string | null = 'appl_wKXHGzcWRaiqcfwGyWzBjnAwPxc';

// Must match the RevenueCat entitlement lookup_key exactly — it is "Pro"
// (capital P) in the dashboard, and entitlements.active is case-sensitive.
export const PRO_ENTITLEMENT_ID = 'Pro';

/** Product name shown to users. Must match the App Store subscription display name. */
export const PRO_PRODUCT_NAME = 'Remi Pro';

// The Terms of Use and Privacy Policy URLs live in lib/legalLinks.ts — the
// paywall, Settings and the AI consent card all read them from there.

let cachedCustomerInfo: CustomerInfo | null = null;
let cachedIsPro: boolean | null = null;
let cachedAtMs = 0;
let listenerRegistered = false;
let configured = false;

/** A key we can actually hand to the SDK — not missing, not a leftover placeholder. */
function isUsableKey(key: string | null): key is string {
  return key !== null && key.length > 0 && !key.startsWith('PLACEHOLDER');
}

/**
 * True once `Purchases.configure()` has succeeded for this platform.
 * Every call into the SDK is gated on this: an unconfigured SDK throws on each
 * call, and those throws are what fill the logs with RevenueCat API errors.
 */
export function isPurchasesConfigured(): boolean {
  return configured;
}

function updateCache(customerInfo: CustomerInfo): void {
  cachedCustomerInfo = customerInfo;
  cachedIsPro = customerInfo.entitlements.active[PRO_ENTITLEMENT_ID] !== undefined;
  cachedAtMs = Date.now();
}

export function getCachedProStatus(): { isPro: boolean | null; updatedAtMs: number } {
  return { isPro: cachedIsPro, updatedAtMs: cachedAtMs };
}

/**
 * Initialize RevenueCat SDK on app start.
 * Call this once in the app layout.
 */
export async function initializePurchases(): Promise<void> {
  try {
    // Every relaunch of a freshly compiled binary runs this again; configuring a
    // second time is what logs "instance already set with same configuration".
    if (configured) return;

    if (__DEV__) {
      // Use WARN instead of DEBUG to prevent RevenueCat ERROR-level logs
      // from triggering Expo's red error overlay (LogBox).
      Purchases.setLogLevel(LOG_LEVEL.WARN);
    }

    const apiKey = Platform.OS === 'ios'
      ? REVENUECAT_IOS_KEY
      : REVENUECAT_ANDROID_KEY;

    if (!isUsableKey(apiKey)) {
      // No real key for this platform. Configuring anyway makes the SDK retry
      // against RevenueCat with an invalid key and spam API errors, so stay off
      // and let the paywall fall back to its "no plans available" state.
      if (__DEV__) {
        console.log(`[RevenueCat] No API key for ${Platform.OS} — skipping configure`);
      }
      return;
    }

    await Purchases.configure({ apiKey });
    configured = true;

    if (!listenerRegistered) {
      listenerRegistered = true;
      Purchases.addCustomerInfoUpdateListener((info) => {
        updateCache(info);
      });
    }

    // Prime cache so UI-gating paths can avoid blocking on network later.
    try {
      const info = await Purchases.getCustomerInfo();
      updateCache(info);
    } catch (e) {
      // Keep cache as-is; we'll treat as free tier until updated.
      console.log('[RevenueCat] getCustomerInfo prime failed (silent):', e);
    }
  } catch (error) {
    // Silent log - RevenueCat init failure is non-critical
    console.log('[RevenueCat] initializePurchases failed (silent):', error);
  }
}

/**
 * Check if the current user has an active "pro" entitlement.
 * Returns true if user is a pro subscriber, false otherwise.
 * Errors are logged silently and default to free tier.
 */
export async function checkProStatus(): Promise<boolean> {
  try {
    if (cachedIsPro !== null) {
      return cachedIsPro;
    }
    if (!configured) return false;
    const customerInfo = await Purchases.getCustomerInfo();
    updateCache(customerInfo);
    return cachedIsPro ?? false;
  } catch (error) {
    // Silent log - expected to fail in dev builds without proper signing
    console.log('[RevenueCat] checkProStatus failed (silent):', error);
    return false;
  }
}

/**
 * Ask the store again, ignoring the cached answer.
 *
 * `checkProStatus` answers from cache the moment it has one — that is what lets
 * the tap gates be synchronous — but it also means a subscription bought on
 * another device would never be noticed by a cache that already read `false`.
 * This is the escape hatch for that case: callers fire it *behind* a decision
 * they already made, never in front of one. Falls back to the cached answer
 * (free, if there isn't one) so an unreachable store never grants Pro.
 */
export async function refreshProStatus(): Promise<boolean> {
  try {
    if (!configured) return cachedIsPro ?? false;
    const customerInfo = await Purchases.getCustomerInfo();
    updateCache(customerInfo);
    return cachedIsPro ?? false;
  } catch (error) {
    console.log('[RevenueCat] refreshProStatus failed (silent):', error);
    return cachedIsPro ?? false;
  }
}

// Where each store keeps subscription management for an account. Only used
// when the native sheet is unavailable — same destination, reached the long way.
const APPLE_MANAGE_SUBSCRIPTIONS_URL = 'https://apps.apple.com/account/subscriptions';
const PLAY_MANAGE_SUBSCRIPTIONS_URL = 'https://play.google.com/store/account/subscriptions';

/**
 * Open the store's own manage-subscription screen.
 *
 * `showManageSubscriptions` is the native sheet users expect, but it is missing
 * on older SDK versions and can refuse to present, so the account URL backs it
 * up. Returns whether anything opened; never throws — a store UI that won't
 * come up must not take Settings down with it.
 */
export async function openManageSubscriptions(): Promise<boolean> {
  try {
    const showNative = (Purchases as unknown as {
      showManageSubscriptions?: () => Promise<void>;
    }).showManageSubscriptions;
    if (configured && typeof showNative === 'function') {
      await showNative.call(Purchases);
      return true;
    }
  } catch (error) {
    console.log('[RevenueCat] showManageSubscriptions failed (silent):', error);
  }

  try {
    await Linking.openURL(
      Platform.OS === 'android'
        ? PLAY_MANAGE_SUBSCRIPTIONS_URL
        : APPLE_MANAGE_SUBSCRIPTIONS_URL
    );
    return true;
  } catch (error) {
    console.log('[RevenueCat] manage-subscriptions fallback failed (silent):', error);
    return false;
  }
}

/**
 * Categories a store error can fall into, so the UI can say something useful
 * instead of "Something went wrong".
 */
export type PurchaseErrorCategory =
  | 'cancelled'
  | 'network'
  | 'not_allowed'
  | 'already_owned'
  | 'payment_pending'
  | 'store_problem'
  | 'unknown';

/**
 * Map a thrown RevenueCat error onto a category the paywall can act on.
 * `cancelled` is expected traffic (user backed out) and should stay silent.
 */
export function categorizePurchasesError(error: unknown): PurchaseErrorCategory {
  const err = error as { code?: string; userCancelled?: boolean | null } | null | undefined;

  switch (err?.code) {
    case PURCHASES_ERROR_CODE.PURCHASE_CANCELLED_ERROR:
      return 'cancelled';
    case PURCHASES_ERROR_CODE.NETWORK_ERROR:
    case PURCHASES_ERROR_CODE.OFFLINE_CONNECTION_ERROR:
    case PURCHASES_ERROR_CODE.PRODUCT_REQUEST_TIMED_OUT_ERROR:
    case PURCHASES_ERROR_CODE.API_ENDPOINT_BLOCKED:
      return 'network';
    case PURCHASES_ERROR_CODE.PURCHASE_NOT_ALLOWED_ERROR:
    case PURCHASES_ERROR_CODE.INSUFFICIENT_PERMISSIONS_ERROR:
      return 'not_allowed';
    case PURCHASES_ERROR_CODE.PRODUCT_ALREADY_PURCHASED_ERROR:
    case PURCHASES_ERROR_CODE.RECEIPT_ALREADY_IN_USE_ERROR:
    case PURCHASES_ERROR_CODE.RECEIPT_IN_USE_BY_OTHER_SUBSCRIBER_ERROR:
      return 'already_owned';
    case PURCHASES_ERROR_CODE.PAYMENT_PENDING_ERROR:
      return 'payment_pending';
    case PURCHASES_ERROR_CODE.STORE_PROBLEM_ERROR:
    case PURCHASES_ERROR_CODE.PRODUCT_NOT_AVAILABLE_FOR_PURCHASE_ERROR:
    case PURCHASES_ERROR_CODE.INVALID_RECEIPT_ERROR:
    case PURCHASES_ERROR_CODE.MISSING_RECEIPT_FILE_ERROR:
      return 'store_problem';
    default:
      break;
  }

  // Older payloads only carry the deprecated flag.
  if (err?.userCancelled) return 'cancelled';
  return 'unknown';
}

export type RestoreResult =
  | { status: 'restored' }
  | { status: 'nothing_to_restore' }
  | { status: 'error'; category: PurchaseErrorCategory };

/**
 * Restore previous purchases from the App Store / Play Store.
 * Distinguishes "restored" from "nothing on this account" from "it broke",
 * because App Review checks that each of those is surfaced to the user.
 */
export async function restorePurchases(): Promise<RestoreResult> {
  try {
    if (!configured) return { status: 'error', category: 'unknown' };
    const customerInfo = await Purchases.restorePurchases();
    updateCache(customerInfo);
    return customerInfo.entitlements.active[PRO_ENTITLEMENT_ID] !== undefined
      ? { status: 'restored' }
      : { status: 'nothing_to_restore' };
  } catch (error) {
    console.log('[RevenueCat] restorePurchases failed (silent):', error);
    return { status: 'error', category: categorizePurchasesError(error) };
  }
}

/**
 * Get available offerings (product packages) from RevenueCat.
 */
export async function getOfferings(): Promise<PurchasesOfferings | null> {
  try {
    if (!configured) return null;
    const offerings = await Purchases.getOfferings();
    return offerings;
  } catch (error) {
    console.log('[RevenueCat] getOfferings failed (silent):', error);
    return null;
  }
}

/**
 * Purchase a specific package.
 * Returns the CustomerInfo if successful, null otherwise.
 */
export async function purchasePackage(pkg: PurchasesPackage): Promise<CustomerInfo | null> {
  try {
    if (!configured) return null;
    const { customerInfo } = await Purchases.purchasePackage(pkg);
    return customerInfo;
  } catch (error) {
    console.log('[RevenueCat] purchasePackage failed (silent):', error);
    return null;
  }
}

/**
 * Get current customer info.
 */
export async function getCustomerInfo(): Promise<CustomerInfo | null> {
  try {
    if (!configured) return null;
    return await Purchases.getCustomerInfo();
  } catch (error) {
    console.log('[RevenueCat] getCustomerInfo failed (silent):', error);
    return null;
  }
}
