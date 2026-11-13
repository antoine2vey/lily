import { transact } from '@lily/api/kernel/transact'
import { CurrentUser } from '@lily/api/services/auth/middleware.types'
import { dissolveCanopy } from '@lily/api/services/canopy/helpers/dissolve-canopy'
import {
  lockMyCanopy,
  requireOwner,
} from '@lily/api/services/canopy/helpers/membership'
import { Effect } from 'effect'

export const deleteMyCanopy = Effect.fn('CanopyService.deleteMyCanopy')(
  function* () {
    const { id: userId } = yield* CurrentUser
    yield* transact(
      Effect.gen(function* () {
        const { canopy, membership } = yield* lockMyCanopy(userId)
        yield* requireOwner(membership)
        yield* dissolveCanopy(canopy.id, userId)
      })
    )
  }
)
