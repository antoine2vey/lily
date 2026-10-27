import { CanopyRepository } from '@lily/api/repositories/canopy.repository'
import { CurrentUser } from '@lily/api/services/auth/middleware.types'
import { lockMyCanopy } from '@lily/api/services/canopy/helpers/membership'
import { Effect } from 'effect'
import * as SqlClient from 'effect/sql/SqlClient'

export const revokeCanopyInvite = Effect.fn('CanopyService.revokeCanopyInvite')(
  function* () {
    const { id: userId } = yield* CurrentUser
    const repo = yield* CanopyRepository
    const sql = yield* SqlClient.SqlClient
    yield* sql.withTransaction(
      Effect.gen(function* () {
        const { canopy } = yield* lockMyCanopy(userId)
        yield* repo.revokeInvite(canopy.id)
      })
    )
  }
)
