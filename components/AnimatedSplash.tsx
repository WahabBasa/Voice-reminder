import { useCallback, useEffect, useRef } from "react";
import { Image, StyleSheet } from "react-native";
import * as SplashScreen from "expo-splash-screen";
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { SPLASH_FALLBACK_MS, splashExitDelayMs } from "./splashTiming";

/**
 * The JS half of the launch screen. It is drawn to be pixel-identical to the
 * native splash (same blue, same glyph, same 200pt box as the expo-splash-screen
 * plugin config in app.json), so hiding the native one behind it is invisible —
 * then it plays the exit the native splash can't.
 */

/** Must stay in sync with the plugin's backgroundColor/imageWidth in app.json. */
const BACKGROUND = "#3D8BFF";
const IMAGE_SIZE = 200;

const POP_UP_MS = 180;
const POP_DOWN_MS = 140;
const FADE_MS = 320;
const EXIT_MS = POP_UP_MS + POP_DOWN_MS + FADE_MS;

/** If onLayout somehow never fires, hide the native splash anyway. */
const HANDOFF_BACKSTOP_MS = 150;

type AnimatedSplashProps = {
  /** App is usable — fonts resolved, first screen can paint. */
  ready: boolean;
  /** Fired once, after the exit animation; the parent unmounts the overlay. */
  onFinish: () => void;
};

export default function AnimatedSplash({ ready, onFinish }: AnimatedSplashProps) {
  const opacity = useSharedValue(1);
  const overlayScale = useSharedValue(1);
  const iconScale = useSharedValue(1);

  const mountedAtRef = useRef(Date.now());
  const exitingRef = useRef(false);
  const finishedRef = useRef(false);
  const nativeHiddenRef = useRef(false);
  const safetyRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const finish = useCallback(() => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    onFinish();
  }, [onFinish]);

  const exit = useCallback(() => {
    if (exitingRef.current) return;
    exitingRef.current = true;

    iconScale.value = withSequence(
      withTiming(1.08, { duration: POP_UP_MS, easing: Easing.out(Easing.cubic) }),
      withTiming(1, { duration: POP_DOWN_MS, easing: Easing.inOut(Easing.cubic) })
    );

    const fadeAt = POP_UP_MS + POP_DOWN_MS;
    overlayScale.value = withDelay(
      fadeAt,
      withTiming(1.06, { duration: FADE_MS, easing: Easing.out(Easing.cubic) })
    );
    opacity.value = withDelay(
      fadeAt,
      withTiming(0, { duration: FADE_MS, easing: Easing.out(Easing.cubic) }, () => {
        "worklet";
        runOnJS(finish)();
      })
    );

    // The overlay covers the whole app, so it can never depend on the animation
    // callback arriving to get out of the way.
    safetyRef.current = setTimeout(finish, EXIT_MS + 250);
  }, [finish, iconScale, opacity, overlayScale]);

  // Handing off: the native splash is identical to what we just laid out, so it
  // can go. Backed by a timer because a stranded native splash hides the whole app.
  const hideNative = useCallback(() => {
    if (nativeHiddenRef.current) return;
    nativeHiddenRef.current = true;
    SplashScreen.hideAsync().catch(() => {});
  }, []);

  useEffect(() => {
    const backstop = setTimeout(hideNative, HANDOFF_BACKSTOP_MS);
    return () => {
      clearTimeout(backstop);
      if (safetyRef.current) clearTimeout(safetyRef.current);
    };
  }, [hideNative]);

  useEffect(() => {
    const delay = splashExitDelayMs(ready, Date.now() - mountedAtRef.current);
    if (delay === null) return;
    const timer = setTimeout(exit, delay);
    return () => clearTimeout(timer);
  }, [ready, exit]);

  useEffect(() => {
    const timer = setTimeout(exit, SPLASH_FALLBACK_MS);
    return () => clearTimeout(timer);
  }, [exit]);

  const overlayStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scale: overlayScale.value }],
  }));

  const iconStyle = useAnimatedStyle(() => ({
    transform: [{ scale: iconScale.value }],
  }));

  return (
    <Animated.View style={[styles.overlay, overlayStyle]} pointerEvents="auto" onLayout={hideNative}>
      <Animated.View style={iconStyle}>
        <Image
          source={require("../assets/splash-icon.png")}
          style={styles.image}
          resizeMode="contain"
          fadeDuration={0}
        />
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: BACKGROUND,
    zIndex: 9999,
    elevation: 9999,
  },
  image: {
    width: IMAGE_SIZE,
    height: IMAGE_SIZE,
  },
});
