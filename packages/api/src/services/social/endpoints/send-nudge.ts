import { FollowRepository } from '@lily/api/repositories/follow.repository'
import { UserRepository } from '@lily/api/repositories/user.repository'
import { CurrentUser } from '@lily/api/services/auth/middleware.types'
import { scheduleSimpleNotification } from '@lily/api/services/helpers/schedule-notification'
import type { NudgeRequest } from '@lily/shared'
import {
  NudgeNotAllowedError,
  NudgeRateLimitError,
  UserNotFoundError,
} from '@lily/shared'
import { DateTime, Effect, Option, pipe } from 'effect'

export const sendNudge = Effect.fn('SocialService.sendNudge')(function* (
  params: NudgeRequest
) {
  const { id: currentUserId, name: currentUserName } = yield* CurrentUser
  const followRepo = yield* FollowRepository
  const userRepo = yield* UserRepository

  const { targetUserId } = params

  // Target must exist
  const targetUser = yield* userRepo.findById(targetUserId)
  if (!targetUser) {
    return yield* new UserNotFoundError({
      userId: targetUserId,
    })
  }

  // Must be following the target
  const isFollowing = yield* followRepo.isFollowing(currentUserId, targetUserId)
  if (!isFollowing) {
    return yield* new NudgeNotAllowedError({
      message: 'You can only nudge users you follow',
    })
  }

  // Rate limit: 1 nudge per user per day
  const lastNudge = yield* followRepo.getLastNudge(currentUserId, targetUserId)
  if (lastNudge) {
    const oneDayAgo = DateTime.toDateUtc(
      DateTime.subtract(DateTime.unsafeNow(), { days: 1 })
    )
    if (lastNudge > oneDayAgo) {
      return yield* new NudgeRateLimitError({
        message: 'You can only nudge this user once per day',
      })
    }
  }

  // Record the nudge
  yield* followRepo.recordNudge(currentUserId, targetUserId)

  // Create push notification for target
  const nudgerName = pipe(
    Option.fromNullable(currentUserName),
    Option.getOrElse(() => 'A friend')
  )

  yield* scheduleSimpleNotification(
    'nudge_to_water',
    targetUserId,
    { senderName: nudgerName },
    targetUser.language
  )

  return { success: true }
})
