import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
    ActivityIndicator,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { colors, scaleFontSize } from "../lib/theme";
import { FONT_DISPLAY_REGULAR } from "../lib/fonts";
import AppIcon from "../components/AppIcon";
import { useToast } from "../components/ToastProvider";
import Purchases, { PurchasesPackage } from "react-native-purchases";
import {
    categorizePurchasesError,
    isPurchasesConfigured,
    restorePurchases,
    PRO_ENTITLEMENT_ID,
    PRO_PRODUCT_NAME,
    type PurchaseErrorCategory,
} from "../lib/purchases";
// Schedule 2 §3.8(b): both links have to work from the purchase screen. Same
// constants Settings and the consent card use — opened from ClosingBlock.
import { openInAppBrowser } from "../lib/legalLinks";
import {
    PAYWALL_COPY,
    buildCtaLabel,
    buildDisclosure,
    buildHonestyCaption,
    describePlan,
    resolvePaywallContext,
    selectPlanPair,
    type PlanCopy,
} from "../lib/paywallContent";
import PaywallHero from "../components/paywall/PaywallHero";
import PricingCards from "../components/paywall/PricingCards";
import FeatureTable from "../components/paywall/FeatureTable";
import ClosingBlock from "../components/paywall/ClosingBlock";
import { AwardBadgeRow, ProofCarousel, TestimonialWall } from "../components/paywall/ProofSlots";
import { PAYWALL_GUTTER, paywallColors, paywallWeight } from "../components/paywall/paywallTheme";

const ERROR_COPY: Record<Exclude<PurchaseErrorCategory, "cancelled">, string> = {
    network: "No connection to the App Store. Check your internet and try again.",
    not_allowed: "Purchases aren't allowed on this device. Check Screen Time restrictions.",
    already_owned: "You already own this subscription — tap Restore purchase.",
    payment_pending: "Your purchase is awaiting approval. Pro unlocks once it goes through.",
    store_problem: "The App Store is having trouble right now. Please try again shortly.",
    unknown: "Something went wrong. Please try again.",
};

export default function PaywallScreen() {
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const toast = useToast();
    // Whoever opened this says why (`?context=interval` from the premium
    // schedule gate); anything else falls back to the general hero.
    const params = useLocalSearchParams<{ context?: string }>();
    const paywallContext = resolvePaywallContext(params.context);

    // RevenueCat state
    const [packages, setPackages] = useState<PurchasesPackage[]>([]);
    const [selectedPackage, setSelectedPackage] = useState<PurchasesPackage | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isPurchasing, setIsPurchasing] = useState(false);
    const [isRestoring, setIsRestoring] = useState(false);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    // Footer height drives scroll padding + banner offset, so the honesty caption
    // can grow without anything ending up underneath it.
    const [footerHeight, setFooterHeight] = useState(150);
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

                // Preselect the annual plan: it's the one carrying the trial, and the
                // CTA promises a trial. Monthly is the anchor, not the default.
                const { monthly, annual } = selectPlanPair(availablePackages);
                const preselected = annual ?? monthly ?? availablePackages[0] ?? null;
                if (preselected) {
                    setSelectedPackage(preselected);
                    console.log("[RevenueCat] Selected package:", preselected.identifier);
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

    const { monthlyPlan, annualPlan } = useMemo(() => {
        const { monthly, annual } = selectPlanPair(packages);
        return {
            monthlyPlan: monthly ? describePlan(monthly) : null,
            annualPlan: annual ? describePlan(annual) : null,
        };
    }, [packages]);

    // What the sticky CTA is actually buying right now.
    const selectedPlan: PlanCopy | null = useMemo(() => {
        if (!selectedPackage) return null;
        if (monthlyPlan?.pkg.identifier === selectedPackage.identifier) return monthlyPlan;
        if (annualPlan?.pkg.identifier === selectedPackage.identifier) return annualPlan;
        return describePlan(selectedPackage);
    }, [selectedPackage, monthlyPlan, annualPlan]);

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
            if (customerInfo.entitlements.active[PRO_ENTITLEMENT_ID]) {
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

    // In-app browser sheet: the user reads the terms and comes straight back to
    // the purchase they were making.
    const handleOpenLink = async (url: string) => {
        try {
            await openInAppBrowser(url);
        } catch (e) {
            showError("Couldn't open that link. Please try again.");
        }
    };

    const ctaDisabled = isPurchasing || isRestoring || !selectedPackage;
    const captionLines = buildHonestyCaption(selectedPlan);

    return (
        <View style={styles.container}>
            <ScrollView
                showsVerticalScrollIndicator={false}
                contentContainerStyle={{ paddingBottom: footerHeight + 24 }}
            >
                <PaywallHero topInset={insets.top} context={paywallContext} />

                {/* Proof slots (carousel, testimonials, badges) are flagged off
                    until real proof exists — each renders null for now. */}
                <ProofCarousel />

                <PricingCards
                    monthly={monthlyPlan}
                    annual={annualPlan}
                    selectedIdentifier={selectedPackage?.identifier ?? null}
                    onSelect={setSelectedPackage}
                    isLoading={isLoading}
                />

                <Text style={styles.affinityLine}>{PAYWALL_COPY.affinityLine}</Text>

                <TestimonialWall />

                <View style={styles.section}>
                    <FeatureTable />
                </View>

                <AwardBadgeRow />

                <View style={styles.section}>
                    <ClosingBlock
                        onRestore={handleRestore}
                        isRestoring={isRestoring}
                        busy={isRestoring || isPurchasing}
                        onOpenLink={handleOpenLink}
                        disclosure={buildDisclosure(selectedPackage, PRO_PRODUCT_NAME)}
                    />
                </View>
            </ScrollView>

            {/* Floating close — sits above the hero gradient at every scroll position. */}
            <TouchableOpacity
                onPress={handleBack}
                style={[styles.closeButton, { top: insets.top + 8 }]}
                activeOpacity={0.7}
                hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
                accessibilityRole="button"
                accessibilityLabel="Close"
            >
                <AppIcon name="x" size={20} color={paywallColors.ink} />
            </TouchableOpacity>

            {/* Error banner - appears above footer */}
            {errorMessage && (
                <View style={[styles.errorBanner, { bottom: footerHeight + 12 }]}>
                    <AppIcon name="info" size={18} color={colors.destructive} />
                    <Text style={styles.errorBannerText}>{errorMessage}</Text>
                    <TouchableOpacity onPress={() => setErrorMessage(null)} hitSlop={{ top: 10, right: 10, bottom: 10, left: 10 }}>
                        <AppIcon name="x" size={16} color={paywallColors.muted} />
                    </TouchableOpacity>
                </View>
            )}

            <View
                style={[styles.footer, { paddingBottom: insets.bottom + 12 }]}
                onLayout={(e) => setFooterHeight(e.nativeEvent.layout.height)}
            >
                <TouchableOpacity
                    style={[styles.cta, ctaDisabled && styles.ctaDisabled]}
                    onPress={handlePurchase}
                    activeOpacity={0.85}
                    disabled={ctaDisabled}
                    accessibilityRole="button"
                >
                    {isPurchasing ? (
                        <ActivityIndicator color="white" />
                    ) : (
                        <Text style={styles.ctaText}>{buildCtaLabel(selectedPlan)}</Text>
                    )}
                </TouchableOpacity>

                {/* Caption arrives as segments so the price run can carry the
                    weight — one ink, emphasis by bold, never by gray. */}
                {captionLines.map((line, lineIndex) => (
                    <Text key={lineIndex} style={styles.caption}>
                        {line.map((segment, segmentIndex) => (
                            <Text
                                key={segmentIndex}
                                style={segment.bold ? styles.captionStrong : undefined}
                            >
                                {segment.text}
                            </Text>
                        ))}
                    </Text>
                ))}
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: paywallColors.surface,
    },
    closeButton: {
        position: "absolute",
        right: PAYWALL_GUTTER,
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: "rgba(255, 255, 255, 0.7)",
        alignItems: "center",
        justifyContent: "center",
    },
    affinityLine: {
        marginTop: 34,
        marginBottom: 34,
        paddingHorizontal: PAYWALL_GUTTER + 10,
        fontFamily: FONT_DISPLAY_REGULAR,
        fontSize: scaleFontSize(20),
        lineHeight: scaleFontSize(29),
        color: paywallColors.ink,
        textAlign: "center",
    },
    section: {
        marginTop: 8,
        marginBottom: 34,
    },
    footer: {
        position: "absolute",
        bottom: 0,
        left: 0,
        right: 0,
        // No top rule: the footer floats on the same plain surface as the
        // scroll body, the way the reference paywall does it.
        paddingTop: 16,
        paddingHorizontal: PAYWALL_GUTTER,
        backgroundColor: paywallColors.surface,
    },
    cta: {
        height: 56,
        borderRadius: 999,
        backgroundColor: paywallColors.ink,
        alignItems: "center",
        justifyContent: "center",
    },
    ctaDisabled: {
        opacity: 0.4,
    },
    ctaText: {
        fontSize: scaleFontSize(16),
        fontWeight: paywallWeight.bold,
        color: "white",
    },
    caption: {
        marginTop: 8,
        fontSize: scaleFontSize(12),
        lineHeight: scaleFontSize(17),
        fontWeight: paywallWeight.regular,
        color: paywallColors.ink,
        textAlign: "center",
    },
    captionStrong: {
        fontWeight: paywallWeight.bold,
        color: paywallColors.ink,
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
        flexShrink: 1,
        fontSize: scaleFontSize(13),
        fontWeight: "500",
        color: colors.destructive,
    },
});
