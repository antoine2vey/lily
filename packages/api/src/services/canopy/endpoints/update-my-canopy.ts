import { CanopyRepository } from '@lily/api/repositories/canopy.repository'
import { CurrentUser } from '@lily/api/services/auth/middleware.types'
import { canopyView } from '@lily/api/services/canopy/helpers/canopy-view'
import {
  lockMyCanopy,
  requireOwner,
} from '@lily/api/services/canopy/helpers/membership'
import type { UpdateCanopyRequest } from '@lily/shared'
import { Array, Effect } from 'effect'
import * as SqlClient from 'effect/sql/SqlClient'

export const updateMyCanopy = Effect.fn('CanopyService.updateMyCanopy')(
  function* (request: UpdateCanopyRequest) {
    const { id: userId } = yield* CurrentUser
    const repo = yield* CanopyRepository
    const sql = yield* SqlClient.SqlClient

    const canopyId = yield* sql.withTransaction(
      Effect.gen(function* () {
        const { canopy, membership } = yield* lockMyCanopy(userId)
        const { name, timezone, latitude, longitude } = request
        const changesSettings = Array.some(
          [timezone, latitude, longitude],
          (value) => value !== undefined
        )
        if (changesSettings) {
          yield* requireOwner(membership)
        }
        if (changesSettings || name !== undefined) {
          yield* repo.update(canopy.id, request)
        }
        return canopy.id
      })
    )

    return yield* canopyView(canopyId, userId)
  }
)
