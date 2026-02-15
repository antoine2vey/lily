import { FollowRepository } from '@lily/api/repositories/follow.repository'
import { CurrentUser } from '@lily/api/services/auth/middleware.types'
import { Effect } from 'effect'

export const getSuggestedUsers = () =>
  Effect.gen(function* () {
    const { id: currentUserId } = yield* CurrentUser
    const followRepo = yield* FollowRepository

    const items = yield* followRepo.getSuggestedUsers({
      currentUserId,
      limit: 10,
    })

    return items
  }).pipe(Effect.withSpan('SocialService.getSuggestedUsers'))
