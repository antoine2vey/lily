// Access token expiry in seconds for response
export const ACCESS_TOKEN_EXPIRY_SECONDS = 15 * 60
// Refresh token expiry: 30 days
export const REFRESH_TOKEN_EXPIRY_MS = 30 * 24 * 60 * 60 * 1000
// Rotation grace window: a rotated (revoked) refresh token stays usable for
// this long so a concurrent/duplicate refresh, or a client killed between the
// server rotating and the device persisting the new pair, doesn't hard-logout
// the user. Reuse after the window still fails as before.
export const REFRESH_TOKEN_ROTATION_GRACE_MS = 60 * 1000
// Deep link prefix for magic link verification
export const APP_VERIFY_DEEP_LINK_PREFIX = 'lily://verify?code='
