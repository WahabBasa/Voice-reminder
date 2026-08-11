import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Alert, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import notifee from "@notifee/react-native";
import * as Linking from "expo-linking";
import AppIcon, { type AppIconName } from "../components/AppIcon";
import { borderRadius, colors, scaleFontSize, shadows } from "../lib/theme";
import { FONT_DISPLAY } from "../lib/fonts";
import { openAlarmPermissionSettingsSafe, openNotificationSettingsSafe } from "../lib/notifications";
import { getScheduledAlarms, parseAlarmAppKey, useAlarmKit, type ScheduledAlarm } from "../lib/alarmKit";
import { useReminderStore } from "../lib/store";

type PermissionTone = "ok" | "bad" | "muted";

function permissionStatus(status: number | undefined): { label: string; tone: PermissionTone } {
  if (status === 1) return { label: "Allowed", tone: "ok" };
  if (status === 2) return { label: "Provisional", tone: "ok" };
  if (status === 0) return { label: "Denied", tone: "bad" };
  if (status === -1) return { label: "Not requested", tone: "muted" };
  return { label: "Unknown", tone: "muted" };
}

function formatFireDate(timestamp: number): string {
  const date = new Date(timestamp);
  const day = date.toLocaleDateString([], { weekday: "short", day: "numeric", month: "short" });
  const time = date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  return `${day} · ${time}`;
}

type AlarmRow = { key: string; title: string; when: string; isFollowUp: boolean };

function toAlarmRows(alarms: ScheduledAlarm[]): AlarmRow[] {
  const sorted = [...alarms].sort((a, b) => a.fireDate - b.fireDate);
  const seenReminder = new Set<string>();
  const getReminderById = useReminderStore.getState().getReminderById;

  return sorted.map((alarm) => {
    const parsed = parseAlarmAppKey(alarm.id);
    const reminderId = parsed?.reminderId;
    const title = (reminderId && getReminderById(reminderId)?.title) || "Reminder";
    const isFollowUp = reminderId ? seenReminder.has(reminderId) : false;
    if (reminderId) seenReminder.add(reminderId);
    return {
      key: alarm.id,
      title,
      when: formatFireDate(alarm.fireDate),
      isFollowUp,
    };
  });
}

function Row({
  icon,
  label,
  right,
  onPress,
  isLast,
}: {
  icon: AppIconName;
  label: string;
  right?: ReactNode;
  onPress?: () => void;
  isLast?: boolean;
}) {
  return (
    <>
      <TouchableOpacity style={styles.row} onPress={onPress} activeOpacity={0.6} disabled={!onPress}>
        <View style={styles.rowIcon}>
          <AppIcon name={icon} size={20} color={colors.textSecondary} />
        </View>
        <Text style={styles.rowTitle}>{label}</Text>
        {right ?? (onPress ? (
          <AppIcon name="chevron-right" size={18} color={colors.textTertiary} />
        ) : null)}
      </TouchableOpacity>
      {!isLast ? <View style={styles.separator} /> : null}
    </>
  );
}

export default function DiagnosticsScreen() {
  const router = useRouter();
  const [authStatus, setAuthStatus] = useState<number | undefined>(undefined);
  const [androidAlarmStatus, setAndroidAlarmStatus] = useState<number | undefined>(undefined);
  const [alarmRows, setAlarmRows] = useState<AlarmRow[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    try {
      const settings = await notifee.getNotificationSettings();
      setAuthStatus(settings?.authorizationStatus);
      setAndroidAlarmStatus(settings?.android?.alarm);

      if (Platform.OS === "ios" && (await useAlarmKit())) {
        setAlarmRows(toAlarmRows(await getScheduledAlarms()));
      } else {
        const ids = await notifee.getTriggerNotificationIds();
        const rows: AlarmRow[] = ids.map((id) => {
          const parsed = parseAlarmAppKey(id);
          const title =
            (parsed && useReminderStore.getState().getReminderById(parsed.reminderId)?.title) ||
            "Reminder";
          return {
            key: id,
            title,
            when: parsed ? formatFireDate(parsed.scheduledFor) : "",
            isFollowUp: false,
          };
        });
        setAlarmRows(rows);
      }
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

  const notifPermission = permissionStatus(authStatus);
  const androidApi = typeof Platform.Version === "number" ? Platform.Version : Number(Platform.Version);
  const showAndroidAlarmRow = Platform.OS === "android" && Number.isFinite(androidApi) && androidApi >= 31;

  return (
    <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.headerButton} activeOpacity={0.85}>
          <AppIcon name="chevron-left" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Alarms</Text>
        <TouchableOpacity onPress={refresh} style={styles.headerButton} activeOpacity={0.85}>
          <AppIcon
            name="refresh-cw"
            size={18}
            color={colors.textPrimary}
            style={isLoading ? { opacity: 0.4 } : undefined}
          />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.sectionLabel}>Permissions</Text>
        <View style={styles.card}>
          <Row
            icon="bell"
            label="Notifications"
            right={
              <Text
                style={[
                  styles.statusText,
                  notifPermission.tone === "ok" && styles.statusOk,
                  notifPermission.tone === "bad" && styles.statusBad,
                ]}
              >
                {notifPermission.label}
              </Text>
            }
            isLast={!showAndroidAlarmRow}
          />
          {showAndroidAlarmRow ? (
            <Row
              icon="clock"
              label="Alarms & reminders"
              right={
                <Text style={[styles.statusText, androidAlarmStatus === 1 ? styles.statusOk : styles.statusBad]}>
                  {androidAlarmStatus === 1 ? "Allowed" : "Check settings"}
                </Text>
              }
              isLast
            />
          ) : null}
        </View>

        <Text style={styles.sectionLabel}>Open system settings</Text>
        <View style={styles.card}>
          <Row icon="bell" label="Notification settings" onPress={() => void openNotificationSettingsSafe()} />
          {showAndroidAlarmRow ? (
            <Row icon="clock" label="Alarms & reminders" onPress={() => void openAlarmPermissionSettingsSafe()} />
          ) : null}
          <Row
            icon="settings"
            label="App settings"
            onPress={async () => {
              try {
                await Linking.openSettings();
              } catch {
                Alert.alert("Unable to open settings", "Please open your system settings manually.");
              }
            }}
            isLast
          />
        </View>

        <Text style={styles.sectionLabel}>
          {`Scheduled${alarmRows.length ? ` (${alarmRows.length})` : ""}`}
        </Text>
        <View style={styles.card}>
          {alarmRows.length === 0 ? (
            <Text style={styles.emptyText}>No alarms scheduled right now.</Text>
          ) : (
            alarmRows.map((row, index) => (
              <View key={row.key}>
                <View style={styles.row}>
                  <View style={styles.rowIcon}>
                    <AppIcon name={row.isFollowUp ? "refresh-cw" : "bell"} size={18} color={colors.textSecondary} />
                  </View>
                  <View style={styles.rowTextWrap}>
                    <Text style={styles.rowTitle} numberOfLines={1}>
                      {row.title}
                    </Text>
                    <Text style={styles.rowSubtitle}>
                      {row.isFollowUp ? `Follow-up · ${row.when}` : row.when}
                    </Text>
                  </View>
                </View>
                {index !== alarmRows.length - 1 ? <View style={styles.separator} /> : null}
              </View>
            ))
          )}
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
    paddingTop: 8,
    paddingBottom: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  headerButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface,
  },
  headerTitle: {
    fontFamily: FONT_DISPLAY,
    fontSize: scaleFontSize(24),
    color: colors.textHeading,
  },
  content: {
    paddingBottom: 40,
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
  card: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.card,
    overflow: "hidden",
    marginBottom: 24,
    ...shadows.card,
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
    marginLeft: 64,
  },
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
    flex: 1,
    fontSize: scaleFontSize(16),
    fontWeight: "600",
    color: colors.textPrimary,
  },
  rowSubtitle: {
    fontSize: scaleFontSize(13),
    color: colors.textSecondary,
    marginTop: 1,
  },
  statusText: {
    fontSize: scaleFontSize(14),
    fontWeight: "600",
    color: colors.textSecondary,
  },
  statusOk: {
    color: colors.success,
  },
  statusBad: {
    color: colors.destructive,
  },
  emptyText: {
    padding: 16,
    fontSize: scaleFontSize(14),
    color: colors.textSecondary,
  },
});
