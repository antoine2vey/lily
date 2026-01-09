import { getCurrentUser } from '@lily/api/services/auth/endpoints/get-current-user'
import { refreshToken } from '@lily/api/services/auth/endpoints/refresh-token'
import { resendVerificationEmail } from '@lily/api/services/auth/endpoints/resend-verification-email'
import { sendMagicLink } from '@lily/api/services/auth/endpoints/send-magic-link'
import { setUsername } from '@lily/api/services/auth/endpoints/set-username'
import { signOut } from '@lily/api/services/auth/endpoints/sign-out'
import { verifyEmail } from '@lily/api/services/auth/endpoints/verify-email'
import { verifyMagicLink } from '@lily/api/services/auth/endpoints/verify-magic-link'
import { Effect } from 'effect'

// Auth service implementation
export class AuthService extends Effect.Service<AuthService>()('AuthService', {
  effect: Effect.succeed({
    sendMagicLink,
    verifyMagicLink,
    getCurrentUser,
    signOut,
    setUsername,
    resendVerificationEmail,
    verifyEmail,
    refreshToken,
  }),
}) {}
