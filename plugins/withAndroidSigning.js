const { withAppBuildGradle } = require("@expo/config-plugins");

const SIGNING_CONFIG = `
    signingConfigs {
        release {
            storeFile file("../../voicereminder.keystore")
            storePassword "voicereminder123"
            keyAlias "voicereminder"
            keyPassword "voicereminder123"
        }
    }
`;

function addSigningConfig(buildGradle) {
    // Check if signing config already exists
    if (buildGradle.includes("signingConfigs")) {
        return buildGradle;
    }

    // Find android { block and insert after it
    const androidMatch = buildGradle.match(/android\s*\{/);
    if (!androidMatch) {
        throw new Error("Could not find android block in app/build.gradle");
    }

    const insertIndex = androidMatch.index + androidMatch[0].length;
    const before = buildGradle.slice(0, insertIndex);
    const after = buildGradle.slice(insertIndex);

    // Also update release buildTypes to use the signing config
    let updated = `${before}${SIGNING_CONFIG}${after}`;

    // Replace the release build type to use our signing config
    updated = updated.replace(
        /buildTypes\s*\{[\s\S]*?release\s*\{[\s\S]*?signingConfig\s+signingConfigs\.debug/,
        (match) => match.replace("signingConfigs.debug", "signingConfigs.release")
    );

    return updated;
}

module.exports = function withAndroidSigning(config) {
    return withAppBuildGradle(config, (config) => {
        config.modResults.contents = addSigningConfig(config.modResults.contents);
        return config;
    });
};
