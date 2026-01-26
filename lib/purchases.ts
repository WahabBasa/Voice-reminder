import Purchases, { LOG_LEVEL, CustomerInfo, PurchasesPackage, PurchasesOfferings } from 'react-native-purchases';
import { Platform } from 'react-native';

// RevenueCat API keys
const REVENUECAT_ANDROID_KEY = 'goog_CajJDmwNngamdqNKtBAJerwrxSV';
const REVENUECAT_IOS_KEY = 'PLACEHOLDER_IOS_KEY'; // Add iOS key when ready

/**
 * Initialize RevenueCat SDK on app start.
 * Call this once in the app layout.
 */
export async function initializePurchases(): Promise<void> {
  try {
    if (__DEV__) {
      Purchases.setLogLevel(LOG_LEVEL.DEBUG);
    }

    const apiKey = Platform.OS === 'ios'
      ? REVENUECAT_IOS_KEY
      : REVENUECAT_ANDROID_KEY;

    await Purchases.configure({ apiKey });
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
    const customerInfo = await Purchases.getCustomerInfo();
    return customerInfo.entitlements.active['pro'] !== undefined;
  } catch (error) {
    // Silent log - expected to fail in dev builds without proper signing
    console.log('[RevenueCat] checkProStatus failed (silent):', error);
    return false;
  }
}

/**
 * Restore previous purchases from the App Store / Play Store.
 * Returns true if pro entitlement was restored.
 */
export async function restorePurchases(): Promise<boolean> {
  try {
    const customerInfo = await Purchases.restorePurchases();
    return customerInfo.entitlements.active['pro'] !== undefined;
  } catch (error) {
    console.log('[RevenueCat] restorePurchases failed (silent):', error);
    return false;
  }
}

/**
 * Get available offerings (product packages) from RevenueCat.
 */
export async function getOfferings(): Promise<PurchasesOfferings | null> {
  try {
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
    return await Purchases.getCustomerInfo();
  } catch (error) {
    console.log('[RevenueCat] getCustomerInfo failed (silent):', error);
    return null;
  }
}
