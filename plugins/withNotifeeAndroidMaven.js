const { withProjectBuildGradle } = require("expo/config-plugins");

/**
 * Expo config plugin to add Notifee Maven repository to Android build.gradle.
 * This is required to fix an error while building for Android with Expo SDK 54.
 * Source: https://github.com/invertase/notifee/issues/1262#issuecomment-3605485587
 */
function withNotifee(config) {
  return withProjectBuildGradle(config, (config) => {
    if (config.modResults.language === "groovy") {
      config.modResults.contents = addNotifeeMavenRepo(config.modResults.contents);
    }

    return config;
  });
}

function addNotifeeMavenRepo(buildGradle) {
  // Check if already added
  if (buildGradle.includes("@notifee/react-native/android/libs")) {
    return buildGradle;
  }

  const notifeeRepo = `maven { url "$rootDir/../node_modules/@notifee/react-native/android/libs" }`;
  // Find the allprojects { repositories { block and add the maven repo
  const pattern = /(allprojects\s*\{\s*repositories\s*\{)/;

  if (pattern.test(buildGradle)) {
    return buildGradle.replace(pattern, `$1\n    ${notifeeRepo}`);
  }

  return buildGradle;
}

module.exports = withNotifee;
