import type { ExpoConfig } from 'expo/config';
import englishLocale from './src/i18n/native/en.json';

const supportedLocales = ['en', 'he', 'es', 'fr', 'de', 'it', 'pt', 'ru', 'ja', 'ar'];

const config: ExpoConfig = {
  name: 'Show Control',
  slug: 'show-control-app',
  scheme: 'showcontrol',
  version: '0.1.0',
  orientation: 'default',
  userInterfaceStyle: 'dark',
  platforms: ['ios', 'android'],
  experiments: { typedRoutes: true },
  locales: {
    en: './src/i18n/native/en.json', he: './src/i18n/native/he.json', es: './src/i18n/native/es.json',
    fr: './src/i18n/native/fr.json', de: './src/i18n/native/de.json', it: './src/i18n/native/it.json',
    pt: './src/i18n/native/pt.json', ru: './src/i18n/native/ru.json', ja: './src/i18n/native/ja.json', ar: './src/i18n/native/ar.json',
  },
  updates: { enabled: false, checkAutomatically: 'NEVER', fallbackToCacheTimeout: 0 },
  ios: {
    supportsTablet: true,
    bundleIdentifier: 'app.showcontrol.working',
    infoPlist: {
      // JS/native adapters permit HTTP only to an explicitly paired private LAN helper.
      NSAppTransportSecurity: { NSAllowsArbitraryLoads: true, NSAllowsLocalNetworking: true },
      UIBackgroundModes: ['audio', 'bluetooth-central'],
      ...englishLocale.ios,
      CFBundleAllowMixedLocalizations: true,
      UIApplicationSceneManifest: {
        UIApplicationSupportsMultipleScenes: true,
        UISceneConfigurations: {
          UIWindowSceneSessionRoleApplication: [{ UISceneConfigurationName: 'Show Control private controls', UISceneDelegateClassName: 'ShowControlSceneDelegate' }],
          UIWindowSceneSessionRoleExternalDisplay: [{ UISceneConfigurationName: 'Show Control audience output', UISceneDelegateClassName: 'ShowAudienceSceneDelegate' }],
          UIWindowSceneSessionRoleExternalDisplayNonInteractive: [{ UISceneConfigurationName: 'Show Control audience output', UISceneDelegateClassName: 'ShowAudienceSceneDelegate' }],
        },
      },
      UIApplicationSupportsIndirectInputEvents: true,
    },
  },
  android: {
    package: 'app.showcontrol.working',
    permissions: [
      'android.permission.BLUETOOTH_CONNECT',
      'android.permission.BLUETOOTH_SCAN',
      'android.permission.FOREGROUND_SERVICE',
      'android.permission.FOREGROUND_SERVICE_MEDIA_PLAYBACK',
      'android.permission.POST_NOTIFICATIONS',
      'android.permission.VIBRATE',
      'android.permission.WAKE_LOCK',
      'android.permission.RECORD_AUDIO',
      'android.permission.FOREGROUND_SERVICE_MICROPHONE',
    ],
  },
  plugins: [
    './plugins/with-show-downloads',
    './plugins/with-offline-locales',
    'expo-router',
    ['expo-localization', { supportedLocales: { ios: supportedLocales, android: supportedLocales }, supportsRTL: true }],
    'expo-document-picker',
    'expo-secure-store',
    'expo-screen-orientation',
    ['expo-build-properties', { ios: { deploymentTarget: '16.4' }, android: { minSdkVersion: 24, useLegacyPackaging: true } }],
    [
      'expo-splash-screen',
      {
        backgroundColor: '#0B0E14',
        image: './assets/splash-icon.png',
        imageWidth: 160,
        resizeMode: 'contain',
      },
    ],
  ],
  extra: { buildIdentityIsProvisional: true, publicNameIsProvisional: true },
};

export default config;
