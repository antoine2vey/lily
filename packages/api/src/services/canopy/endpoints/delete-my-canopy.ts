import { Canopy } from '@lily/api/contexts/canopy'
import { CurrentUser } from '@lily/api/services/auth/middleware.types'
import { Effect } from 'effect'

export const deleteMyCanopy = Effect.fn('CanopyService.deleteMyCanopy')(
  function* () {
    const { id: by } = yield* CurrentUser
    const canopy = yield* Canopy
    yield* canopy.dissolve({ by })
  }
)
