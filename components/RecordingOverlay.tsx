import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Modal,
  Platform,
  ScrollView,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useState, useEffect, useRef } from "react";
import { colors, spacing } from "../lib/theme";
import {
  requestMicrophonePermission,
  startRecording,
  stopRecording,
} from "../lib/audio";

type RecordingState = "idle" | "recording" | "processing";

interface RecordingOverlayProps {
  visible: boolean;
  onClose: () => void;
  onRecordingComplete: (audioUri: string) => void;
}

export default function RecordingOverlay({
  visible,
  onClose,
  onRecordingComplete,
}: RecordingOverlayProps) {
  const [state, setState] = useState<RecordingState>("idle");
  const [duration, setDuration] = useState(0);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!visible) {
      setState("idle");
      setDuration(0);
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
  }, [visible]);

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

  const handleMicPress = async () => {
    if (state === "processing") return;

    if (state === "recording") {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      const uri = await stopRecording();
      setDuration(0);

      if (uri) {
        setState("processing");
        onRecordingComplete(uri);
      } else {
        setState("idle");
      }
    } else {
      const status = await requestMicrophonePermission();
      if (status !== "granted") {
        setPermissionDenied(true);
        return;
      }
      setPermissionDenied(false);
      await startRecording();
      setState("recording");
      timerRef.current = setInterval(() => {
        setDuration((d) => d + 1);
      }, 1000);
    }
  };

  const handleClose = () => {
    if (state === "idle") {
      onClose();
    }
  };

  const getStatusText = () => {
    if (permissionDenied) return "Microphone access required";
    if (state === "processing") return "Creating your reminder...";
    if (state === "recording") return "Listening... Tap to stop";
    return "Tap to record";
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      onRequestClose={handleClose}
    >
      <View style={styles.container}>
        <LinearGradient
          colors={colors.accentGradient}
          style={styles.headerGradient}
        />

        <View style={styles.content}>
          <View style={styles.header}>
            <TouchableOpacity
              onPress={handleClose}
              style={styles.backButton}
              disabled={state !== "idle"}
            >
              <Ionicons name="chevron-back" size={28} color={colors.accent} />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>New Reminder</Text>
          </View>

          <ScrollView
            style={styles.scrollContent}
            contentContainerStyle={styles.scrollContainer}
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.micSection}>
              <TouchableOpacity
                style={[
                  styles.micButton,
                  state === "recording" && styles.micButtonRecording,
                  state === "processing" && styles.micButtonProcessing,
                ]}
                onPress={handleMicPress}
                activeOpacity={0.8}
                disabled={state === "processing"}
              >
                {state === "processing" ? (
                  <ActivityIndicator size="large" color="#fff" />
                ) : (
                  <Ionicons
                    name={state === "recording" ? "stop" : "mic"}
                    size={48}
                    color="#fff"
                  />
                )}
              </TouchableOpacity>

              {state === "recording" && (
                <Text style={styles.timer}>{formatDuration(duration)}</Text>
              )}

              <Text style={styles.statusText}>{getStatusText()}</Text>
            </View>

            {state === "idle" && !permissionDenied && (
              <View style={styles.examplesCard}>
                <Text style={styles.examplesTitle}>Try saying:</Text>
                <View style={styles.exampleItem}>
                  <Ionicons name="chatbubble-outline" size={18} color={colors.accent} />
                  <Text style={styles.exampleText}>"Call mom tomorrow at 3pm"</Text>
                </View>
                <View style={styles.exampleItem}>
                  <Ionicons name="chatbubble-outline" size={18} color={colors.accent} />
                  <Text style={styles.exampleText}>"Take vitamins every morning at 9"</Text>
                </View>
                <View style={styles.exampleItem}>
                  <Ionicons name="chatbubble-outline" size={18} color={colors.accent} />
                  <Text style={styles.exampleText}>"Meeting on Monday at 2pm"</Text>
                </View>
              </View>
            )}

            {state === "processing" && (
              <View style={styles.processingCard}>
                <Text style={styles.processingTitle}>Processing your voice...</Text>
                <Text style={styles.processingSubtitle}>
                  Transcribing and creating your reminder
                </Text>
              </View>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
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
  scrollContent: {
    flex: 1,
  },
  scrollContainer: {
    padding: 20,
    alignItems: "center",
  },
  micSection: {
    alignItems: "center",
    marginTop: 40,
    marginBottom: 40,
  },
  micButton: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: colors.accent,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: spacing.lg,
    shadowColor: colors.accent,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  micButtonRecording: {
    backgroundColor: colors.destructive,
    shadowColor: colors.destructive,
  },
  micButtonProcessing: {
    backgroundColor: colors.textSecondary,
    shadowColor: colors.textSecondary,
  },
  timer: {
    fontSize: 48,
    fontWeight: "300",
    color: colors.destructive,
    marginBottom: spacing.sm,
    fontVariant: ["tabular-nums"],
  },
  statusText: {
    fontSize: 18,
    color: colors.textSecondary,
    textAlign: "center",
  },
  examplesCard: {
    width: "100%",
    backgroundColor: "white",
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: "#e0e0e0",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  examplesTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#333",
    marginBottom: 16,
  },
  exampleItem: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
  },
  exampleText: {
    fontSize: 15,
    color: "#666",
    fontStyle: "italic",
    marginLeft: 10,
  },
  processingCard: {
    width: "100%",
    backgroundColor: "white",
    borderRadius: 16,
    padding: 24,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#e0e0e0",
  },
  processingTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#333",
    marginBottom: 8,
  },
  processingSubtitle: {
    fontSize: 14,
    color: "#666",
    textAlign: "center",
  },
});
