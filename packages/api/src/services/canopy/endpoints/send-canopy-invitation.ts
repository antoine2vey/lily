import { Canopy } from '@lily/api/contexts/canopy'
import { transact } from '@lily/api/kernel/transact'
import { CurrentUser } from '@lily/api/services/auth/middleware.types'
import { canopyView } from '@lily/api/services/canopy/helpers/canopy-view'
import {
  RATE_LIMITS,
  RateLimiterService,
} from '@lily/api/services/rate-limiter/service'
import { Effect } from 'effect'

export const sendCanopyInvitation = Effect.fn(
  'CanopyService.sendCanopyInvitation'
)(function* (invitee: string) {
  const { id: by } = yield* CurrentUser
  const rateLimiter = yield* RateLimiterService
  const canopy = yield* Canopy

  yield* rateLimiter.checkRateLimit(
    `canopy-invitation:${by}`,
    RATE_LIMITS.CANOPY_INVITATION
  )

  return yield* transact(
    Effect.flatMap(canopy.invite({ by, invitee }), ({ canopyId }) =>
      canopyView(canopyId, by)
    )
  )
})
