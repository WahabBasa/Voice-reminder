import { useMemo } from "react";
import { Alert, Platform, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import * as Linking from "expo-linking";
import Constants from "expo-constants";
import { colors, scaleFontSize } from "../lib/theme";
import AppIcon from "../components/AppIcon";

export default function SettingsScreen() {
  const router = useRouter();

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
          activeOpacity={0.85}
        >
          <AppIcon name="chevron-left" size={26} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Settings</Text>
        <View style={styles.headerSpacer} />
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>General</Text>

        <TouchableOpacity
          style={[styles.row, styles.proRow]}
          onPress={() => router.push("/paywall")}
          activeOpacity={0.85}
        >
          <View style={styles.rowLeft}>
            <View style={[styles.rowIcon, styles.proIcon]}>
              <AppIcon name="crown" size={18} color="#fff" />
            </View>
            <View>
              <Text style={styles.rowTitle}>Upgrade to Pro</Text>
              <Text style={styles.rowSubtitle}>Unlimited reminders & no ads</Text>
            </View>
          </View>
          <AppIcon name="chevron-right" size={18} color={colors.accent} />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.row}
          onPress={handleOpenAppSettings}
          activeOpacity={0.85}
        >
          <View style={styles.rowLeft}>
            <View style={styles.rowIcon}>
              <AppIcon name="bell" size={18} color={colors.textSecondary} />
            </View>
            <View>
              <Text style={styles.rowTitle}>Notifications</Text>
              <Text style={styles.rowSubtitle}>Open system settings</Text>
            </View>
          </View>
          <AppIcon name="chevron-right" size={18} color={colors.textSecondary} />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.row}
          onPress={() => router.push("/diagnostics")}
          activeOpacity={0.85}
        >
          <View style={styles.rowLeft}>
            <View style={styles.rowIcon}>
              <AppIcon name="zap" size={18} color={colors.textSecondary} />
            </View>
            <View>
              <Text style={styles.rowTitle}>Alarm diagnostics</Text>
              <Text style={styles.rowSubtitle}>Permissions & scheduled alarms</Text>
            </View>
          </View>
          <AppIcon name="chevron-right" size={18} color={colors.textSecondary} />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.row}
          onPress={() => router.push("/history")}
          activeOpacity={0.85}
        >
          <View style={styles.rowLeft}>
            <View style={styles.rowIcon}>
              <AppIcon name="clock" size={18} color={colors.textSecondary} />
            </View>
            <View>
              <Text style={styles.rowTitle}>History</Text>
              <Text style={styles.rowSubtitle}>Completed and missed reminders</Text>
            </View>
          </View>
          <AppIcon name="chevron-right" size={18} color={colors.textSecondary} />
        </TouchableOpacity>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>About</Text>

        <View style={[styles.row, styles.rowStatic]}>
          <View style={styles.rowLeft}>
            <View style={styles.rowIcon}>
              <AppIcon name="info" size={18} color={colors.textSecondary} />
            </View>
            <View>
              <Text style={styles.rowTitle}>Voice Reminder</Text>
              <Text style={styles.rowSubtitle}>{versionLabel}</Text>
            </View>
          </View>
        </View>
      </View>
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
    paddingBottom: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 12,
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
  section: {
    marginTop: 14,
  },
  sectionTitle: {
    fontSize: scaleFontSize(14),
    fontWeight: "700",
    color: colors.textLabel,
    marginBottom: 10,
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: colors.surface,
    borderRadius: 18,
    paddingVertical: 12,
    paddingHorizontal: 12,
    marginBottom: 10,
  },
  rowStatic: {
    justifyContent: "flex-start",
  },
  rowLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  rowIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: colors.muted,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },
  rowTitle: {
    fontSize: scaleFontSize(16),
    fontWeight: "700",
    color: colors.textPrimary,
  },
  rowSubtitle: {
    marginTop: 2,
    fontSize: scaleFontSize(13),
    color: colors.textSecondary,
  },
  proRow: {
    borderWidth: 1,
    borderColor: colors.accent + "40",
    backgroundColor: colors.accent + "10",
  },
  proIcon: {
    backgroundColor: colors.accent,
  },
});
