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
                    "android:taskAffinity": `${packageName}.alarm`,
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
import android.util.Log
import android.view.WindowManager
import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.fabricEnabled
import com.facebook.react.defaults.DefaultReactActivityDelegate
import expo.modules.ReactActivityDelegateWrapper

/**
 * Dedicated alarm activity for displaying alarms over the lockscreen.
 * Launched by Notifee full-screen intent via \`launchActivity\`.
 * 
 * ALARM_ACTIVITY_LOG_VERSION=3 - Added comprehensive lifecycle logging (pastebin Step 1)
 */
class AlarmActivity : ReactActivity() {

  companion object {
    // Version marker to verify we're running the correct native build
    const val ALARM_ACTIVITY_LOG_VERSION = 3
    private const val LOG_TAG = "VR"
  }

  override fun onCreate(savedInstanceState: Bundle?) {
    val intentAction = intent?.action ?: "null"
    val intentData = intent?.dataString ?: "null"
    val intentFlags = intent?.flags ?: 0
    val taskId = this.taskId
    val isTaskRoot = this.isTaskRoot
    val componentName = "alarm"
    
    // Log sanitized extras (keys only, truncated values)
    val extrasKeys = intent?.extras?.keySet()?.toList() ?: emptyList()
    val extrasSummary = extrasKeys.joinToString(",") { key ->
      val value = intent?.extras?.get(key)
      val valueStr = when (value) {
        is String -> value.take(100)
        is Number -> value.toString()
        is Boolean -> value.toString()
        else -> "[\${value?.javaClass?.simpleName ?: "null"}]"
      }
      "\$key=\$valueStr"
    }
    
    Log.i(LOG_TAG, "[VR][NATIVE][AlarmActivity] onCreate taskId=\$taskId isTaskRoot=\$isTaskRoot component=\$componentName action=\$intentAction data=\$intentData flags=\$intentFlags extras=[\$extrasSummary] version=\$ALARM_ACTIVITY_LOG_VERSION")

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
    
    Log.i(LOG_TAG, "[VR][NATIVE][AlarmActivity] onCreate complete taskId=\$taskId")
  }

  override fun onNewIntent(intent: android.content.Intent?) {
    super.onNewIntent(intent)
    val action = intent?.action ?: "null"
    val data = intent?.dataString ?: "null"
    Log.i(LOG_TAG, "[VR][NATIVE][AlarmActivity] onNewIntent taskId=\$taskId action=\$action data=\$data")
  }

  override fun onResume() {
    super.onResume()
    Log.i(LOG_TAG, "[VR][NATIVE][AlarmActivity] onResume taskId=\$taskId isTaskRoot=\$isTaskRoot")
  }

  override fun onPause() {
    super.onPause()
    Log.i(LOG_TAG, "[VR][NATIVE][AlarmActivity] onPause taskId=\$taskId")
  }

  override fun onStop() {
    super.onStop()
    Log.i(LOG_TAG, "[VR][NATIVE][AlarmActivity] onStop taskId=\$taskId")
  }

  override fun onDestroy() {
    Log.i(LOG_TAG, "[VR][NATIVE][AlarmActivity] onDestroy taskId=\$taskId")
    super.onDestroy()
  }

  override fun getMainComponentName(): String = "alarm"

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

            // Also patch MainActivity.kt with logging for debugging (pastebin Step 1)
            const mainActivityPath = path.join(
                config.modRequest.platformProjectRoot,
                "app",
                "src",
                "main",
                "java",
                ...packagePath,
                "MainActivity.kt"
            );

            try {
                if (fs.existsSync(mainActivityPath)) {
                    let mainActivityContent = fs.readFileSync(mainActivityPath, "utf8");
                    
                    // Check if logging is already added by looking for version marker
                    if (!mainActivityContent.includes("MAIN_ACTIVITY_LOG_VERSION")) {
                        // Add import for Log if not present
                        if (!mainActivityContent.includes("import android.util.Log")) {
                            mainActivityContent = mainActivityContent.replace(
                                "import android.os.Bundle",
                                "import android.os.Bundle\nimport android.util.Log"
                            );
                        }
                        
                        // Add version marker and comprehensive logging
                        mainActivityContent = mainActivityContent.replace(
                            /class MainActivity : ReactActivity\(\) \{/,
                            `class MainActivity : ReactActivity() {

  companion object {
    // Version marker to verify we're running the correct native build
    const val MAIN_ACTIVITY_LOG_VERSION = 2
    private const val LOG_TAG = "VR"
  }`
                        );
                        
                        // Replace the entire onCreate method with logged version
                        mainActivityContent = mainActivityContent.replace(
                            /override fun onCreate\(savedInstanceState: Bundle\?\) \{\s*\/\/ Set the theme[\s\S]*?super\.onCreate\(null\)/,
                            `override fun onCreate(savedInstanceState: Bundle?) {
    val intentAction = intent?.action ?: "null"
    val intentData = intent?.dataString ?: "null"
    val intentFlags = intent?.flags ?: 0
    val taskId = this.taskId
    val isTaskRoot = this.isTaskRoot
    val componentName = "main"
    
    // Log sanitized extras (keys only, truncated values)
    val extrasKeys = intent?.extras?.keySet()?.toList() ?: emptyList()
    val extrasSummary = extrasKeys.joinToString(",") { key ->
      val value = intent?.extras?.get(key)
      val valueStr = when (value) {
        is String -> value.take(100)
        is Number -> value.toString()
        is Boolean -> value.toString()
        else -> "[\${value?.javaClass?.simpleName ?: "null"}]"
      }
      "\$key=\$valueStr"
    }
    
    // Set the theme to AppTheme BEFORE onCreate to support
    // coloring the background, status bar, and navigation bar.
    // This is required for expo-splash-screen.
    setTheme(R.style.AppTheme);
    
    Log.i(LOG_TAG, "[VR][NATIVE][MainActivity] onCreate taskId=\$taskId isTaskRoot=\$isTaskRoot component=\$componentName action=\$intentAction data=\$intentData flags=\$intentFlags extras=[\$extrasSummary] version=\$MAIN_ACTIVITY_LOG_VERSION")
    
    super.onCreate(null)
    
    Log.i(LOG_TAG, "[VR][NATIVE][MainActivity] onCreate complete taskId=\$taskId")`
                        );
                        
                        // Add lifecycle methods if they don't exist
                        if (!mainActivityContent.includes("override fun onResume()")) {
                            mainActivityContent = mainActivityContent.replace(
                                /\n\}\s*$/,
                                `

  override fun onResume() {
    super.onResume()
    Log.i(LOG_TAG, "[VR][NATIVE][MainActivity] onResume taskId=\$taskId isTaskRoot=\$isTaskRoot")
  }

  override fun onPause() {
    super.onPause()
    Log.i(LOG_TAG, "[VR][NATIVE][MainActivity] onPause taskId=\$taskId")
  }

  override fun onStop() {
    super.onStop()
    Log.i(LOG_TAG, "[VR][NATIVE][MainActivity] onStop taskId=\$taskId")
  }

  override fun onDestroy() {
    Log.i(LOG_TAG, "[VR][NATIVE][MainActivity] onDestroy taskId=\$taskId")
    super.onDestroy()
  }
}
`
                            );
                        }
                        
                        fs.writeFileSync(mainActivityPath, mainActivityContent, "utf8");
                        console.log("[withFullScreenAlarm] Added comprehensive logging to MainActivity.kt");
                    }
                }
            } catch (e) {
                console.log("[withFullScreenAlarm] Failed to patch MainActivity.kt:", e);
            }

            return config;
        },
    ]);

    return config;
}

module.exports = withFullScreenAlarm;
