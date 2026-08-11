import { useEffect, useMemo, useState } from "react";
import { Alert, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import * as Linking from "expo-linking";
import Constants from "expo-constants";
import { borderRadius, colors, scaleFontSize, shadows } from "../lib/theme";
import { FONT_DISPLAY } from "../lib/fonts";
import { useSettingsStore } from "../lib/settingsStore";
import AppIcon from "../components/AppIcon";
import AddressTermSheet from "../components/AddressTermSheet";

// Apple's standard EULA — the terms that govern App Store subscriptions.
const TERMS_OF_USE_URL = "https://www.apple.com/legal/internet-services/itunes/dev/stdeula/";

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

  const addressTerm = useSettingsStore((state) => state.settings.addressTerm);
  const setAddressTerm = useSettingsStore((state) => state.setAddressTerm);
  const loadSettings = useSettingsStore((state) => state.loadSettings);
  const [showAddressSheet, setShowAddressSheet] = useState(false);

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  const versionLabel = useMemo(() => {
    const version = Constants.expoConfig?.version ?? "1.0.0";
    const build = (Constants as any).nativeBuildVersion ?? (Constants as any).expoConfig?.ios?.buildNumber;
    if (!build) return `v${version}`;
    return `v${version} (${build})`;
  }, []);

  const handleOpenTerms = async () => {
    try {
      await Linking.openURL(TERMS_OF_USE_URL);
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

      {/* Pro upgrade card */}
      <TouchableOpacity
        style={styles.proCard}
        onPress={() => router.push("/paywall")}
        activeOpacity={0.7}
      >
        <View style={styles.proLeft}>
          <View style={styles.proIconWrap}>
            <AppIcon name="crown" size={20} color="#fff" />
          </View>
          <View>
            <Text style={styles.proTitle}>Upgrade to Pro</Text>
            <Text style={styles.proSubtitle}>Unlimited reminders & no ads</Text>
          </View>
        </View>
        <AppIcon name="chevron-right" size={18} color={colors.accent} />
      </TouchableOpacity>

      {/* General: personalization + the ONE notifications entry point */}
      <Text style={styles.sectionLabel}>General</Text>
      <View style={styles.card}>
        <SettingsRow
          icon="user"
          label="How should I address you?"
          subtitle={addressTerm ? addressTerm : "Not set"}
          onPress={() => setShowAddressSheet(true)}
        />
        <View style={styles.separator} />
        <SettingsRow
          icon="bell"
          label="Notifications & alarms"
          subtitle="Permissions, scheduled alarms & system settings"
          onPress={() => router.push("/diagnostics")}
        />
      </View>

      {/* About */}
      <Text style={styles.sectionLabel}>About</Text>
      <View style={styles.card}>
        <SettingsRow
          icon="file-text"
          label="Terms of Use"
          subtitle="App Store subscription terms"
          onPress={handleOpenTerms}
        />
      </View>

      {/* Version footer */}
      <Text style={styles.versionFooter}>Voice Reminder {versionLabel}</Text>

      <AddressTermSheet
        visible={showAddressSheet}
        value={addressTerm}
        onSave={(value) => {
          void setAddressTerm(value);
        }}
        onDismiss={() => setShowAddressSheet(false)}
      />
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
