import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";

export default function RecordScreen() {
  const [isRecording, setIsRecording] = useState(false);

  const handleRecordPress = () => {
    setIsRecording(!isRecording);
    // Recording logic will be added in Phase 2
  };

  return (
    <SafeAreaView style={styles.container} edges={["bottom"]}>
      <View style={styles.content}>
        <Text style={styles.title}>New Reminder</Text>
        <Text style={styles.subtitle}>
          {isRecording
            ? "Listening... Speak your reminder"
            : "Tap the microphone and speak your reminder"}
        </Text>

        <View style={styles.micContainer}>
          {isRecording && <View style={styles.pulseRing} />}
          <TouchableOpacity
            style={[styles.micButton, isRecording && styles.micButtonRecording]}
            onPress={handleRecordPress}
            activeOpacity={0.8}
          >
            <Ionicons
              name={isRecording ? "stop" : "mic"}
              size={48}
              color="#fff"
            />
          </TouchableOpacity>
        </View>

        <Text style={styles.buttonLabel}>
          {isRecording ? "Tap to Stop" : "Tap to Record"}
        </Text>

        <Text style={styles.hint}>
          Example: "Remind me to take my medicine at 8am every day"
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F2F2F7",
  },
  content: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 32,
  },
  title: {
    fontSize: 28,
    fontWeight: "700",
    color: "#1C1C1E",
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 17,
    color: "#8E8E93",
    textAlign: "center",
    marginBottom: 48,
  },
  micContainer: {
    position: "relative",
    marginBottom: 48,
  },
  micButton: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: "#007AFF",
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#007AFF",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  micButtonRecording: {
    backgroundColor: "#FF3B30",
    shadowColor: "#FF3B30",
  },
  pulseRing: {
    position: "absolute",
    width: 140,
    height: 140,
    borderRadius: 70,
    borderWidth: 3,
    borderColor: "#FF3B30",
    opacity: 0.5,
    top: -10,
    left: -10,
  },
  buttonLabel: {
    fontSize: 17,
    fontWeight: "600",
    color: "#007AFF",
    marginBottom: 32,
  },
  hint: {
    fontSize: 15,
    color: "#8E8E93",
    textAlign: "center",
    fontStyle: "italic",
  },
});
