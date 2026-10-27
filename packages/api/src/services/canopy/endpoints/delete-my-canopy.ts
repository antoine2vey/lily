import { CurrentUser } from '@lily/api/services/auth/middleware.types'
import { dissolveCanopy } from '@lily/api/services/canopy/helpers/dissolve-canopy'
import {
  lockMyCanopy,
  requireOwner,
} from '@lily/api/services/canopy/helpers/membership'
import { Effect } from 'effect'
import * as SqlClient from 'effect/sql/SqlClient'

export const deleteMyCanopy = Effect.fn('CanopyService.deleteMyCanopy')(
  function* () {
    const { id: userId } = yield* CurrentUser
    const sql = yield* SqlClient.SqlClient
    yield* sql.withTransaction(
      Effect.gen(function* () {
        const { canopy, membership } = yield* lockMyCanopy(userId)
        yield* requireOwner(membership)
        yield* dissolveCanopy(canopy.id, userId)
      })
    )
  }
)
