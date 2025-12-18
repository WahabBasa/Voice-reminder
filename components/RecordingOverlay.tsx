import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useMemo, useState, useEffect, useRef } from "react";
import { colors, scaleFontSize } from "../lib/theme";
import AppIcon from "./AppIcon";
import {
  requestMicrophonePermission,
  startRecording,
  pauseRecording,
  resumeRecording,
  stopRecording,
} from "../lib/audio";

type RecordingState = "idle" | "recording" | "paused" | "processing";

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
  const { height: windowHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [state, setState] = useState<RecordingState>("idle");
  const [duration, setDuration] = useState(0);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const waveformTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [waveformHeights, setWaveformHeights] = useState<number[]>([]);

  useEffect(() => {
    if (!visible) {
      setState("idle");
      setDuration(0);
      setWaveformHeights([]);
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      if (waveformTimerRef.current) {
        clearInterval(waveformTimerRef.current);
        waveformTimerRef.current = null;
      }
    }
  }, [visible]);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (waveformTimerRef.current) clearInterval(waveformTimerRef.current);
    };
  }, []);

  const formatDuration = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  const startTimers = () => {
    if (!timerRef.current) {
      timerRef.current = setInterval(() => {
        setDuration((d) => d + 1);
      }, 1000);
    }
    if (!waveformTimerRef.current) {
      waveformTimerRef.current = setInterval(() => {
        setWaveformHeights((prev) => {
          if (prev.length === 0) return prev;
          const next = prev.map((h) => {
            const jitter = (Math.random() - 0.5) * 0.4;
            const clamped = Math.max(0.1, Math.min(1, h + jitter));
            return clamped;
          });
          return next;
        });
      }, 140);
    }
  };

  const stopTimers = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (waveformTimerRef.current) {
      clearInterval(waveformTimerRef.current);
      waveformTimerRef.current = null;
    }
  };

  const handlePrimaryPress = async () => {
    if (state === "processing") return;

    if (state === "recording" || state === "paused") {
      stopTimers();
      const uri = await stopRecording();

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
      setWaveformHeights(Array.from({ length: 28 }, () => 0.4 + Math.random() * 0.6));
      setState("recording");
      startTimers();
    }
  };

  const handleClose = () => {
    if (state === "idle") {
      onClose();
    }
  };

  const handleDelete = async () => {
    if (state === "processing") return;
    if (state === "idle") {
      onClose();
      return;
    }

    stopTimers();
    await stopRecording();
    setDuration(0);
    setState("idle");
    onClose();
  };

  const handlePauseToggle = async () => {
    if (state === "processing" || state === "idle") return;
    if (state === "recording") {
      stopTimers();
      await pauseRecording();
      setState("paused");
      return;
    }

    await resumeRecording();
    setState("recording");
    startTimers();
  };

  const getStatusText = () => {
    if (permissionDenied) return "Microphone access required";
    if (state === "processing") return "Creating your reminder...";
    if (state === "paused") return "Paused";
    if (state === "recording") return "Listening...";
    return "Tap the mic to start";
  };

  const waveformBars = useMemo(() => {
    if (waveformHeights.length === 0) {
      return Array.from({ length: 28 }, () => 0.2);
    }
    return waveformHeights;
  }, [waveformHeights]);

  const sheetBottomOffset = useMemo(() => {
    const base = Platform.OS === "ios" ? 28 : 18;
    return base + Math.round(windowHeight * 0.05) + insets.bottom;
  }, [windowHeight, insets.bottom]);

  return (
    <Modal
      visible={visible}
      transparent
      statusBarTranslucent
      animationType="fade"
      onRequestClose={handleClose}
    >
      <View style={styles.backdrop}>
        <Pressable style={styles.backdropPressable} onPress={handleClose} />

        <View style={[styles.sheet, { marginBottom: sheetBottomOffset }]}>
          <View style={styles.handleBar} />

          <Text style={styles.title}>New Recording</Text>

          <View style={styles.proRow}>
            <AppIcon name="zap" size={14} color={colors.accent} />
            <Text style={styles.proText}>Get Pro for recordings over 1 minute</Text>
          </View>

          <View style={styles.waveform}>
            {waveformBars.map((height, idx) => (
              <View
                key={idx}
                style={[
                  styles.waveBar,
                  {
                    height: 14 + height * 34,
                    opacity:
                      state === "recording" || state === "paused" ? 1 : 0.35,
                  },
                ]}
              />
            ))}
          </View>

          <Text style={styles.transcript} numberOfLines={2}>
            {getStatusText()}
          </Text>

          <View style={styles.timerPill}>
            <View style={styles.timerDot} />
            <Text style={styles.timerText}>{formatDuration(duration)}</Text>
          </View>

          {state === "processing" && (
            <View style={styles.processingRow}>
              <ActivityIndicator size="small" color={colors.textSecondary} />
              <Text style={styles.processingText}>Processing…</Text>
            </View>
          )}

          <View style={styles.controlsRow}>
            <TouchableOpacity
              style={[styles.controlButton, styles.controlButtonGhost]}
              onPress={handleDelete}
              disabled={state === "processing"}
              activeOpacity={0.8}
            >
              <AppIcon name="trash-2" size={22} color="#7a7f86" />
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.primaryButton,
                (state === "recording" || state === "paused") && styles.primaryButtonStop,
                state === "processing" && styles.primaryButtonDisabled,
              ]}
              onPress={handlePrimaryPress}
              disabled={state === "processing"}
              activeOpacity={0.85}
            >
              {state === "processing" ? (
                <ActivityIndicator size="large" color="#fff" />
              ) : (
                <AppIcon
                  name={state === "recording" || state === "paused" ? "square" : "mic"}
                  size={30}
                  color="#fff"
                />
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.controlButton, styles.controlButtonGhost]}
              onPress={handlePauseToggle}
              disabled={state === "processing" || state === "idle"}
              activeOpacity={0.8}
            >
              <AppIcon
                name={state === "paused" ? "play" : "pause"}
                size={22}
                color={state === "processing" || state === "idle" ? "#b9bcc1" : "#7a7f86"}
              />
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.25)",
    justifyContent: "flex-end",
  },
  backdropPressable: {
    flex: 1,
  },
  sheet: {
    backgroundColor: "white",
    marginHorizontal: 16,
    borderRadius: 28,
    paddingHorizontal: 18,
    paddingTop: 10,
    paddingBottom: 18,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.18,
    shadowRadius: 22,
    elevation: 10,
  },
  handleBar: {
    width: 56,
    height: 5,
    borderRadius: 999,
    backgroundColor: "#e7e9ec",
    alignSelf: "center",
    marginTop: 6,
    marginBottom: 14,
  },
  title: {
    fontSize: scaleFontSize(16),
    fontWeight: "700",
    color: colors.textPrimary,
    textAlign: "center",
  },
  proRow: {
    marginTop: 10,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 6,
  },
  proText: {
    fontSize: scaleFontSize(13),
    color: colors.textSecondary,
    fontWeight: "500",
  },
  waveform: {
    marginTop: 18,
    height: 70,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "flex-end",
    gap: 4,
    paddingHorizontal: 6,
  },
  waveBar: {
    width: 5,
    borderRadius: 999,
    backgroundColor: colors.accent,
  },
  transcript: {
    marginTop: 12,
    textAlign: "center",
    fontSize: scaleFontSize(15),
    color: colors.textPrimary,
    fontWeight: "500",
  },
  timerPill: {
    marginTop: 14,
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#f1f3f4",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
  },
  timerDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.destructive,
  },
  timerText: {
    fontSize: scaleFontSize(15),
    color: colors.textPrimary,
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
  },
  processingRow: {
    marginTop: 12,
    flexDirection: "row",
    alignSelf: "center",
    alignItems: "center",
    gap: 8,
  },
  processingText: {
    color: colors.textSecondary,
    fontSize: scaleFontSize(14),
    fontWeight: "500",
  },
  controlsRow: {
    marginTop: 18,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  controlButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  controlButtonGhost: {
    backgroundColor: "#f1f3f4",
  },
  primaryButton: {
    width: 68,
    height: 68,
    borderRadius: 34,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.accent,
    shadowColor: colors.accent,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 14,
    elevation: 8,
  },
  primaryButtonStop: {
    backgroundColor: colors.accent,
  },
  primaryButtonDisabled: {
    backgroundColor: "#9aa0a6",
    shadowColor: "#9aa0a6",
  },
});
