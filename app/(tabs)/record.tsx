import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useState, useEffect, useRef } from "react";
import { useAction } from "convex/react";
import { api } from "../../convex/_generated/api";
import {
  requestMicrophonePermission,
  startRecording,
  stopRecording,
} from "../../lib/audio";
import { readFileAsBase64 } from "../../lib/convex";
import { scheduleReminder } from "../../lib/notifications";
import { formatNextTrigger, getNextTriggerTime } from "../../lib/time";

export default function RecordScreen() {
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [duration, setDuration] = useState(0);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const processVoiceReminder = useAction(api.actions.processVoiceReminder);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const formatDuration = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  const handleRecordPress = async () => {
    if (isProcessing) return;

    if (isRecording) {
      if (timerRef.current) clearInterval(timerRef.current);
      const uri = await stopRecording();
      setIsRecording(false);
      setDuration(0);

      if (uri) {
        setIsProcessing(true);
        try {
          const base64 = await readFileAsBase64(uri);
          console.log("[VR] Processing audio...");
          const result = await processVoiceReminder({ audioBase64: base64 });
          console.log("[VR] Result:", JSON.stringify(result, null, 2));

          // Schedule notification
          if (!result.audioUrl) {
            throw new Error("Failed to get audio URL");
          }
          console.log("[VR] Scheduling notification...");
          await scheduleReminder({
            id: result.id,
            title: result.title,
            description: result.description,
            time: result.time,
            frequency: result.frequency,
            days: result.days,
            audioUrl: result.audioUrl,
          });

          const nextTrigger = getNextTriggerTime({
            time: result.time,
            frequency: result.frequency,
            days: result.days,
          });
          const nextTriggerStr = formatNextTrigger(nextTrigger);

          Alert.alert(
            "Reminder Created",
            `"${result.title}"\n\nNext: ${nextTriggerStr}\n\nTranscript: "${result.transcript}"`
          );
        } catch (error) {
          console.error("[VR] Processing error:", error);
          Alert.alert(
            "Error",
            "Failed to process your reminder. Please try again."
          );
        } finally {
          setIsProcessing(false);
        }
      }
    } else {
      const status = await requestMicrophonePermission();
      if (status !== "granted") {
        setPermissionDenied(true);
        Alert.alert(
          "Microphone Permission Required",
          "Please enable microphone access in your device settings to record reminders."
        );
        return;
      }
      setPermissionDenied(false);
      await startRecording();
      setIsRecording(true);
      timerRef.current = setInterval(() => {
        setDuration((d) => d + 1);
      }, 1000);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={["bottom"]}>
      <View style={styles.content}>
        <Text style={styles.title}>New Reminder</Text>
        <Text style={styles.subtitle}>
          {isProcessing
            ? "Processing your reminder..."
            : isRecording
              ? "Listening... Speak your reminder"
              : permissionDenied
                ? "Microphone access required"
                : "Tap the microphone and speak your reminder"}
        </Text>

        {isRecording && (
          <Text style={styles.timer}>{formatDuration(duration)}</Text>
        )}

        <View style={styles.micContainer}>
          {isRecording && <View style={styles.pulseRing} />}
          <TouchableOpacity
            style={[
              styles.micButton,
              isRecording && styles.micButtonRecording,
              isProcessing && styles.micButtonProcessing,
            ]}
            onPress={handleRecordPress}
            activeOpacity={0.8}
            disabled={isProcessing}
          >
            {isProcessing ? (
              <ActivityIndicator size="large" color="#fff" />
            ) : (
              <Ionicons
                name={isRecording ? "stop" : "mic"}
                size={48}
                color="#fff"
              />
            )}
          </TouchableOpacity>
        </View>

        <Text style={styles.buttonLabel}>
          {isProcessing
            ? "Please wait..."
            : isRecording
              ? "Tap to Stop"
              : "Tap to Record"}
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
    marginBottom: 16,
  },
  timer: {
    fontSize: 48,
    fontWeight: "300",
    color: "#FF3B30",
    marginBottom: 32,
    fontVariant: ["tabular-nums"],
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
  micButtonProcessing: {
    backgroundColor: "#8E8E93",
    shadowColor: "#8E8E93",
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
