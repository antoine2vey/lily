import { CurrentUser } from '@lily/api/services/auth/middleware.types'
import { dissolveCanopy } from '@lily/api/services/canopy/helpers/dissolve-canopy'
import { requireOwner } from '@lily/api/services/canopy/helpers/membership'
import { changeMyCanopy } from '@lily/api/services/plants/helpers/plant-change'
import { Effect } from 'effect'

export const deleteMyCanopy = Effect.fn('CanopyService.deleteMyCanopy')(
  function* () {
    const { id: userId } = yield* CurrentUser
    yield* changeMyCanopy(userId)(({ canopy, membership }) =>
      Effect.andThen(
        requireOwner(membership),
        dissolveCanopy(canopy.id, userId)
      )
    )
  }
)
