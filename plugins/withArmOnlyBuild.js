const { withGradleProperties } = require('@expo/config-plugins');

/**
 * Configures the build to only include ARM architectures (real Android devices).
 * Skips x86/x86_64 which are only needed for emulators.
 * This significantly speeds up release builds (~50% faster).
 */
const withArmOnlyBuild = (config) => {
    return withGradleProperties(config, (config) => {
        // Find and update the reactNativeArchitectures property
        const props = config.modResults;
        const archIndex = props.findIndex(
            (item) => item.type === 'property' && item.key === 'reactNativeArchitectures'
        );

        if (archIndex !== -1) {
            props[archIndex].value = 'armeabi-v7a,arm64-v8a';
        } else {
            // Add it if not present
            props.push({
                type: 'property',
                key: 'reactNativeArchitectures',
                value: 'armeabi-v7a,arm64-v8a',
            });
        }

        return config;
    });
};

module.exports = withArmOnlyBuild;
