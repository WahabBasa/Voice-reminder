import React from "react";
import { StyleSheet, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Calendar, List, Mic, Settings } from "lucide-react-native";
import { borderRadius, colors, shadows } from "../lib/theme";

export type BottomBarTab = "today" | "days" | "settings";

type BottomBarProps = {
    activeTab: BottomBarTab;
    onTab: (tab: BottomBarTab) => void;
    /** When set, renders the round record button anchored bottom-right (Tiimo style). */
    onRecord?: () => void;
};

const TABS: { key: BottomBarTab; Icon: typeof List }[] = [
    { key: "today", Icon: List },
    { key: "days", Icon: Calendar },
    { key: "settings", Icon: Settings },
];

export default function BottomBar({ activeTab, onTab, onRecord }: BottomBarProps) {
    const insets = useSafeAreaInsets();

    return (
        <View pointerEvents="box-none" style={[styles.wrap, { bottom: Math.max(insets.bottom - 6, 10) }]}>
            {/* Dock and mic travel as one centered group. */}
            <View style={styles.dockRow} pointerEvents="box-none">
                <View style={styles.bar}>
                    {TABS.map(({ key, Icon }) => {
                        const active = key === activeTab;
                        return (
                            <TouchableOpacity
                                key={key}
                                style={[styles.item, active && styles.itemActive]}
                                onPress={() => onTab(key)}
                                activeOpacity={0.7}
                                accessibilityRole="tab"
                                accessibilityState={{ selected: active }}
                            >
                                <Icon
                                    size={22}
                                    color={active ? colors.card : colors.textTertiary}
                                    strokeWidth={1.75}
                                />
                            </TouchableOpacity>
                        );
                    })}
                </View>

                {onRecord && (
                    <TouchableOpacity
                        style={styles.recordButton}
                        onPress={onRecord}
                        activeOpacity={0.9}
                        accessibilityRole="button"
                        accessibilityLabel="Record a reminder"
                    >
                        <Mic size={24} color="white" strokeWidth={1.75} />
                    </TouchableOpacity>
                )}
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    wrap: {
        position: "absolute",
        left: 0,
        right: 0,
        alignItems: "center",
    },
    dockRow: {
        flexDirection: "row",
        alignItems: "center",
        gap: 14,
    },
    bar: {
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
        backgroundColor: colors.card,
        borderRadius: borderRadius.bar,
        paddingHorizontal: 14,
        paddingVertical: 8,
        ...shadows.card,
        shadowOpacity: 0.12,
        shadowRadius: 12,
        elevation: 5,
    },
    item: {
        width: 52,
        height: 52,
        borderRadius: 17,
        alignItems: "center",
        justifyContent: "center",
    },
    // Tiimo-style active tab: dark rounded square, light icon.
    itemActive: {
        backgroundColor: colors.textHeading,
    },
    recordButton: {
        width: 58,
        height: 58,
        borderRadius: 29,
        backgroundColor: colors.accent,
        alignItems: "center",
        justifyContent: "center",
        ...shadows.card,
        shadowOpacity: 0.16,
        shadowRadius: 12,
        elevation: 6,
    },
});
