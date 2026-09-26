import { openNotificationSettingsSafe } from "./notifications";
import { isNotificationPermissionError } from "./notificationDecisions";

type ToastLike = {
  show: (options: {
    title: string;
    message?: string;
    type?: "success" | "error" | "info" | "warning";
    durationMs?: number;
    onPress?: () => void;
  }) => void;
};

// Once per app session: a reminder saved with notifications off gets one gentle
// heads-up, not a nag on every create/edit.
let shownThisSession = false;

/**
 * Show the non-blocking "saved, but notifications are off" toast whose tap opens
 * system settings — at most once per app session. Returns true if it was shown
 * by this call.
 */
export function showNotificationsOffNoticeOnce(toast: ToastLike): boolean {
  if (shownThisSession) return false;
  shownThisSession = true;
  toast.show({
    title: "Reminder saved — notifications are off",
    message: "Turn them on in Settings to get alerted",
    type: "info",
    durationMs: 4000,
    onPress: () => {
      void openNotificationSettingsSafe();
    },
  });
  return true;
}

/**
 * If `error` is scheduleReminder's NotificationPermissionError, show the
 * once-per-session notice. Returns true when the error was a notification-
 * permission failure (whether or not the toast was shown this time), so the
 * caller can treat it as handled.
 */
export function noticeIfNotificationsOff(error: unknown, toast: ToastLike): boolean {
  if (!isNotificationPermissionError(error)) return false;
  showNotificationsOffNoticeOnce(toast);
  return true;
}

/** Test hook. */
export function resetNotificationsOffNoticeForTests(): void {
  shownThisSession = false;
}
