import { useMemo } from "react";
import { Alert, Platform, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import * as Linking from "expo-linking";
import Constants from "expo-constants";
import { colors, scaleFontSize } from "../lib/theme";

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
          <Feather name="chevron-left" size={26} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Settings</Text>
        <View style={styles.headerSpacer} />
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>General</Text>

        <TouchableOpacity
          style={styles.row}
          onPress={handleOpenAppSettings}
          activeOpacity={0.85}
        >
          <View style={styles.rowLeft}>
            <View style={styles.rowIcon}>
              <Feather name="bell" size={18} color={colors.accent} />
            </View>
            <View>
              <Text style={styles.rowTitle}>Notifications</Text>
              <Text style={styles.rowSubtitle}>Open system settings</Text>
            </View>
          </View>
          <Feather name="chevron-right" size={18} color="#9aa0a6" />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.row}
          onPress={() => router.push("/history")}
          activeOpacity={0.85}
        >
          <View style={styles.rowLeft}>
            <View style={styles.rowIcon}>
              <Feather name="clock" size={18} color={colors.accent} />
            </View>
            <View>
              <Text style={styles.rowTitle}>History</Text>
              <Text style={styles.rowSubtitle}>Completed and missed reminders</Text>
            </View>
          </View>
          <Feather name="chevron-right" size={18} color="#9aa0a6" />
        </TouchableOpacity>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>About</Text>

        <View style={[styles.row, styles.rowStatic]}>
          <View style={styles.rowLeft}>
            <View style={styles.rowIcon}>
              <Feather name="info" size={18} color={colors.accent} />
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
    backgroundColor: "#f1f3f4",
  },
  headerTitle: {
    fontSize: scaleFontSize(20),
    fontWeight: "800",
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
    fontWeight: "800",
    color: "#596069",
    marginBottom: 10,
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#f1f3f4",
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
    backgroundColor: colors.accentLight,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },
  rowTitle: {
    fontSize: scaleFontSize(16),
    fontWeight: "800",
    color: colors.textPrimary,
  },
  rowSubtitle: {
    marginTop: 2,
    fontSize: scaleFontSize(13),
    color: "#596069",
  },
});

