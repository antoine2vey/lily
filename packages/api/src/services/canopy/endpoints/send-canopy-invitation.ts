import { CanopyRepository } from '@lily/api/repositories/canopy.repository'
import { UserRepository } from '@lily/api/repositories/user.repository'
import { CurrentUser } from '@lily/api/services/auth/middleware.types'
import { canopyView } from '@lily/api/services/canopy/helpers/canopy-view'
import { planInvitation } from '@lily/api/services/canopy/helpers/invitation'
import { lockMyCanopy } from '@lily/api/services/canopy/helpers/membership'
import {
  notifyMemberBestEffort,
  senderNameOf,
} from '@lily/api/services/canopy/helpers/notify-member'
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
import * as SqlClient from 'effect/sql/SqlClient'

export const sendCanopyInvitation = Effect.fn(
  'CanopyService.sendCanopyInvitation'
)(function* (inviteeId: string) {
  const { id: userId, name } = yield* CurrentUser
  const repo = yield* CanopyRepository
  const userRepo = yield* UserRepository
  const rateLimiter = yield* RateLimiterService
  const sql = yield* SqlClient.SqlClient

  yield* rateLimiter.checkRateLimit(
    `canopy-invitation:${userId}`,
    RATE_LIMITS.CANOPY_INVITATION
  )

  const { canopy, push } = yield* sql.withTransaction(
    Effect.gen(function* () {
      const { canopy } = yield* lockMyCanopy(userId)
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
        return { canopy, push: Option.none() }
      }
      const invitation = yield* repo.upsertInvitation({
        canopyId: canopy.id,
        inviteeUserId: invitee.id,
        invitedByUserId: userId,
        expiresAt: DateTime.toDateUtc(
          DateTime.add(now, { days: CANOPY_INVITE_TTL_DAYS })
        ),
      })
      return { canopy, push: Option.some({ invitation, invitee }) }
    })
  )

  yield* Option.match(push, {
    onNone: () => Effect.void,
    onSome: ({ invitation, invitee }) =>
      notifyMemberBestEffort(
        'canopy_invitation',
        { userId: invitee.id, language: invitee.language },
        { ...senderNameOf(name), canopyName: canopy.name },
        { invitationId: invitation.id }
      ),
  })

  return yield* canopyView(canopy.id, userId)
})
