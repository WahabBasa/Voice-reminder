import Purchases, { LOG_LEVEL, CustomerInfo, PurchasesPackage, PurchasesOfferings } from 'react-native-purchases';
import { Platform } from 'react-native';

// Placeholder keys - replace with actual RevenueCat API keys
const REVENUECAT_ANDROID_KEY = 'PLACEHOLDER_ANDROID_KEY';
const REVENUECAT_IOS_KEY = 'PLACEHOLDER_IOS_KEY';

/**
 * Initialize RevenueCat SDK on app start.
 * Call this once in the app layout.
 */
export async function initializePurchases(): Promise<void> {
  if (__DEV__) {
    Purchases.setLogLevel(LOG_LEVEL.DEBUG);
  }
  
  const apiKey = Platform.OS === 'ios' 
    ? REVENUECAT_IOS_KEY 
    : REVENUECAT_ANDROID_KEY;
    
  await Purchases.configure({ apiKey });
}

/**
 * Check if the current user has an active "pro" entitlement.
 * Returns true if user is a pro subscriber, false otherwise.
 */
export async function checkProStatus(): Promise<boolean> {
  try {
    const customerInfo = await Purchases.getCustomerInfo();
    return customerInfo.entitlements.active['pro'] !== undefined;
  } catch (error) {
    console.error('Error checking pro status:', error);
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
    console.error('Error restoring purchases:', error);
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
    console.error('Error fetching offerings:', error);
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
    console.error('Error purchasing package:', error);
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
    console.error('Error getting customer info:', error);
    return null;
  }
}
