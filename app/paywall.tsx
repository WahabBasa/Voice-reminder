import React, { useState, useEffect, useRef, useCallback } from "react";
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    ScrollView,
    ActivityIndicator,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import * as Linking from "expo-linking";
import { colors, scaleFontSize, shadows } from "../lib/theme";
import AppIcon from "../components/AppIcon";
import { useToast } from "../components/ToastProvider";
import Purchases, { PurchasesPackage } from "react-native-purchases";
import {
    categorizePurchasesError,
    isPurchasesConfigured,
    restorePurchases,
    PRIVACY_POLICY_URL,
    PRO_PRODUCT_NAME,
    TERMS_OF_USE_URL,
    type PurchaseErrorCategory,
} from "../lib/purchases";
import { getFreeActiveLimit } from "../lib/usageGate";

// Pro gates exactly one thing today: the active-reminder limit in lib/usageGate.ts.
// Everything listed here has to be true of the build that ships (App Review 3.1.1/3.1.2).
const BENEFITS = [
    `Unlimited active reminders (free stops at ${getFreeActiveLimit()})`,
    "Voice capture that sets the time and repeat for you",
    "Alarms that speak the reminder out loud",
    "Supports a solo developer building this",
];

const ERROR_COPY: Record<Exclude<PurchaseErrorCategory, "cancelled">, string> = {
    network: "No connection to the App Store. Check your internet and try again.",
    not_allowed: "Purchases aren't allowed on this device. Check Screen Time restrictions.",
    already_owned: "You already own this subscription — tap Restore Purchases.",
    payment_pending: "Your purchase is awaiting approval. Pro unlocks once it goes through.",
    store_problem: "The App Store is having trouble right now. Please try again shortly.",
    unknown: "Something went wrong. Please try again.",
};

const PERIOD_UNIT_LABELS: Record<string, string> = { D: "day", W: "week", M: "month", Y: "year" };
const PERIOD_UNIT_MONTHS: Record<string, number> = { D: 1 / 30, W: 1 / 4.345, M: 1, Y: 12 };

const PACKAGE_TYPE_TERMS: Record<string, string> = {
    WEEKLY: "week",
    MONTHLY: "month",
    TWO_MONTH: "2 months",
    THREE_MONTH: "3 months",
    SIX_MONTH: "6 months",
    ANNUAL: "year",
};

/** Parses an ISO 8601 billing period ("P1M", "P6M") off the store product. */
function parsePeriod(pkg: PurchasesPackage): { count: number; unit: string } | null {
    const match = /^P(\d+)([DWMY])$/.exec(pkg.product.subscriptionPeriod ?? "");
    if (!match) return null;
    return { count: Number(match[1]), unit: match[2] };
}

/** Billing term as words: "month", "year", "6 months". Store data first, package type as fallback. */
function getTermLabel(pkg: PurchasesPackage): string {
    const parsed = parsePeriod(pkg);
    const unit = parsed ? PERIOD_UNIT_LABELS[parsed.unit] : undefined;
    if (parsed && unit) {
        return parsed.count === 1 ? unit : `${parsed.count} ${unit}s`;
    }
    return PACKAGE_TYPE_TERMS[pkg.packageType] ?? "billing period";
}

/** Price normalised to one month, so plans on different terms can be compared. */
function getMonthlyRate(pkg: PurchasesPackage): number | null {
    const parsed = parsePeriod(pkg);
    const months = parsed ? parsed.count * (PERIOD_UNIT_MONTHS[parsed.unit] ?? 0) : 0;
    if (!months || !Number.isFinite(pkg.product.price) || pkg.product.price <= 0) return null;
    return pkg.product.price / months;
}

/**
 * Real savings against the priciest plan on offer, rounded down to a whole percent.
 * Returns null when we can't prove a saving — we don't advertise numbers we can't back up.
 */
function getSavingsPercent(pkg: PurchasesPackage, all: PurchasesPackage[]): number | null {
    const rate = getMonthlyRate(pkg);
    if (rate === null) return null;

    const rates = all.map(getMonthlyRate).filter((r): r is number => r !== null);
    const baseline = rates.length > 0 ? Math.max(...rates) : 0;
    if (baseline <= 0) return null;

    const percent = Math.floor((1 - rate / baseline) * 100);
    return percent >= 5 ? percent : null;
}

/**
 * Auto-renewal disclosure required by Apple's Schedule 2 §3.8(b): product name,
 * price, term, when the account is charged, and how to cancel.
 */
function buildDisclosure(pkg: PurchasesPackage | null): string {
    if (!pkg) {
        return `${PRO_PRODUCT_NAME} is an auto-renewing subscription. Payment is charged to your Apple Account at confirmation of purchase and renews automatically until canceled. Manage or cancel anytime in Settings > Apple Account > Subscriptions.`;
    }

    const term = getTermLabel(pkg);
    const price = pkg.product.priceString;
    return `${PRO_PRODUCT_NAME} is ${price} every ${term}. Payment is charged to your Apple Account at confirmation of purchase. It renews automatically for ${price} every ${term}, and your account is charged within 24 hours before each renewal, unless auto-renew is turned off at least 24 hours before the current period ends. Manage or cancel anytime in Settings > Apple Account > Subscriptions.`;
}

export default function PaywallScreen() {
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const toast = useToast();

    // RevenueCat state
    const [packages, setPackages] = useState<PurchasesPackage[]>([]);
    const [selectedPackage, setSelectedPackage] = useState<PurchasesPackage | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isPurchasing, setIsPurchasing] = useState(false);
    const [isRestoring, setIsRestoring] = useState(false);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    // Footer height drives scroll padding + banner offset, so the disclosure block
    // can grow without anything ending up underneath it.
    const [footerHeight, setFooterHeight] = useState(240);
    const errorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const showError = useCallback((message: string) => {
        if (errorTimerRef.current) clearTimeout(errorTimerRef.current);
        setErrorMessage(message);
        // Auto-dismiss after 5 seconds
        errorTimerRef.current = setTimeout(() => setErrorMessage(null), 5000);
    }, []);

    useEffect(() => {
        return () => {
            if (errorTimerRef.current) clearTimeout(errorTimerRef.current);
        };
    }, []);

    // Fetch offerings on mount
    useEffect(() => {
        const fetchOfferings = async () => {
            try {
                // No API key for this platform means the SDK was never configured;
                // calling it just throws. Fall straight through to the empty state.
                if (!isPurchasesConfigured()) {
                    return;
                }

                const res = await Purchases.getOfferings();
                console.log("[RevenueCat] Offerings response received");

                // Try current offering first, then fall back to any available offering
                let availablePackages = res.current?.availablePackages ?? [];

                // If no current offering, try to find any offering with packages
                if (availablePackages.length === 0 && res.all) {
                    const offeringKeys = Object.keys(res.all);
                    console.log("[RevenueCat] Available offering keys:", offeringKeys);
                    for (const key of offeringKeys) {
                        const offering = res.all[key];
                        if (offering?.availablePackages?.length > 0) {
                            availablePackages = offering.availablePackages;
                            console.log("[RevenueCat] Using offering:", key, "with", availablePackages.length, "packages");
                            break;
                        }
                    }
                }

                console.log("[RevenueCat] Total packages found:", availablePackages.length);
                setPackages(availablePackages);

                // Auto-select first package (or monthly if available)
                if (availablePackages.length > 0) {
                    const monthlyPkg = availablePackages.find(
                        pkg => pkg.packageType === "MONTHLY" || pkg.identifier.includes("monthly")
                    );
                    const selected = monthlyPkg ?? availablePackages[0];
                    setSelectedPackage(selected);
                    console.log("[RevenueCat] Selected package:", selected.identifier);
                }
            } catch (error) {
                // Log silently - the empty state UI will handle this gracefully
                console.log("[RevenueCat] Error fetching offerings (silent):", error);
            } finally {
                setIsLoading(false);
            }
        };

        fetchOfferings();
    }, []);

    const handleBack = () => {
        router.back();
    };

    // Real purchase flow using RevenueCat
    const handlePurchase = async () => {
        if (!selectedPackage) {
            toast.show({
                title: "Error",
                message: "Please select a plan.",
                type: "error",
            });
            return;
        }

        setIsPurchasing(true);

        try {
            const { customerInfo } = await Purchases.purchasePackage(selectedPackage);
            console.log("[RevenueCat] Purchase complete. Entitlements:", customerInfo.entitlements.active);

            // Check if pro entitlement is now active
            if (customerInfo.entitlements.active["pro"]) {
                toast.show({
                    title: "Pro Activated! 🎉",
                    message: `Welcome to ${PRO_PRODUCT_NAME}!`,
                    type: "success",
                });
                router.back();
            } else {
                toast.show({
                    title: "Purchase Complete",
                    message: "Thank you for subscribing!",
                    type: "success",
                });
                router.back();
            }
        } catch (error: unknown) {
            const category = categorizePurchasesError(error);
            if (category === "cancelled") {
                // Expected traffic — the user backed out of the sheet. Say nothing.
                console.log("[RevenueCat] User cancelled purchase");
            } else {
                // Log silently, show inline error banner (not toast)
                console.log("[RevenueCat] Purchase error (silent):", category, error);
                showError(ERROR_COPY[category]);
            }
        } finally {
            setIsPurchasing(false);
        }
    };

    // Required by App Review 3.1.1: a subscriber reinstalling must be able to
    // get their entitlement back without paying again.
    const handleRestore = async () => {
        if (isRestoring || isPurchasing) return;
        setIsRestoring(true);

        const result = await restorePurchases();

        if (result.status === "restored") {
            toast.show({
                title: "Purchases Restored",
                message: `${PRO_PRODUCT_NAME} is active on this device again.`,
                type: "success",
            });
            setIsRestoring(false);
            router.back();
            return;
        }

        if (result.status === "nothing_to_restore") {
            toast.show({
                title: "Nothing to Restore",
                message: "No previous subscription was found for this Apple Account.",
                type: "info",
            });
        } else {
            showError(ERROR_COPY[result.category === "cancelled" ? "unknown" : result.category]);
        }

        setIsRestoring(false);
    };

    const handleOpenLink = async (url: string) => {
        try {
            await Linking.openURL(url);
        } catch (e) {
            showError("Couldn't open that link. Please try again.");
        }
    };

    // Helper to get display info from package
    const getPackageDisplayInfo = (pkg: PurchasesPackage) => {
        const product = pkg.product;
        const term = getTermLabel(pkg);
        const savings = getSavingsPercent(pkg, packages);

        // Clean up title - remove app name suffix
        let title = product.title;
        if (title.includes("(")) {
            title = title.split("(")[0].trim();
        }

        return {
            title,
            price: product.priceString,
            period: `/${term}`,
            description: savings
                ? `Billed every ${term} · save ${savings}%`
                : `Billed every ${term}`,
            tag: savings ? "Best Value" : (pkg.packageType === "MONTHLY" ? "Most Popular" : null),
            isPopular: pkg.packageType === "MONTHLY",
        };
    };

    return (
        <View style={styles.container}>
            <SafeAreaView style={{ flex: 1 }} edges={["top"]}>
                <View style={styles.header}>
                    <TouchableOpacity
                        onPress={handleBack}
                        style={styles.closeButton}
                        activeOpacity={0.7}
                    >
                        <AppIcon name="x" size={24} color={colors.textPrimary} />
                    </TouchableOpacity>
                </View>

                <ScrollView
                    showsVerticalScrollIndicator={false}
                    contentContainerStyle={[
                        styles.scrollContent,
                        { paddingBottom: footerHeight + 24 },
                    ]}
                >
                    <View style={styles.heroSection}>
                        <View style={styles.iconContainer}>
                            <AppIcon name="crown" size={48} color={colors.accent} />
                        </View>
                        <Text style={styles.title}>Unlock Pro Access</Text>
                        <Text style={styles.subtitle}>
                            The free plan keeps {getFreeActiveLimit()} reminders active at a time. Pro lifts the
                            cap so you can schedule as many as you need.
                        </Text>
                    </View>

                    <View style={styles.benefitsSection}>
                        {BENEFITS.map((benefit, index) => (
                            <View key={index} style={styles.benefitItem}>
                                <View style={styles.checkContainer}>
                                    <AppIcon name="check" size={14} color="white" />
                                </View>
                                <Text style={styles.benefitText}>{benefit}</Text>
                            </View>
                        ))}
                    </View>

                    <View style={styles.plansSection}>
                        {isLoading ? (
                            <View style={styles.loadingContainer}>
                                <ActivityIndicator size="large" color={colors.accent} />
                                <Text style={styles.loadingText}>Loading plans...</Text>
                            </View>
                        ) : packages.length > 0 ? (
                            packages.map((pkg) => {
                                const plan = getPackageDisplayInfo(pkg);
                                const isSelected = selectedPackage?.identifier === pkg.identifier;

                                return (
                                    <TouchableOpacity
                                        key={pkg.identifier}
                                        style={[
                                            styles.planCard,
                                            plan.isPopular && styles.planCardHighlighted,
                                            isSelected && styles.planCardSelected,
                                        ]}
                                        onPress={() => {
                                            console.log("[Paywall] Selected:", pkg.identifier);
                                            setSelectedPackage(pkg);
                                        }}
                                        activeOpacity={0.8}
                                    >
                                        {plan.tag && (
                                            <View
                                                style={[
                                                    styles.tag,
                                                    plan.isPopular ? styles.tagActive : styles.tagInactive,
                                                ]}
                                            >
                                                <Text
                                                    style={[
                                                        styles.tagText,
                                                        plan.isPopular && styles.tagTextActive,
                                                    ]}
                                                >
                                                    {plan.tag}
                                                </Text>
                                            </View>
                                        )}
                                        <View style={styles.planCardHeader}>
                                            <View style={styles.planInfo}>
                                                <Text style={styles.planTitle}>{plan.title}</Text>
                                                <Text style={styles.planDescription}>{plan.description}</Text>
                                            </View>
                                            <View style={styles.priceContainer}>
                                                <Text style={styles.planPrice}>{plan.price}</Text>
                                                <Text style={styles.planPeriod}>{plan.period}</Text>
                                            </View>
                                        </View>
                                        {isSelected && (
                                            <View style={styles.selectedIndicator}>
                                                <AppIcon name="check" size={16} color="white" />
                                            </View>
                                        )}
                                    </TouchableOpacity>
                                );
                            })
                        ) : (
                            <View style={styles.errorContainer}>
                                <AppIcon name="info" size={32} color={colors.textSecondary} />
                                <Text style={styles.errorText}>No plans available</Text>
                                <Text style={styles.errorSubtext}>Please check your connection and try again.</Text>
                            </View>
                        )}
                    </View>
                </ScrollView>
            </SafeAreaView>

            {/* Error banner - appears above footer */}
            {errorMessage && (
                <View style={[styles.errorBanner, { bottom: footerHeight + 12 }]}>
                    <AppIcon name="info" size={18} color={colors.destructive} />
                    <Text style={styles.errorBannerText}>{errorMessage}</Text>
                    <TouchableOpacity onPress={() => setErrorMessage(null)} hitSlop={{ top: 10, right: 10, bottom: 10, left: 10 }}>
                        <AppIcon name="x" size={16} color={colors.textTertiary} />
                    </TouchableOpacity>
                </View>
            )}

            <View
                style={[styles.footer, { paddingBottom: insets.bottom + 16 }]}
                onLayout={(e) => setFooterHeight(e.nativeEvent.layout.height)}
            >
                <TouchableOpacity
                    style={[
                        styles.continueButton,
                        (isPurchasing || isRestoring || !selectedPackage || packages.length === 0) &&
                            styles.continueButtonDisabled,
                    ]}
                    onPress={handlePurchase}
                    activeOpacity={0.8}
                    disabled={isPurchasing || isRestoring || !selectedPackage || packages.length === 0}
                >
                    {isPurchasing ? (
                        <ActivityIndicator color="white" />
                    ) : (
                        <Text style={styles.continueButtonText}>
                            {selectedPackage
                                ? `Subscribe for ${selectedPackage.product.priceString} / ${getTermLabel(selectedPackage)}`
                                : "Select a plan"}
                        </Text>
                    )}
                </TouchableOpacity>

                <TouchableOpacity
                    style={styles.restoreButton}
                    onPress={handleRestore}
                    activeOpacity={0.7}
                    disabled={isRestoring || isPurchasing}
                >
                    {isRestoring ? (
                        <View style={styles.restoreRow}>
                            <ActivityIndicator size="small" color={colors.textSecondary} />
                            <Text style={styles.restoreText}>Restoring…</Text>
                        </View>
                    ) : (
                        <Text style={styles.restoreText}>Restore Purchases</Text>
                    )}
                </TouchableOpacity>

                <Text style={styles.disclosureText}>{buildDisclosure(selectedPackage)}</Text>

                <View style={styles.legalLinks}>
                    <TouchableOpacity onPress={() => handleOpenLink(TERMS_OF_USE_URL)} activeOpacity={0.7}>
                        <Text style={styles.legalLinkText}>Terms of Use</Text>
                    </TouchableOpacity>
                    <Text style={styles.legalSeparator}>·</Text>
                    <TouchableOpacity onPress={() => handleOpenLink(PRIVACY_POLICY_URL)} activeOpacity={0.7}>
                        <Text style={styles.legalLinkText}>Privacy Policy</Text>
                    </TouchableOpacity>
                </View>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: colors.background,
    },
    header: {
        height: 60,
        justifyContent: "center",
        paddingHorizontal: 20,
    },
    closeButton: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: colors.surface,
        alignItems: "center",
        justifyContent: "center",
    },
    scrollContent: {
        paddingHorizontal: 24,
        paddingTop: 10,
    },
    heroSection: {
        alignItems: "center",
        marginBottom: 32,
    },
    iconContainer: {
        width: 90,
        height: 90,
        borderRadius: 30,
        backgroundColor: colors.accent + "15",
        alignItems: "center",
        justifyContent: "center",
        marginBottom: 20,
    },
    title: {
        fontSize: scaleFontSize(28),
        fontWeight: "800",
        color: colors.textHeading,
        textAlign: "center",
        marginBottom: 12,
    },
    subtitle: {
        fontSize: scaleFontSize(16),
        color: colors.textSecondary,
        textAlign: "center",
        lineHeight: 24,
        paddingHorizontal: 10,
    },
    benefitsSection: {
        backgroundColor: colors.surface,
        borderRadius: 20,
        padding: 20,
        marginBottom: 32,
    },
    benefitItem: {
        flexDirection: "row",
        alignItems: "center",
        marginBottom: 14,
    },
    checkContainer: {
        width: 22,
        height: 22,
        borderRadius: 11,
        backgroundColor: colors.accent,
        alignItems: "center",
        justifyContent: "center",
        marginRight: 12,
    },
    benefitText: {
        fontSize: scaleFontSize(15),
        fontWeight: "600",
        color: colors.textPrimary,
    },
    plansSection: {
        gap: 16,
    },
    planCard: {
        backgroundColor: colors.card,
        borderRadius: 18,
        padding: 20,
        borderWidth: 2,
        borderColor: colors.border,
        position: "relative",
        ...shadows.card,
    },
    planCardHighlighted: {
        borderColor: colors.accent,
        backgroundColor: colors.accent + "08",
    },
    planCardSelected: {
        borderColor: colors.accent,
        backgroundColor: colors.accent + "10",
    },
    planCardHeader: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
    },
    planInfo: {
        flex: 1,
        marginRight: 12,
    },
    planTitle: {
        fontSize: scaleFontSize(18),
        fontWeight: "700",
        color: colors.textHeading,
        marginBottom: 4,
    },
    planDescription: {
        fontSize: scaleFontSize(13),
        color: colors.textSecondary,
    },
    priceContainer: {
        alignItems: "flex-end",
    },
    planPrice: {
        fontSize: scaleFontSize(20),
        fontWeight: "800",
        color: colors.textHeading,
    },
    planPeriod: {
        fontSize: scaleFontSize(12),
        color: colors.textTertiary,
    },
    tag: {
        position: "absolute",
        top: -12,
        right: 20,
        paddingHorizontal: 12,
        paddingVertical: 4,
        borderRadius: 999,
    },
    tagInactive: {
        backgroundColor: colors.surfaceAlt,
    },
    tagActive: {
        backgroundColor: colors.accent,
    },
    tagText: {
        fontSize: scaleFontSize(11),
        fontWeight: "800",
        color: colors.textSecondary,
        textTransform: "uppercase",
    },
    tagTextActive: {
        color: "white",
    },
    selectedIndicator: {
        position: "absolute",
        bottom: -10,
        right: -10,
        width: 28,
        height: 28,
        borderRadius: 14,
        backgroundColor: colors.accent,
        alignItems: "center",
        justifyContent: "center",
        borderWidth: 3,
        borderColor: colors.background,
    },
    footer: {
        position: "absolute",
        bottom: 0,
        left: 0,
        right: 0,
        paddingTop: 16,
        paddingHorizontal: 24,
        backgroundColor: colors.background,
        borderTopWidth: 1,
        borderTopColor: colors.border,
    },
    restoreButton: {
        alignItems: "center",
        justifyContent: "center",
        paddingVertical: 12,
    },
    restoreRow: {
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
    },
    restoreText: {
        fontSize: scaleFontSize(15),
        fontWeight: "600",
        color: colors.textSecondary,
    },
    disclosureText: {
        fontSize: scaleFontSize(11),
        lineHeight: 15,
        color: colors.textTertiary,
        textAlign: "center",
    },
    legalLinks: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        marginTop: 10,
    },
    legalLinkText: {
        fontSize: scaleFontSize(12),
        fontWeight: "600",
        color: colors.textSecondary,
        textDecorationLine: "underline",
    },
    legalSeparator: {
        fontSize: scaleFontSize(12),
        color: colors.textTertiary,
    },
    continueButton: {
        backgroundColor: colors.accent,
        borderRadius: 16,
        height: 60,
        alignItems: "center",
        justifyContent: "center",
        shadowColor: colors.accent,
        shadowOpacity: 0.3,
        shadowRadius: 10,
        shadowOffset: { width: 0, height: 4 },
        elevation: 6,
    },
    continueButtonDisabled: {
        opacity: 0.6,
    },
    continueButtonText: {
        fontSize: scaleFontSize(18),
        fontWeight: "700",
        color: "white",
    },
    loadingContainer: {
        padding: 40,
        alignItems: "center",
        justifyContent: "center",
    },
    loadingText: {
        marginTop: 12,
        fontSize: scaleFontSize(14),
        color: colors.textSecondary,
    },
    errorContainer: {
        padding: 40,
        alignItems: "center",
        justifyContent: "center",
    },
    errorText: {
        marginTop: 12,
        fontSize: scaleFontSize(16),
        fontWeight: "600",
        color: colors.textSecondary,
    },
    errorSubtext: {
        marginTop: 8,
        fontSize: scaleFontSize(14),
        color: colors.textTertiary,
        textAlign: "center",
    },
    errorBanner: {
        position: "absolute",
        alignSelf: "center",
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
        backgroundColor: colors.surface,
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderRadius: 16,
        shadowColor: "#000",
        shadowOpacity: 0.08,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 4 },
        elevation: 4,
    },
    errorBannerText: {
        fontSize: scaleFontSize(14),
        fontWeight: "500",
        color: colors.destructive,
    },
});
