import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  Alert,
} from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";

export default function HomeScreen() {
  const router = useRouter();
  const reminders = useQuery(api.reminders.list);
  const deleteReminder = useMutation(api.reminders.remove);

  const handleDelete = (id: Id<"reminders">, title: string) => {
    Alert.alert("Delete Reminder", `Delete "${title}"?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => deleteReminder({ id }),
      },
    ]);
  };

  if (reminders === undefined) {
    return (
      <SafeAreaView style={styles.container} edges={["bottom"]}>
        <View style={styles.loadingState}>
          <ActivityIndicator size="large" color="#007AFF" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={["bottom"]}>
      {reminders.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyIcon}>🔔</Text>
          <Text style={styles.emptyTitle}>No Reminders Yet</Text>
          <Text style={styles.emptySubtitle}>
            Tap the button below to create your first voice reminder
          </Text>
          <TouchableOpacity
            style={styles.addButton}
            onPress={() => router.push("/record")}
          >
            <Text style={styles.addButtonText}>+ Create Reminder</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={reminders}
          keyExtractor={(item) => item._id}
          renderItem={({ item }) => (
            <View style={styles.reminderCard}>
              <View style={styles.cardHeader}>
                <Text style={styles.reminderTitle}>{item.title}</Text>
                <TouchableOpacity
                  onPress={() => handleDelete(item._id, item.title)}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <Ionicons name="trash-outline" size={20} color="#FF3B30" />
                </TouchableOpacity>
              </View>
              <Text style={styles.reminderTime}>
                {item.time} · {item.frequency}
                {item.days && item.days.length > 0
                  ? ` · ${item.days.join(", ")}`
                  : ""}
              </Text>
              <Text style={styles.reminderDescription}>
                "{item.description}"
              </Text>
            </View>
          )}
          contentContainerStyle={styles.listContent}
          ListHeaderComponent={
            <TouchableOpacity
              style={styles.addButtonSmall}
              onPress={() => router.push("/record")}
            >
              <Ionicons name="add" size={20} color="#fff" />
              <Text style={styles.addButtonSmallText}>New Reminder</Text>
            </TouchableOpacity>
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F2F2F7",
  },
  loadingState: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  emptyState: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 32,
  },
  emptyIcon: {
    fontSize: 64,
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 24,
    fontWeight: "600",
    color: "#1C1C1E",
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 16,
    color: "#8E8E93",
    textAlign: "center",
    marginBottom: 24,
  },
  addButton: {
    backgroundColor: "#007AFF",
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 12,
  },
  addButtonText: {
    color: "#fff",
    fontSize: 17,
    fontWeight: "600",
  },
  listContent: {
    padding: 16,
  },
  reminderCard: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
  },
  reminderTitle: {
    fontSize: 17,
    fontWeight: "600",
    color: "#1C1C1E",
    flex: 1,
  },
  reminderTime: {
    fontSize: 15,
    color: "#8E8E93",
    marginBottom: 6,
  },
  reminderDescription: {
    fontSize: 14,
    color: "#636366",
    fontStyle: "italic",
  },
  addButtonSmall: {
    backgroundColor: "#007AFF",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    marginBottom: 16,
    gap: 6,
  },
  addButtonSmallText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "600",
  },
});
