import { StyleSheet, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Svg, { Path } from "react-native-svg";
import { scaleFontSize } from "../../lib/theme";
import { FONT_DISPLAY } from "../../lib/fonts";
import { getHeroCopy, type PaywallContext } from "../../lib/paywallContent";
import { PAYWALL_GUTTER, paywallColors, paywallHeroGradient } from "./paywallTheme";

/** Scattered dot accents, positioned as fractions of the hero box. */
const DOTS: { top: number; left: number; size: number; opacity: number }[] = [
  { top: 34, left: 26, size: 7, opacity: 1 },
  { top: 96, left: 12, size: 4, opacity: 0.7 },
  { top: 150, left: 40, size: 5, opacity: 0.5 },
  { top: 62, left: 300, size: 5, opacity: 0.6 },
  { top: 190, left: 288, size: 8, opacity: 0.9 },
];

/**
 * Crescent drawn as a single path (big arc out, smaller arc back) so it can
 * bleed off the right edge without a mask. react-native-svg is already in the
 * bundle — lucide icons render through it — so this adds no native surface.
 */
function BrandCrescent() {
  return (
    <Svg width={230} height={230} viewBox="0 0 100 100">
      <Path
        d="M50 4 A46 46 0 1 0 86 78 A38 38 0 1 1 50 4 Z"
        fill={paywallColors.accent}
        opacity={0.16}
      />
    </Svg>
  );
}

/**
 * Top of the paywall: soft tinted→white gradient, dot accents, a brand crescent
 * bleeding off the right edge, and the three-line serif display headline.
 *
 * The headline is the one part of the screen that answers "why am I here" — it
 * follows the entry context (OLD-100), everything below it does not.
 *
 * The gradient runs edge to edge under the status bar, so the safe-area inset
 * comes in as padding rather than as a gap above the hero.
 */
export default function PaywallHero({
  topInset = 0,
  context = "default",
}: {
  topInset?: number;
  context?: PaywallContext;
}) {
  const hero = getHeroCopy(context);

  return (
    <View style={[styles.hero, { paddingTop: topInset + 62 }]}>
      <LinearGradient
        colors={paywallHeroGradient}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={StyleSheet.absoluteFill}
      />

      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        <View style={styles.crescent}>
          <BrandCrescent />
        </View>
        {DOTS.map((dot, index) => (
          <View
            key={index}
            style={[
              styles.dot,
              {
                top: dot.top,
                left: dot.left,
                width: dot.size,
                height: dot.size,
                borderRadius: dot.size / 2,
                opacity: dot.opacity,
              },
            ]}
          />
        ))}
      </View>

      <View style={styles.copy}>
        {hero.lines.map((line) => (
          <Text key={line} style={styles.heroLine}>
            {line}
          </Text>
        ))}
        <Text style={styles.heroSubtitle}>{hero.subtitle}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: {
    paddingBottom: 34,
    paddingHorizontal: PAYWALL_GUTTER,
    overflow: "hidden",
  },
  crescent: {
    position: "absolute",
    top: -34,
    right: -104,
  },
  dot: {
    position: "absolute",
    backgroundColor: paywallColors.accent,
  },
  copy: {
    alignItems: "center",
  },
  heroLine: {
    fontFamily: FONT_DISPLAY,
    fontSize: scaleFontSize(34),
    lineHeight: scaleFontSize(42),
    color: paywallColors.textHeading,
    textAlign: "center",
  },
  heroSubtitle: {
    marginTop: 14,
    fontSize: scaleFontSize(15),
    lineHeight: scaleFontSize(22),
    color: paywallColors.textSecondary,
    textAlign: "center",
    paddingHorizontal: 12,
  },
});
