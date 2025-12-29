const { withAppBuildGradle } = require("@expo/config-plugins");

const RELEASE_SIGNING_CONFIG = `
        release {
            storeFile file("../../voicereminder.keystore")
            storePassword "voicereminder123"
            keyAlias "voicereminder"
            keyPassword "voicereminder123"
        }`;

function addSigningConfig(buildGradle) {
    let updated = buildGradle;

    // Check if release signing config already exists
    if (buildGradle.includes('signingConfigs') && buildGradle.includes('release {') && buildGradle.includes('voicereminder.keystore')) {
        // Already configured, just ensure buildTypes uses it
    } else if (buildGradle.includes('signingConfigs {')) {
        // signingConfigs exists but no release config - add release inside existing block
        updated = updated.replace(
            /signingConfigs\s*\{/,
            `signingConfigs {${RELEASE_SIGNING_CONFIG}`
        );
    } else {
        // No signingConfigs at all - add the whole block
        const androidMatch = buildGradle.match(/android\s*\{/);
        if (!androidMatch) {
            throw new Error("Could not find android block in app/build.gradle");
        }

        const insertIndex = androidMatch.index + androidMatch[0].length;
        const before = buildGradle.slice(0, insertIndex);
        const after = buildGradle.slice(insertIndex);
        updated = `${before}\n    signingConfigs {${RELEASE_SIGNING_CONFIG}\n    }${after}`;
    }

    // Replace the release build type to use our release signing config
    // Match the release block's signingConfig line specifically
    updated = updated.replace(
        /(buildTypes\s*\{[\s\S]*?release\s*\{[\s\S]*?)signingConfig\s+signingConfigs\.debug/,
        '$1signingConfig signingConfigs.release'
    );

    return updated;
}

module.exports = function withAndroidSigning(config) {
    return withAppBuildGradle(config, (config) => {
        config.modResults.contents = addSigningConfig(config.modResults.contents);
        return config;
    });
};
