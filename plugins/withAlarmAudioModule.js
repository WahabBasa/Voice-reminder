/**
 * Expo config plugin to add AlarmAudioModule native Android module.
 * This adds:
 * 1. AlarmAudioModule.kt - Native module with USAGE_ALARM for alarm stream audio
 * 2. AlarmAudioPackage.kt - React Native package registration
 * 3. Modifies MainApplication.kt to register the package
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

// AlarmAudioPackage.kt content
const ALARM_AUDIO_PACKAGE_KT = `package com.wahabbasa.VoiceReminder

import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.ViewManager

class AlarmAudioPackage : ReactPackage {
    override fun createNativeModules(reactContext: ReactApplicationContext): List<NativeModule> {
        return listOf(AlarmAudioModule(reactContext))
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

            // Write AlarmAudioPackage.kt
            const packageFile = path.join(packageDir, "AlarmAudioPackage.kt");
            fs.writeFileSync(packageFile, ALARM_AUDIO_PACKAGE_KT, "utf-8");
            console.log("[withAlarmAudioModule] Created AlarmAudioPackage.kt");

            return config;
        },
    ]);

    // Step 2: Modify MainApplication.kt to register the package
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

        config.modResults.contents = contents;
        console.log("[withAlarmAudioModule] Modified MainApplication.kt to register AlarmAudioPackage");
        return config;
    });

    return config;
}

module.exports = withAlarmAudioModule;
