import { useCallback, useMemo, useState } from "react";
import { Alert, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import Constants from "expo-constants";
import { borderRadius, colors, scaleFontSize, shadows } from "../lib/theme";
import { FONT_DISPLAY } from "../lib/fonts";
import AppIcon from "../components/AppIcon";
import {
  PRO_PRODUCT_NAME,
  checkProStatus,
  getCachedProStatus,
  openManageSubscriptions,
  refreshProStatus,
  restorePurchases,
} from "../lib/purchases";
import { getProCardContent } from "../lib/proCardContent";
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
};

export function SettingsContent({ embedded = false }: SettingsContentProps) {
  const router = useRouter();

  const [isRestoring, setIsRestoring] = useState(false);

  // Seeded from the entitlement cache so a known subscriber never sees
  // "Upgrade to Pro" flash on the first paint.
  const [isPro, setIsPro] = useState<boolean | null>(() => getCachedProStatus().isPro);
  const proCard = getProCardContent(isPro, PRO_PRODUCT_NAME);

  // Runs on mount and on every re-focus, which is how a purchase made on the
  // paywall lands here the moment the user comes back. checkProStatus answers
  // from cache (instant, possibly stale); refreshProStatus asks the store
  // behind it, catching sandbox expiry and purchases made on another device.
  // Neither blocks the render, and both fall back to free on error.
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      const apply = (pro: boolean) => {
        if (!cancelled) setIsPro(pro);
      };
      void checkProStatus().then(apply);
      void refreshProStatus().then(apply);
      return () => {
        cancelled = true;
      };
    }, [])
  );

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

    if (result.status === "restored") {
      // The card is right there under the alert — flip it in the same beat.
      setIsPro(true);
      Alert.alert("Purchases restored", `${PRO_PRODUCT_NAME} is active on this device again.`);
      return;
    }
    if (result.status === "nothing_to_restore") {
      Alert.alert(
        "Nothing to restore",
        "No previous subscription was found for this Apple Account."
      );
      return;
    }
    Alert.alert(
      "Restore failed",
      result.category === "network"
        ? "No connection to the App Store. Check your internet and try again."
        : "Couldn't reach the App Store. Please try again shortly."
    );
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

      {/* Pro card: the upgrade pitch until the entitlement says otherwise, then
          the subscription's status with a way into the store to manage it */}
      <TouchableOpacity
        style={styles.proCard}
        onPress={
          proCard.action === "manage"
            ? () => void handleManageSubscription()
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
