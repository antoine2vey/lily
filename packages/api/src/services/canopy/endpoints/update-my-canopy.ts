import { CanopyRepository } from '@lily/api/repositories/canopy.repository'
import { CurrentUser } from '@lily/api/services/auth/middleware.types'
import { canopyView } from '@lily/api/services/canopy/helpers/canopy-view'
import {
  requireMembership,
  requireOwner,
} from '@lily/api/services/canopy/helpers/membership'
import type { UpdateCanopyRequest } from '@lily/shared'
import { Array, Effect } from 'effect'

/** Any member renames; changing the timezone or location needs the owner. */
export const updateMyCanopy = Effect.fn('CanopyService.updateMyCanopy')(
  function* (request: UpdateCanopyRequest) {
    const { id: userId } = yield* CurrentUser
    const repo = yield* CanopyRepository
    const membership = yield* requireMembership(userId)

    const { name, timezone, latitude, longitude } = request
    const changesSettings = Array.some(
      [timezone, latitude, longitude],
      (value) => value !== undefined
    )
    if (changesSettings) {
      yield* requireOwner(membership)
    }
    if (changesSettings || name !== undefined) {
      yield* repo.update(membership.canopyId, request)
    }

    return yield* canopyView(membership.canopyId, userId)
  }
)
