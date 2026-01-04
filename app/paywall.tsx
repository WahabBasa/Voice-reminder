import React, { useState, useEffect } from "react";
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
import { colors, scaleFontSize, shadows } from "../lib/theme";
import AppIcon from "../components/AppIcon";
import { useToast } from "../components/ToastProvider";
import Purchases, { PurchasesPackage, PurchasesOfferings } from "react-native-purchases";

const BENEFITS = [
    "Unlimited voice reminders",
    "Custom notification sounds",
    "Advanced AI voice processing",
    "Priority storage & sync",
    "Zero ads forever",
];

export default function PaywallScreen() {
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const toast = useToast();

    // RevenueCat state
    const [packages, setPackages] = useState<PurchasesPackage[]>([]);
    const [selectedPackage, setSelectedPackage] = useState<PurchasesPackage | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isPurchasing, setIsPurchasing] = useState(false);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);

    // Fetch offerings on mount
    useEffect(() => {
        const fetchOfferings = async () => {
            try {
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
                    message: "Welcome to NoteToSelf Pro!",
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
        } catch (error: any) {
            // Check if user cancelled
            if (error.userCancelled) {
                console.log("[RevenueCat] User cancelled purchase");
            } else {
                // Log silently, show inline error banner (not toast)
                console.log("[RevenueCat] Purchase error (silent):", error);
                setErrorMessage("Something went wrong. Please try again.");
                // Auto-dismiss after 4 seconds
                setTimeout(() => setErrorMessage(null), 4000);
            }
        } finally {
            setIsPurchasing(false);
        }
    };

    // Helper to get display info from package
    const getPackageDisplayInfo = (pkg: PurchasesPackage) => {
        const product = pkg.product;
        const isAnnual = pkg.packageType === "ANNUAL";

        // Clean up title - remove app name suffix
        let title = product.title;
        if (title.includes("(")) {
            title = title.split("(")[0].trim();
        }

        return {
            title,
            price: product.priceString,
            period: isAnnual ? "/year" : "/month",
            description: isAnnual ? "Best value - save 48%" : "Most flexible plan",
            tag: isAnnual ? "Best Value" : (pkg.packageType === "MONTHLY" ? "Most Popular" : null),
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
                        { paddingBottom: insets.bottom + 160 },
                    ]}
                >
                    <View style={styles.heroSection}>
                        <View style={styles.iconContainer}>
                            <AppIcon name="crown" size={48} color={colors.accent} />
                        </View>
                        <Text style={styles.title}>Unlock Pro Access</Text>
                        <Text style={styles.subtitle}>
                            Take your productivity to the next level with our premium features.
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
                <View style={[styles.errorBanner, { bottom: 180 + insets.bottom }]}>
                    <AppIcon name="info" size={18} color={colors.destructive} />
                    <Text style={styles.errorBannerText}>{errorMessage}</Text>
                    <TouchableOpacity onPress={() => setErrorMessage(null)} hitSlop={{ top: 10, right: 10, bottom: 10, left: 10 }}>
                        <AppIcon name="x" size={16} color={colors.textTertiary} />
                    </TouchableOpacity>
                </View>
            )}

            <View style={[styles.footer, { paddingBottom: insets.bottom + 16 }]}>
                <Text style={styles.termsText}>
                    Secure payment via Google Play. Cancel anytime.
                </Text>
                <TouchableOpacity
                    style={[
                        styles.continueButton,
                        (isPurchasing || !selectedPackage || packages.length === 0) && styles.continueButtonDisabled,
                    ]}
                    onPress={handlePurchase}
                    activeOpacity={0.8}
                    disabled={isPurchasing || !selectedPackage || packages.length === 0}
                >
                    {isPurchasing ? (
                        <ActivityIndicator color="white" />
                    ) : (
                        <Text style={styles.continueButtonText}>
                            {selectedPackage
                                ? `Subscribe for ${selectedPackage.product.priceString}`
                                : "Select a plan"}
                        </Text>
                    )}
                </TouchableOpacity>
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
    termsText: {
        fontSize: scaleFontSize(12),
        color: colors.textTertiary,
        textAlign: "center",
        marginBottom: 16,
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
