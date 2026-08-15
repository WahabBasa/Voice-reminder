import { StyleSheet, Text, View } from "react-native";
import { scaleFontSize } from "../../lib/theme";
import { FONT_DISPLAY } from "../../lib/fonts";
import AppIcon from "../AppIcon";
import { PAYWALL_COPY, getFeatureRows, type TierCell } from "../../lib/paywallContent";
import { PAYWALL_GUTTER, paywallColors } from "./paywallTheme";

/** A check circle, a short value, or an em dash for "not on this tier". */
function Cell({ cell, muted }: { cell: TierCell; muted?: boolean }) {
  if (cell.kind === "check") {
    return (
      <View style={[styles.check, muted && styles.checkMuted]}>
        <AppIcon name="check" size={12} color="white" strokeWidth={3} />
      </View>
    );
  }
  if (cell.kind === "text") {
    return <Text style={[styles.cellText, muted && styles.cellTextMuted]}>{cell.label}</Text>;
  }
  return <Text style={styles.cellEmpty}>—</Text>;
}

/**
 * PRO / FREE comparison. Rows come from `getFeatureRows()`, which mirrors what
 * the build actually gates — nothing here is aspirational.
 */
export default function FeatureTable() {
  const rows = getFeatureRows();

  return (
    <View style={styles.wrap}>
      <Text style={styles.heading}>{PAYWALL_COPY.featureHeading}</Text>

      <View style={styles.container}>
        <View style={styles.headRow}>
          <View style={styles.featureCol} />
          <Text style={styles.colHead}>PRO</Text>
          <Text style={[styles.colHead, styles.colHeadMuted]}>FREE</Text>
        </View>

        {rows.map((row, index) => (
          <View key={row.feature} style={[styles.row, index > 0 && styles.rowDivided]}>
            <Text style={styles.feature}>{row.feature}</Text>
            <View style={styles.tierCol}>
              <Cell cell={row.pro} />
            </View>
            <View style={styles.tierCol}>
              <Cell cell={row.free} muted />
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: PAYWALL_GUTTER,
  },
  heading: {
    fontFamily: FONT_DISPLAY,
    fontSize: scaleFontSize(24),
    color: paywallColors.textHeading,
    textAlign: "center",
    marginBottom: 16,
  },
  container: {
    borderRadius: 24,
    backgroundColor: paywallColors.accentWash,
    paddingHorizontal: 18,
    paddingVertical: 6,
  },
  headRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
  },
  featureCol: {
    flex: 1,
  },
  colHead: {
    width: 56,
    textAlign: "center",
    fontSize: scaleFontSize(10),
    fontWeight: "800",
    letterSpacing: 1.4,
    color: paywallColors.accent,
  },
  colHeadMuted: {
    color: paywallColors.textTertiary,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
  },
  rowDivided: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: paywallColors.hairline,
  },
  feature: {
    flex: 1,
    paddingRight: 10,
    fontSize: scaleFontSize(14),
    lineHeight: scaleFontSize(19),
    color: paywallColors.textPrimary,
  },
  tierCol: {
    width: 56,
    alignItems: "center",
  },
  check: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: paywallColors.accent,
  },
  checkMuted: {
    backgroundColor: paywallColors.textTertiary,
  },
  cellText: {
    fontSize: scaleFontSize(12),
    fontWeight: "700",
    color: paywallColors.accent,
    textAlign: "center",
  },
  cellTextMuted: {
    color: paywallColors.textSecondary,
  },
  cellEmpty: {
    fontSize: scaleFontSize(14),
    color: paywallColors.textTertiary,
  },
});
