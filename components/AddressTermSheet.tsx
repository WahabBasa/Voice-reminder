import { useCallback, useEffect, useRef, useState } from "react";
import { BackHandler, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import BottomSheet, {
    BottomSheetBackdrop,
    BottomSheetTextInput,
    BottomSheetView,
} from "@gorhom/bottom-sheet";
import { Portal } from "@gorhom/portal";
import { colors, scaleFontSize } from "../lib/theme";

const ANIMATION_DURATION = 250;
const QUICK_PICKS = ["Sir", "Ma'am", "None"] as const;

export type AddressTermSheetProps = {
    visible: boolean;
    value: string;
    onSave: (value: string) => void;
    onDismiss: () => void;
    hostName?: string;
};

export default function AddressTermSheet({
    visible,
    value,
    onSave,
    onDismiss,
    hostName = "root",
}: AddressTermSheetProps) {
    const bottomSheetRef = useRef<BottomSheet>(null);
    const [draft, setDraft] = useState(value);

    // Handle visibility changes
    useEffect(() => {
        if (visible) {
            setDraft(value);
            bottomSheetRef.current?.snapToIndex(0);
        } else {
            bottomSheetRef.current?.close();
        }
    }, [visible, value]);

    // Handle Android back button
    useEffect(() => {
        if (!visible) return;

        const backHandler = BackHandler.addEventListener("hardwareBackPress", () => {
            onDismiss();
            return true;
        });

        return () => backHandler.remove();
    }, [visible, onDismiss]);

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
                onDismiss();
            }
        },
        [onDismiss]
    );

    const handleQuickPick = useCallback((pick: string) => {
        setDraft(pick === "None" ? "" : pick);
    }, []);

    const handleSave = useCallback(() => {
        onSave(draft.trim());
        bottomSheetRef.current?.close();
    }, [draft, onSave]);

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
                backgroundStyle={styles.background}
                keyboardBehavior="interactive"
                keyboardBlurBehavior="restore"
            >
                <BottomSheetView style={styles.content}>
                    <Text style={styles.title}>How should I address you?</Text>
                    <Text style={styles.subtitle}>
                        Spoken at the start of urgent reminders. Leave empty for none.
                    </Text>

                    <BottomSheetTextInput
                        style={styles.input}
                        value={draft}
                        onChangeText={setDraft}
                        placeholder="e.g. Sir, Ma'am, or your name"
                        placeholderTextColor={colors.textTertiary}
                        maxLength={40}
                        autoCorrect={false}
                    />

                    <View style={styles.quickPicks}>
                        {QUICK_PICKS.map((pick) => {
                            const isSelected =
                                pick === "None" ? draft.trim() === "" : draft.trim() === pick;
                            return (
                                <TouchableOpacity
                                    key={pick}
                                    style={[styles.quickPick, isSelected && styles.quickPickSelected]}
                                    onPress={() => handleQuickPick(pick)}
                                    activeOpacity={0.7}
                                >
                                    <Text
                                        style={[
                                            styles.quickPickText,
                                            isSelected && styles.quickPickTextSelected,
                                        ]}
                                    >
                                        {pick}
                                    </Text>
                                </TouchableOpacity>
                            );
                        })}
                    </View>

                    <View style={styles.actions}>
                        <TouchableOpacity
                            style={styles.cancelButton}
                            onPress={onDismiss}
                            activeOpacity={0.7}
                        >
                            <Text style={styles.cancelText}>Cancel</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={styles.saveButton}
                            onPress={handleSave}
                            activeOpacity={0.7}
                        >
                            <Text style={styles.saveText}>Save</Text>
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
        width: 40,
    },
    background: {
        backgroundColor: "#ffffff",
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
    },
    content: {
        paddingHorizontal: 20,
        paddingBottom: 32,
    },
    title: {
        fontSize: scaleFontSize(18),
        fontWeight: "700",
        color: "#212121",
        textAlign: "center",
        marginTop: 8,
        marginBottom: 6,
    },
    subtitle: {
        fontSize: scaleFontSize(13),
        color: colors.textSecondary,
        textAlign: "center",
        marginBottom: 16,
    },
    input: {
        borderWidth: 1.5,
        borderColor: colors.border,
        borderRadius: 12,
        paddingVertical: 12,
        paddingHorizontal: 14,
        fontSize: scaleFontSize(16),
        color: "#212121",
        backgroundColor: "#fafafa",
    },
    quickPicks: {
        flexDirection: "row",
        gap: 8,
        marginTop: 12,
    },
    quickPick: {
        paddingVertical: 8,
        paddingHorizontal: 16,
        borderRadius: 20,
        backgroundColor: "#f5f5f5",
    },
    quickPickSelected: {
        backgroundColor: colors.accent + "15",
    },
    quickPickText: {
        fontSize: scaleFontSize(14),
        fontWeight: "600",
        color: "#757575",
    },
    quickPickTextSelected: {
        color: colors.accent,
    },
    actions: {
        flexDirection: "row",
        justifyContent: "space-between",
        marginTop: 20,
        gap: 12,
    },
    cancelButton: {
        flex: 1,
        paddingVertical: 14,
        borderRadius: 12,
        backgroundColor: "#f5f5f5",
        alignItems: "center",
    },
    cancelText: {
        fontSize: scaleFontSize(15),
        fontWeight: "600",
        color: "#757575",
    },
    saveButton: {
        flex: 1,
        paddingVertical: 14,
        borderRadius: 12,
        backgroundColor: colors.accent,
        alignItems: "center",
    },
    saveText: {
        fontSize: scaleFontSize(15),
        fontWeight: "600",
        color: "#ffffff",
    },
});
