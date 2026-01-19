import { getCurrentUser } from '@lily/api/services/auth/endpoints/get-current-user'
import { logout } from '@lily/api/services/auth/endpoints/logout'
import { magicLinkCallback } from '@lily/api/services/auth/endpoints/magic-link-callback'
import { refreshToken } from '@lily/api/services/auth/endpoints/refresh-token'
import { sendMagicLink } from '@lily/api/services/auth/endpoints/send-magic-link'
import { setUsername } from '@lily/api/services/auth/endpoints/set-username'
import { verifyMagicLink } from '@lily/api/services/auth/endpoints/verify-magic-link'
import { Effect } from 'effect'

// Auth service implementation
export class AuthService extends Effect.Service<AuthService>()('AuthService', {
  effect: Effect.succeed({
    sendMagicLink,
    magicLinkCallback,
    verifyMagicLink,
    refreshToken,
    getCurrentUser,
    logout,
    setUsername,
  }),
}) {}
