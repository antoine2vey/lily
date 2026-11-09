import { CanopyRepository } from '@lily/api/repositories/canopy.repository'
import { UserRepository } from '@lily/api/repositories/user.repository'
import { CurrentUser } from '@lily/api/services/auth/middleware.types'
import { canopyView } from '@lily/api/services/canopy/helpers/canopy-view'
import { planInvitation } from '@lily/api/services/canopy/helpers/invitation'
import { senderNameOf } from '@lily/api/services/canopy/helpers/notify-member'
import {
  dispatchNow,
  recordNotification,
} from '@lily/api/services/helpers/schedule-notification'
import { changeInvitations } from '@lily/api/services/plants/helpers/plant-change'
import {
  RATE_LIMITS,
  RateLimiterService,
} from '@lily/api/services/rate-limiter/service'
import {
  CANOPY_INVITE_TTL_DAYS,
  CANOPY_MAX_MEMBERS,
  CanopyFullError,
  CanopyInviteeAlreadyMemberError,
  UserNotFoundError,
} from '@lily/shared'
import { Array, DateTime, Effect, Option } from 'effect'

export const sendCanopyInvitation = Effect.fn(
  'CanopyService.sendCanopyInvitation'
)(function* (inviteeId: string) {
  const { id: userId, name } = yield* CurrentUser
  const repo = yield* CanopyRepository
  const userRepo = yield* UserRepository
  const rateLimiter = yield* RateLimiterService

  yield* rateLimiter.checkRateLimit(
    `canopy-invitation:${userId}`,
    RATE_LIMITS.CANOPY_INVITATION
  )

  const { canopy, notification } = yield* changeInvitations(userId)(
    ({ canopy }) =>
      Effect.gen(function* () {
        const invitee = yield* userRepo.findById(inviteeId)
        if (
          invitee === null ||
          invitee.status !== 'active' ||
          invitee.deletedAt !== null
        ) {
          return yield* new UserNotFoundError({ userId: inviteeId })
        }
        const members = yield* repo.findMembersByJoinDate(canopy.id)
        if (Array.some(members, (m) => m.userId === invitee.id)) {
          return yield* new CanopyInviteeAlreadyMemberError()
        }
        if (members.length >= CANOPY_MAX_MEMBERS) {
          return yield* new CanopyFullError({ limit: CANOPY_MAX_MEMBERS })
        }

        const now = DateTime.nowUnsafe()
        const existing = yield* repo.findInvitationByPair(canopy.id, invitee.id)
        if (planInvitation(existing, now) !== 'send') {
          return { canopy, notification: Option.none() }
        }
        const invitation = yield* repo.upsertInvitation({
          canopyId: canopy.id,
          inviteeUserId: invitee.id,
          invitedByUserId: userId,
          expiresAt: DateTime.toDateUtc(
            DateTime.add(now, { days: CANOPY_INVITE_TTL_DAYS })
          ),
        })
        const notification = yield* recordNotification(
          'canopy_invitation',
          invitee.id,
          { ...senderNameOf(name), canopyName: canopy.name },
          invitee.language,
          { invitationId: invitation.id }
        )
        return { canopy, notification: Option.some(notification) }
      })
  )

  yield* Option.match(notification, {
    onNone: () => Effect.void,
    onSome: dispatchNow,
  })

  return yield* canopyView(canopy.id, userId)
})
