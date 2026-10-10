import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import BottomSheet, { BottomSheetBackdrop, BottomSheetView } from "@gorhom/bottom-sheet";
import { Portal } from "@gorhom/portal";
import ScrollSelector from "./ScrollSelector";
import { borderRadius, colors, scaleFontSize } from "../lib/theme";
import { FONT_DISPLAY } from "../lib/fonts";
import { t } from "../lib/i18n";
import { LANGUAGE_OPTIONS, indexOfLanguage } from "../lib/appLanguage";

const ITEM_HEIGHT = 44;
const WHEEL_HEIGHT = ITEM_HEIGHT * 5;

export type LanguageSheetProps = {
    visible: boolean;
    /** The language the wheel opens on (the pick, else the device's). */
    initialCode: string;
    /** The button under the wheel: "Continue" on first run, "Done" in Settings. */
    confirmLabel: string;
    onConfirm: (code: string) => void;
    /** Backdrop tap, swipe-down: nothing is saved. */
    onDismiss: () => void;
    hostName?: string;
};

/**
 * The language wheel (Settings › Language, and the first-run step before the
 * first recording). Every language Remi knows, each in its own name, with the
 * current one preselected. The pick sets both the UI language and the voice
 * hint (lib/appLanguage.ts `chooseAppLanguage`) — the caller does that.
 */
export default function LanguageSheet({
    visible,
    initialCode,
    confirmLabel,
    onConfirm,
    onDismiss,
    hostName = "root",
}: LanguageSheetProps) {
    const bottomSheetRef = useRef<BottomSheet>(null);
    const [index, setIndex] = useState(() => indexOfLanguage(initialCode));
    const confirmedRef = useRef(false);

    // Re-centre on the current language every time the sheet opens.
    useEffect(() => {
        if (visible) {
            confirmedRef.current = false;
            setIndex(indexOfLanguage(initialCode));
        }
    }, [visible, initialCode]);

    const names = useMemo(() => LANGUAGE_OPTIONS.map((option) => option.endonym), []);

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
        (sheetIndex: number) => {
            if (sheetIndex === -1 && !confirmedRef.current) onDismiss();
        },
        [onDismiss]
    );

    const handleConfirm = useCallback(() => {
        confirmedRef.current = true;
        onConfirm(LANGUAGE_OPTIONS[index]?.code ?? "en");
        bottomSheetRef.current?.close();
    }, [index, onConfirm]);

    if (!visible) return null;

    return (
        <Portal hostName={hostName}>
            <BottomSheet
                ref={bottomSheetRef}
                index={0}
                enablePanDownToClose
                // The wheel scrolls; the sheet only drags by its handle.
                enableContentPanningGesture={false}
                enableDynamicSizing
                backdropComponent={renderBackdrop}
                onChange={handleSheetChange}
                handleIndicatorStyle={styles.handleIndicator}
                backgroundStyle={styles.sheetBackground}
            >
                <BottomSheetView style={styles.content}>
                    <Text style={styles.title}>{t("language.sheet.title")}</Text>
                    <Text style={styles.subtitle}>{t("language.sheet.subtitle")}</Text>

                    <View style={styles.wheel} testID="language-wheel">
                        <ScrollSelector
                            dataSource={names}
                            selectedIndex={index}
                            onValueChange={(_, next) => setIndex(next)}
                            itemHeight={ITEM_HEIGHT}
                            wrapperHeight={WHEEL_HEIGHT}
                            wrapperWidth="100%"
                            renderItem={(item, _i, isSelected) => (
                                <Text
                                    style={[styles.item, isSelected && styles.itemSelected]}
                                    numberOfLines={1}
                                    adjustsFontSizeToFit
                                    minimumFontScale={0.75}
                                >
                                    {item}
                                </Text>
                            )}
                        />
                    </View>

                    <TouchableOpacity
                        style={styles.confirmButton}
                        onPress={handleConfirm}
                        activeOpacity={0.7}
                        accessibilityRole="button"
                        accessibilityHint={LANGUAGE_OPTIONS[index]?.endonym}
                        testID="language-confirm"
                    >
                        <Text
                            style={styles.confirmText}
                            numberOfLines={1}
                            adjustsFontSizeToFit
                            minimumFontScale={0.75}
                        >
                            {confirmLabel}
                        </Text>
                    </TouchableOpacity>
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
        lineHeight: scaleFontSize(27),
        color: colors.textHeading,
        marginTop: 6,
        marginBottom: 8,
    },
    subtitle: {
        fontSize: scaleFontSize(15),
        lineHeight: scaleFontSize(22),
        color: colors.textSecondary,
    },
    wheel: {
        marginTop: 16,
        alignItems: "center",
    },
    item: {
        fontSize: scaleFontSize(20),
        color: colors.textTertiary,
        paddingHorizontal: 12,
    },
    itemSelected: {
        color: colors.textPrimary,
        fontWeight: "600",
    },
    confirmButton: {
        marginTop: 20,
        paddingVertical: 14,
        borderRadius: borderRadius.md,
        backgroundColor: colors.accent,
        alignItems: "center",
    },
    confirmText: {
        fontSize: scaleFontSize(15),
        fontWeight: "600",
        lineHeight: scaleFontSize(21),
        color: "#ffffff",
    },
});
