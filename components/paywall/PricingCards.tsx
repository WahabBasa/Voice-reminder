import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import type { PurchasesPackage } from "react-native-purchases";
import { scaleFontSize } from "../../lib/theme";
import { FONT_DISPLAY_MEDIUM, FONT_DISPLAY_REGULAR } from "../../lib/fonts";
import { PAYWALL_COPY, type PlanCopy } from "../../lib/paywallContent";
import {
  PAYWALL_CARD_RADIUS,
  PAYWALL_GUTTER,
  paywallColors,
  paywallWeight,
} from "./paywallTheme";

type PricingCardProps = {
  /** Plan name above the price — serif, sentence case. */
  kicker: string;
  plan: PlanCopy;
  selected: boolean;
  /** Only the annual card carries the pill; it overlaps the card's top edge. */
  badge?: string;
  onPress: () => void;
};

function PricingCard({ kicker, plan, selected, badge, onPress }: PricingCardProps) {
  return (
    <TouchableOpacity
      style={[styles.card, selected ? styles.cardSelected : styles.cardPlain]}
      onPress={onPress}
      activeOpacity={0.85}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={`${kicker}, ${plan.priceString}, ${plan.billedLabel}, ${plan.trialLabel}`}
    >
      {badge ? (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{badge}</Text>
        </View>
      ) : null}

      <Text style={styles.kicker}>{kicker}</Text>
      <Text style={styles.price} numberOfLines={1} adjustsFontSizeToFit>
        {plan.priceString}
      </Text>
      <Text style={styles.billed}>{plan.billedLabel}</Text>
      <Text style={styles.trial}>{plan.trialLabel}</Text>
    </TouchableOpacity>
  );
}

type PricingCardsProps = {
  monthly: PlanCopy | null;
  annual: PlanCopy | null;
  selectedIdentifier: string | null;
  onSelect: (pkg: PurchasesPackage) => void;
  isLoading: boolean;
};

/**
 * The two-card row: monthly at full price as the anchor (no trial), annual
 * highlighted with the value pill. Both cards are tappable — the one you pick
 * is what the sticky CTA buys.
 */
export default function PricingCards({
  monthly,
  annual,
  selectedIdentifier,
  onSelect,
  isLoading,
}: PricingCardsProps) {
  if (isLoading) {
    return (
      <View style={styles.stateBox}>
        <ActivityIndicator color={paywallColors.accent} />
      </View>
    );
  }

  if (!monthly && !annual) {
    return (
      <View style={styles.stateBox}>
        <Text style={styles.stateTitle}>{PAYWALL_COPY.plansUnavailable}</Text>
        <Text style={styles.stateBody}>{PAYWALL_COPY.plansUnavailableHint}</Text>
      </View>
    );
  }

  return (
    <View style={styles.row}>
      {monthly ? (
        <PricingCard
          kicker="Monthly"
          plan={monthly}
          selected={selectedIdentifier === monthly.pkg.identifier}
          onPress={() => onSelect(monthly.pkg)}
        />
      ) : null}
      {annual ? (
        <PricingCard
          kicker="Annual"
          plan={annual}
          badge={PAYWALL_COPY.annualBadge}
          selected={selectedIdentifier === annual.pkg.identifier}
          onPress={() => onSelect(annual.pkg)}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    gap: 12,
    paddingHorizontal: PAYWALL_GUTTER,
    // Room for the pill hanging off the annual card's top edge.
    paddingTop: 14,
  },
  card: {
    flex: 1,
    borderRadius: PAYWALL_CARD_RADIUS,
    paddingVertical: 22,
    paddingHorizontal: 14,
    alignItems: "center",
    backgroundColor: paywallColors.surface,
  },
  cardPlain: {
    borderWidth: 1,
    borderColor: paywallColors.cardBorder,
  },
  cardSelected: {
    borderWidth: 2,
    borderColor: paywallColors.ink,
  },
  badge: {
    position: "absolute",
    top: -11,
    alignSelf: "center",
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: paywallColors.accent,
  },
  badgeText: {
    fontSize: scaleFontSize(9),
    fontWeight: paywallWeight.bold,
    letterSpacing: 1,
    textTransform: "uppercase",
    color: "white",
  },
  kicker: {
    fontFamily: FONT_DISPLAY_REGULAR,
    fontSize: scaleFontSize(16),
    color: paywallColors.ink,
  },
  price: {
    marginTop: 8,
    fontFamily: FONT_DISPLAY_MEDIUM,
    fontSize: scaleFontSize(28),
    // No explicit lineHeight: it fights `adjustsFontSizeToFit` and clips the
    // shrunk glyphs on long price strings ("AED 149.99").
    color: paywallColors.ink,
  },
  billed: {
    marginTop: 8,
    fontSize: scaleFontSize(12),
    fontWeight: paywallWeight.regular,
    color: paywallColors.ink,
    textAlign: "center",
  },
  trial: {
    marginTop: 4,
    fontSize: scaleFontSize(12),
    fontWeight: paywallWeight.bold,
    color: paywallColors.ink,
    textAlign: "center",
  },
  stateBox: {
    marginHorizontal: PAYWALL_GUTTER,
    marginTop: 14,
    paddingVertical: 30,
    paddingHorizontal: 20,
    borderRadius: PAYWALL_CARD_RADIUS,
    borderWidth: 1,
    borderColor: paywallColors.cardBorder,
    backgroundColor: paywallColors.surface,
    alignItems: "center",
  },
  stateTitle: {
    fontSize: scaleFontSize(15),
    fontWeight: paywallWeight.bold,
    color: paywallColors.ink,
    textAlign: "center",
  },
  stateBody: {
    marginTop: 6,
    fontSize: scaleFontSize(13),
    fontWeight: paywallWeight.regular,
    color: paywallColors.ink,
    textAlign: "center",
  },
});
