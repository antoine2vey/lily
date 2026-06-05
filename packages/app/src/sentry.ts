import * as Sentry from '@sentry/react-native'

Sentry.init({
  dsn: process.env.EXPO_PUBLIC_SENTRY_DSN,
  enabled: !!process.env.EXPO_PUBLIC_SENTRY_DSN,
  tracesSampleRate: 1.0,
  environment: __DEV__ ? 'development' : 'production',
  // Drop expected, non-actionable transient network noise: an in-flight
  // fetch aborted because the user navigated away, backgrounded the app, or
  // briefly lost signal. These surface from Expo fetch, SWR and @ai-sdk and
  // bury real signal. Matches both English and French (device-locale) copy.
  ignoreErrors: [
    /network connection was lost/i,
    /connexion réseau a été perdue/i,
    /FetchRequestCanceledException/i,
    /opération n’a pas pu s’achever/i,
    // expo-notifications primes its server-registration keychain read on
    // import (DevicePushTokenAutoRegistration.fx) with no .catch. The blob is
    // stored kSecAttrAccessibleWhenUnlockedThisDeviceOnly, so a background/
    // locked-device boot (silent push, Live Activity push-to-start, APNs token
    // refresh) reads it while locked → errSecInteractionNotAllowed (-25308).
    // Self-healing: registration retries on next unlock/token event. Match on
    // the locale-stable signals, not the OS message (which localizes per device).
    /getRegistrationInfoAsync/i,
    /ERR_NOTIFICATIONS_KEYCHAIN_ACCESS/i,
  ],
})
