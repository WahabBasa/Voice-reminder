import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
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
import {
  Gesture,
  GestureDetector,
  GestureHandlerRootView,
} from "react-native-gesture-handler";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useState, useEffect, useRef } from "react";
import { colors, scaleFontSize } from "../lib/theme";
import AppIcon from "./AppIcon";
import VoiceMeter from "./VoiceMeter";
import ProcessingWave from "./ProcessingWave";
import {
  requestMicrophonePermission,
  startRecording,
  pauseRecording,
  resumeRecording,
  stopRecording,
} from "../lib/audio";
import { createTraceId, perfLog } from "../lib/perf";
import { concentricCardRadius } from "../lib/screenCorners";

const MAX_RECORDING_SECONDS = 120; // 2 minute cap

const DRAG_DISMISS_DISTANCE = 120;
const DRAG_DISMISS_VELOCITY = 800;
const DRAG_RUBBER_BAND = 0.2;

// Equal gap between the card and the screen edge on left, right and bottom.
const EDGE_GAP = 10;

// Closed/rest card height — just enough for the 28px corner radius to render
// cleanly before the entrance stretch begins.
const SHEET_REST_HEIGHT = 90;

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
  // Fired once the mic is cleared to start, before the recorder itself is up.
  // Used to prefetch the Convex upload URL so the upload can begin the instant
  // the recording stops (OLD-106).
  onRecordingStart?: (traceId: string) => void;
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
  onRecordingStart,
  onRecordingComplete,
  onCancelProcessing,
}: RecordingOverlayProps) {
  const { height: windowHeight } = useWindowDimensions();
  const openHeight = Math.round(windowHeight * 0.48);
  const insets = useSafeAreaInsets();
  // Corners concentric with the display's own curve at this inset.
  const cardRadius = concentricCardRadius(EDGE_GAP, insets.bottom, 28);
  const [state, setState] = useState<RecordingState>("idle");
  const [duration, setDuration] = useState(0);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const traceIdRef = useRef<string | null>(null);

  // Sheet animation (runs on UI thread)
  const sheetTranslateY = useSharedValue(openHeight + 40);
  const sheetHeight = useSharedValue(SHEET_REST_HEIGHT);
  const backdropOpacity = useSharedValue(0);
  const dragStartY = useSharedValue(0);
  // Read from both threads: blocks re-entry into dismissSheet and stops the
  // pan gesture from grabbing the sheet mid-exit (which would strand the modal).
  const isClosing = useSharedValue(false);

  useEffect(() => {
    if (visible) {
      if (initialTraceId && !traceIdRef.current) {
        traceIdRef.current = initialTraceId;
      }
      if (traceIdRef.current) {
        perfLog(traceIdRef.current, "overlay.recording", "visible_true");
      }
      isClosing.value = false;
      // Drawer entrance: a low card rises from below the bottom edge while
      // stretching to its open height. Same spring family on both values so
      // the rise and the stretch read as one continuous motion. Tuned to
      // ~450ms settle — fast, but slow enough that the stretch registers.
      sheetTranslateY.value = withSpring(0, { damping: 23, stiffness: 160, mass: 1 });
      sheetHeight.value = withSpring(openHeight, { damping: 23, stiffness: 160, mass: 1 });
      backdropOpacity.value = withTiming(1, { duration: 250 });
    } else {
      isClosing.value = false;
      sheetTranslateY.value = openHeight + 40;
      sheetHeight.value = SHEET_REST_HEIGHT;
      backdropOpacity.value = 0;
    }
  }, [visible, initialTraceId]);

  const animatedSheetStyle = useAnimatedStyle(() => ({
    height: sheetHeight.value,
    transform: [{ translateY: sheetTranslateY.value }],
  }));
  const animatedBackdropStyle = useAnimatedStyle(() => ({
    opacity: backdropOpacity.value,
  }));
  useEffect(() => {
    if (!visible) {
      setState("idle");
      setDuration(0);
      traceIdRef.current = null;
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
  };

  const stopTimers = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  // Single exit path: slide the sheet out and fade the backdrop, then close.
  // A drag release passes its velocity so the exit continues the finger's motion.
  const dismissSheet = (velocity = 0) => {
    if (isClosing.value) return;
    isClosing.value = true;
    backdropOpacity.value = withTiming(0, { duration: 200 });
    sheetTranslateY.value = withSpring(
      sheetHeight.value + 60,
      { velocity, damping: 26, stiffness: 300, mass: 0.8, overshootClamping: true },
      (finished) => {
        if (finished) {
          runOnJS(onClose)();
        }
      }
    );
  };

  // Discard the current take (if any) and animate out. State/duration reset is
  // deferred to the !visible effect so the UI doesn't flicker mid-exit.
  const discardAndDismiss = async (velocity = 0) => {
    if (state === "processing") return;
    dismissSheet(velocity);
    if (state === "recording" || state === "paused") {
      stopTimers();
      await stopRecording();
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
      const uri = await stopRecording(traceId).finally(() => {
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

      // Warm the upload path while the mic is still coming up (OLD-106). The
      // Convex upload URL is a round trip that used to be spent *after* the
      // user stopped talking, in the dead time between the mic releasing and
      // the first byte going out. Fired here it overlaps recording entirely,
      // and the owner treats it as optional — if it fails, the stop path just
      // fetches one the old way.
      onRecordingStart?.(traceId);

      const tStart = Date.now();
      await startRecording();
      perfLog(traceId, "device.recording", "startRecording_done", {
        ms: Date.now() - tStart,
      });
      setState("recording");
      startTimers();
    }
  };

  const handleBackdropPress = () => {
    // Allow closing by tapping backdrop in any non-processing state
    discardAndDismiss();
  };

  const handleClose = () => {
    if (state === "idle") {
      dismissSheet();
    }
  };

  const handleDelete = () => {
    discardAndDismiss();
  };

  const handleCancelProcessing = () => {
    onCancelProcessing?.();
    dismissSheet();
  };

  const handleDragRelease = (velocity: number) => {
    discardAndDismiss(Math.max(0, velocity));
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

  const panGesture = Gesture.Pan()
    .enabled(state !== "processing")
    .activeOffsetY([-12, 12])
    .onStart(() => {
      if (isClosing.value) return;
      dragStartY.value = sheetTranslateY.value;
    })
    .onUpdate((e) => {
      if (isClosing.value) return;
      const raw = dragStartY.value + e.translationY;
      sheetTranslateY.value = raw >= 0 ? raw : raw * DRAG_RUBBER_BAND;
    })
    .onEnd((e) => {
      if (isClosing.value) return;
      if (
        sheetTranslateY.value > DRAG_DISMISS_DISTANCE ||
        e.velocityY > DRAG_DISMISS_VELOCITY
      ) {
        runOnJS(handleDragRelease)(e.velocityY);
      } else {
        sheetTranslateY.value = withSpring(0, { damping: 21, stiffness: 250, mass: 0.8 });
      }
    });

  const getStatusText = () => {
    if (permissionDenied) return "Microphone access required";
    if (state === "processing") return "Creating your reminder...";
    if (state === "paused") return "Paused";
    if (state === "recording") return "Listening...";
    if (!canStartRecording) {
      // The screen owns the gate copy and supplies it with the lock. This
      // fallback only covers a lock that arrived without any — nothing in the
      // gate consults the network, so it must not read like a wait on one.
      return gateStatusText ?? (showUpgradeCta ? "Upgrade to continue" : "Getting ready...");
    }
    return "Tap the mic to start";
  };

  const showGateLock = state === "idle" && !canStartRecording && showUpgradeCta;

  return (
    <Modal
      visible={visible}
      transparent
      statusBarTranslucent
      animationType="none"
      onRequestClose={handleClose}
    >
      {/* Gestures inside a RN Modal need their own root view on Android */}
      <GestureHandlerRootView style={styles.root}>
        <Animated.View style={[styles.backdrop, animatedBackdropStyle]}>
          <Pressable style={styles.backdropPressable} onPress={handleBackdropPress} />
        </Animated.View>

        <GestureDetector gesture={panGesture}>
          <Animated.View
            style={[styles.sheet, { borderRadius: cardRadius }, animatedSheetStyle]}
          >
            {/* Bottom-anchored at the fixed open height so the card's animated
                height only reveals content from the top (controls first, handle
                bar last) — nothing reflows while the drawer stretches. */}
            <View
              style={[
                styles.sheetContent,
                {
                  height: openHeight,
                  // Safe-area inset lives inside the card so controls clear
                  // the home bar.
                  paddingBottom: insets.bottom > 0 ? insets.bottom + 6 : 18,
                },
              ]}
            >
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

              <View style={styles.meterRow}>
                {/* The live meter hands off to the processing wave in the same
                    slot — the bars that were listening keep moving while we
                    build the reminder. */}
                {state === "processing" ? (
                  <ProcessingWave accessibilityLabel="Creating your reminder" />
                ) : (
                  <VoiceMeter active={state === "recording"} />
                )}
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
                  <Text style={styles.processingText}>Processing…</Text>
                </View>
              )}

              <View style={styles.spacer} />

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
                  onPress={state === "processing" ? handleCancelProcessing : handlePrimaryPress}
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
            </View>
          </Animated.View>
        </GestureDetector>
      </GestureHandlerRootView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: "flex-end",
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0, 0, 0, 0.25)",
  },
  backdropPressable: {
    flex: 1,
  },
  sheet: {
    backgroundColor: "white",
    marginHorizontal: EDGE_GAP,
    marginBottom: EDGE_GAP,
    // Clip the bottom-anchored content while the animated height grows.
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.18,
    shadowRadius: 22,
    elevation: 10,
  },
  sheetContent: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 18,
    paddingTop: 10,
  },
  handleBar: {
    width: 56,
    height: 5,
    borderRadius: 999,
    backgroundColor: colors.borderSubtle,
    alignSelf: "center",
    marginTop: 6,
    marginBottom: 16,
  },
  title: {
    fontSize: scaleFontSize(16),
    fontWeight: "700",
    color: colors.textPrimary,
    textAlign: "center",
  },
  gateRow: {
    marginTop: 12,
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
  meterRow: {
    marginTop: 28,
    height: 34,
    alignItems: "center",
    justifyContent: "center",
  },
  transcript: {
    marginTop: 14,
    textAlign: "center",
    fontSize: scaleFontSize(15),
    color: colors.textPrimary,
    fontWeight: "500",
  },
  timerPill: {
    marginTop: 18,
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
  spacer: {
    flex: 1,
    minHeight: 20,
  },
  controlsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
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
