/**
 * Proof surfaces — press cards, testimonials, award badges.
 *
 * All three ship dark: `PAYWALL_PROOF_FLAGS` is off and the content arrays in
 * `lib/paywallContent.ts` are empty. Each component checks both, so nothing can
 * render invented social proof even if a flag gets flipped early.
 */

import { ScrollView, StyleSheet, Text, View } from "react-native";
import Svg, { Path } from "react-native-svg";
import { scaleFontSize } from "../../lib/theme";
import { FONT_DISPLAY } from "../../lib/fonts";
import {
  AWARD_BADGES,
  PAYWALL_PROOF_FLAGS,
  PROOF_CARDS,
  TESTIMONIALS,
} from "../../lib/paywallContent";
import { PAYWALL_GUTTER, paywallColors } from "./paywallTheme";

/** Warm-tone star row. `count` is whatever the real review carried. */
function Stars({ count }: { count: number }) {
  const stars = Math.max(0, Math.min(5, Math.round(count)));
  return <Text style={styles.stars}>{"★".repeat(stars)}</Text>;
}

/** Horizontally scrolling cards, neighbours peeking at both screen edges. */
export function ProofCarousel() {
  if (!PAYWALL_PROOF_FLAGS.proofCarousel || PROOF_CARDS.length === 0) return null;

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.carousel}
      snapToInterval={272}
      decelerationRate="fast"
    >
      {PROOF_CARDS.map((card) => (
        <View key={card.headline} style={styles.proofCard}>
          <Text style={styles.proofHeadline}>{card.headline}</Text>
          <Text style={styles.proofBody}>{card.body}</Text>
          <Text style={styles.proofSource}>{card.source}</Text>
        </View>
      ))}
    </ScrollView>
  );
}

/** Centred quote blocks: stars, serif quote, plain name. */
export function TestimonialWall() {
  if (!PAYWALL_PROOF_FLAGS.testimonials || TESTIMONIALS.length === 0) return null;

  return (
    <View style={styles.testimonials}>
      {TESTIMONIALS.map((item) => (
        <View key={item.name} style={styles.testimonial}>
          <Stars count={item.stars} />
          <Text style={styles.quote}>{item.quote}</Text>
          <Text style={styles.quoteName}>{item.name}</Text>
        </View>
      ))}
    </View>
  );
}

/** One laurel branch; mirrored with scaleX to flank the badge text. */
function Laurel({ flipped }: { flipped?: boolean }) {
  return (
    <Svg
      width={22}
      height={40}
      viewBox="0 0 22 40"
      style={flipped ? styles.laurelFlipped : undefined}
    >
      <Path
        d="M18 2C8 8 4 18 6 38M15 9C10 9 8 12 8 15M14 17C9 17 7 20 7 23M13 25C8 25 7 28 7 31"
        stroke={paywallColors.textSecondary}
        strokeWidth={1.4}
        strokeLinecap="round"
        fill="none"
      />
    </Svg>
  );
}

/** Laurel-flanked ratings / editorial row. */
export function AwardBadgeRow() {
  if (!PAYWALL_PROOF_FLAGS.awardBadges || AWARD_BADGES.length === 0) return null;

  return (
    <View style={styles.badges}>
      {AWARD_BADGES.map((badge) => (
        <View key={badge.title} style={styles.badge}>
          <Laurel />
          <View style={styles.badgeCopy}>
            <Text style={styles.badgeTitle}>{badge.title}</Text>
            <Text style={styles.badgeSubtitle}>{badge.subtitle}</Text>
          </View>
          <Laurel flipped />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  carousel: {
    paddingHorizontal: PAYWALL_GUTTER,
    gap: 12,
  },
  proofCard: {
    width: 260,
    borderRadius: 22,
    padding: 18,
    backgroundColor: paywallColors.accentWash,
    borderWidth: 1,
    borderColor: paywallColors.cardBorder,
  },
  proofHeadline: {
    fontFamily: FONT_DISPLAY,
    fontSize: scaleFontSize(17),
    color: paywallColors.textHeading,
  },
  proofBody: {
    marginTop: 8,
    fontSize: scaleFontSize(13),
    lineHeight: scaleFontSize(19),
    color: paywallColors.textSecondary,
  },
  proofSource: {
    marginTop: 12,
    fontSize: scaleFontSize(11),
    fontWeight: "700",
    letterSpacing: 0.8,
    textTransform: "uppercase",
    color: paywallColors.textTertiary,
  },
  testimonials: {
    paddingHorizontal: PAYWALL_GUTTER,
    gap: 30,
  },
  testimonial: {
    alignItems: "center",
  },
  stars: {
    fontSize: scaleFontSize(15),
    letterSpacing: 3,
    color: "#E9A23B",
  },
  quote: {
    marginTop: 10,
    fontFamily: FONT_DISPLAY,
    fontSize: scaleFontSize(19),
    lineHeight: scaleFontSize(27),
    color: paywallColors.textHeading,
    textAlign: "center",
  },
  quoteName: {
    marginTop: 10,
    fontSize: scaleFontSize(13),
    color: paywallColors.textSecondary,
  },
  badges: {
    paddingHorizontal: PAYWALL_GUTTER,
    gap: 18,
  },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  badgeCopy: {
    alignItems: "center",
  },
  badgeTitle: {
    fontSize: scaleFontSize(14),
    fontWeight: "700",
    color: paywallColors.textPrimary,
    textAlign: "center",
  },
  badgeSubtitle: {
    marginTop: 2,
    fontSize: scaleFontSize(12),
    color: paywallColors.textSecondary,
    textAlign: "center",
  },
  laurelFlipped: {
    transform: [{ scaleX: -1 }],
  },
});
