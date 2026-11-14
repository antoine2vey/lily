import { hashInviteToken } from '@lily/api/contexts/canopy'
import { CanopyRepository } from '@lily/api/repositories/canopy.repository'
import {
  RATE_LIMITS,
  RateLimiterService,
} from '@lily/api/services/rate-limiter/service'
import {
  CanopyInviteExpiredError,
  CanopyInviteNotFoundError,
  type CanopyInvitePreview,
  isFuture,
} from '@lily/shared'
import { clientIp } from '@lily/shared/server'
import { DateTime, Effect } from 'effect'

export const previewCanopyInvite = Effect.fn(
  'CanopyService.previewCanopyInvite'
)(function* (
  token: string,
  headers: {
    readonly 'x-real-ip'?: string | undefined
    readonly 'cf-connecting-ip'?: string | undefined
  }
) {
  const rateLimiter = yield* RateLimiterService
  const repo = yield* CanopyRepository
  yield* rateLimiter.checkRateLimit(
    `canopy-invite-preview:${clientIp(headers)}`,
    RATE_LIMITS.CANOPY_INVITE_PREVIEW
  )
  yield* rateLimiter.checkRateLimit(
    `canopy-invite-preview:token:${hashInviteToken(token)}`,
    RATE_LIMITS.CANOPY_INVITE_PREVIEW
  )

  const invite = yield* repo.findInviteByTokenHash(hashInviteToken(token))
  if (invite === null || invite.revokedAt !== null) {
    return yield* new CanopyInviteNotFoundError()
  }
  if (!isFuture(DateTime.makeUnsafe(invite.expiresAt))) {
    return yield* new CanopyInviteExpiredError()
  }
  return {
    canopyName: invite.canopyName,
    inviterName: invite.inviterName,
    memberCount: invite.memberCount,
    expiresAt: invite.expiresAt,
  } satisfies CanopyInvitePreview
})
