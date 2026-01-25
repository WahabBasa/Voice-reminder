import React, { useCallback, useEffect, useRef } from "react";
import { BackHandler, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import BottomSheet, { BottomSheetBackdrop, BottomSheetView } from "@gorhom/bottom-sheet";
import { Portal } from "@gorhom/portal";
import AppIcon from "./AppIcon";
import { colors, scaleFontSize } from "../lib/theme";

export type ActionSheetAction = {
    key: string;
    label: string;
    icon?: Parameters<typeof AppIcon>[0]["name"];
    variant?: "default" | "destructive" | "cancel";
    onPress: () => void;
};

export type ActionSheetProps = {
    visible: boolean;
    title?: string;
    message?: string;
    actions: ActionSheetAction[];
    onDismiss: () => void;
    hostName?: string;
};

const ANIMATION_DURATION = 250;

export default function ActionSheet({
    visible,
    title,
    message,
    actions,
    onDismiss,
    hostName = "root",
}: ActionSheetProps) {
    const bottomSheetRef = useRef<BottomSheet>(null);

    // Handle visibility changes
    useEffect(() => {
        if (visible) {
            bottomSheetRef.current?.snapToIndex(0);
        } else {
            bottomSheetRef.current?.close();
        }
    }, [visible]);

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

    const handleActionPress = useCallback((action: ActionSheetAction) => {
        // Close sheet first, then execute action
        bottomSheetRef.current?.close();
        // Small delay to let animation complete
        setTimeout(() => {
            action.onPress();
        }, ANIMATION_DURATION);
    }, []);

    if (!visible) return null;

    return (
        <Portal hostName={hostName}>
            <BottomSheet
                ref={bottomSheetRef}
                snapPoints={["90%"]}
                index={0}
                enablePanDownToClose
                enableDynamicSizing
                animationConfigs={{ duration: ANIMATION_DURATION }}
                backdropComponent={renderBackdrop}
                onChange={handleSheetChange}
                handleIndicatorStyle={styles.handleIndicator}
                backgroundStyle={styles.background}
            >
                <BottomSheetView style={styles.content}>
                    {title && <Text style={styles.title}>{title}</Text>}
                    {message && <Text style={styles.message}>{message}</Text>}

                    <View style={styles.actionsContainer}>
                        {actions.map((action) => {
                            const isDestructive = action.variant === "destructive";
                            const isCancel = action.variant === "cancel";

                            return (
                                <TouchableOpacity
                                    key={action.key}
                                    style={[
                                        styles.actionRow,
                                        isCancel && styles.actionRowCancel,
                                    ]}
                                    onPress={() => handleActionPress(action)}
                                    activeOpacity={0.7}
                                >
                                    {action.icon && (
                                        <AppIcon
                                            name={action.icon}
                                            size={22}
                                            color={isDestructive ? colors.destructive : isCancel ? "#9e9e9e" : "#424242"}
                                        />
                                    )}
                                    <Text
                                        style={[
                                            styles.actionLabel,
                                            isDestructive && styles.actionLabelDestructive,
                                            isCancel && styles.actionLabelCancel,
                                        ]}
                                    >
                                        {action.label}
                                    </Text>
                                </TouchableOpacity>
                            );
                        })}
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
        marginBottom: 8,
    },
    message: {
        fontSize: scaleFontSize(14),
        color: "#757575",
        textAlign: "center",
        marginBottom: 16,
        lineHeight: 20,
    },
    actionsContainer: {
        marginTop: 8,
    },
    actionRow: {
        flexDirection: "row",
        alignItems: "center",
        paddingVertical: 16,
        paddingHorizontal: 12,
        borderRadius: 12,
        gap: 14,
    },
    actionRowCancel: {
        marginTop: 8,
        borderTopWidth: 1,
        borderTopColor: "#f0f0f0",
    },
    actionLabel: {
        fontSize: scaleFontSize(16),
        fontWeight: "500",
        color: "#424242",
    },
    actionLabelDestructive: {
        color: colors.destructive,
    },
    actionLabelCancel: {
        color: "#9e9e9e",
    },
});
