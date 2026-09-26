/**
 * App Review 4.5.4: notifications are optional. A reminder saved while they are
 * off stays saved and gets one non-blocking "notifications are off" toast per
 * app session, whose tap opens system settings.
 */

jest.mock("../../lib/notifications", () => ({
  openNotificationSettingsSafe: jest.fn(async () => true),
}));

import { openNotificationSettingsSafe } from "../../lib/notifications";
import {
  noticeIfNotificationsOff,
  resetNotificationsOffNoticeForTests,
  showNotificationsOffNoticeOnce,
} from "../../lib/notificationsOffNotice";

function permissionError(): Error {
  const e = new Error("Notification permission not granted");
  e.name = "NotificationPermissionError";
  return e;
}

beforeEach(() => {
  resetNotificationsOffNoticeForTests();
  jest.clearAllMocks();
});

describe("noticeIfNotificationsOff", () => {
  it("ignores errors that aren't about notification permission", () => {
    const toast = { show: jest.fn() };
    const exact = new Error("x");
    exact.name = "ExactAlarmPermissionError";

    expect(noticeIfNotificationsOff(exact, toast)).toBe(false);
    expect(noticeIfNotificationsOff(new Error("boom"), toast)).toBe(false);
    expect(toast.show).not.toHaveBeenCalled();
  });

  it("shows the notice once per session and still reports later errors as handled", () => {
    const toast = { show: jest.fn() };

    expect(noticeIfNotificationsOff(permissionError(), toast)).toBe(true);
    expect(noticeIfNotificationsOff(permissionError(), toast)).toBe(true);

    expect(toast.show).toHaveBeenCalledTimes(1);
    const [options] = toast.show.mock.calls[0];
    expect(options.title).toBe("Reminder saved — notifications are off");
    expect(options.message).toBe("Turn them on in Settings to get alerted");
    expect(options.type).toBe("info");
  });

  it("opens system settings when the notice is tapped", () => {
    const toast = { show: jest.fn() };
    noticeIfNotificationsOff(permissionError(), toast);

    toast.show.mock.calls[0][0].onPress();

    expect(openNotificationSettingsSafe).toHaveBeenCalledTimes(1);
  });
});

describe("showNotificationsOffNoticeOnce", () => {
  it("returns true only for the call that showed it", () => {
    const toast = { show: jest.fn() };
    expect(showNotificationsOffNoticeOnce(toast)).toBe(true);
    expect(showNotificationsOffNoticeOnce(toast)).toBe(false);
    expect(toast.show).toHaveBeenCalledTimes(1);
  });
});
