import { MagicLinkRepository } from '@lily/api/repositories/magic-link.repository'
import { APP_VERIFY_DEEP_LINK_PREFIX } from '@lily/api/services/auth/constants'
import { Effect } from 'effect'

/**
 * Browser callback endpoint - validates token exists and redirects to app
 * This endpoint is called when user clicks the magic link in their email
 * It redirects to the app with the code for the app to exchange for tokens
 */
export const magicLinkCallback = ({
  token,
}: {
  token: string
}): Effect.Effect<
  { redirectUrl: string },
  { message: string },
  MagicLinkRepository
> =>
  Effect.gen(function* () {
    const magicLinkRepo = yield* MagicLinkRepository

    // Validate UUID format
    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(token)) {
      return yield* Effect.fail({ message: 'Invalid token format' })
    }

    // Check if token exists and is valid (not used, not expired)
    const magicLink = yield* magicLinkRepo.findValidByToken(token)

    if (!magicLink) {
      return yield* Effect.fail({ message: 'Invalid or expired magic link' })
    }

    // Don't mark as used here - the verify endpoint will do that
    // Just redirect to app with the code
    const redirectUrl = `${APP_VERIFY_DEEP_LINK_PREFIX}${token}`

    // Return redirect URL - the handler will perform the actual redirect
    return { redirectUrl }
  }).pipe(Effect.withSpan('AuthService.magicLinkCallback'))
