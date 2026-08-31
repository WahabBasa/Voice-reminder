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

/**
 * What we know about the entitlement right now.
 *
 * `unknown` is the state that used to be spelled `false`: the SDK hasn't
 * configured yet, or the store couldn't be reached. Collapsing it into "free"
 * is safe for a *gate* (nobody gets Pro they haven't paid for) but wrong for
 * *copy* — it turns "we couldn't check" into "you don't have a subscription"
 * and pitches an upgrade to someone who may already be paying.
 */
export type ProStatus = 'pro' | 'free' | 'unknown';

let cachedCustomerInfo: CustomerInfo | null = null;
let cachedIsPro: boolean | null = null;
let cachedAtMs = 0;
let listenerRegistered = false;
let configured = false;

type ProStatusListener = (status: ProStatus) => void;
const proStatusListeners = new Set<ProStatusListener>();

/** A key we can actually hand to the SDK — not missing, not a leftover placeholder. */
function isUsableKey(key: string | null): key is string {
  return key !== null && key.length > 0 && !key.startsWith('PLACEHOLDER');
}

/** The cached answer as a status. No network, no throwing — safe during render. */
export function getProStatusSnapshot(): ProStatus {
  if (cachedIsPro === null) return 'unknown';
  return cachedIsPro ? 'pro' : 'free';
}

/**
 * Watch the entitlement instead of sampling it.
 *
 * Screens that stay mounted (Settings lives inside the home pager and is never
 * unmounted) can't rely on a focus effect to notice a change: the SDK finishes
 * configuring long after they first rendered, and RevenueCat's own
 * `customerInfoUpdateListener` only refreshes this module's cache. This is how
 * that reaches the UI — including the unknown → pro/free transition at startup.
 *
 * Returns the unsubscribe function; fires immediately with nothing (callers
 * seed themselves from `getProStatusSnapshot`).
 */
export function subscribeToProStatus(listener: ProStatusListener): () => void {
  proStatusListeners.add(listener);
  return () => {
    proStatusListeners.delete(listener);
  };
}

function notifyProStatus(): void {
  const status = getProStatusSnapshot();
  // Copy first: a listener that unsubscribes itself must not mutate the set
  // we're walking.
  for (const listener of [...proStatusListeners]) {
    try {
      listener(status);
    } catch (error) {
      console.log('[RevenueCat] pro status listener threw (silent):', error);
    }
  }
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
  notifyProStatus();
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

    // Registered at configure time, before the first fetch: every later change
    // the SDK learns about (renewal, expiry, a purchase on another device,
    // a refund) lands in the cache here and is pushed to subscribers by
    // updateCache. This is the only thing keeping long-lived screens honest.
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

    // Even when the prime failed the world changed: the SDK is usable now, so
    // anyone still showing "can't check" gets a nudge to ask again.
    notifyProStatus();
  } catch (error) {
    // Silent log - RevenueCat init failure is non-critical
    console.log('[RevenueCat] initializePurchases failed (silent):', error);
  }
}

/**
 * Resolve the entitlement, cheaply: a cached answer is returned as-is, and only
 * a cold cache costs a round trip. `unknown` means exactly that — the SDK isn't
 * up yet, or the call failed — never "free".
 */
export async function readProStatus(): Promise<ProStatus> {
  try {
    if (cachedIsPro !== null) {
      return cachedIsPro ? 'pro' : 'free';
    }
    if (!configured) return 'unknown';
    const customerInfo = await Purchases.getCustomerInfo();
    updateCache(customerInfo);
    return getProStatusSnapshot();
  } catch (error) {
    // Silent log - expected to fail in dev builds without proper signing
    console.log('[RevenueCat] readProStatus failed (silent):', error);
    return getProStatusSnapshot();
  }
}

/**
 * Ask the store again, ignoring every cached answer — this module's and
 * RevenueCat's own.
 *
 * `getCustomerInfo` alone is cache-aware: the SDK will happily hand back the
 * receipt state it fetched minutes ago, which is why a subscription bought on
 * another device, a refund, or a sandbox expiry could sit unnoticed. Only
 * `invalidateCustomerInfoCache` forces the network. That makes this the
 * expensive path — passive reads use `readProStatus`, this one runs behind an
 * explicit refresh (screen becoming visible, user tapping retry).
 *
 * Falls back to whatever the cache already knew, so an unreachable store never
 * grants Pro and never revokes it either.
 */
export async function forceRefreshProStatus(): Promise<ProStatus> {
  try {
    if (!configured) return getProStatusSnapshot();
    try {
      await Purchases.invalidateCustomerInfoCache();
    } catch (error) {
      // Invalidation is an optimisation, not a precondition — a failure here
      // just means the fetch below may be answered from the SDK's cache.
      console.log('[RevenueCat] invalidateCustomerInfoCache failed (silent):', error);
    }
    const customerInfo = await Purchases.getCustomerInfo();
    updateCache(customerInfo);
    return getProStatusSnapshot();
  } catch (error) {
    console.log('[RevenueCat] forceRefreshProStatus failed (silent):', error);
    return getProStatusSnapshot();
  }
}

/**
 * Boolean view of `readProStatus` for the gates: everything that isn't a
 * confirmed `pro` is treated as not entitled, which is the conservative answer
 * a gate wants. Copy must not use this — see ProStatus.
 */
export async function checkProStatus(): Promise<boolean> {
  return (await readProStatus()) === 'pro';
}

// There is deliberately no boolean wrapper over forceRefreshProStatus. Its two
// callers are the tap-time cap gates, and both need to tell a settled "free"
// apart from a check that still hasn't landed — collapsing that to a boolean is
// the bug this gate was fixed for.

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
  /** A subscription was found on this account, but it has lapsed. */
  | { status: 'expired' }
  /** This account has never had a subscription to restore. */
  | { status: 'nothing_to_restore' }
  | { status: 'error'; category: PurchaseErrorCategory };

/**
 * Did this account ever hold the subscription, whatever its state today?
 *
 * Restore answers "is it active" but the user asked "where did my subscription
 * go", and those need different copy: "nothing was ever bought here" is a wrong
 * and slightly insulting thing to tell someone whose plan simply ran out. Any
 * one of these is proof of a past purchase — the entitlement record survives
 * expiry, and so do the purchase/expiration ledgers.
 */
function hasLapsedSubscription(customerInfo: CustomerInfo): boolean {
  if (customerInfo.entitlements.all[PRO_ENTITLEMENT_ID] !== undefined) return true;
  if (customerInfo.latestExpirationDate !== null) return true;
  return customerInfo.allPurchasedProductIdentifiers.length > 0;
}

/**
 * Restore previous purchases from the App Store / Play Store.
 * Distinguishes "restored" from "expired" from "nothing on this account" from
 * "it broke", because App Review checks that each of those is surfaced to the
 * user — and because the caller reconciles its card off this result in both
 * directions: a restore that finds nothing active must clear a stale "Active".
 */
export async function restorePurchases(): Promise<RestoreResult> {
  try {
    if (!configured) return { status: 'error', category: 'unknown' };
    const customerInfo = await Purchases.restorePurchases();
    updateCache(customerInfo);
    if (customerInfo.entitlements.active[PRO_ENTITLEMENT_ID] !== undefined) {
      return { status: 'restored' };
    }
    return hasLapsedSubscription(customerInfo)
      ? { status: 'expired' }
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
