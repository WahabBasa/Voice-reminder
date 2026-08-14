import { useCallback, useEffect, useRef } from "react";
import { BackHandler, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import BottomSheet, { BottomSheetBackdrop, BottomSheetView } from "@gorhom/bottom-sheet";
import { Portal } from "@gorhom/portal";
import { borderRadius, colors, scaleFontSize } from "../lib/theme";
import { FONT_DISPLAY } from "../lib/fonts";
import { AI_CONSENT_COPY, AI_CONSENT_LEARN_MORE_URL } from "../lib/aiConsent";
import { openInAppBrowser } from "../lib/legalLinks";

const ANIMATION_DURATION = 250;

export type AiConsentCardProps = {
    visible: boolean;
    /** "Allow" — the caller persists consent (and, on the record path, chains the mic prompt). */
    onAllow: () => void;
    /** Called on "Not now", backdrop tap, swipe-down and Android back. */
    onDecline: () => void;
    hostName?: string;
};

/**
 * Pre-permission card for the first recording (App Review 5.1.2(i)).
 *
 * Deliberately small: two sentences, one link, two buttons, no scrolling. The
 * wording lives in `lib/aiConsent.ts` so the copy and the consent path can't
 * drift apart.
 */
export default function AiConsentCard({
    visible,
    onAllow,
    onDecline,
    hostName = "root",
}: AiConsentCardProps) {
    const bottomSheetRef = useRef<BottomSheet>(null);

    useEffect(() => {
        if (visible) {
            bottomSheetRef.current?.snapToIndex(0);
        } else {
            bottomSheetRef.current?.close();
        }
    }, [visible]);

    // Backing out is a decline, not an allow.
    useEffect(() => {
        if (!visible) return;

        const backHandler = BackHandler.addEventListener("hardwareBackPress", () => {
            onDecline();
            return true;
        });

        return () => backHandler.remove();
    }, [visible, onDecline]);

    const renderBackdrop = useCallback(
        (props: any) => (
            <BottomSheetBackdrop
                {...props}
                disappearsOnIndex={-1}
                appearsOnIndex={0}
                opacity={0.25}
                pressBehavior="close"
            />
        ),
        []
    );

    const handleSheetChange = useCallback(
        (index: number) => {
            if (index === -1) {
                onDecline();
            }
        },
        [onDecline]
    );

    const handleAllow = useCallback(() => {
        onAllow();
        bottomSheetRef.current?.close();
    }, [onAllow]);

    // In-app browser sheet: reading the policy doesn't kick the user out of the app.
    const handleLearnMore = useCallback(() => {
        void openInAppBrowser(AI_CONSENT_LEARN_MORE_URL).catch(() => {});
    }, []);

    if (!visible) return null;

    return (
        <Portal hostName={hostName}>
            <BottomSheet
                ref={bottomSheetRef}
                index={0}
                enablePanDownToClose
                enableDynamicSizing
                animationConfigs={{ duration: ANIMATION_DURATION }}
                backdropComponent={renderBackdrop}
                onChange={handleSheetChange}
                handleIndicatorStyle={styles.handleIndicator}
                backgroundStyle={styles.sheetBackground}
            >
                <BottomSheetView style={styles.content}>
                    <Text style={styles.title}>{AI_CONSENT_COPY.title}</Text>
                    <Text style={styles.body}>
                        {AI_CONSENT_COPY.body}
                        {" "}
                        {AI_CONSENT_COPY.learnMorePrefix}
                        <Text style={styles.link} onPress={handleLearnMore}>
                            {AI_CONSENT_COPY.learnMoreLabel}
                        </Text>
                        {AI_CONSENT_COPY.learnMoreSuffix}
                    </Text>

                    <View style={styles.actions}>
                        <TouchableOpacity
                            style={styles.declineButton}
                            onPress={onDecline}
                            activeOpacity={0.7}
                        >
                            <Text style={styles.declineText}>{AI_CONSENT_COPY.declineLabel}</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={styles.allowButton}
                            onPress={handleAllow}
                            activeOpacity={0.7}
                        >
                            <Text style={styles.allowText}>{AI_CONSENT_COPY.allowLabel}</Text>
                        </TouchableOpacity>
                    </View>
                </BottomSheetView>
            </BottomSheet>
        </Portal>
    );
}

const styles = StyleSheet.create({
    handleIndicator: {
        backgroundColor: "#e0e0e0",
        width: 36,
    },
    sheetBackground: {
        backgroundColor: colors.background,
        borderTopLeftRadius: borderRadius.sheet,
        borderTopRightRadius: borderRadius.sheet,
    },
    content: {
        paddingHorizontal: 20,
        paddingBottom: 32,
    },
    title: {
        fontFamily: FONT_DISPLAY,
        fontSize: scaleFontSize(22),
        color: colors.textHeading,
        marginTop: 6,
        marginBottom: 8,
    },
    body: {
        fontSize: scaleFontSize(15),
        lineHeight: scaleFontSize(22),
        color: colors.textSecondary,
    },
    link: {
        color: colors.accent,
        fontWeight: "600",
    },

    actions: {
        flexDirection: "row",
        justifyContent: "space-between",
        marginTop: 24,
        gap: 12,
    },
    declineButton: {
        flex: 1,
        paddingVertical: 14,
        borderRadius: borderRadius.md,
        backgroundColor: colors.surfaceAlt,
        alignItems: "center",
    },
    declineText: {
        fontSize: scaleFontSize(15),
        fontWeight: "600",
        color: colors.textSecondary,
    },
    allowButton: {
        flex: 1,
        paddingVertical: 14,
        borderRadius: borderRadius.md,
        backgroundColor: colors.accent,
        alignItems: "center",
    },
    allowText: {
        fontSize: scaleFontSize(15),
        fontWeight: "600",
        color: "#ffffff",
    },
});
