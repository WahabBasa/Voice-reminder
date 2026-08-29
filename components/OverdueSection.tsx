import { View, Text, StyleSheet } from "react-native";
import { colors, spacing, borderRadius } from "../lib/theme";
import AppIcon from "./AppIcon";
import ReminderListItem, { ReminderListItemProps } from "./ReminderListItem";

export interface OverdueSectionProps {
  items: ReminderListItemProps[];
}

/**
 * One-offs whose ring has passed and that were never ticked (OLD-118).
 *
 * Mirrors CompletedSection's pill-header shape, but never collapses: these are
 * the only things on Today the user still owes, so they sit open above the
 * day's list. Tapping a row's circle ticks it, which moves it into COMPLETE
 * through the ledger; swiping deletes it.
 */
export default function OverdueSection({ items }: OverdueSectionProps) {
  if (items.length === 0) {
    return null;
  }

  return (
    <View style={styles.container}>
      <View style={styles.headerPill}>
        <AppIcon name="clock" size={14} color={colors.statusOverdue} />
        <Text style={styles.headerText}>OVERDUE ({items.length})</Text>
      </View>

      <View style={styles.list}>
        {items.map((item) => (
          <ReminderListItem key={item.id} {...item} overdue />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: spacing.sm,
  },
  headerPill: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    // Soft wash of colors.statusOverdue — local to this pill, so the shared
    // palette stays as-is.
    backgroundColor: "#FDECEC",
    borderRadius: borderRadius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: spacing.xs,
    marginBottom: spacing.sm,
  },
  headerText: {
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 1,
    color: colors.statusOverdue,
  },
  list: {
    marginTop: spacing.xs,
  },
});
