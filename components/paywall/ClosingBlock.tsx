import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import Svg, { Circle, Path } from "react-native-svg";
import { scaleFontSize } from "../../lib/theme";
import { FONT_DISPLAY, FONT_DISPLAY_REGULAR } from "../../lib/fonts";
import { PAYWALL_COPY } from "../../lib/paywallContent";
import { PRIVACY_POLICY_URL, TERMS_OF_USE_URL } from "../../lib/legalLinks";
import { PAYWALL_GUTTER, paywallColors, paywallWeight } from "./paywallTheme";

/**
 * Our own line illustration: the brand crescent with three spoken arcs coming
 * off it — the reminder saying itself out loud. Stroke only, no fill.
 */
function SpokenCrescent() {
  return (
    <Svg width={132} height={96} viewBox="0 0 132 96">
      <Path
        d="M46 12a34 34 0 1 0 26 57 28 28 0 1 1-26-57Z"
        stroke={paywallColors.accent}
        strokeWidth={1.6}
        fill="none"
      />
      <Path
        d="M84 34c5 8 5 20 0 28M96 26c9 13 9 31 0 44M108 20c13 18 13 40 0 58"
        stroke={paywallColors.accent}
        strokeWidth={1.6}
        strokeLinecap="round"
        fill="none"
        opacity={0.75}
      />
      <Circle cx={30} cy={78} r={2.6} fill={paywallColors.accent} opacity={0.5} />
      <Circle cx={70} cy={10} r={2} fill={paywallColors.accent} opacity={0.4} />
    </Svg>
  );
}

type ClosingBlockProps = {
  onRestore: () => void;
  isRestoring: boolean;
  busy: boolean;
  onOpenLink: (url: string) => void;
  /** Auto-renewal disclosure (Schedule 2 §3.8(b)) — rendered verbatim. */
  disclosure: string;
};

/**
 * Bottom of the scroll: closing headline, restore pill, the auto-renewal
 * disclosure, and the two legal links. Both links have to be reachable from the
 * purchase screen, and both come from `lib/legalLinks.ts`.
 */
export default function ClosingBlock({
  onRestore,
  isRestoring,
  busy,
  onOpenLink,
  disclosure,
}: ClosingBlockProps) {
  return (
    <View style={styles.wrap}>
      <Text style={styles.headline}>{PAYWALL_COPY.closingHeadline}</Text>

      <View style={styles.illustration}>
        <SpokenCrescent />
      </View>

      <TouchableOpacity
        style={styles.restorePill}
        onPress={onRestore}
        activeOpacity={0.7}
        disabled={busy}
        accessibilityRole="button"
      >
        {isRestoring ? (
          <View style={styles.restoreRow}>
            <ActivityIndicator size="small" color={paywallColors.ink} />
            <Text style={styles.restoreText}>Restoring…</Text>
          </View>
        ) : (
          <Text style={styles.restoreText}>{PAYWALL_COPY.restoreLabel}</Text>
        )}
      </TouchableOpacity>

      <Text style={styles.brandStatement}>{PAYWALL_COPY.brandStatement}</Text>

      <Text style={styles.disclosure}>{disclosure}</Text>

      <View style={styles.links}>
        <TouchableOpacity onPress={() => onOpenLink(TERMS_OF_USE_URL)} activeOpacity={0.7}>
          <Text style={styles.linkText}>Terms of Use</Text>
        </TouchableOpacity>
        <Text style={styles.linkSeparator}>·</Text>
        <TouchableOpacity onPress={() => onOpenLink(PRIVACY_POLICY_URL)} activeOpacity={0.7}>
          <Text style={styles.linkText}>Privacy Policy</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: PAYWALL_GUTTER,
    alignItems: "center",
  },
  headline: {
    fontFamily: FONT_DISPLAY,
    fontSize: scaleFontSize(26),
    lineHeight: scaleFontSize(34),
    color: paywallColors.ink,
    textAlign: "center",
  },
  illustration: {
    marginTop: 14,
    marginBottom: 22,
  },
  restorePill: {
    minWidth: 190,
    paddingHorizontal: 24,
    paddingVertical: 13,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: paywallColors.cardBorder,
    alignItems: "center",
    justifyContent: "center",
  },
  restoreRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  restoreText: {
    fontSize: scaleFontSize(14),
    fontWeight: paywallWeight.semibold,
    color: paywallColors.ink,
  },
  brandStatement: {
    marginTop: 18,
    fontFamily: FONT_DISPLAY_REGULAR,
    fontSize: scaleFontSize(15),
    lineHeight: scaleFontSize(22),
    color: paywallColors.ink,
    textAlign: "center",
  },
  disclosure: {
    marginTop: 16,
    fontSize: scaleFontSize(11),
    lineHeight: scaleFontSize(16),
    fontWeight: paywallWeight.regular,
    color: paywallColors.ink,
    textAlign: "center",
  },
  links: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: 14,
  },
  linkText: {
    fontSize: scaleFontSize(12),
    fontWeight: paywallWeight.semibold,
    color: paywallColors.ink,
    textDecorationLine: "underline",
  },
  linkSeparator: {
    fontSize: scaleFontSize(12),
    color: paywallColors.ink,
  },
});
