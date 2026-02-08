import { NativeModules, Platform } from "react-native";
import { vrLog } from "./vrLog";

const { ActivityControl } = NativeModules as any;

let hasLoggedMissingModule = false;

function logMissingModuleOnce() {
  if (!hasLoggedMissingModule) {
    console.log("[VR] ActivityControl native module not available (expected on iOS or if not registered)");
    hasLoggedMissingModule = true;
  }
}

/**
 * Get the current Android Activity class name.
 * Returns null on iOS or if the native module is not available.
 */
export async function getCurrentActivityName(): Promise<string | null> {
  if (Platform.OS !== "android") return null;
  if (!ActivityControl?.getCurrentActivityName) {
    logMissingModuleOnce();
    return null;
  }
  try {
    const name = await ActivityControl.getCurrentActivityName();
    return name ?? null;
  } catch (e) {
    console.log("[VR] Failed to get current activity name:", e);
    return null;
  }
}

/**
 * Check if the current Activity is AlarmActivity.
 * Returns false on iOS or if the native module is not available.
 */
export async function isAlarmActivity(): Promise<boolean> {
  if (Platform.OS !== "android") return false;
  if (ActivityControl?.isAlarmActivity) {
    try {
      return Boolean(await ActivityControl.isAlarmActivity());
    } catch (e) {
      console.log("[VR] Failed to check if AlarmActivity (native):", e);
      return false;
    }
  }
  if (!ActivityControl?.getCurrentActivityName) {
    logMissingModuleOnce();
    return false;
  }
  try {
    const name = await ActivityControl.getCurrentActivityName();
    return typeof name === "string" && name.endsWith(".AlarmActivity");
  } catch (e) {
    console.log("[VR] Failed to check if AlarmActivity:", e);
    return false;
  }
}

/**
 * Check if the device is currently locked (keyguard engaged).
 * Returns false on iOS or if the native module is not available.
 */
export async function isKeyguardLocked(): Promise<boolean> {
  if (Platform.OS !== "android") return false;
  if (!ActivityControl?.isKeyguardLocked) {
    logMissingModuleOnce();
    return false;
  }
  try {
    return Boolean(await ActivityControl.isKeyguardLocked());
  } catch (e) {
    console.log("[VR] Failed to check keyguard lock:", e);
    return false;
  }
}

/**
 * Finish the AlarmActivity if currently running.
 * Returns true if a finish was actually requested.
 * Safe to call from any context - returns false if not in AlarmActivity.
 */
export async function finishIfAlarmActivity(): Promise<boolean> {
  if (Platform.OS !== "android") return false;
  if (!ActivityControl?.finishIfAlarmActivity) {
    logMissingModuleOnce();
    return false;
  }
  try {
    const didFinish = await ActivityControl.finishIfAlarmActivity();
    return Boolean(didFinish);
  } catch (e) {
    console.log("[VR] Failed to finish AlarmActivity:", e);
    return false;
  }
}

/**
 * Finish and remove the current task (AlarmActivity or MainActivity).
 * Returns true if a finish was actually requested.
 */
export async function finishCurrentTask(): Promise<boolean> {
  if (Platform.OS !== "android") return false;
  if (!ActivityControl?.finishCurrentTask) {
    logMissingModuleOnce();
    return false;
  }
  try {
    const didFinish = await ActivityControl.finishCurrentTask();
    return Boolean(didFinish);
  } catch (e) {
    console.log("[VR] Failed to finish current task:", e);
    return false;
  }
}

/**
 * Logs current app task state for debugging (pastebin Step 4.5).
 * Calls native ActivityControlModule.logAppTaskState() which in turn
 * calls ActivityTracker.logCurrentState() and dumps ActivityManager state.
 * 
 * Call this at key decision points:
 * - Notifee DELIVERED arrives (before/after repost)
 * - PRESS / ACTION_PRESS
 * - Alarm UI mounts
 * - Dismiss/snooze pressed (before finish + after finish attempt)
 */
export async function logAppTaskState(reason: string): Promise<boolean> {
  if (Platform.OS !== "android") {
    vrLog('activity', 'logAppTaskState_skipped', { reason, platform: Platform.OS });
    return false;
  }
  
  if (!ActivityControl?.logAppTaskState) {
    logMissingModuleOnce();
    vrLog('activity', 'logAppTaskState_unavailable', { reason });
    return false;
  }
  
  try {
    vrLog('activity', 'logAppTaskState_calling', { reason });
    const result = await ActivityControl.logAppTaskState(reason);
    vrLog('activity', 'logAppTaskState_complete', { reason, result });
    return Boolean(result);
  } catch (e) {
    vrLog('activity', 'logAppTaskState_error', { reason, error: String(e) });
    return false;
  }
}
