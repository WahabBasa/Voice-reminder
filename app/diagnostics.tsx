import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import notifee from "@notifee/react-native";
import * as Linking from "expo-linking";
import AppIcon from "../components/AppIcon";
import { colors, scaleFontSize } from "../lib/theme";
import { openAlarmPermissionSettingsSafe, openNotificationSettingsSafe } from "../lib/notifications";

function formatMaybeJson(value: any): string {
  if (value === null || value === undefined) return "(not available)";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export default function DiagnosticsScreen() {
  const router = useRouter();
  const [settings, setSettings] = useState<any>(null);
  const [triggerIds, setTriggerIds] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    try {
      const s = await notifee.getNotificationSettings();
      const ids = await notifee.getTriggerNotificationIds();
      setSettings(s);
      setTriggerIds(ids);
    } catch (e) {
      console.log("[VR] Diagnostics refresh failed:", e);
      Alert.alert("Error", "Failed to load notification diagnostics.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const apiLevel = useMemo(() => {
    const raw = Platform.Version;
    return typeof raw === "number" ? raw : Number(raw);
  }, []);

  const authorizationStatus = settings?.authorizationStatus;
  const androidAlarm = settings?.android?.alarm;

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
        <Text style={styles.headerTitle}>Alarm Diagnostics</Text>
        <TouchableOpacity onPress={refresh} style={styles.refreshButton} activeOpacity={0.85}>
          <Text style={[styles.refreshText, isLoading && { opacity: 0.6 }]}>Refresh</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Device</Text>
          <Text style={styles.kv}>Platform: {Platform.OS}</Text>
          <Text style={styles.kv}>Android API: {Number.isFinite(apiLevel) ? apiLevel : String(Platform.Version)}</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Notification Settings</Text>
          <Text style={styles.kv}>authorizationStatus: {formatMaybeJson(authorizationStatus)}</Text>
          {Platform.OS === "android" ? (
            <Text style={styles.kv}>android.alarm: {formatMaybeJson(androidAlarm)}</Text>
          ) : null}

          <View style={styles.actionsRow}>
            <TouchableOpacity
              style={styles.actionButton}
              onPress={async () => {
                await openNotificationSettingsSafe();
              }}
              activeOpacity={0.85}
            >
              <AppIcon name="bell" size={18} color={colors.textPrimary} />
              <Text style={styles.actionText}>Notification settings</Text>
            </TouchableOpacity>

            {Platform.OS === "android" && Number.isFinite(apiLevel) && apiLevel >= 31 ? (
              <TouchableOpacity
                style={styles.actionButton}
                onPress={async () => {
                  await openAlarmPermissionSettingsSafe();
                }}
                activeOpacity={0.85}
              >
                <AppIcon name="clock" size={18} color={colors.textPrimary} />
                <Text style={styles.actionText}>Alarms & reminders</Text>
              </TouchableOpacity>
            ) : null}
          </View>

          <TouchableOpacity
            style={[styles.actionButton, { marginTop: 10 }]}
            onPress={async () => {
              try {
                await Linking.openSettings();
              } catch {
                Alert.alert("Unable to open settings", "Please open your system settings manually.");
              }
            }}
            activeOpacity={0.85}
          >
            <AppIcon name="settings" size={18} color={colors.textPrimary} />
            <Text style={styles.actionText}>App settings</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Scheduled Triggers</Text>
          <Text style={styles.kv}>count: {triggerIds.length}</Text>
          <View style={styles.monoBox}>
            <Text style={styles.monoText}>
              {triggerIds.length ? triggerIds.join("\n") : "(none)"}
            </Text>
          </View>
        </View>
      </ScrollView>
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
    fontSize: scaleFontSize(18),
    fontWeight: "700",
    color: colors.textPrimary,
  },
  refreshButton: {
    width: 90,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface,
  },
  refreshText: {
    fontSize: scaleFontSize(14),
    fontWeight: "700",
    color: colors.textPrimary,
  },
  content: {
    paddingBottom: 28,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 18,
    padding: 14,
    marginBottom: 12,
  },
  cardTitle: {
    fontSize: scaleFontSize(14),
    fontWeight: "800",
    color: colors.textPrimary,
    marginBottom: 10,
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  kv: {
    fontSize: scaleFontSize(14),
    color: colors.textSecondary,
    marginBottom: 6,
  },
  actionsRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 10,
  },
  actionButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 10,
    borderRadius: 14,
    backgroundColor: colors.muted,
  },
  actionText: {
    fontSize: scaleFontSize(13),
    fontWeight: "700",
    color: colors.textPrimary,
  },
  monoBox: {
    marginTop: 10,
    borderRadius: 14,
    backgroundColor: colors.muted,
    padding: 12,
  },
  monoText: {
    fontSize: 12,
    lineHeight: 16,
    color: colors.textSecondary,
  },
});
