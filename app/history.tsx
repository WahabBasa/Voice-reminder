import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  InteractionManager,
  SectionList,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useFocusEffect } from "@react-navigation/native";
import { colors, scaleFontSize } from "../lib/theme";
import { useReminderStore, ReminderHistory } from "../lib/store";
import AppIcon from "../components/AppIcon";
import ActionSheet from "../components/ActionSheet";
import { useToast } from "../components/ToastProvider";

type FilterType = "all" | "completed" | "missed";

function formatCardTimestamp(isoString: string) {
  const date = new Date(isoString);
  const dd = String(date.getDate()).padStart(2, "0");
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const yyyy = String(date.getFullYear());

  const hours24 = date.getHours();
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const ampm = hours24 >= 12 ? "PM" : "AM";
  const hours12 = hours24 % 12 === 0 ? 12 : hours24 % 12;

  return `${dd}/${mm}/${yyyy}, ${hours12}:${minutes}${ampm}`;
}

function getDayBucket(isoString: string): "Today" | "Yesterday" | "Earlier" {
  const date = new Date(isoString);
  const now = new Date();

  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);

  const startOfYesterday = new Date(startOfToday);
  startOfYesterday.setDate(startOfYesterday.getDate() - 1);

  if (date >= startOfToday) return "Today";
  if (date >= startOfYesterday) return "Yesterday";
  return "Earlier";
}

export default function HistoryScreen() {
  const router = useRouter();
  const toast = useToast();

  // Use Zustand store for centralized history state
  const history = useReminderStore((state) => state.history);
  const loadHistory = useReminderStore((state) => state.loadHistory);
  const storeClearHistory = useReminderStore((state) => state.clearHistory);

  const [selectedFilter, setSelectedFilter] = useState<FilterType>("all");
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  useFocusEffect(
    useCallback(() => {
      const task = InteractionManager.runAfterInteractions(() => {
        loadHistory();
      });
      return () => task.cancel();
    }, [loadHistory])
  );

  const filteredHistory = history.filter((entry) => {
    if (selectedFilter === "all") return true;
    return entry.status === selectedFilter;
  });

  const historyBySection = React.useMemo(() => {
    const sections: Record<"Today" | "Yesterday" | "Earlier", ReminderHistory[]> = {
      Today: [],
      Yesterday: [],
      Earlier: [],
    };

    const sorted = [...filteredHistory].sort((a, b) => {
      const aTime = new Date(a.timestamp).getTime();
      const bTime = new Date(b.timestamp).getTime();
      return bTime - aTime;
    });

    for (const entry of sorted) {
      sections[getDayBucket(entry.timestamp)].push(entry);
    }

    return sections;
  }, [filteredHistory]);

  const sections = React.useMemo(() => {
    return (["Today", "Yesterday", "Earlier"] as const)
      .map((title) => ({ title, data: historyBySection[title] }))
      .filter((section) => section.data.length > 0);
  }, [historyBySection]);

  const renderSectionHeader = useCallback(
    ({ section }: { section: { title: string } }) => {
      return (
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>{section.title}</Text>
        </View>
      );
    },
    []
  );

  const renderItem = useCallback(({ item }: { item: ReminderHistory }) => {
    return (
      <View style={styles.card}>
        <View style={styles.cardMain}>
          <View style={styles.cardIcon}>
            <AppIcon
              name={item.status === "completed" ? "check" : "x"}
              size={18}
              color={item.status === "completed" ? "#4CAF50" : "#F44336"}
            />
          </View>
          <View style={styles.cardText}>
            <Text style={styles.cardTitle} numberOfLines={1}>
              {item.reminderTitle}
            </Text>
            <Text style={styles.cardMeta} numberOfLines={1}>
              {formatCardTimestamp(item.timestamp)}
            </Text>
          </View>
        </View>

        {item.status === "completed" ? (
          <View style={[styles.statusBadge, styles.completedBadge]}>
            <AppIcon name="check-circle" size={16} color="#4CAF50" />
            <Text style={[styles.statusText, styles.completedText]}>Done</Text>
          </View>
        ) : (
          <View style={[styles.statusBadge, styles.missedBadge]}>
            <AppIcon name="x-circle" size={16} color="#F44336" />
            <Text style={[styles.statusText, styles.missedText]}>Missed</Text>
          </View>
        )}
      </View>
    );
  }, []);

  const handleClearHistory = () => {
    setShowClearConfirm(true);
  };

  const executeClearHistory = async () => {
    try {
      await storeClearHistory();
      toast.show({ title: "Success", message: "History cleared successfully", type: "success" });
    } catch (error) {
      toast.show({ title: "Error", message: "Failed to clear history", type: "error" });
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={["bottom"]}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backButton}
          activeOpacity={0.85}
        >
          <AppIcon name="chevron-left" size={26} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>History</Text>
        <View style={styles.headerSpacer} />
      </View>

      <View style={styles.filtersRow}>
        <TouchableOpacity
          style={[styles.filterPill, selectedFilter === "all" && styles.filterPillActive]}
          onPress={() => setSelectedFilter("all")}
          activeOpacity={0.85}
        >
          <Text style={[styles.filterPillText, selectedFilter === "all" && styles.filterPillTextActive]}>
            All
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.filterPill, selectedFilter === "completed" && styles.filterPillActive]}
          onPress={() => setSelectedFilter("completed")}
          activeOpacity={0.85}
        >
          <Text style={[styles.filterPillText, selectedFilter === "completed" && styles.filterPillTextActive]}>
            Completed
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.filterPill, selectedFilter === "missed" && styles.filterPillActive]}
          onPress={() => setSelectedFilter("missed")}
          activeOpacity={0.85}
        >
          <Text style={[styles.filterPillText, selectedFilter === "missed" && styles.filterPillTextActive]}>
            Missed
          </Text>
        </TouchableOpacity>
      </View>

      <SectionList
        style={styles.content}
        contentContainerStyle={styles.contentContainer}
        sections={sections}
        keyExtractor={(item) => item.id}
        renderSectionHeader={renderSectionHeader}
        renderItem={renderItem}
        stickySectionHeadersEnabled={false}
        showsVerticalScrollIndicator={false}
        removeClippedSubviews
        initialNumToRender={14}
        maxToRenderPerBatch={14}
        windowSize={7}
        updateCellsBatchingPeriod={16}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={styles.emptyTitle}>No history yet</Text>
            <Text style={styles.emptySubtitle}>Mark reminders done to see them here.</Text>
          </View>
        }
        ListFooterComponent={
          history.length > 0 ? (
            <View style={styles.clearContainer}>
              <TouchableOpacity
                style={styles.clearButton}
                onPress={handleClearHistory}
                activeOpacity={0.85}
              >
                <AppIcon name="trash-2" size={18} color="#FF5252" />
                <Text style={styles.clearText}>Clear History</Text>
              </TouchableOpacity>
            </View>
          ) : null
        }
      />

      {/* Clear History Confirmation */}
      <ActionSheet
        visible={showClearConfirm}
        title="Clear History"
        message="Are you sure you want to clear all history? This cannot be undone."
        actions={[
          {
            key: "clear",
            label: "Clear All",
            icon: "trash-2",
            variant: "destructive",
            onPress: () => {
              setShowClearConfirm(false);
              executeClearHistory();
            },
          },
          {
            key: "cancel",
            label: "Cancel",
            variant: "cancel",
            onPress: () => setShowClearConfirm(false),
          },
        ]}
        onDismiss={() => setShowClearConfirm(false)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    paddingHorizontal: 20,
  },
  header: {
    paddingTop: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingBottom: 14,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: colors.surface,
    justifyContent: "center",
    alignItems: "center",
  },
  headerTitle: {
    fontSize: scaleFontSize(20),
    fontWeight: "700",
    color: colors.textPrimary,
  },
  headerSpacer: {
    width: 40,
  },
  filtersRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 2,
    marginBottom: 8,
  },
  filterPill: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: colors.surface,
    marginRight: 10,
  },
  filterPillActive: {
    backgroundColor: colors.accent,
  },
  filterPillText: {
    fontSize: scaleFontSize(14),
    fontWeight: "700",
    color: colors.textPrimary,
  },
  filterPillTextActive: {
    color: "white",
  },
  content: {
    flex: 1,
  },
  emptyState: {
    marginTop: 26,
    paddingVertical: 18,
    alignItems: "center",
  },
  emptyTitle: {
    fontSize: scaleFontSize(17),
    fontWeight: "700",
    color: colors.textPrimary,
  },
  emptySubtitle: {
    marginTop: 6,
    fontSize: scaleFontSize(14),
    color: colors.textSecondary,
  },
  contentContainer: {
    paddingTop: 8,
    paddingBottom: 30,
  },
  section: {
    marginTop: 14,
  },
  sectionHeader: {
    marginTop: 14,
  },
  sectionTitle: {
    fontSize: scaleFontSize(20),
    fontWeight: "700",
    color: colors.textPrimary,
    marginBottom: 10,
  },
  card: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: colors.surface,
    borderRadius: 18,
    paddingVertical: 12,
    paddingHorizontal: 12,
    marginBottom: 10,
  },
  cardMain: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
  },
  cardIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: colors.muted,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },
  cardText: {
    flex: 1,
  },
  cardTitle: {
    fontSize: scaleFontSize(16),
    fontWeight: "700",
    color: colors.textPrimary,
  },
  cardMeta: {
    marginTop: 4,
    fontSize: scaleFontSize(13),
    color: colors.textTertiary,
  },
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  completedBadge: {
    backgroundColor: "#E8F5E9",
  },
  missedBadge: {
    backgroundColor: "#FFEBEE",
  },
  statusText: {
    marginLeft: 4,
    fontSize: scaleFontSize(14),
    fontWeight: "600",
  },
  completedText: {
    color: "#4CAF50",
  },
  missedText: {
    color: "#F44336",
  },
  clearContainer: {
    alignItems: "center",
    marginTop: 20,
    marginBottom: 20,
  },
  clearButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFEBEE",
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#FFCDD2",
  },
  clearText: {
    color: "#FF5252",
    fontSize: scaleFontSize(15),
    fontWeight: "600",
    marginLeft: 8,
  },
});
