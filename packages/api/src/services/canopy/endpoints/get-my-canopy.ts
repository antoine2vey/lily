import { CanopyRepository } from '@lily/api/repositories/canopy.repository'
import { CurrentUser } from '@lily/api/services/auth/middleware.types'
import { canopyView } from '@lily/api/services/canopy/helpers/canopy-view'
import type { CanopyResponse } from '@lily/shared'
import { Effect } from 'effect'

/** `{ canopy: null }` for a user in no Canopy. */
export const getMyCanopy = Effect.fn('CanopyService.getMyCanopy')(function* () {
  const { id: userId } = yield* CurrentUser
  const repo = yield* CanopyRepository
  const membership = yield* repo.findMembershipByUser(userId)
  if (membership === null) {
    return { canopy: null } satisfies CanopyResponse
  }
  const canopy = yield* canopyView(membership.canopyId, userId).pipe(
    Effect.map((c) => c as CanopyResponse['canopy']),
    Effect.catchTag('CanopyNotFoundError', () => Effect.succeed(null))
  )
  return { canopy } satisfies CanopyResponse
})
