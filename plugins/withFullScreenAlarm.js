const { withAndroidManifest, withDangerousMod } = require("@expo/config-plugins");
const path = require("path");
const fs = require("fs");

/**
 * Expo config plugin to add USE_FULL_SCREEN_INTENT permission for alarm notifications.
 * This allows the app to display full-screen alarm UI when a notification fires,
 * even when the device is locked.
 * 
 * Also adds AlarmActivity for dedicated lockscreen alarm handling.
 */
function withFullScreenAlarm(config) {
    // First, add permissions and AlarmActivity to AndroidManifest
    config = withAndroidManifest(config, async (config) => {
        const manifest = config.modResults.manifest;
        const packageName = config.android?.package || "com.wahabbasa.VoiceReminder";

        // Ensure uses-permission array exists
        if (!manifest["uses-permission"]) {
            manifest["uses-permission"] = [];
        }

        // Add USE_FULL_SCREEN_INTENT permission (required for full-screen notifications)
        const hasFullScreenPermission = manifest["uses-permission"].some(
            (perm) => perm.$?.["android:name"] === "android.permission.USE_FULL_SCREEN_INTENT"
        );

        if (!hasFullScreenPermission) {
            manifest["uses-permission"].push({
                $: { "android:name": "android.permission.USE_FULL_SCREEN_INTENT" },
            });
        }

        // Add WAKE_LOCK permission (to wake screen when alarm fires)
        const hasWakeLock = manifest["uses-permission"].some(
            (perm) => perm.$?.["android:name"] === "android.permission.WAKE_LOCK"
        );

        if (!hasWakeLock) {
            manifest["uses-permission"].push({
                $: { "android:name": "android.permission.WAKE_LOCK" },
            });
        }

        // Ensure application array exists
        if (!manifest.application) {
            manifest.application = [];
        }

        // Get or create the main application
        let mainApplication = manifest.application[0];
        if (!mainApplication) {
            mainApplication = { $: {}, activity: [] };
            manifest.application.push(mainApplication);
        }

        // Ensure activity array exists
        if (!mainApplication.activity) {
            mainApplication.activity = [];
        }

        // Add AlarmActivity for lockscreen alarm handling
        const alarmActivityFqcn = `${packageName}.AlarmActivity`;
        const hasAlarmActivity = mainApplication.activity.some(
            (act) =>
                act.$?.["android:name"] === alarmActivityFqcn ||
                act.$?.["android:name"] === ".AlarmActivity"
        );

        if (!hasAlarmActivity) {
            mainApplication.activity.push({
                $: {
                    "android:name": ".AlarmActivity",
                    "android:launchMode": "singleTask",
                    "android:excludeFromRecents": "true",
                    "android:showWhenLocked": "true",
                    "android:turnScreenOn": "true",
                    "android:theme": "@style/AppTheme",
                    "android:exported": "false",
                    "android:screenOrientation": "portrait",
                },
            });
        }

        return config;
    });

    // Then, ensure AlarmActivity.kt exists (so prebuild/run doesn't depend on a checked-in android folder).
    config = withDangerousMod(config, [
        "android",
        async (config) => {
            const packageName = config.android?.package || "com.wahabbasa.VoiceReminder";
            const packagePath = packageName.split(".");
            const alarmActivityPath = path.join(
                config.modRequest.platformProjectRoot,
                "app",
                "src",
                "main",
                "java",
                ...packagePath,
                "AlarmActivity.kt"
            );

            const alarmActivityContent = `package ${packageName}

import android.os.Build
import android.os.Bundle
import android.view.WindowManager
import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.fabricEnabled
import com.facebook.react.defaults.DefaultReactActivityDelegate
import expo.modules.ReactActivityDelegateWrapper

/**
 * Dedicated alarm activity for displaying alarms over the lockscreen.
 * Launched by Notifee full-screen intent via \`launchActivity\`.
 */
class AlarmActivity : ReactActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
      setShowWhenLocked(true)
      setTurnScreenOn(true)
    } else {
      @Suppress("DEPRECATION")
      window.addFlags(
        WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or
          WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON or
          WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON
      )
    }

    setTheme(R.style.AppTheme)
    super.onCreate(null)
  }

  override fun getMainComponentName(): String = "main"

  override fun createReactActivityDelegate(): ReactActivityDelegate {
    return ReactActivityDelegateWrapper(
      this,
      BuildConfig.IS_NEW_ARCHITECTURE_ENABLED,
      object : DefaultReactActivityDelegate(
        this,
        mainComponentName,
        fabricEnabled
      ) {})
  }
}
`;

            try {
                fs.mkdirSync(path.dirname(alarmActivityPath), { recursive: true });
                fs.writeFileSync(alarmActivityPath, alarmActivityContent, "utf8");
                console.log("[withFullScreenAlarm] Ensured AlarmActivity.kt exists");
            } catch (e) {
                console.log("[withFullScreenAlarm] Failed to write AlarmActivity.kt:", e);
            }

            return config;
        },
    ]);

    return config;
}

module.exports = withFullScreenAlarm;
