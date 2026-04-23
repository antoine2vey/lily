import type { SqlError } from '@effect/sql/SqlError'
import { ActivityPushTokenRepository } from '@lily/api/repositories/activity-push-token.repository'
import { CurrentUser } from '@lily/api/services/auth/middleware.types'
import { Effect } from 'effect'

interface EndActivityError {
  readonly error: string
}

// Local dismissal: the app is telling us it ended the activity itself (e.g.
// user explicitly dismissed it from the lock screen). Ownership is checked so
// a user can't mark another user's activity as ended.
export const endActivity = (
  activityId: string
): Effect.Effect<
  { message: string },
  EndActivityError | SqlError,
  ActivityPushTokenRepository | CurrentUser
> =>
  Effect.gen(function* () {
    const repo = yield* ActivityPushTokenRepository
    const { id: userId } = yield* CurrentUser

    const existing = yield* repo.findByActivityId(activityId)

    if (!existing || existing.userId !== userId) {
      return yield* Effect.fail<EndActivityError>({
        error: 'activity not found',
      })
    }

    yield* repo.markEnded(activityId)
    return { message: 'ended' }
  }).pipe(Effect.withSpan('ActivityPushTokensService.endActivity'))
