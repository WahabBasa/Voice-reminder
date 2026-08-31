import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import Constants from "expo-constants";
import { borderRadius, colors, scaleFontSize, shadows } from "../lib/theme";
import { FONT_DISPLAY } from "../lib/fonts";
import AppIcon from "../components/AppIcon";
import {
  PRO_PRODUCT_NAME,
  forceRefreshProStatus,
  getProStatusSnapshot,
  openManageSubscriptions,
  readProStatus,
  restorePurchases,
  subscribeToProStatus,
} from "../lib/purchases";
import {
  getProCardContent,
  getRestoreOutcomeContent,
  type ProStatus,
} from "../lib/proCardContent";
// One source of truth for the legal URLs — same constants the paywall and the
// consent card use.
import { PRIVACY_POLICY_URL, TERMS_OF_USE_URL, openInAppBrowser } from "../lib/legalLinks";

type SettingsRowProps = {
  icon: Parameters<typeof AppIcon>[0]["name"];
  label: string;
  subtitle?: string;
  onPress?: () => void;
};

function SettingsRow({ icon, label, subtitle, onPress }: SettingsRowProps) {
  return (
    <TouchableOpacity
      style={styles.row}
      onPress={onPress}
      activeOpacity={0.6}
      disabled={!onPress}
    >
      <View style={styles.rowIcon}>
        <AppIcon name={icon} size={20} color={colors.textSecondary} />
      </View>
      <View style={styles.rowTextWrap}>
        <Text style={styles.rowTitle}>{label}</Text>
        {subtitle ? <Text style={styles.rowSubtitle}>{subtitle}</Text> : null}
      </View>
      {onPress ? (
        <AppIcon name="chevron-right" size={18} color={colors.textTertiary} />
      ) : null}
    </TouchableOpacity>
  );
}

type SettingsContentProps = {
  /** When true, renders for the pager page: no back button, extra bottom padding for the bar. */
  embedded?: boolean;
  /**
   * Whether this is the pager page the user is actually looking at. The pager
   * keeps every page mounted (components/SwipePager), so swiping here is not a
   * route focus and nothing else would tell us to re-check. Defaults to true
   * for the standalone route, where being rendered means being visible.
   */
  visible?: boolean;
};

export function SettingsContent({ embedded = false, visible = true }: SettingsContentProps) {
  const router = useRouter();

  const [isRestoring, setIsRestoring] = useState(false);

  // Seeded from the entitlement cache so a known subscriber never sees
  // "Upgrade to Pro" flash on the first paint.
  const [proStatus, setProStatus] = useState<ProStatus>(() => getProStatusSnapshot());
  const proCard = getProCardContent(proStatus, PRO_PRODUCT_NAME);

  // Track the entitlement rather than sample it. This component mounts once, at
  // cold start, inside the home pager — long before RevenueCat has configured
  // (app/_layout defers it past interactions). Every sampled read at that point
  // answers "unknown", and without this subscription nothing would ever correct
  // it: the SDK's own update listener only refreshes lib/purchases' cache.
  useEffect(() => subscribeToProStatus(setProStatus), []);

  // One resolution pass: the cached answer lands first (instant, possibly
  // stale), the forced re-read follows and catches sandbox expiry, refunds and
  // purchases made on another device. Neither blocks the render, and both fall
  // back to what we already knew rather than inventing "free".
  const resolveProStatus = useCallback(() => {
    let cancelled = false;
    const apply = (status: ProStatus) => {
      if (!cancelled) setProStatus(status);
    };
    void readProStatus().then(apply);
    void forceRefreshProStatus().then(apply);
    return () => {
      cancelled = true;
    };
  }, []);

  // Mount and every route re-focus — how a purchase made on the paywall lands
  // here the moment the user comes back.
  useFocusEffect(resolveProStatus);

  // Arriving at the Settings page by swipe/tab tap changes no route, so it
  // needs its own trigger. Only the false → true edge: staying visible must not
  // re-fire on every unrelated re-render.
  const wasVisible = useRef(visible);
  useEffect(() => {
    const becameVisible = visible && !wasVisible.current;
    wasVisible.current = visible;
    if (!becameVisible) return;
    return resolveProStatus();
  }, [visible, resolveProStatus]);

  // The "can't check" card's tap: ask again, and say so if it still won't
  // answer. Deliberately not a route to the paywall — we don't know whether
  // this user already pays.
  const handleRetryProStatus = async () => {
    const status = await forceRefreshProStatus();
    setProStatus(status);
    if (status === "unknown") {
      Alert.alert(
        "Couldn't check your subscription",
        "Check your connection and try again in a moment."
      );
    }
  };

  const versionLabel = useMemo(() => {
    const version = Constants.expoConfig?.version ?? "1.0.0";
    const build = (Constants as any).nativeBuildVersion ?? (Constants as any).expoConfig?.ios?.buildNumber;
    if (!build) return `v${version}`;
    return `v${version} (${build})`;
  }, []);

  // App Review 3.1.1 wants restore reachable outside the paywall too.
  const handleRestore = async () => {
    if (isRestoring) return;
    setIsRestoring(true);
    const result = await restorePurchases();
    setIsRestoring(false);

    if (result.status === "error") {
      Alert.alert(
        "Restore failed",
        result.category === "network"
          ? "No connection to the App Store. Check your internet and try again."
          : "Couldn't reach the App Store. Please try again shortly."
      );
      return;
    }

    // Restore is the one moment the store gives a definitive answer, so the
    // card reconciles off it in BOTH directions — getRestoreOutcomeContent owns
    // that rule. Only flipping it upward was how a lapsed subscriber kept
    // reading "Active" straight after being told their subscription had ended.
    const outcome = getRestoreOutcomeContent(result.status, PRO_PRODUCT_NAME);
    setProStatus(outcome.proStatus);
    Alert.alert(outcome.title, outcome.message);
  };

  // The manage-subscription UI belongs to the store, so it can decline to
  // appear; openManageSubscriptions swallows that and reports it instead.
  const handleManageSubscription = async () => {
    const opened = await openManageSubscriptions();
    if (!opened) {
      Alert.alert(
        "Couldn't open subscriptions",
        "Manage your subscription under Settings › your Apple Account › Subscriptions."
      );
    }
  };

  // Legal pages open in an in-app browser sheet — reading them doesn't bounce
  // the user out to Safari and lose their place.
  const handleOpenLegalLink = async (url: string) => {
    try {
      await openInAppBrowser(url);
    } catch (e) {
      Alert.alert("Unable to open link", "Please try again later.");
    }
  };

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={[styles.scrollContent, embedded && styles.scrollContentEmbedded]}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.header}>
        {!embedded ? (
          <TouchableOpacity
            onPress={() => router.back()}
            style={styles.backButton}
            activeOpacity={0.7}
          >
            <AppIcon name="chevron-left" size={24} color={colors.textPrimary} />
          </TouchableOpacity>
        ) : null}
        <Text style={styles.headerTitle}>Settings</Text>
      </View>

      {/* Pro card: the upgrade pitch for a confirmed free user, the
          subscription's status (with a way into the store) for a subscriber,
          and a retry for the state where we don't know which they are */}
      <TouchableOpacity
        style={styles.proCard}
        onPress={
          proCard.action === "manage"
            ? () => void handleManageSubscription()
            : proCard.action === "retry"
              ? () => void handleRetryProStatus()
              : () => router.push("/paywall")
        }
        activeOpacity={0.7}
      >
        <View style={styles.proLeft}>
          <View style={styles.proIconWrap}>
            <AppIcon name="crown" size={20} color="#fff" />
          </View>
          <View>
            <Text style={styles.proTitle}>{proCard.title}</Text>
            <Text style={styles.proSubtitle}>{proCard.subtitle}</Text>
          </View>
        </View>
        <AppIcon name="chevron-right" size={18} color={colors.accent} />
      </TouchableOpacity>

      {/* General: the ONE notifications entry point */}
      <Text style={styles.sectionLabel}>General</Text>
      <View style={styles.card}>
        <SettingsRow
          icon="bell"
          label="Notifications & alarms"
          subtitle="Permissions, scheduled alarms & system settings"
          onPress={() => router.push("/diagnostics")}
        />
        <View style={styles.separator} />
        <SettingsRow
          icon="refresh-cw"
          label="Restore purchases"
          subtitle={isRestoring ? "Restoring…" : "Already subscribed? Get Pro back"}
          onPress={isRestoring ? undefined : handleRestore}
        />
      </View>

      {/* About: the two legal documents, reachable without leaving the app
          (Guideline 5.1.1(i) wants the policy in-app and easy to find) */}
      <Text style={styles.sectionLabel}>About</Text>
      <View style={styles.card}>
        <SettingsRow
          icon="shield"
          label="Privacy Policy"
          subtitle="What we collect and who processes it"
          onPress={() => void handleOpenLegalLink(PRIVACY_POLICY_URL)}
        />
        <View style={styles.separator} />
        <SettingsRow
          icon="file-text"
          label="Terms of Use"
          subtitle="Subscription terms and app licence"
          onPress={() => void handleOpenLegalLink(TERMS_OF_USE_URL)}
        />
      </View>

      {/* Version footer */}
      <Text style={styles.versionFooter}>Remi {versionLabel}</Text>
    </ScrollView>
  );
}

export default function SettingsScreen() {
  return (
    <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
      <SettingsContent />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scroll: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  scrollContentEmbedded: {
    paddingBottom: 120,
  },
  header: {
    paddingTop: Platform.OS === "ios" ? 20 : 16,
    paddingBottom: 20,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface,
  },
  headerTitle: {
    fontFamily: FONT_DISPLAY,
    fontSize: scaleFontSize(30),
    color: colors.textHeading,
  },

  // Pro card
  proCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: colors.accent + "12",
    borderWidth: 1.5,
    borderColor: colors.accent + "30",
    borderRadius: borderRadius.card,
    padding: 16,
    marginBottom: 24,
  },
  proLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  proIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  proTitle: {
    fontSize: scaleFontSize(16),
    fontWeight: "700",
    color: colors.accent,
  },
  proSubtitle: {
    fontSize: scaleFontSize(13),
    color: colors.accent,
    opacity: 0.7,
    marginTop: 1,
  },

  // Card
  card: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.card,
    overflow: "hidden",
    marginBottom: 24,
    ...shadows.card,
  },
  sectionLabel: {
    fontSize: scaleFontSize(13),
    fontWeight: "600",
    letterSpacing: 0.6,
    textTransform: "uppercase",
    color: colors.textTertiary,
    marginBottom: 8,
    marginLeft: 4,
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
    marginLeft: 64,
  },

  // Row
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 16,
    paddingHorizontal: 16,
  },
  rowIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  rowTextWrap: {
    flex: 1,
  },
  rowTitle: {
    fontSize: scaleFontSize(16),
    fontWeight: "600",
    color: colors.textPrimary,
  },
  rowSubtitle: {
    fontSize: scaleFontSize(13),
    color: colors.textSecondary,
    marginTop: 1,
  },

  // Footer
  versionFooter: {
    marginTop: 24,
    textAlign: "center",
    fontSize: scaleFontSize(13),
    color: colors.textTertiary,
  },
});
