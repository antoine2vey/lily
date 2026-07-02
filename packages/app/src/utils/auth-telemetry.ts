import * as Sentry from '@sentry/react-native'

/**
 * Auth/session observability.
 *
 * Breadcrumbs record the sequence of auth events leading up to a disconnect
 * (attached to whatever error is captured next); captured messages make
 * forced logouts and refresh failures countable and alertable in Sentry, so
 * we can see how often users get logged out in production and why.
 */

type AuthEventData = Record<string, string | number | boolean>

export const addAuthBreadcrumb = (
  message: string,
  data?: AuthEventData
): void => {
  Sentry.addBreadcrumb({
    category: 'auth',
    message,
    level: 'info',
    ...(data ? { data } : {}),
  })
}

export type ForcedLogoutReason =
  // Server rejected the refresh token (401/403) — session truly dead
  | 'refresh_rejected'
  // getCurrentUser failed with an auth error during app launch
  | 'startup_check_auth_error'
  // getCurrentUser failed with an auth error mid-session
  | 'refresh_user_auth_error'

/**
 * The user is being logged out without asking for it. Every call site of
 * this function is a disconnect the user experiences.
 */
export const trackForcedLogout = (
  reason: ForcedLogoutReason,
  data?: AuthEventData
): void => {
  Sentry.captureMessage('auth.forced_logout', {
    level: 'warning',
    tags: { auth_logout_reason: reason },
    ...(data ? { extra: data } : {}),
  })
}

/**
 * Something unexpected happened in the auth flow that did not (yet) log the
 * user out — refresh throttled, races recovered, transient failures.
 */
export const trackAuthAnomaly = (event: string, data?: AuthEventData): void => {
  Sentry.captureMessage(`auth.${event}`, {
    level: 'warning',
    ...(data ? { extra: data } : {}),
  })
}
