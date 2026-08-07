// Sentry's wrapper around Expo's default Metro config — required for
// source-map generation so crash stack traces point at real files.
const { getSentryExpoConfig } = require("@sentry/react-native/metro");

module.exports = getSentryExpoConfig(__dirname);
