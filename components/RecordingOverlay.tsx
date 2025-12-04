import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Modal,
  Pressable,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useState, useEffect, useRef } from "react";
import { colors, spacing, typography, shadows, borderRadius } from "../lib/theme";
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

  const handleBackdropPress = () => {
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
      transparent
      animationType="fade"
      onRequestClose={handleBackdropPress}
    >
      <Pressable style={styles.backdrop} onPress={handleBackdropPress}>
        <Pressable style={styles.content} onPress={(e) => e.stopPropagation()}>
          <View style={styles.card}>
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
                  size={40}
                  color="#fff"
                />
              )}
            </TouchableOpacity>

            {state === "recording" && (
              <Text style={styles.timer}>{formatDuration(duration)}</Text>
            )}

            <Text style={styles.statusText}>{getStatusText()}</Text>

            {state === "idle" && !permissionDenied && (
              <View style={styles.examples}>
                <Text style={styles.examplesTitle}>Try saying:</Text>
                <Text style={styles.exampleText}>"Call mom tomorrow at 3pm"</Text>
                <Text style={styles.exampleText}>"Take vitamins every morning at 9"</Text>
              </View>
            )}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: "center",
    alignItems: "center",
  },
  content: {
    width: "85%",
    maxWidth: 340,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.lg,
    padding: spacing.xl,
    alignItems: "center",
    ...shadows.card,
  },
  micButton: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: colors.accent,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: spacing.md,
    ...shadows.fab,
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
    fontSize: 36,
    fontWeight: "300",
    color: colors.destructive,
    marginBottom: spacing.sm,
    fontVariant: ["tabular-nums"],
  },
  statusText: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: "center",
    marginBottom: spacing.md,
  },
  examples: {
    alignItems: "center",
  },
  examplesTitle: {
    ...typography.caption,
    marginBottom: spacing.xs,
  },
  exampleText: {
    fontSize: 13,
    color: colors.textSecondary,
    fontStyle: "italic",
    marginBottom: 2,
  },
});
