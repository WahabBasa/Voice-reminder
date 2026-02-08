/**
 * Centralized logging helper for VoiceReminder debugging.
 * 
 * Provides structured, single-line logs that are easy to grep in logcat.
 * All logs use the [VR][JS][scope] prefix for consistency.
 * 
 * Usage:
 *   vrLog('notifee', 'DELIVERED', { traceId: '...', id: '...' })
 *   → [VR][JS][notifee] ts=1234567890 event=DELIVERED traceId=... id=...
 */

export interface VrLogFields {
  [key: string]: string | number | boolean | undefined | null;
}

/**
 * Centralized logging function.
 * Always includes timestamp, scope, and event.
 * Fields are appended as key=value pairs.
 */
export function vrLog(scope: string, event: string, fields?: VrLogFields): void {
  const ts = Date.now();
  const base = `[VR][JS][${scope}] ts=${ts} event=${event}`;
  
  if (!fields || Object.keys(fields).length === 0) {
    console.log(base);
    return;
  }
  
  const fieldStr = Object.entries(fields)
    .filter(([, value]) => value !== undefined && value !== null)
    .map(([key, value]) => {
      // Escape values that contain spaces or special chars
      const str = String(value);
      if (str.includes(' ') || str.includes('=') || str.includes(',')) {
        return `${key}="${str.replace(/"/g, '""')}"`;
      }
      return `${key}=${str}`;
    })
    .join(' ');
  
  console.log(`${base} ${fieldStr}`);
}

/**
 * Predefined scopes for consistency.
 */
export const VrScope = {
  NOTIFEE: 'notifee',
  PENDING_ALARM: 'pending_alarm',
  ALARM_ROOT: 'alarm_root',
  ALARM_SCREEN: 'alarm_screen',
  ALARM_OVERLAY: 'alarm_overlay',
  ROUTER: 'router',
  ACTIVITY: 'activity',
  NOTIFICATIONS: 'notifications',
} as const;

/**
 * Build a standardized trace ID for correlation.
 * Format: ${notificationId}|${reminderId}|${scheduledFor}|${kind}|repost=${__reposted}
 * This is the SINGLE canonical traceId function - use this everywhere.
 */
export function buildTraceId(
  notification?: { id?: string; data?: Record<string, any> } | null
): string {
  if (!notification) return "no_notification";
  const data = notification.data || {};
  const id = notification.id || "";
  const reminderId = data.reminderId || "";
  const scheduledFor = data.scheduledFor || "";
  const kind = data.kind || "";
  const reposted = data.__reposted || "0";
  return `${id}|${reminderId}|${scheduledFor}|${kind}|repost=${reposted}`;
}

/**
 * Helper to log alarm lifecycle events with consistent structure.
 */
export function logAlarmLifecycle(
  event: string,
  params: {
    traceId?: string;
    notificationId?: string;
    reminderId?: string;
    state?: string;
    action?: string;
    source?: string;
    didFinish?: boolean;
  }
): void {
  vrLog('alarm_lifecycle', event, {
    traceId: params.traceId,
    notificationId: params.notificationId,
    reminderId: params.reminderId,
    state: params.state,
    action: params.action,
    source: params.source,
    didFinish: params.didFinish,
  });
}

/**
 * Helper to log notification events.
 */
export function logNotificationEvent(
  eventType: string,
  params: {
    traceId?: string;
    id?: string;
    kind?: string;
    repost?: boolean;
    action?: string;
  }
): void {
  vrLog('notifee', eventType, {
    traceId: params.traceId,
    id: params.id,
    kind: params.kind,
    repost: params.repost,
    action: params.action,
  });
}
