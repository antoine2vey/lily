import type { SqlError } from '@effect/sql/SqlError'
import { ActivityPushTokenRepository } from '@lily/api/repositories/activity-push-token.repository'
import { CurrentUser } from '@lily/api/services/auth/middleware.types'
import type { ActivityPushToken, RegisterStartTokenRequest } from '@lily/shared'
import { Effect } from 'effect'

// Idempotent upsert — Apple rotates push-to-start tokens per device.
export const registerStartToken = (
  request: RegisterStartTokenRequest
): Effect.Effect<
  ActivityPushToken,
  SqlError,
  ActivityPushTokenRepository | CurrentUser
> =>
  Effect.gen(function* () {
    const repo = yield* ActivityPushTokenRepository
    const { id: userId } = yield* CurrentUser

    return yield* repo.upsertStartToken({
      userId,
      deviceTokenId: request.deviceTokenId,
      token: request.startToken,
    })
  }).pipe(Effect.withSpan('ActivityPushTokensService.registerStartToken'))
