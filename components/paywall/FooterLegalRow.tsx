import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { scaleFontSize } from "../../lib/theme";
import { PRIVACY_POLICY_URL, TERMS_OF_USE_URL } from "../../lib/legalLinks";
import { paywallColors, paywallWeight } from "./paywallTheme";

type FooterLegalRowProps = {
  /** Opens a legal page in the in-app browser sheet (paywall's handleOpenLink). */
  onOpenLink: (url: string) => void;
  /** Restore purchases (paywall's handleRestore). */
  onRestore: () => void;
  /** isRestoring || isPurchasing — dims and disables Restore while a call is in flight. */
  busy: boolean;
};

/**
 * Always-visible legal row in the sticky footer, directly under the honesty
 * caption. App Review 3.1.2(c) wants working Terms of Use (EULA) and Privacy
 * Policy links on the subscription screen without scrolling — the full versions
 * still live at the bottom of the scroll in ClosingBlock, this just surfaces
 * them above the fold. Both URLs come from `lib/legalLinks.ts`; nothing here
 * hardcodes a URL. One ink, links underlined (never grayed) to match the screen.
 */
export default function FooterLegalRow({ onOpenLink, onRestore, busy }: FooterLegalRowProps) {
  const hitSlop = { top: 8, bottom: 8, left: 6, right: 6 };
  return (
    <View style={styles.row}>
      <TouchableOpacity
        testID="footer-legal-terms"
        onPress={() => onOpenLink(TERMS_OF_USE_URL)}
        activeOpacity={0.7}
        hitSlop={hitSlop}
        accessibilityRole="link"
      >
        <Text style={styles.link}>Terms of Use</Text>
      </TouchableOpacity>

      <Text style={styles.separator}>·</Text>

      <TouchableOpacity
        testID="footer-legal-privacy"
        onPress={() => onOpenLink(PRIVACY_POLICY_URL)}
        activeOpacity={0.7}
        hitSlop={hitSlop}
        accessibilityRole="link"
      >
        <Text style={styles.link}>Privacy Policy</Text>
      </TouchableOpacity>

      <Text style={styles.separator}>·</Text>

      <TouchableOpacity
        testID="footer-legal-restore"
        onPress={onRestore}
        activeOpacity={0.7}
        hitSlop={hitSlop}
        disabled={busy}
        accessibilityRole="button"
      >
        <Text style={[styles.link, busy && styles.linkBusy]}>Restore</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    // Wraps instead of clipping at the largest Dynamic Type sizes; the footer
    // height is measured, so a second line is absorbed automatically.
    flexWrap: "wrap",
    gap: 6,
    marginTop: 10,
  },
  link: {
    fontSize: scaleFontSize(12),
    lineHeight: scaleFontSize(16),
    fontWeight: paywallWeight.semibold,
    color: paywallColors.ink,
    textDecorationLine: "underline",
  },
  // Reduced opacity while a restore/purchase is in flight — same busy handling
  // as ClosingBlock's restore pill, without introducing gray text.
  linkBusy: {
    opacity: 0.4,
  },
  separator: {
    fontSize: scaleFontSize(12),
    lineHeight: scaleFontSize(16),
    color: paywallColors.ink,
  },
});
