// @ts-check
const appJson = require('./app.json');

const disableUpdates = true;

/** @type {import('expo/config').ExpoConfig} */
module.exports = {
  expo: {
    ...appJson.expo,
    // Hier fügen wir die ID für iOS hinzu:
    ios: {
      ...appJson.expo.ios,
      bundleIdentifier: "com.startplatzboerse.app",
    },
    // Und hier für Android, damit es konsistent bleibt:
    android: {
      ...appJson.expo.android,
      package: "com.startplatzboerse.app",
    },
    updates: {
      ...appJson.expo.updates,
      enabled: !disableUpdates,
      checkAutomatically: disableUpdates ? 'NEVER' : 'ON_LOAD',
      fallbackToCacheTimeout: disableUpdates ? 0 : 10000,
    },
    plugins: [
      'expo-font',
      'expo-splash-screen',
      ...(appJson.expo.plugins ?? []),
    ],
  },
};