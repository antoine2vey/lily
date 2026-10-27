import { CanopyRepository } from '@lily/api/repositories/canopy.repository'
import { CurrentUser } from '@lily/api/services/auth/middleware.types'
import { canopyView } from '@lily/api/services/canopy/helpers/canopy-view'
import type { Canopy, CanopyResponse } from '@lily/shared'
import { Effect } from 'effect'

export const getMyCanopy = Effect.fn('CanopyService.getMyCanopy')(function* () {
  const { id: userId } = yield* CurrentUser
  const repo = yield* CanopyRepository
  const membership = yield* repo.findMembershipByUser(userId)
  if (membership === null) {
    return { canopy: null } satisfies CanopyResponse
  }
  const canopy = yield* canopyView(membership.canopyId, userId).pipe(
    Effect.catchTag('CanopyNotFoundError', () =>
      Effect.succeed<Canopy | null>(null)
    )
  )
  return { canopy } satisfies CanopyResponse
})
