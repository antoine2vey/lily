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

    const upserted = yield* repo.upsertStartToken({
      userId,
      deviceTokenId: request.deviceTokenId,
      token: request.startToken,
    })

    // Drop orphan start-rows tied to dead device_tokens for this user — the
    // device_token's `is_active = false` predicate keeps multi-device users
    // safe.
    yield* repo.endOrphanStartTokens(userId, request.deviceTokenId)

    return upserted
  }).pipe(Effect.withSpan('ActivityPushTokensService.registerStartToken'))
