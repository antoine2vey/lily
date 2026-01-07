import type { SqlError } from '@effect/sql/SqlError'
import { PlantRepository } from '@lily/api/repositories/plant.repository'
import { PlantNotFoundError } from '@lily/shared/errors/plant'
import type { Plant, PlantUpdateRequest } from '@lily/shared/plant'
import { Effect, pipe, Record } from 'effect'

export const updatePlant = (
  request: PlantUpdateRequest & { id: string }
): Effect.Effect<Plant, SqlError | PlantNotFoundError, PlantRepository> =>
  Effect.gen(function* () {
    const repo = yield* PlantRepository
    const data = pipe(
      Object.entries(request),
      Record.fromEntries,
      Record.remove('id'),
      Record.filter((_, value) => value !== undefined)
    )
    const plant = yield* repo.update(request.id, data)

    if (!plant) {
      return yield* Effect.fail(new PlantNotFoundError())
    }

    return plant
  })
