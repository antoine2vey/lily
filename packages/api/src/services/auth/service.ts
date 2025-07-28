import { Effect } from 'effect'
import { getCurrentUser } from './endpoints/get-current-user'
import { sendMagicLink } from './endpoints/send-magic-link'
import { setUsername } from './endpoints/set-username'
import { signOut } from './endpoints/sign-out'
import { verifyMagicLink } from './endpoints/verify-magic-link'

// Auth service implementation
export class AuthService extends Effect.Service<AuthService>()('AuthService', {
  effect: Effect.succeed({
    sendMagicLink,
    verifyMagicLink,
    getCurrentUser,
    signOut,
    setUsername,
  }),
}) {}
