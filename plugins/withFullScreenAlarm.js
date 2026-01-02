const { withAndroidManifest } = require("@expo/config-plugins");

/**
 * Expo config plugin to add USE_FULL_SCREEN_INTENT permission for alarm notifications.
 * This allows the app to display full-screen alarm UI when a notification fires,
 * even when the device is locked.
 */
function withFullScreenAlarm(config) {
    return withAndroidManifest(config, async (config) => {
        const manifest = config.modResults.manifest;

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

        return config;
    });
}

module.exports = withFullScreenAlarm;
