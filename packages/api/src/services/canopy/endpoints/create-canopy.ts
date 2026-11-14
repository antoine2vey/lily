import { Canopy } from '@lily/api/contexts/canopy'
import { transact } from '@lily/api/kernel/transact'
import { CurrentUser } from '@lily/api/services/auth/middleware.types'
import { canopyView } from '@lily/api/services/canopy/helpers/canopy-view'
import type { CreateCanopyRequest } from '@lily/shared'
import { Effect } from 'effect'

export const createCanopy = Effect.fn('CanopyService.createCanopy')(function* (
  request: CreateCanopyRequest
) {
  const { id: by } = yield* CurrentUser
  const canopy = yield* Canopy
  return yield* transact(
    Effect.flatMap(canopy.create({ by, name: request.name }), ({ canopyId }) =>
      canopyView(canopyId, by)
    )
  )
})
