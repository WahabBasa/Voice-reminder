const { withProjectBuildGradle, mergeContents } = require("@expo/config-plugins");

const MAVEN_LINE = `maven { url "$rootDir/../node_modules/@notifee/react-native/android/libs" }`;

function addNotifeeMavenRepo(buildGradle) {
  if (buildGradle.includes(MAVEN_LINE)) return buildGradle;

  const result = mergeContents({
    tag: "notifee-maven-repo",
    src: buildGradle,
    newSrc: `    ${MAVEN_LINE}`,
    anchor: /allprojects\s*\{\s*[\s\S]*?repositories\s*\{/m,
    offset: 1,
    comment: "//",
  });

  if (!result.didMerge) {
    throw new Error("Failed to add Notifee Maven repo to android/build.gradle");
  }

  return result.contents;
}

module.exports = function withNotifeeAndroidMaven(config) {
  return withProjectBuildGradle(config, (config) => {
    config.modResults.contents = addNotifeeMavenRepo(config.modResults.contents);
    return config;
  });
};

