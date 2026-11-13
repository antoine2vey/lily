import { Canopy } from '@lily/api/contexts/canopy'
import { CurrentUser } from '@lily/api/services/auth/middleware.types'
import { canopyView } from '@lily/api/services/canopy/helpers/canopy-view'
import type { CreateCanopyRequest } from '@lily/shared'
import { Effect } from 'effect'

export const createCanopy = Effect.fn('CanopyService.createCanopy')(function* (
  request: CreateCanopyRequest
) {
  const { id: by } = yield* CurrentUser
  const canopy = yield* Canopy
  const { canopyId } = yield* canopy.create({ by, name: request.name })
  return yield* canopyView(canopyId, by)
})
