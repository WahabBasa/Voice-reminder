import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Platform,
  Alert,
} from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useFocusEffect } from "@react-navigation/native";
import { colors } from "../lib/theme";
import { getHistory, clearHistory, ReminderHistory } from "../lib/storage";

type FilterType = "all" | "completed" | "missed";

export default function HistoryScreen() {
  const router = useRouter();
  const [history, setHistory] = useState<ReminderHistory[]>([]);
  const [selectedFilter, setSelectedFilter] = useState<FilterType>("all");

  const loadHistory = useCallback(async () => {
    try {
      const data = await getHistory();
      setHistory(data);
    } catch (error) {
      console.error("Error loading history:", error);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadHistory();
    }, [loadHistory])
  );

  const filteredHistory = history.filter((entry) => {
    if (selectedFilter === "all") return true;
    return entry.status === selectedFilter;
  });

  const groupHistoryByDate = () => {
    const grouped = filteredHistory.reduce((acc, entry) => {
      const date = new Date(entry.timestamp).toDateString();
      if (!acc[date]) {
        acc[date] = [];
      }
      acc[date].push(entry);
      return acc;
    }, {} as Record<string, ReminderHistory[]>);

    return Object.entries(grouped).sort(
      (a, b) => new Date(b[0]).getTime() - new Date(a[0]).getTime()
    );
  };

  const groupedHistory = groupHistoryByDate();

  const handleClearHistory = () => {
    Alert.alert(
      "Clear History",
      "Are you sure you want to clear all history? This cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Clear All",
          style: "destructive",
          onPress: async () => {
            try {
              await clearHistory();
              setHistory([]);
              Alert.alert("Success", "History cleared successfully");
            } catch (error) {
              Alert.alert("Error", "Failed to clear history");
            }
          },
        },
      ]
    );
  };

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={colors.accentGradient}
        style={styles.headerGradient}
      />

      <View style={styles.content}>
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => router.back()}
            style={styles.backButton}
          >
            <Ionicons name="chevron-back" size={28} color={colors.accent} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>History</Text>
        </View>

        <View style={styles.filtersContainer}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.filtersScroll}
          >
            <TouchableOpacity
              style={[
                styles.filterButton,
                selectedFilter === "all" && styles.filterButtonActive,
              ]}
              onPress={() => setSelectedFilter("all")}
            >
              <Text
                style={[
                  styles.filterText,
                  selectedFilter === "all" && styles.filterTextActive,
                ]}
              >
                All
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.filterButton,
                selectedFilter === "completed" && styles.filterButtonActive,
              ]}
              onPress={() => setSelectedFilter("completed")}
            >
              <Text
                style={[
                  styles.filterText,
                  selectedFilter === "completed" && styles.filterTextActive,
                ]}
              >
                Completed
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.filterButton,
                selectedFilter === "missed" && styles.filterButtonActive,
              ]}
              onPress={() => setSelectedFilter("missed")}
            >
              <Text
                style={[
                  styles.filterText,
                  selectedFilter === "missed" && styles.filterTextActive,
                ]}
              >
                Missed
              </Text>
            </TouchableOpacity>
          </ScrollView>
        </View>

        <ScrollView
          style={styles.historyContainer}
          showsVerticalScrollIndicator={false}
        >
          {groupedHistory.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="time-outline" size={64} color="#ccc" />
              <Text style={styles.emptyTitle}>No history yet</Text>
              <Text style={styles.emptyText}>
                Mark reminders as done to see them here
              </Text>
            </View>
          ) : (
            groupedHistory.map(([date, entries]) => (
              <View key={date} style={styles.dateGroup}>
                <Text style={styles.dateHeader}>
                  {new Date(date).toLocaleDateString("default", {
                    weekday: "long",
                    month: "long",
                    day: "numeric",
                  })}
                </Text>
                {entries.map((entry) => (
                  <View key={entry.id} style={styles.historyCard}>
                    <View
                      style={[
                        styles.colorStrip,
                        {
                          backgroundColor:
                            entry.status === "completed"
                              ? "#4CAF50"
                              : "#F44336",
                        },
                      ]}
                    />
                    <View style={styles.entryInfo}>
                      <Text style={styles.entryTitle}>{entry.reminderTitle}</Text>
                      <Text style={styles.entryTime}>
                        {new Date(entry.timestamp).toLocaleTimeString("default", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </Text>
                    </View>
                    <View style={styles.statusContainer}>
                      {entry.status === "completed" ? (
                        <View style={[styles.statusBadge, styles.completedBadge]}>
                          <Ionicons
                            name="checkmark-circle"
                            size={16}
                            color="#4CAF50"
                          />
                          <Text style={[styles.statusText, styles.completedText]}>
                            Done
                          </Text>
                        </View>
                      ) : (
                        <View style={[styles.statusBadge, styles.missedBadge]}>
                          <Ionicons
                            name="close-circle"
                            size={16}
                            color="#F44336"
                          />
                          <Text style={[styles.statusText, styles.missedText]}>
                            Missed
                          </Text>
                        </View>
                      )}
                    </View>
                  </View>
                ))}
              </View>
            ))
          )}

          {history.length > 0 && (
            <View style={styles.clearContainer}>
              <TouchableOpacity
                style={styles.clearButton}
                onPress={handleClearHistory}
              >
                <Ionicons name="trash-outline" size={20} color="#FF5252" />
                <Text style={styles.clearText}>Clear History</Text>
              </TouchableOpacity>
            </View>
          )}

          <View style={{ height: 40 }} />
        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f8f9fa",
  },
  headerGradient: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: Platform.OS === "ios" ? 140 : 120,
  },
  content: {
    flex: 1,
    paddingTop: Platform.OS === "ios" ? 50 : 30,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingBottom: 20,
    zIndex: 1,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "white",
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: "700",
    color: "white",
    marginLeft: 15,
  },
  filtersContainer: {
    paddingHorizontal: 20,
    marginBottom: 20,
  },
  filtersScroll: {
    paddingRight: 20,
  },
  filterButton: {
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: "white",
    marginRight: 10,
    borderWidth: 1,
    borderColor: "#e0e0e0",
  },
  filterButtonActive: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  filterText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#666",
  },
  filterTextActive: {
    color: "white",
  },
  historyContainer: {
    flex: 1,
    paddingHorizontal: 20,
  },
  emptyState: {
    alignItems: "center",
    paddingVertical: 60,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: "600",
    color: "#333",
    marginTop: 16,
  },
  emptyText: {
    fontSize: 14,
    color: "#666",
    marginTop: 8,
  },
  dateGroup: {
    marginBottom: 25,
  },
  dateHeader: {
    fontSize: 16,
    fontWeight: "600",
    color: "#666",
    marginBottom: 12,
  },
  historyCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "white",
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#e0e0e0",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  colorStrip: {
    width: 12,
    height: 40,
    borderRadius: 6,
    marginRight: 16,
  },
  entryInfo: {
    flex: 1,
  },
  entryTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#333",
    marginBottom: 4,
  },
  entryTime: {
    fontSize: 14,
    color: "#666",
  },
  statusContainer: {
    alignItems: "flex-end",
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
    fontSize: 14,
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
    fontSize: 16,
    fontWeight: "600",
    marginLeft: 8,
  },
});
