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
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
  runOnJS,
} from "react-native-reanimated";
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
import { createTraceId, perfLog } from "../lib/perf";

const MAX_RECORDING_SECONDS = 120; // 2 minute cap

type RecordingState = "idle" | "recording" | "paused" | "processing";

interface RecordingOverlayProps {
  visible: boolean;
  autoStart?: boolean;
  initialTraceId?: string;
  canStartRecording?: boolean;
  gateStatusText?: string;
  showUpgradeCta?: boolean;
  onUpgradePress?: () => void;
  onClose: () => void;
  onRecordingComplete: (audioUri: string, traceId: string) => void;
  onCancelProcessing?: () => void;
}

export default function RecordingOverlay({
  visible,
  autoStart = false,
  initialTraceId,
  canStartRecording = true,
  gateStatusText,
  showUpgradeCta = false,
  onUpgradePress,
  onClose,
  onRecordingComplete,
  onCancelProcessing,
}: RecordingOverlayProps) {
  const { height: windowHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [state, setState] = useState<RecordingState>("idle");
  const [duration, setDuration] = useState(0);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const waveformTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [waveformHeights, setWaveformHeights] = useState<number[]>([]);
  const traceIdRef = useRef<string | null>(null);

  // Sheet animation (runs on UI thread)
  const sheetTranslateY = useSharedValue(400);

  useEffect(() => {
    if (visible) {
      if (initialTraceId && !traceIdRef.current) {
        traceIdRef.current = initialTraceId;
      }
      if (traceIdRef.current) {
        perfLog(traceIdRef.current, "overlay.recording", "visible_true");
      }
      // Animate sheet up from bottom when visible
      sheetTranslateY.value = withTiming(0, { duration: 250 });
    } else {
      sheetTranslateY.value = 400;
    }
  }, [visible, initialTraceId]);

  const animatedSheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: sheetTranslateY.value }],
  }));
  useEffect(() => {
    if (!visible) {
      setState("idle");
      setDuration(0);
      setWaveformHeights([]);
      traceIdRef.current = null;
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

  // Auto-start recording when overlay becomes visible
  const hasAutoStarted = useRef(false);
  useEffect(() => {
    if (visible && autoStart && canStartRecording && !hasAutoStarted.current && state === "idle") {
      hasAutoStarted.current = true;
      // Small delay to let modal animation start
      const timeout = setTimeout(() => {
        handlePrimaryPress();
      }, 50);
      return () => clearTimeout(timeout);
    }
    if (!visible) {
      hasAutoStarted.current = false;
    }
  }, [visible, autoStart, canStartRecording, state]);

  // Auto-stop when recording hits the max duration
  const autoStopTriggered = useRef(false);
  useEffect(() => {
    if (state === "recording" && duration >= MAX_RECORDING_SECONDS && !autoStopTriggered.current) {
      autoStopTriggered.current = true;
      handlePrimaryPress(); // triggers stop path since state === "recording"
    }
    if (state === "idle") {
      autoStopTriggered.current = false;
    }
  }, [duration, state]);

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

    if (state === "idle" && !canStartRecording) {
      const traceId = traceIdRef.current ?? initialTraceId ?? createTraceId("vr");
      traceIdRef.current = traceId;
      perfLog(traceId, "device.recording", "start_blocked_gate");
      return;
    }

    if (state === "recording" || state === "paused") {
      const traceId = traceIdRef.current ?? createTraceId("vr");
      traceIdRef.current = traceId;
      const tStopTap = Date.now();
      perfLog(traceId, "device.recording", "stop_tap");

      stopTimers();
      const uri = await stopRecording().finally(() => {
        perfLog(traceId, "device.recording", "stopRecording_done", {
          ms: Date.now() - tStopTap,
        });
      });

      if (uri) {
        setState("processing");
        perfLog(traceId, "device.recording", "uri_ready");
        onRecordingComplete(uri, traceId);
      } else {
        perfLog(traceId, "device.recording", "stop_no_uri");
        setState("idle");
      }
      } else {
      const traceId = traceIdRef.current ?? createTraceId("vr");
      traceIdRef.current = traceId;
      perfLog(traceId, "device.recording", "start_tap");

      const tPerm = Date.now();
      const status = await requestMicrophonePermission();
      perfLog(traceId, "device.recording", "micPermission_done", {
        ms: Date.now() - tPerm,
        status,
      });
      if (status !== "granted") {
        setPermissionDenied(true);
        return;
      }
      setPermissionDenied(false);

      const tStart = Date.now();
      await startRecording();
      perfLog(traceId, "device.recording", "startRecording_done", {
        ms: Date.now() - tStart,
      });
      setWaveformHeights(Array.from({ length: 28 }, () => 0.4 + Math.random() * 0.6));
      setState("recording");
      startTimers();
    }
  };

  const handleBackdropPress = async () => {
    // Allow closing by tapping backdrop in any non-processing state
    if (state === "processing") return;
    if (state === "recording" || state === "paused") {
      // Stop recording and close
      stopTimers();
      await stopRecording();
      setDuration(0);
      setState("idle");
    }
    onClose();
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
    if (!canStartRecording) {
      return gateStatusText ?? (showUpgradeCta ? "Upgrade to continue" : "Checking your plan...");
    }
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

  const showGateLock = state === "idle" && !canStartRecording && showUpgradeCta;

  return (
    <Modal
      visible={visible}
      transparent
      statusBarTranslucent
      animationType="fade"
      onRequestClose={handleClose}
    >
      <View style={styles.backdrop}>
        <Pressable style={styles.backdropPressable} onPress={handleBackdropPress} />

        <Animated.View style={[styles.sheet, { marginBottom: sheetBottomOffset }, animatedSheetStyle]}>
          <View style={styles.handleBar} />

          <Text style={styles.title}>New Recording</Text>

          {showGateLock && (
            <View style={styles.gateRow}>
              <View style={styles.gateLeft}>
                <AppIcon name="crown" size={14} color={colors.accent} />
                <Text style={styles.gateText} numberOfLines={2}>
                  {gateStatusText ?? "Free limit reached"}
                </Text>
              </View>
              {showUpgradeCta && onUpgradePress && (
                <TouchableOpacity
                  style={styles.upgradeButton}
                  onPress={onUpgradePress}
                  activeOpacity={0.85}
                >
                  <Text style={styles.upgradeButtonText}>Upgrade</Text>
                </TouchableOpacity>
              )}
            </View>
          )}

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
              disabled={state === "idle" && !canStartRecording}
              style={[
                styles.primaryButton,
                (state === "recording" || state === "paused") && styles.primaryButtonStop,
                state === "processing" && styles.primaryButtonCancel,
                state !== "processing" && state === "idle" && !canStartRecording && styles.primaryButtonDisabled,
              ]}
              onPress={state === "processing" ? () => {
                setState("idle");
                setDuration(0);
                onCancelProcessing?.();
                onClose();
              } : handlePrimaryPress}
              activeOpacity={0.85}
            >
              <AppIcon
                name={state === "processing" ? "x" : (state === "recording" || state === "paused" ? "square" : "mic")}
                size={30}
                color="#fff"
              />
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
        </Animated.View>
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
    backgroundColor: colors.borderSubtle,
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
  gateRow: {
    marginTop: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    backgroundColor: colors.surface,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  gateLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flex: 1,
  },
  gateText: {
    fontSize: scaleFontSize(13),
    color: colors.textSecondary,
    fontWeight: "600",
    flex: 1,
  },
  upgradeButton: {
    backgroundColor: colors.accent,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
  },
  upgradeButtonText: {
    color: "white",
    fontSize: scaleFontSize(13),
    fontWeight: "800",
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
    backgroundColor: colors.surface,
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
    backgroundColor: colors.surface,
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
    backgroundColor: colors.textTertiary,
    shadowColor: colors.textTertiary,
  },
  primaryButtonCancel: {
    backgroundColor: colors.destructive,
    shadowColor: colors.destructive,
  },
});
