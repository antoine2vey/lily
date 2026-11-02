import { CanopyRepository } from '@lily/api/repositories/canopy.repository'
import { UserRepository } from '@lily/api/repositories/user.repository'
import { CurrentUser } from '@lily/api/services/auth/middleware.types'
import { canopyView } from '@lily/api/services/canopy/helpers/canopy-view'
import { failAlreadyInCanopy } from '@lily/api/services/canopy/helpers/membership'
import type { CreateCanopyRequest } from '@lily/shared'
import { Effect, Option, pipe } from 'effect'
import * as SqlClient from 'effect/sql/SqlClient'

export const createCanopy = Effect.fn('CanopyService.createCanopy')(function* (
  request: CreateCanopyRequest
) {
  const { id: userId } = yield* CurrentUser
  const repo = yield* CanopyRepository
  const userRepo = yield* UserRepository
  const sql = yield* SqlClient.SqlClient

  const canopyId = yield* sql.withTransaction(
    Effect.gen(function* () {
      const current = yield* repo.findMembershipByUser(userId)
      if (current !== null) {
        return yield* failAlreadyInCanopy(current.canopyId)
      }

      const user = Option.fromNullishOr(yield* userRepo.findById(userId))
      const canopy = yield* repo.create({
        name: request.name,
        timezone: pipe(
          user,
          Option.flatMap((u) => Option.fromNullishOr(u.timezone)),
          Option.getOrElse(() => 'UTC')
        ),
        latitude: pipe(
          user,
          Option.flatMap((u) => Option.fromNullishOr(u.latitude)),
          Option.getOrNull
        ),
        longitude: pipe(
          user,
          Option.flatMap((u) => Option.fromNullishOr(u.longitude)),
          Option.getOrNull
        ),
      })

      if (!(yield* repo.addMember(canopy.id, userId, 'owner'))) {
        const winner = yield* repo.findMembershipByUser(userId)
        return yield* failAlreadyInCanopy(
          pipe(
            Option.fromNullishOr(winner),
            Option.map((m) => m.canopyId),
            Option.getOrElse(() => canopy.id)
          )
        )
      }
      return canopy.id
    })
  )

  return yield* canopyView(canopyId, userId)
})
