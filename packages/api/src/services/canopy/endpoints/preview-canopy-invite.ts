import { findLiveInvite } from '@lily/api/services/canopy/helpers/invite-token'
import {
  RATE_LIMITS,
  RateLimiterService,
} from '@lily/api/services/rate-limiter/service'
import type { CanopyInvitePreview } from '@lily/shared'
import { clientIp } from '@lily/shared/server'
import { Effect } from 'effect'

/** Public: the join page shows this before the visitor has an account. */
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
  yield* rateLimiter.checkRateLimit(
    `canopy-invite-preview:${clientIp(headers)}`,
    RATE_LIMITS.CANOPY_INVITE_PREVIEW
  )

  const invite = yield* findLiveInvite(token)
  return {
    canopyName: invite.canopyName,
    inviterName: invite.inviterName,
    memberCount: invite.memberCount,
    expiresAt: invite.expiresAt,
  } satisfies CanopyInvitePreview
})
