import React, { useState } from "react";
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    ScrollView,
    Platform,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { colors, scaleFontSize, borderRadius, shadows } from "../lib/theme";
import AppIcon from "../components/AppIcon";
import { useToast } from "../components/ToastProvider";

const PLANS = [
    {
        id: "weekly",
        title: "Weekly",
        price: "$2.99",
        period: "/week",
        description: "Perfect for a quick start",
        tag: null,
    },
    {
        id: "monthly",
        title: "Monthly",
        price: "$7.99",
        period: "/month",
        description: "Our most flexible plan",
        tag: "Most Popular",
    },
    {
        id: "yearly",
        title: "Yearly",
        price: "$49.99",
        period: "/year",
        description: "Best value - save 50%",
        tag: "Best Value",
    },
];

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
    const [selectedPlan, setSelectedPlan] = useState("monthly");

    const handleBack = () => {
        router.back();
    };

    const handleContinue = () => {
        toast.show({
            title: "Pro Activated",
            message: `You've selected the ${selectedPlan} plan.`,
            type: "success",
        });
        router.back();
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
                        {PLANS.map((plan) => {
                            const isMonthly = plan.id === "monthly";
                            const isSelected = selectedPlan === plan.id;

                            return (
                                <TouchableOpacity
                                    key={plan.id}
                                    style={[
                                        styles.planCard,
                                        isMonthly && styles.planCardHighlighted,
                                        isSelected && !isMonthly && styles.planCardSelected,
                                    ]}
                                    onPress={() => setSelectedPlan(plan.id)}
                                    activeOpacity={0.9}
                                >
                                    {plan.tag && (
                                        <View
                                            style={[
                                                styles.tag,
                                                isMonthly
                                                    ? styles.tagActive
                                                    : styles.tagInactive,
                                            ]}
                                        >
                                            <Text
                                                style={[
                                                    styles.tagText,
                                                    isMonthly && styles.tagTextActive,
                                                ]}
                                            >
                                                {plan.tag}
                                            </Text>
                                        </View>
                                    )}
                                    <View style={styles.planCardHeader}>
                                        <View>
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
                        })}
                    </View>
                </ScrollView>
            </SafeAreaView>

            <View style={[styles.footer, { paddingBottom: insets.bottom + 16 }]}>
                <Text style={styles.termsText}>
                    Secure payment via App Store. Cancel anytime.
                </Text>
                <TouchableOpacity
                    style={styles.continueButton}
                    onPress={handleContinue}
                    activeOpacity={0.8}
                >
                    <Text style={styles.continueButtonText}>Continue</Text>
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
        backgroundColor: colors.accent + "05",
    },
    planCardSelected: {
        backgroundColor: colors.surface,
    },
    planCardHeader: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
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
    continueButtonText: {
        fontSize: scaleFontSize(18),
        fontWeight: "700",
        color: "white",
    },
});
