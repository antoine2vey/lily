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
  ],
})
