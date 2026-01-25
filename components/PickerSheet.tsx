import React, { useCallback, useEffect, useRef, useState } from "react";
import {
    BackHandler,
    FlatList,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from "react-native";
import BottomSheet, { BottomSheetBackdrop, BottomSheetView } from "@gorhom/bottom-sheet";
import { Portal } from "@gorhom/portal";
import AppIcon from "./AppIcon";
import { colors, scaleFontSize } from "../lib/theme";

export type PickerOption = {
    value: string | number;
    label: string;
};

export type PickerSheetProps = {
    visible: boolean;
    title?: string;
    mode: "list" | "wheel";
    options: PickerOption[];
    selected: string | number;
    onSelect: (value: string | number) => void;
    onDismiss: () => void;
    hostName?: string;
};

const ANIMATION_DURATION = 250;
const ITEM_HEIGHT = 48;
const VISIBLE_ITEMS = 5;

export default function PickerSheet({
    visible,
    title,
    mode,
    options,
    selected,
    onSelect,
    onDismiss,
    hostName = "root",
}: PickerSheetProps) {
    const bottomSheetRef = useRef<BottomSheet>(null);
    const flatListRef = useRef<FlatList>(null);
    const [localSelected, setLocalSelected] = useState(selected);

    // Sync local state with prop
    useEffect(() => {
        setLocalSelected(selected);
    }, [selected]);

    // Handle visibility changes
    useEffect(() => {
        if (visible) {
            bottomSheetRef.current?.snapToIndex(0);
            // Scroll to selected item in wheel mode
            if (mode === "wheel") {
                const selectedIndex = options.findIndex((o) => o.value === selected);
                if (selectedIndex >= 0) {
                    setTimeout(() => {
                        flatListRef.current?.scrollToIndex({
                            index: selectedIndex,
                            animated: false,
                            viewPosition: 0.5,
                        });
                    }, 100);
                }
            }
        } else {
            bottomSheetRef.current?.close();
        }
    }, [visible, mode, options, selected]);

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

    const handleListItemPress = useCallback(
        (value: string | number) => {
            onSelect(value);
            bottomSheetRef.current?.close();
        },
        [onSelect]
    );

    const handleWheelConfirm = useCallback(() => {
        onSelect(localSelected);
        bottomSheetRef.current?.close();
    }, [localSelected, onSelect]);

    // Handle scroll end for wheel mode
    const handleMomentumScrollEnd = useCallback(
        (event: any) => {
            const offsetY = event.nativeEvent.contentOffset.y;
            const index = Math.round(offsetY / ITEM_HEIGHT);
            const clampedIndex = Math.max(0, Math.min(options.length - 1, index));
            setLocalSelected(options[clampedIndex].value);
        },
        [options]
    );

    const renderListItem = useCallback(
        ({ item }: { item: PickerOption }) => {
            const isSelected = item.value === selected;
            return (
                <TouchableOpacity
                    style={[styles.listItem, isSelected && styles.listItemSelected]}
                    onPress={() => handleListItemPress(item.value)}
                    activeOpacity={0.7}
                >
                    <Text style={[styles.listItemText, isSelected && styles.listItemTextSelected]}>
                        {item.label}
                    </Text>
                    {isSelected && (
                        <AppIcon name="check" size={20} color={colors.accent} />
                    )}
                </TouchableOpacity>
            );
        },
        [selected, handleListItemPress]
    );

    const renderWheelItem = useCallback(
        ({ item }: { item: PickerOption }) => {
            const isSelected = item.value === localSelected;
            return (
                <View style={styles.wheelItem}>
                    <Text
                        style={[
                            styles.wheelItemText,
                            isSelected && styles.wheelItemTextSelected,
                        ]}
                    >
                        {item.label}
                    </Text>
                </View>
            );
        },
        [localSelected]
    );

    const getItemLayout = useCallback(
        (_: any, index: number) => ({
            length: ITEM_HEIGHT,
            offset: ITEM_HEIGHT * index,
            index,
        }),
        []
    );

    if (!visible) return null;

    return (
        <Portal hostName={hostName}>
            <BottomSheet
                ref={bottomSheetRef}
                snapPoints={mode === "wheel" ? [300] : ["90%"]}
                index={0}
                enablePanDownToClose
                enableDynamicSizing={mode === "list"}
                animationConfigs={{ duration: ANIMATION_DURATION }}
                backdropComponent={renderBackdrop}
                onChange={handleSheetChange}
                handleIndicatorStyle={styles.handleIndicator}
                backgroundStyle={styles.background}
            >
                <BottomSheetView style={styles.content}>
                    {title && <Text style={styles.title}>{title}</Text>}

                    {mode === "list" ? (
                        <View style={styles.listContainer}>
                            {options.map((option) => (
                                <React.Fragment key={String(option.value)}>
                                    {renderListItem({ item: option })}
                                </React.Fragment>
                            ))}
                        </View>
                    ) : (
                        <>
                            <View style={styles.wheelContainer}>
                                <View style={styles.wheelHighlight} pointerEvents="none" />

                                <FlatList
                                    ref={flatListRef}
                                    data={options}
                                    renderItem={renderWheelItem}
                                    keyExtractor={(item) => String(item.value)}
                                    getItemLayout={getItemLayout}
                                    showsVerticalScrollIndicator={false}
                                    snapToInterval={ITEM_HEIGHT}
                                    decelerationRate="fast"
                                    onMomentumScrollEnd={handleMomentumScrollEnd}
                                    contentContainerStyle={{
                                        paddingVertical: (ITEM_HEIGHT * (VISIBLE_ITEMS - 1)) / 2,
                                    }}
                                />
                            </View>

                            <View style={styles.wheelActions}>
                                <TouchableOpacity
                                    style={styles.wheelCancelButton}
                                    onPress={onDismiss}
                                    activeOpacity={0.7}
                                >
                                    <Text style={styles.wheelCancelText}>Cancel</Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    style={styles.wheelConfirmButton}
                                    onPress={handleWheelConfirm}
                                    activeOpacity={0.7}
                                >
                                    <Text style={styles.wheelConfirmText}>Done</Text>
                                </TouchableOpacity>
                            </View>
                        </>
                    )}
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
        marginBottom: 16,
    },
    // List mode styles
    listContainer: {
        marginTop: 8,
    },
    listItem: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        paddingVertical: 14,
        paddingHorizontal: 12,
        borderRadius: 12,
    },
    listItemSelected: {
        backgroundColor: colors.accent + "10",
    },
    listItemText: {
        fontSize: scaleFontSize(16),
        fontWeight: "500",
        color: "#424242",
    },
    listItemTextSelected: {
        color: colors.accent,
        fontWeight: "600",
    },
    // Wheel mode styles
    wheelContainer: {
        height: ITEM_HEIGHT * VISIBLE_ITEMS,
        overflow: "hidden",
        position: "relative",
    },
    wheelHighlight: {
        position: "absolute",
        top: (ITEM_HEIGHT * (VISIBLE_ITEMS - 1)) / 2,
        left: 0,
        right: 0,
        height: ITEM_HEIGHT,
        backgroundColor: colors.accent + "10",
        borderRadius: 12,
    },
    wheelItem: {
        height: ITEM_HEIGHT,
        justifyContent: "center",
        alignItems: "center",
    },
    wheelItemText: {
        fontSize: scaleFontSize(18),
        fontWeight: "500",
        color: "#9e9e9e",
    },
    wheelItemTextSelected: {
        color: "#212121",
        fontWeight: "700",
    },
    wheelActions: {
        flexDirection: "row",
        justifyContent: "space-between",
        marginTop: 16,
        gap: 12,
    },
    wheelCancelButton: {
        flex: 1,
        paddingVertical: 14,
        borderRadius: 12,
        backgroundColor: "#f5f5f5",
        alignItems: "center",
    },
    wheelCancelText: {
        fontSize: scaleFontSize(15),
        fontWeight: "600",
        color: "#757575",
    },
    wheelConfirmButton: {
        flex: 1,
        paddingVertical: 14,
        borderRadius: 12,
        backgroundColor: colors.accent,
        alignItems: "center",
    },
    wheelConfirmText: {
        fontSize: scaleFontSize(15),
        fontWeight: "600",
        color: "#ffffff",
    },
});
