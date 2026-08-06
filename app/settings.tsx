import { useEffect, useMemo, useState } from "react";
import { Alert, Platform, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import * as Linking from "expo-linking";
import Constants from "expo-constants";
import { colors, scaleFontSize } from "../lib/theme";
import { useSettingsStore } from "../lib/settingsStore";
import AppIcon from "../components/AppIcon";
import AddressTermSheet from "../components/AddressTermSheet";

type SettingsRowProps = {
  icon: Parameters<typeof AppIcon>[0]["name"];
  label: string;
  subtitle?: string;
  onPress?: () => void;
  accent?: boolean;
  showChevron?: boolean;
};

function SettingsRow({ icon, label, subtitle, onPress, accent, showChevron = true }: SettingsRowProps) {
  return (
    <TouchableOpacity
      style={styles.row}
      onPress={onPress}
      activeOpacity={0.6}
      disabled={!onPress}
    >
      <View style={[styles.rowIcon, accent && styles.rowIconAccent]}>
        <AppIcon name={icon} size={20} color={accent ? "#fff" : colors.textSecondary} />
      </View>
      <View style={styles.rowTextWrap}>
        <Text style={[styles.rowTitle, accent && styles.rowTitleAccent]}>{label}</Text>
        {subtitle ? <Text style={styles.rowSubtitle}>{subtitle}</Text> : null}
      </View>
      {showChevron && onPress ? (
        <AppIcon name="chevron-right" size={18} color={colors.textTertiary} />
      ) : null}
    </TouchableOpacity>
  );
}

export default function SettingsScreen() {
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

  const handleOpenAppSettings = async () => {
    try {
      await Linking.openSettings();
    } catch (e) {
      Alert.alert("Unable to open settings", "Please open your system settings manually.");
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={["bottom"]}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backButton}
          activeOpacity={0.7}
        >
          <AppIcon name="chevron-left" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Settings</Text>
        <View style={styles.headerSpacer} />
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

      {/* General section */}
      <Text style={styles.sectionLabel}>General</Text>
      <View style={styles.card}>
        <SettingsRow
          icon="bell"
          label="Notifications"
          subtitle="Manage notification settings"
          onPress={handleOpenAppSettings}
        />
        <View style={styles.separator} />
        <SettingsRow
          icon="zap"
          label="Alarm diagnostics"
          subtitle="Permissions & scheduled alarms"
          onPress={() => router.push("/diagnostics")}
        />
        <View style={styles.separator} />
        <SettingsRow
          icon="clock"
          label="History"
          subtitle="Completed and missed reminders"
          onPress={() => router.push("/history")}
        />
        <View style={styles.separator} />
        <SettingsRow
          icon="user"
          label="How should I address you?"
          subtitle={addressTerm ? addressTerm : "Not set"}
          onPress={() => setShowAddressSheet(true)}
        />
      </View>

      {/* About section */}
      <Text style={styles.sectionLabel}>About</Text>
      <View style={styles.card}>
        <View style={styles.aboutRow}>
          <View style={styles.rowIcon}>
            <AppIcon name="info" size={20} color={colors.textSecondary} />
          </View>
          <View>
            <Text style={styles.rowTitle}>Voice Reminder</Text>
            <Text style={styles.rowSubtitle}>{versionLabel}</Text>
          </View>
        </View>
      </View>

      <AddressTermSheet
        visible={showAddressSheet}
        value={addressTerm}
        onSave={(value) => {
          void setAddressTerm(value);
        }}
        onDismiss={() => setShowAddressSheet(false)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    paddingHorizontal: 20,
  },
  header: {
    paddingTop: Platform.OS === "ios" ? 20 : 8,
    paddingBottom: 20,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
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
    fontSize: scaleFontSize(20),
    fontWeight: "700",
    color: colors.textPrimary,
  },
  headerSpacer: {
    width: 40,
  },

  // Pro card
  proCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: colors.accent + "12",
    borderWidth: 1.5,
    borderColor: colors.accent + "30",
    borderRadius: 16,
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

  // Section
  sectionLabel: {
    fontSize: scaleFontSize(13),
    fontWeight: "600",
    color: colors.textTertiary,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: 8,
    marginLeft: 4,
  },
  card: {
    backgroundColor: "#fff",
    borderRadius: 16,
    marginBottom: 24,
    overflow: "hidden",
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
    paddingVertical: 14,
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
  rowIconAccent: {
    backgroundColor: colors.accent,
  },
  rowTextWrap: {
    flex: 1,
  },
  rowTitle: {
    fontSize: scaleFontSize(16),
    fontWeight: "600",
    color: colors.textPrimary,
  },
  rowTitleAccent: {
    color: colors.accent,
  },
  rowSubtitle: {
    fontSize: scaleFontSize(13),
    color: colors.textSecondary,
    marginTop: 1,
  },

  // About
  aboutRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
});
