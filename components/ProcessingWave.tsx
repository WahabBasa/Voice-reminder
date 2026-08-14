import { useEffect } from "react";
import { StyleSheet, View, ViewStyle } from "react-native";
import Animated, {
  cancelAnimation,
  Easing,
  SharedValue,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import { colors } from "../lib/theme";

/**
 * Calm "we're working on it" waveform — the processing sibling of VoiceMeter.
 * A swell travels left to right across five bars while the whole row breathes
 * on a slower, deliberately unrelated period, so the two cycles drift against
 * each other and the loop never lands on an obvious repeat.
 *
 * Everything is driven by two linear shared values fed through sine on the UI
 * thread: sin has period 1, so a value looping 0 -> 1 is seamless by
 * construction — no reverse, no visible seam, zero React re-renders.
 */

const BAR_COUNT = 5;
// Center-weighted like VoiceMeter so the shape still reads as "voice".
const WEIGHTS = [0.6, 0.82, 1, 0.82, 0.6];
// Lag per bar, in fractions of a cycle. 0.14 spreads the swell over ~half a
// cycle — enough travel to read as motion, not so much the bars go opposed.
const PHASE_STEP = 0.14;

const TRAVEL_MS = 1500; // one swell crossing
const BREATH_MS = 2300; // whole-row breath — not a multiple of TRAVEL_MS
const MIN_SCALE = 0.24; // resting scale, so troughs are dots not gaps

interface BarProps {
  index: number;
  wave: SharedValue<number>;
  color: string;
  height: number;
  width: number;
}

function Bar({ index, wave, color, height, width }: BarProps) {
  const animatedStyle = useAnimatedStyle(() => {
    const t = wave.value - index * PHASE_STEP;
    const raw = 0.5 + 0.5 * Math.sin(2 * Math.PI * t);
    // Smoothstep: hangs a beat at the top and bottom of each swell instead of
    // sweeping through at constant speed — reads as breathing, not machinery.
    const eased = raw * raw * (3 - 2 * raw);
    const peak = MIN_SCALE + (1 - MIN_SCALE) * WEIGHTS[index];
    return {
      transform: [{ scaleY: MIN_SCALE + (peak - MIN_SCALE) * eased }],
      // Opacity rides the same swell so crests feel lit, troughs recede.
      opacity: 0.45 + 0.55 * eased,
    };
  });

  return (
    <Animated.View
      style={[
        styles.bar,
        { backgroundColor: color, height, width, borderRadius: width },
        animatedStyle,
      ]}
    />
  );
}

interface ProcessingWaveProps {
  color?: string;
  height?: number;
  accessibilityLabel?: string;
  style?: ViewStyle;
}

export default function ProcessingWave({
  color = colors.accent,
  height = 26,
  accessibilityLabel = "Processing",
  style,
}: ProcessingWaveProps) {
  const wave = useSharedValue(0);
  const breath = useSharedValue(0);

  useEffect(() => {
    wave.value = withRepeat(
      withTiming(1, { duration: TRAVEL_MS, easing: Easing.linear }),
      -1,
      false
    );
    breath.value = withRepeat(
      withTiming(1, { duration: BREATH_MS, easing: Easing.linear }),
      -1,
      false
    );
    return () => {
      cancelAnimation(wave);
      cancelAnimation(breath);
    };
  }, [wave, breath]);

  const rowStyle = useAnimatedStyle(() => {
    const swell = 0.5 + 0.5 * Math.sin(2 * Math.PI * breath.value);
    return { transform: [{ scale: 0.97 + 0.06 * swell }] };
  });

  const barWidth = Math.max(3.5, Math.round(height * 0.16));

  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={accessibilityLabel}
      style={style}
    >
      <Animated.View style={[styles.row, { height, gap: barWidth + 1 }, rowStyle]}>
        {Array.from({ length: BAR_COUNT }, (_, i) => (
          <Bar key={i} index={i} wave={wave} color={color} height={height} width={barWidth} />
        ))}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  bar: {
    borderRadius: 999,
  },
});
