import { Care, careWhenOf, type RecordOneError } from '@lily/api/contexts/care'
import type { Outbox } from '@lily/api/kernel/outbox'
import type { PlantPermit } from '@lily/api/kernel/permit'
import { transact } from '@lily/api/kernel/transact'
import {
  PlantRepository,
  type PlantWithRoom,
} from '@lily/api/repositories/plant.repository'
import type { CareType } from '@lily/shared'
import { PlantNotFoundError } from '@lily/shared/errors/plant'
import type { PlantCorrectCareDatesRequest } from '@lily/shared/plant'
import { Array, Effect, Option } from 'effect'
import type * as SqlClient from 'effect/sql/SqlClient'
import type { SqlError } from 'effect/sql/SqlError'

const correction = (careType: CareType, date: Date | undefined) =>
  Option.map(Option.fromUndefinedOr(date), (on) => ({
    careType,
    on: careWhenOf(on),
  }))

export const correctCareDates = (
  permit: PlantPermit<'care'>,
  request: PlantCorrectCareDatesRequest
): Effect.Effect<
  PlantWithRoom,
  SqlError | RecordOneError,
  Care | PlantRepository | SqlClient.SqlClient | Outbox
> =>
  transact(
    Effect.gen(function* () {
      const care = yield* Care
      const plants = yield* PlantRepository
      yield* care.correctLastCare({
        permit,
        corrections: Array.getSomes([
          correction('watering', request.lastWateredAt),
          correction('fertilization', request.lastFertilizedAt),
        ]),
      })
      const plant = yield* plants.findById(permit.plantId)
      return yield* Effect.fromNullishOr(plant).pipe(
        Effect.mapError(
          () => new PlantNotFoundError({ plantId: permit.plantId })
        )
      )
    })
  ).pipe(
    Effect.withSpan('PlantsService.correctCareDates', {
      attributes: { 'plant.id': permit.plantId },
    })
  )
