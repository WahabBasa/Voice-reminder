import { useEffect } from "react";
import { StyleSheet, View, ViewStyle } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { setMeteringListener } from "../lib/audio";

/**
 * Small live voice-level meter (Granola-style): a few centered bars that
 * breathe with real mic input. Levels arrive from the recorder's metering
 * callback and land directly on Reanimated shared values, so the bars
 * animate on the UI thread with zero React re-renders.
 */

// Center-weighted so the middle bar leads — reads as "voice", not a spectrum.
const WEIGHTS = [0.5, 0.78, 1, 0.78, 0.5];
const BAR_HEIGHT = 22;
const REST = 0.18; // resting scale so silence shows dots, not emptiness

// Speech on phone mics sits roughly between -52 dBFS (quiet) and -12 dBFS
// (loud). The power curve lifts mid-volume speech so the meter reads lively
// at normal talking distance instead of idling in the bottom third.
function dbToLevel(db: number): number {
  const level = (db + 52) / 40;
  const clamped = Math.max(0, Math.min(1, level));
  return Math.pow(clamped, 0.6);
}

interface VoiceMeterProps {
  active: boolean;
  color?: string;
  style?: ViewStyle;
}

export default function VoiceMeter({ active, color = "#1a1a1a", style }: VoiceMeterProps) {
  const b0 = useSharedValue(REST);
  const b1 = useSharedValue(REST);
  const b2 = useSharedValue(REST);
  const b3 = useSharedValue(REST);
  const b4 = useSharedValue(REST);

  useEffect(() => {
    const bars = [b0, b1, b2, b3, b4];
    if (!active) {
      for (const bar of bars) {
        bar.value = withTiming(REST, { duration: 180 });
      }
      return;
    }
    setMeteringListener((db) => {
      const level = dbToLevel(db);
      bars.forEach((bar, i) => {
        // Per-sample flutter keeps quiet speech visibly alive without faking
        // the level — the driver is still the real mic reading.
        const flutter = 0.85 + Math.random() * 0.3;
        const target = REST + (1 - REST) * Math.min(1, level * WEIGHTS[i] * flutter);
        // VU-meter dynamics: snap up on syllables, fall away slower.
        const rising = target > bar.value;
        bar.value = withSpring(
          target,
          rising
            ? { damping: 18, stiffness: 500, mass: 0.4 }
            : { damping: 16, stiffness: 180, mass: 0.6 }
        );
      });
    });
    return () => setMeteringListener(null);
  }, [active, b0, b1, b2, b3, b4]);

  const s0 = useAnimatedStyle(() => ({ transform: [{ scaleY: b0.value }] }));
  const s1 = useAnimatedStyle(() => ({ transform: [{ scaleY: b1.value }] }));
  const s2 = useAnimatedStyle(() => ({ transform: [{ scaleY: b2.value }] }));
  const s3 = useAnimatedStyle(() => ({ transform: [{ scaleY: b3.value }] }));
  const s4 = useAnimatedStyle(() => ({ transform: [{ scaleY: b4.value }] }));

  return (
    <View style={[styles.row, style]}>
      {[s0, s1, s2, s3, s4].map((animatedStyle, i) => (
        <Animated.View
          key={i}
          style={[styles.bar, { backgroundColor: color }, animatedStyle]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
    height: BAR_HEIGHT,
  },
  bar: {
    width: 3.5,
    height: BAR_HEIGHT,
    borderRadius: 999,
  },
});
