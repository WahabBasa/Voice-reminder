/**
 * Expo config plugin to add AlarmAudioModule native Android module.
 * This adds:
 * 1. AlarmAudioModule.kt - Native module with USAGE_ALARM for alarm stream audio
 * 2. ActivityControlModule.kt - Native helpers for AlarmActivity/task handling + logAppTaskState
 * 3. ActivityTracker.kt - Application-level activity lifecycle tracking
 * 4. AlarmAudioPackage.kt - React Native package registration
 * 5. Modifies MainApplication.kt to register the package and ActivityTracker
 */

const { withProjectBuildGradle, withMainApplication, withDangerousMod } = require("@expo/config-plugins");
const fs = require("fs");
const path = require("path");

// AlarmAudioModule.kt content
const ALARM_AUDIO_MODULE_KT = `package com.wahabbasa.VoiceReminder

import android.media.AudioAttributes
import android.media.MediaPlayer
import android.net.Uri
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

/**
 * Native module for playing alarm audio with USAGE_ALARM AudioAttributes.
 * This bypasses silent mode and respects the alarm volume stream.
 */
class AlarmAudioModule(private val reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {

    private var mediaPlayer: MediaPlayer? = null

    override fun getName(): String = "AlarmAudioModule"

    @ReactMethod
    fun play(filePath: String, volume: Double, promise: Promise) {
        try {
            // Stop any existing playback first
            stopPlayer()

            // Create AudioAttributes for alarm stream
            val audioAttributes = AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_ALARM)
                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                .build()

            // Create and configure MediaPlayer
            mediaPlayer = MediaPlayer().apply {
                setAudioAttributes(audioAttributes)
                
                // Handle both file:// URIs and regular paths
                val uri = if (filePath.startsWith("file://")) {
                    Uri.parse(filePath)
                } else {
                    Uri.parse("file://" + filePath)
                }
                
                setDataSource(reactContext, uri)
                setVolume(volume.toFloat(), volume.toFloat())
                isLooping = true
                
                setOnPreparedListener { mp ->
                    mp.start()
                    promise.resolve(true)
                }
                
                setOnErrorListener { _, what, extra ->
                    promise.reject("PLAY_ERROR", "MediaPlayer error: what=" + what + ", extra=" + extra)
                    true
                }
                
                prepareAsync()
            }
        } catch (e: Exception) {
            promise.reject("PLAY_ERROR", e.message, e)
        }
    }

    @ReactMethod
    fun stop(promise: Promise) {
        try {
            stopPlayer()
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("STOP_ERROR", e.message, e)
        }
    }

    @ReactMethod
    fun setVolume(volume: Double, promise: Promise) {
        try {
            mediaPlayer?.setVolume(volume.toFloat(), volume.toFloat())
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("VOLUME_ERROR", e.message, e)
        }
    }

    @ReactMethod
    fun isPlaying(promise: Promise) {
        try {
            val playing = mediaPlayer?.isPlaying ?: false
            promise.resolve(playing)
        } catch (e: Exception) {
            promise.resolve(false)
        }
    }

    private fun stopPlayer() {
        mediaPlayer?.let { player ->
            if (player.isPlaying) {
                player.stop()
            }
            player.release()
        }
        mediaPlayer = null
    }

    override fun invalidate() {
        stopPlayer()
        super.invalidate()
    }
}`;

// ActivityTracker.kt content - Application-level activity lifecycle tracking
const ACTIVITY_TRACKER_KT = `package com.wahabbasa.VoiceReminder

import android.app.Activity
import android.app.Application
import android.os.Bundle
import android.util.Log

/**
 * Activity lifecycle tracker for debugging.
 * Logs all activity transitions and maintains state about the last resumed activity.
 * Registered in MainApplication.onCreate()
 */
object ActivityTracker : Application.ActivityLifecycleCallbacks {
    
    @Volatile
    var lastResumedActivityName: String? = null
        private set
    
    @Volatile
    var lastResumedAt: Long = 0
        private set
    
    private const val LOG_TAG = "VR"
    
    init {
        Log.i(LOG_TAG, "[VR][NATIVE][ActivityTracker] initialized")
    }
    
    private fun logLifecycle(event: String, activity: Activity) {
        val name = activity.javaClass.simpleName
        val taskId = activity.taskId
        val isTaskRoot = activity.isTaskRoot
        val timestamp = System.currentTimeMillis()
        
        Log.i(LOG_TAG, "[VR][NATIVE][Lifecycle] event=\$event activity=\$name taskId=\$taskId isTaskRoot=\$isTaskRoot ts=\$timestamp")
    }
    
    override fun onActivityCreated(activity: Activity, savedInstanceState: Bundle?) {
        val intentAction = activity.intent?.action ?: "null"
        val intentData = activity.intent?.dataString ?: "null"
        val intentFlags = activity.intent?.flags ?: 0
        val extrasKeys = activity.intent?.extras?.keySet()?.toList() ?: emptyList()
        val extrasSummary = extrasKeys.joinToString(",") { key ->
            val value = activity.intent?.extras?.get(key)
            val valueStr = when (value) {
                is String -> value.take(50)
                is Number -> value.toString()
                is Boolean -> value.toString()
                else -> "[\${value?.javaClass?.simpleName ?: "null"}]"
            }
            "\$key=\$valueStr"
        }
        
        Log.i(LOG_TAG, "[VR][NATIVE][Lifecycle] event=onCreated activity=\${activity.javaClass.simpleName} taskId=\${activity.taskId} isTaskRoot=\${activity.isTaskRoot} action=\$intentAction data=\$intentData flags=\$intentFlags extras=[\$extrasSummary]")
    }
    
    override fun onActivityStarted(activity: Activity) {
        logLifecycle("onStarted", activity)
    }
    
    override fun onActivityResumed(activity: Activity) {
        val name = activity.javaClass.name
        lastResumedActivityName = name
        lastResumedAt = System.currentTimeMillis()
        
        Log.i(LOG_TAG, "[VR][NATIVE][Lifecycle] event=onResumed activity=\${activity.javaClass.simpleName} taskId=\${activity.taskId} isTaskRoot=\${activity.isTaskRoot} lastResumed=\$lastResumedAt")
    }
    
    override fun onActivityPaused(activity: Activity) {
        logLifecycle("onPaused", activity)
    }
    
    override fun onActivityStopped(activity: Activity) {
        logLifecycle("onStopped", activity)
    }
    
    override fun onActivitySaveInstanceState(activity: Activity, outState: Bundle) {
        // Not logging to reduce noise
    }
    
    override fun onActivityDestroyed(activity: Activity) {
        logLifecycle("onDestroyed", activity)
    }
    
    /**
     * Logs current state for debugging.
     * Called from JS via ActivityControlModule.logAppTaskState()
     */
    fun logCurrentState(reason: String) {
        Log.i(LOG_TAG, "[VR][NATIVE][StateDump] reason=\$reason lastResumedActivity=\$lastResumedActivityName lastResumedAt=\$lastResumedAt")
    }
}`;

// ActivityControlModule.kt content with logAppTaskState method
const ACTIVITY_CONTROL_MODULE_KT = `package com.wahabbasa.VoiceReminder

import android.app.ActivityManager
import android.app.KeyguardManager
import android.content.Context
import android.os.Build
import android.util.Log
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

/**
 * Native helpers for distinguishing AlarmActivity vs MainActivity and closing
 * the AlarmActivity task after dismiss/snooze so the main app UI does not show.
 * 
 * Also provides logAppTaskState() for debugging (pastebin Step 3.3)
 */
class ActivityControlModule(private val reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {

  companion object {
    private const val LOG_TAG = "VR"
  }

  override fun getName(): String = "ActivityControl"

  @ReactMethod
  fun getCurrentActivityName(promise: Promise) {
    try {
      val activity = reactContext.currentActivity
      promise.resolve(activity?.javaClass?.name)
    } catch (e: Exception) {
      promise.resolve(null)
    }
  }

  /**
   * Returns true if the current activity is AlarmActivity.
   */
  @ReactMethod
  fun isAlarmActivity(promise: Promise) {
    val activity = reactContext.currentActivity
    if (activity == null) {
      promise.resolve(false)
      return
    }
    val name = activity.javaClass.name
    promise.resolve(name.endsWith(".AlarmActivity"))
  }

  @ReactMethod
  fun isKeyguardLocked(promise: Promise) {
    try {
      val km = reactContext.getSystemService(Context.KEYGUARD_SERVICE) as? KeyguardManager
      if (km == null) {
        promise.resolve(false)
        return
      }

      val locked = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
        km.isDeviceLocked || km.isKeyguardLocked
      } else {
        km.isKeyguardLocked
      }

      promise.resolve(locked)
    } catch (_: Exception) {
      promise.resolve(false)
    }
  }

  /**
   * Finishes the current activity if it is AlarmActivity.
   * Returns true if a finish was requested.
   */
  @ReactMethod
  fun finishIfAlarmActivity(promise: Promise) {
    val activity = reactContext.currentActivity
    if (activity == null) {
      promise.resolve(false)
      return
    }
    val name = activity.javaClass.name
    if (!name.endsWith(".AlarmActivity")) {
      promise.resolve(false)
      return
    }

    Log.i(LOG_TAG, "[VR][NATIVE][ActivityControl] finishIfAlarmActivity taskId=\${activity.taskId}")

    activity.runOnUiThread {
      try {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
          activity.finishAndRemoveTask()
          Log.i(LOG_TAG, "[VR][NATIVE][ActivityControl] finishAndRemoveTask called")
        } else {
          activity.finish()
          Log.i(LOG_TAG, "[VR][NATIVE][ActivityControl] finish called")
        }
      } catch (_: Exception) {
        try {
          activity.finish()
          Log.i(LOG_TAG, "[VR][NATIVE][ActivityControl] finish called (fallback)")
        } catch (_: Exception) {
          Log.i(LOG_TAG, "[VR][NATIVE][ActivityControl] finish failed")
        }
      }
    }
    promise.resolve(true)
  }

  /**
   * Finishes the current activity task (AlarmActivity or MainActivity).
   * Returns true if a finish was actually requested.
   */
  @ReactMethod
  fun finishCurrentTask(promise: Promise) {
    val activity = reactContext.currentActivity
    if (activity == null) {
      promise.resolve(false)
      return
    }

    Log.i(LOG_TAG, "[VR][NATIVE][ActivityControl] finishCurrentTask activity=\${activity.javaClass.simpleName} taskId=\${activity.taskId}")

    activity.runOnUiThread {
      try {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
          activity.finishAndRemoveTask()
          Log.i(LOG_TAG, "[VR][NATIVE][ActivityControl] finishAndRemoveTask called")
        } else {
          activity.finish()
          Log.i(LOG_TAG, "[VR][NATIVE][ActivityControl] finish called")
        }
      } catch (_: Exception) {
        try {
          activity.finish()
          Log.i(LOG_TAG, "[VR][NATIVE][ActivityControl] finish called (fallback)")
        } catch (_: Exception) {
          Log.i(LOG_TAG, "[VR][NATIVE][ActivityControl] finish failed")
        }
      }
    }
    promise.resolve(true)
  }

  /**
   * Logs current app task state for debugging (pastebin Step 3.3).
   * Called from JS at key decision points.
   */
  @ReactMethod
  fun logAppTaskState(reason: String, promise: Promise) {
    try {
      // Log from ActivityTracker (pastebin Step 3.2)
      ActivityTracker.logCurrentState(reason)

      // Log current activity info
      val currentAct = reactContext.currentActivity
      val currentActivityName = currentAct?.javaClass?.name ?: "null"
      val currentTaskId = currentAct?.taskId ?: -1
      
      Log.i(LOG_TAG, "[VR][NATIVE][ActivityControl] logAppTaskState reason=\$reason currentActivity=\$currentActivityName currentTaskId=\$currentTaskId")

      // Log app tasks from ActivityManager
      try {
        val am = reactContext.getSystemService(Context.ACTIVITY_SERVICE) as? ActivityManager
        if (am != null) {
          val appTasks = am.appTasks
          Log.i(LOG_TAG, "[VR][NATIVE][ActivityControl] logAppTaskState appTasksCount=\${appTasks.size}")
          
          appTasks.forEachIndexed { index, appTask ->
            try {
              val taskInfo = appTask.taskInfo
              val topActivity = taskInfo?.topActivity?.className ?: "null"
              val taskId = taskInfo?.taskId ?: -1
              val numActivities = taskInfo?.numActivities ?: 0
              Log.i(LOG_TAG, "[VR][NATIVE][ActivityControl] logAppTaskState task[\$index] id=\$taskId topActivity=\$topActivity numActivities=\$numActivities")
            } catch (e: Exception) {
              Log.i(LOG_TAG, "[VR][NATIVE][ActivityControl] logAppTaskState task[\$index] error=\${e.message}")
            }
          }
        } else {
          Log.i(LOG_TAG, "[VR][NATIVE][ActivityControl] logAppTaskState ActivityManager not available")
        }
      } catch (e: Exception) {
        Log.i(LOG_TAG, "[VR][NATIVE][ActivityControl] logAppTaskState failed to get appTasks: \${e.message}")
      }

      promise.resolve(true)
    } catch (e: Exception) {
      Log.i(LOG_TAG, "[VR][NATIVE][ActivityControl] logAppTaskState error: \${e.message}")
      promise.resolve(false)
    }
  }
}`;

// AlarmAudioPackage.kt content
const ALARM_AUDIO_PACKAGE_KT = `package com.wahabbasa.VoiceReminder

import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.ViewManager

class AlarmAudioPackage : ReactPackage {
    override fun createNativeModules(reactContext: ReactApplicationContext): List<NativeModule> {
        return listOf(
            AlarmAudioModule(reactContext),
            ActivityControlModule(reactContext)
        )
    }

    override fun createViewManagers(reactContext: ReactApplicationContext): List<ViewManager<*, *>> {
        return emptyList()
    }
}`;

function withAlarmAudioModule(config) {
  // Step 1: Add the Kotlin files during prebuild
  config = withDangerousMod(config, [
    "android",
    async (config) => {
      const projectRoot = config.modRequest.projectRoot;
      const packageDir = path.join(
        projectRoot,
        "android/app/src/main/java/com/wahabbasa/VoiceReminder"
      );

      // Ensure directory exists
      if (!fs.existsSync(packageDir)) {
        fs.mkdirSync(packageDir, { recursive: true });
      }

      // Write AlarmAudioModule.kt
      const moduleFile = path.join(packageDir, "AlarmAudioModule.kt");
      fs.writeFileSync(moduleFile, ALARM_AUDIO_MODULE_KT, "utf-8");
      console.log("[withAlarmAudioModule] Created AlarmAudioModule.kt");

      // Write ActivityControlModule.kt
      const activityControlFile = path.join(packageDir, "ActivityControlModule.kt");
      fs.writeFileSync(activityControlFile, ACTIVITY_CONTROL_MODULE_KT, "utf-8");
      console.log("[withAlarmAudioModule] Created ActivityControlModule.kt");

      // Write ActivityTracker.kt
      const activityTrackerFile = path.join(packageDir, "ActivityTracker.kt");
      fs.writeFileSync(activityTrackerFile, ACTIVITY_TRACKER_KT, "utf-8");
      console.log("[withAlarmAudioModule] Created ActivityTracker.kt");

      // Write AlarmAudioPackage.kt
      const packageFile = path.join(packageDir, "AlarmAudioPackage.kt");
      fs.writeFileSync(packageFile, ALARM_AUDIO_PACKAGE_KT, "utf-8");
      console.log("[withAlarmAudioModule] Created AlarmAudioPackage.kt");

      return config;
    },
  ]);

  // Step 2: Modify MainApplication.kt to register the package and ActivityTracker
  config = withMainApplication(config, (config) => {
    let contents = config.modResults.contents;

    // Add import if not present
    const importStatement = "import com.wahabbasa.VoiceReminder.AlarmAudioPackage";
    if (!contents.includes(importStatement)) {
      // Add import after other imports
      const lastImportIndex = contents.lastIndexOf("import ");
      if (lastImportIndex !== -1) {
        const endOfLine = contents.indexOf("\n", lastImportIndex);
        contents =
          contents.slice(0, endOfLine + 1) +
          importStatement + "\n" +
          contents.slice(endOfLine + 1);
      }
    }

    // Add package to getPackages() if not present
    const packageRegistration = "add(AlarmAudioPackage())";
    if (!contents.includes(packageRegistration)) {
      // Find the getPackages function and add our package
      const packagesMatch = contents.match(
        /PackageList\(this\)\.packages\.apply\s*\{[\s\S]*?\/\/.*can be added manually here[\s\S]*?\n/
      );
      if (packagesMatch) {
        const insertPoint = contents.indexOf(packagesMatch[0]) + packagesMatch[0].length;
        contents =
          contents.slice(0, insertPoint) +
          `              ${packageRegistration}\n` +
          contents.slice(insertPoint);
      }
    }

    // Add ActivityTracker import if not present
    const trackerImport = "import com.wahabbasa.VoiceReminder.ActivityTracker";
    if (!contents.includes(trackerImport)) {
      const lastImportIndex = contents.lastIndexOf("import ");
      if (lastImportIndex !== -1) {
        const endOfLine = contents.indexOf("\n", lastImportIndex);
        contents =
          contents.slice(0, endOfLine + 1) +
          trackerImport + "\n" +
          contents.slice(endOfLine + 1);
      }
    }

    // Register ActivityTracker in onCreate if not present
    const trackerRegistration = "registerActivityLifecycleCallbacks(ActivityTracker)";
    if (!contents.includes(trackerRegistration)) {
      // Find onCreate and add registration
      const onCreateMatch = contents.match(/override fun onCreate\(\) \{\s*super\.onCreate\(\)/);
      if (onCreateMatch) {
        const insertPoint = contents.indexOf(onCreateMatch[0]) + onCreateMatch[0].length;
        contents =
          contents.slice(0, insertPoint) +
          `\n    \n    // Register ActivityTracker for lifecycle logging (pastebin Step 3.2)\n    ${trackerRegistration}\n    Log.i("VR", "[VR][NATIVE][MainApplication] ActivityTracker registered")` +
          contents.slice(insertPoint);
      }
    }

    // Add Log import if not present
    if (!contents.includes("import android.util.Log")) {
      const lastImportIndex = contents.lastIndexOf("import ");
      if (lastImportIndex !== -1) {
        const endOfLine = contents.indexOf("\n", lastImportIndex);
        contents =
          contents.slice(0, endOfLine + 1) +
          "import android.util.Log\n" +
          contents.slice(endOfLine + 1);
      }
    }

    config.modResults.contents = contents;
    console.log("[withAlarmAudioModule] Modified MainApplication.kt to register AlarmAudioPackage and ActivityTracker");
    return config;
  });

  return config;
}

module.exports = withAlarmAudioModule;
