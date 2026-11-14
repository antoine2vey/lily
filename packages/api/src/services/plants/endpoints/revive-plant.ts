import type { Canopy } from '@lily/api/contexts/canopy'
import { OwnerRoom, PlantLife } from '@lily/api/contexts/care'
import type { Outbox } from '@lily/api/kernel/outbox'
import type { PlantPermit } from '@lily/api/kernel/permit'
import {
  PlantRepository,
  type PlantWithRoom,
} from '@lily/api/repositories/plant.repository'
import type { CurrentUser } from '@lily/api/services/auth/middleware.types'
import { withOwnerLock } from '@lily/api/services/plants/helpers/owner-lock'
import { LimitChecker } from '@lily/api/services/subscriptions/limit-checker'
import type { LimitExceededError } from '@lily/shared'
import {
  type PlantNotDeadError,
  PlantNotFoundError,
} from '@lily/shared/errors/plant'
import { Effect } from 'effect'
import type * as SqlClient from 'effect/sql/SqlClient'
import type { SqlError } from 'effect/sql/SqlError'

export const revivePlant = (
  plant: PlantWithRoom,
  permit: PlantPermit<'revive'>,
  requestedId: string = plant.id
): Effect.Effect<
  PlantWithRoom,
  SqlError | PlantNotFoundError | PlantNotDeadError | LimitExceededError,
  | PlantRepository
  | PlantLife
  | LimitChecker
  | CurrentUser
  | SqlClient.SqlClient
  | Outbox
  | Canopy
> =>
  Effect.gen(function* () {
    const life = yield* PlantLife
    const repo = yield* PlantRepository
    const limitChecker = yield* LimitChecker
    const notFound = () =>
      Effect.fail(new PlantNotFoundError({ plantId: requestedId }))

    return yield* withOwnerLock(plant.owner)((held) =>
      Effect.gen(function* () {
        const room = yield* limitChecker.checkPlantLimit(held.owner).pipe(
          Effect.as(OwnerRoom.Room()),
          Effect.catchTag('LimitExceededError', (error) =>
            Effect.succeed(OwnerRoom.Full({ error }))
          )
        )
        yield* life.revive({ permit, held, room })
        const fresh = yield* repo.findById(plant.id)
        if (!fresh) {
          return yield* notFound()
        }
        return fresh
      })
    ).pipe(
      Effect.catchTag('CanopyNotFoundError', notFound),
      Effect.catchTag('PlantNotFoundError', notFound)
    )
  }).pipe(
    Effect.withSpan('PlantsService.revivePlant', {
      attributes: { 'plant.id': plant.id },
    })
  )
