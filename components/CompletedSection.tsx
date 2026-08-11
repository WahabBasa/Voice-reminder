import { useState } from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { colors, spacing, borderRadius } from "../lib/theme";
import AppIcon from "./AppIcon";
import ReminderListItem, { ReminderListItemProps } from "./ReminderListItem";

export interface CompletedSectionProps {
  items: ReminderListItemProps[];
  initiallyCollapsed?: boolean;
}

export default function CompletedSection({
  items,
  initiallyCollapsed = true,
}: CompletedSectionProps) {
  const [collapsed, setCollapsed] = useState(initiallyCollapsed);

  if (items.length === 0) {
    return null;
  }

  return (
    <View style={styles.container}>
      <Pressable
        onPress={() => setCollapsed((prev) => !prev)}
        style={({ pressed }) => [styles.headerPill, pressed && styles.headerPressed]}
      >
        <Text style={styles.headerText}>COMPLETE ({items.length})</Text>
        <AppIcon
          name="chevron-down"
          size={16}
          color={colors.textSecondary}
          style={collapsed ? undefined : styles.chevronExpanded}
        />
      </Pressable>

      {!collapsed && (
        <View style={styles.list}>
          {items.map((item) => (
            <ReminderListItem
              key={item.id}
              {...item}
              completed={item.completed ?? !item.missed}
            />
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: spacing.md,
  },
  headerPill: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    backgroundColor: colors.surface,
    borderRadius: borderRadius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: spacing.xs,
    marginBottom: spacing.sm,
  },
  headerPressed: {
    opacity: 0.85,
  },
  headerText: {
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 1,
    color: colors.textSecondary,
  },
  list: {
    marginTop: spacing.xs,
  },
  chevronExpanded: {
    transform: [{ rotate: "180deg" }],
  },
});
