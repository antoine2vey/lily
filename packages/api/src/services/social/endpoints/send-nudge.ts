import { FollowRepository } from '@lily/api/repositories/follow.repository'
import { NotificationRepository } from '@lily/api/repositories/notification.repository'
import { UserRepository } from '@lily/api/repositories/user.repository'
import { CurrentUser } from '@lily/api/services/auth/middleware.types'
import { buildSimpleContent } from '@lily/api/services/notification-scheduler/translations'
import type { NudgeRequest } from '@lily/shared'
import {
  NudgeNotAllowedError,
  NudgeRateLimitError,
  UserNotFoundError,
} from '@lily/shared'
import { Effect, Option, pipe } from 'effect'

export const sendNudge = (params: NudgeRequest) =>
  Effect.gen(function* () {
    const { id: currentUserId, name: currentUserName } = yield* CurrentUser
    const followRepo = yield* FollowRepository
    const userRepo = yield* UserRepository
    const notificationRepo = yield* NotificationRepository

    const { targetUserId } = params

    // Target must exist
    const targetUser = yield* userRepo.findById(targetUserId)
    if (!targetUser) {
      return yield* Effect.fail(new UserNotFoundError({ userId: targetUserId }))
    }

    // Must be following the target
    const isFollowing = yield* followRepo.isFollowing(
      currentUserId,
      targetUserId
    )
    if (!isFollowing) {
      return yield* Effect.fail(
        new NudgeNotAllowedError({
          message: 'You can only nudge users you follow',
        })
      )
    }

    // Rate limit: 1 nudge per user per day
    const lastNudge = yield* followRepo.getLastNudge(
      currentUserId,
      targetUserId
    )
    if (lastNudge) {
      const oneDayMs = 24 * 60 * 60 * 1000
      const oneDayAgo = new Date(Date.now() - oneDayMs)
      if (lastNudge > oneDayAgo) {
        return yield* Effect.fail(
          new NudgeRateLimitError({
            message: 'You can only nudge this user once per day',
          })
        )
      }
    }

    // Record the nudge
    yield* followRepo.recordNudge(currentUserId, targetUserId)

    // Create push notification for target
    const nudgerName = pipe(
      Option.fromNullable(currentUserName),
      Option.getOrElse(() => 'A friend')
    )

    const { title, body } = buildSimpleContent(
      'nudge_to_water',
      { senderName: nudgerName },
      targetUser.language
    )

    yield* notificationRepo.create({
      userId: targetUserId,
      type: 'nudge_to_water',
      title,
      body,
      scheduledAt: new Date(),
    })

    return { success: true }
  }).pipe(Effect.withSpan('SocialService.sendNudge'))
