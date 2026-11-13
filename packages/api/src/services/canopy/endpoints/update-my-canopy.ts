import { Canopy } from '@lily/api/contexts/canopy'
import { CurrentUser } from '@lily/api/services/auth/middleware.types'
import { canopyView } from '@lily/api/services/canopy/helpers/canopy-view'
import type { UpdateCanopyRequest } from '@lily/shared'
import { Effect, Option } from 'effect'

export const updateMyCanopy = Effect.fn('CanopyService.updateMyCanopy')(
  function* (request: UpdateCanopyRequest) {
    const { id: by } = yield* CurrentUser
    const canopy = yield* Canopy
    const { canopyId } = yield* canopy.update({
      by,
      changes: {
        name: Option.fromUndefinedOr(request.name),
        timezone: Option.fromUndefinedOr(request.timezone),
        latitude: Option.fromUndefinedOr(request.latitude),
        longitude: Option.fromUndefinedOr(request.longitude),
      },
    })
    return yield* canopyView(canopyId, by)
  }
)
