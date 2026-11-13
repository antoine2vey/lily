import type { Outbox } from '@lily/api/kernel/outbox'
import {
  CanopyRepository,
  type MovedPlant,
} from '@lily/api/repositories/canopy.repository'
import type { NotificationRepository } from '@lily/api/repositories/notification.repository'
import { plantsLeftCanopy } from '@lily/api/services/canopy/helpers/plants-left-canopy'
import { Array, Effect } from 'effect'
import * as SqlClient from 'effect/sql/SqlClient'
import type { SqlError } from 'effect/sql/SqlError'

export const dissolveCanopy = (
  canopyId: string,
  heirUserId: string
): Effect.Effect<
  ReadonlyArray<MovedPlant>,
  SqlError,
  CanopyRepository | NotificationRepository | SqlClient.SqlClient | Outbox
> =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    return yield* sql.withTransaction(
      Effect.gen(function* () {
        const repo = yield* CanopyRepository
        if ((yield* repo.lock(canopyId)) === null) {
          return []
        }
        const members = yield* repo.findMembersByJoinDate(canopyId)
        const returned = yield* Effect.forEach(
          Array.filter(members, (m) => m.userId !== heirUserId),
          (m) => repo.returnToSharer(canopyId, m.userId)
        )
        const moved = yield* repo.transferToUser(canopyId, heirUserId)
        yield* repo.delete(canopyId)
        yield* plantsLeftCanopy(
          Array.map([...Array.flatten(returned), ...moved], (plant) => plant.id)
        )
        return moved
      })
    )
  }).pipe(
    Effect.withSpan('dissolveCanopy', {
      attributes: { 'canopy.id': canopyId },
    })
  )
