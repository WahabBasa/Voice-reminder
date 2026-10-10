import { t } from "../lib/i18n";
import React, { useCallback, useEffect, useState } from "react";
import {
  AppState,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import AppIcon from "./AppIcon";
import { colors, scaleFontSize } from "../lib/theme";
import {
  getNotificationSettingsSafe,
  isBatteryOptimizationEnabledSafe,
  openAlarmPermissionSettingsSafe,
  openBatteryOptimizationSettingsSafe,
  requestAlarmPermission,
  requestNotificationPermission,
} from "../lib/notifications";
import {
  isExactAlarmAccessMissing,
  shouldAskAlarmKitInContext,
  shouldAskNotificationPermissionInContext,
} from "../lib/notificationDecisions";

const DEFERRED_KEY = "@permission_prompt_deferred";

type PermissionState = {
  notifications: boolean;
  alarms: boolean;
  battery: boolean;
};

// Module-level callback so any code can trigger the prompt
let _showPrompt: (() => void) | null = null;

/**
 * Call this to offer the permission prompt from anywhere.
 * Ignores the "deferred" flag — shows if something is missing. It is always
 * dismissable ("Not now") and must never be used as a gate on creating reminders.
 */
export async function showPermissionPrompt(): Promise<void> {
  _showPrompt?.();
}

function androidApiLevel(): number {
  return typeof Platform.Version === "number" ? Platform.Version : Number(Platform.Version);
}

// The in-context notification ask happens at most once per app session.
let askedForNotificationsThisSession = false;
// Same for the iOS 26 AlarmKit ("Alarms") ask when notifications are off.
let askedForAlarmsThisSession = false;

/**
 * Run right before the recorder or composer opens. Notifications are OPTIONAL
 * (App Review 4.5.4) and never block creating a reminder:
 *
 * - If the user has never been asked, show the system notification dialog now
 *   — the in-context consent moment — and wait for the answer (so it can't
 *   collide with the mic prompt that follows). Whatever they answer, proceed.
 * - iOS 26: with notifications off, AlarmKit ("Alarms") authorization is asked
 *   instead — once per session — since it rings reminders without them.
 * - The one remaining gate is Android 12+ exact-alarm access ("Alarms &
 *   reminders"), without which Android can't schedule the alarm at all.
 *   Battery optimization never blocks.
 *
 * Returns false only when that Android gate is closed; the caller shows the
 * permission prompt and stops.
 */
export async function prepareReminderCreation(): Promise<boolean> {
  let settings: any = null;
  try {
    settings = await getNotificationSettingsSafe();
  } catch {
    settings = null;
  }

  if (isExactAlarmAccessMissing(Platform.OS, androidApiLevel(), settings?.android?.alarm)) {
    return false;
  }

  if (
    shouldAskNotificationPermissionInContext(
      Platform.OS,
      settings?.authorizationStatus,
      askedForNotificationsThisSession
    )
  ) {
    askedForNotificationsThisSession = true;
    // On iOS requestNotificationPermission asks for AlarmKit too.
    if (Platform.OS === "ios") askedForAlarmsThisSession = true;
    try {
      await requestNotificationPermission();
    } catch (e) {
      console.log("[VR] Notification permission request failed:", e);
    }
  } else if (
    shouldAskAlarmKitInContext(
      Platform.OS,
      settings?.authorizationStatus,
      askedForAlarmsThisSession
    )
  ) {
    // iOS 26: notifications are off, but AlarmKit is its own permission and
    // can still ring the reminder as a system alarm. Never blocks either.
    askedForAlarmsThisSession = true;
    try {
      await requestAlarmPermission();
    } catch (e) {
      console.log("[VR] Alarm permission request failed:", e);
    }
  }
  return true;
}

export default function PermissionPrompt() {
  const [visible, setVisible] = useState(false);
  const [permissions, setPermissions] = useState<PermissionState>({
    notifications: true,
    alarms: true,
    battery: true,
  });

  const refreshPermissions = useCallback(async () => {
    const settings = await getNotificationSettingsSafe();
    if (!settings) return;

    const notifGranted = settings.authorizationStatus >= 1;
    const alarmGranted = !isExactAlarmAccessMissing(
      Platform.OS,
      androidApiLevel(),
      settings.android?.alarm
    );

    // Battery optimization on = OS can force-stop the app and wipe its alarms.
    const batteryGranted = !(await isBatteryOptimizationEnabledSafe());

    setPermissions({
      notifications: notifGranted,
      alarms: alarmGranted,
      battery: batteryGranted,
    });
    return { notifGranted, alarmGranted, batteryGranted };
  }, []);

  // Register the global show function
  useEffect(() => {
    _showPrompt = async () => {
      const result = await refreshPermissions();
      // Only show if something is actually missing
      if (result && (!result.notifGranted || !result.alarmGranted || !result.batteryGranted)) {
        setVisible(true);
      }
    };
    return () => {
      _showPrompt = null;
    };
  }, [refreshPermissions]);

  // Re-check when returning from system settings/dialogs (app regains focus)
  useEffect(() => {
    if (!visible) return;
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        void (async () => {
          const result = await refreshPermissions();
          if (result && result.notifGranted && result.alarmGranted && result.batteryGranted) {
            setVisible(false);
          }
        })();
      }
    });
    return () => sub.remove();
  }, [visible, refreshPermissions]);

  // Auto-show on first launch (respects deferred flag)
  useEffect(() => {
    const autoCheck = async () => {
      try {
        const deferred = await AsyncStorage.getItem(DEFERRED_KEY);
        if (deferred) return;

        const result = await refreshPermissions();
        if (result && (!result.notifGranted || !result.alarmGranted || !result.batteryGranted)) {
          setVisible(true);
        }
      } catch (e) {
        console.log("[VR] Permission check failed:", e);
      }
    };

    const timeout = setTimeout(autoCheck, 1500);
    return () => clearTimeout(timeout);
  }, [refreshPermissions]);

  const handleEnableNotifications = async () => {
    const granted = await requestNotificationPermission();
    setPermissions((p) => {
      if (granted && p.alarms && p.battery) setVisible(false);
      return { ...p, notifications: granted };
    });
  };

  const handleEnableAlarms = async () => {
    await openAlarmPermissionSettingsSafe();
    // Re-check after returning from settings
    setTimeout(async () => {
      const settings = await getNotificationSettingsSafe();
      const alarmVal = settings?.android?.alarm;
      const granted = alarmVal === 1 || alarmVal === true;
      setPermissions((p) => {
        if (p.notifications && granted && p.battery) setVisible(false);
        return { ...p, alarms: granted };
      });
    }, 1000);
  };

  const handleEnableBattery = async () => {
    await openBatteryOptimizationSettingsSafe();
    // Re-check after returning from the system dialog/settings
    setTimeout(async () => {
      const granted = !(await isBatteryOptimizationEnabledSafe());
      setPermissions((p) => {
        if (p.notifications && p.alarms && granted) setVisible(false);
        return { ...p, battery: granted };
      });
    }, 1000);
  };

  const handleDefer = async () => {
    // Only defer for the auto-show on launch — showPermissionPrompt() bypasses this
    await AsyncStorage.setItem(DEFERRED_KEY, "1");
    setVisible(false);
  };

  const allGranted = permissions.notifications && permissions.alarms && permissions.battery;

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
    >
      <View style={styles.overlay}>
        <View style={styles.card}>
          <View style={styles.iconCircle}>
            <AppIcon name="bell" size={28} color={colors.accent} />
          </View>

          <Text style={styles.title}>{t("permission.title")}</Text>
          <Text style={styles.subtitle}>{t("permission.subtitle")}</Text>

          {/* Notification permission */}
          <TouchableOpacity
            style={[
              styles.permRow,
              permissions.notifications && styles.permRowGranted,
            ]}
            onPress={permissions.notifications ? undefined : handleEnableNotifications}
            activeOpacity={permissions.notifications ? 1 : 0.7}
          >
            <View style={styles.permLeft}>
              <View
                style={[
                  styles.permIcon,
                  permissions.notifications && styles.permIconGranted,
                ]}
              >
                <AppIcon
                  name={permissions.notifications ? "check" : "bell"}
                  size={18}
                  color={permissions.notifications ? "#fff" : colors.textSecondary}
                />
              </View>
              <View style={styles.permTextWrap}>
                <Text style={styles.permTitle}>{t("permission.notifications.title")}</Text>
                <Text style={styles.permDesc}>{t("permission.notifications.desc")}</Text>
              </View>
            </View>
            {permissions.notifications ? (
              <Text style={styles.grantedText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>{t("permission.enabled")}</Text>
            ) : (
              <View style={styles.enableBtn}>
                <Text style={styles.enableBtnText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>{t("permission.enable")}</Text>
              </View>
            )}
          </TouchableOpacity>

          {/* Alarm permission (Android 12+ only) */}
          {Platform.OS === "android" &&
            typeof Platform.Version === "number" &&
            Platform.Version >= 31 && (
              <TouchableOpacity
                style={[
                  styles.permRow,
                  permissions.alarms && styles.permRowGranted,
                ]}
                onPress={permissions.alarms ? undefined : handleEnableAlarms}
                activeOpacity={permissions.alarms ? 1 : 0.7}
              >
                <View style={styles.permLeft}>
                  <View
                    style={[
                      styles.permIcon,
                      permissions.alarms && styles.permIconGranted,
                    ]}
                  >
                    <AppIcon
                      name={permissions.alarms ? "check" : "clock"}
                      size={18}
                      color={permissions.alarms ? "#fff" : colors.textSecondary}
                    />
                  </View>
                  <View style={styles.permTextWrap}>
                    <Text style={styles.permTitle}>Alarms & Reminders</Text>
                    <Text style={styles.permDesc}>Ring at exact times</Text>
                  </View>
                </View>
                {permissions.alarms ? (
                  <Text style={styles.grantedText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>{t("permission.enabled")}</Text>
                ) : (
                  <View style={styles.enableBtn}>
                    <Text style={styles.enableBtnText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>{t("permission.enable")}</Text>
                  </View>
                )}
              </TouchableOpacity>
            )}

          {/* Battery optimization exemption (Android only) — without it the OS
              can force-stop the app and silently cancel every scheduled alarm */}
          {Platform.OS === "android" && (
            <TouchableOpacity
              style={[
                styles.permRow,
                permissions.battery && styles.permRowGranted,
              ]}
              onPress={permissions.battery ? undefined : handleEnableBattery}
              activeOpacity={permissions.battery ? 1 : 0.7}
            >
              <View style={styles.permLeft}>
                <View
                  style={[
                    styles.permIcon,
                    permissions.battery && styles.permIconGranted,
                  ]}
                >
                  <AppIcon
                    name={permissions.battery ? "check" : "zap"}
                    size={18}
                    color={permissions.battery ? "#fff" : colors.textSecondary}
                  />
                </View>
                <View style={styles.permTextWrap}>
                  <Text style={styles.permTitle}>Run in Background</Text>
                  <Text style={styles.permDesc}>Keep alarms alive when unused</Text>
                </View>
              </View>
              {permissions.battery ? (
                <Text style={styles.grantedText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>{t("permission.enabled")}</Text>
              ) : (
                <View style={styles.enableBtn}>
                  <Text style={styles.enableBtnText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>{t("permission.enable")}</Text>
                </View>
              )}
            </TouchableOpacity>
          )}

          {allGranted ? (
            <TouchableOpacity
              style={styles.doneBtn}
              onPress={() => setVisible(false)}
              activeOpacity={0.7}
            >
              <Text style={styles.doneBtnText}>{t("permission.allSet")}</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={styles.skipBtn}
              onPress={handleDefer}
              activeOpacity={0.7}
            >
              <Text style={styles.skipBtnText}>{t("aiConsent.notNow")}</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  card: {
    width: "100%",
    backgroundColor: "#fff",
    borderRadius: 24,
    padding: 28,
    alignItems: "center",
  },
  iconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.accent + "15",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  title: {
    fontSize: scaleFontSize(20),
    fontWeight: "600",
    color: colors.textPrimary,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: scaleFontSize(14),
    color: colors.textSecondary,
    textAlign: "center",
    lineHeight: scaleFontSize(20),
    marginBottom: 24,
  },
  permRow: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: colors.surface,
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
  },
  permRowGranted: {
    backgroundColor: colors.success + "10",
  },
  permLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flex: 1,
  },
  permIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: colors.muted,
    alignItems: "center",
    justifyContent: "center",
  },
  permIconGranted: {
    backgroundColor: colors.success,
  },
  permTextWrap: {
    flex: 1,
  },
  permTitle: {
    fontSize: scaleFontSize(15),
    fontWeight: "600",
    color: colors.textPrimary,
  },
  permDesc: {
    fontSize: scaleFontSize(12),
    color: colors.textSecondary,
    marginTop: 1,
  },
  grantedText: {
    fontSize: scaleFontSize(13),
    fontWeight: "600",
    color: colors.success,
  },
  enableBtn: {
    backgroundColor: colors.accent,
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  enableBtnText: {
    fontSize: scaleFontSize(13),
    fontWeight: "600",
    color: "#fff",
  },
  doneBtn: {
    width: "100%",
    backgroundColor: colors.success,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 14,
  },
  doneBtnText: {
    fontSize: scaleFontSize(16),
    fontWeight: "600",
    color: "#fff",
  },
  skipBtn: {
    marginTop: 14,
    paddingVertical: 8,
  },
  skipBtnText: {
    fontSize: scaleFontSize(14),
    fontWeight: "600",
    color: colors.textTertiary,
  },
});
