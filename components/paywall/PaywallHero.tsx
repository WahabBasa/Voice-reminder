import { StyleSheet, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { scaleFontSize } from "../../lib/theme";
import { FONT_DISPLAY } from "../../lib/fonts";
import { getHeroCopy, type PaywallContext } from "../../lib/paywallContent";
import { PAYWALL_GUTTER, paywallColors, paywallHeroGradient, paywallWeight } from "./paywallTheme";

/**
 * Top of the paywall: soft tinted→white gradient behind the three-line serif
 * display headline and its subline. Nothing else — the decorative crescent and
 * dot accents came out, so the type is the only thing in the frame.
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
  copy: {
    alignItems: "center",
  },
  heroLine: {
    fontFamily: FONT_DISPLAY,
    fontSize: scaleFontSize(34),
    lineHeight: scaleFontSize(42),
    color: paywallColors.ink,
    textAlign: "center",
  },
  heroSubtitle: {
    marginTop: 14,
    fontSize: scaleFontSize(15),
    lineHeight: scaleFontSize(22),
    fontWeight: paywallWeight.regular,
    color: paywallColors.ink,
    textAlign: "center",
    paddingHorizontal: 12,
  },
});
