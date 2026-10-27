import { sameOwner } from '@lily/api/repositories/helpers/plant-owner'
import {
  PlantRepository,
  type PlantRow,
} from '@lily/api/repositories/plant.repository'
import { PlantNotFoundError } from '@lily/shared/errors/plant'
import { Array, Effect, Option } from 'effect'
import type { SqlError } from 'effect/sql/SqlError'

export const reloadOwnedPlant = (
  plant: PlantRow
): Effect.Effect<PlantRow, PlantNotFoundError | SqlError, PlantRepository> =>
  Effect.flatMap(PlantRepository, (repo) => repo.findByIds([plant.id])).pipe(
    Effect.flatMap((rows) =>
      Option.match(
        Array.findFirst(rows, (row) => sameOwner(row.owner, plant.owner)),
        {
          onNone: () =>
            Effect.fail(new PlantNotFoundError({ plantId: plant.id })),
          onSome: Effect.succeed,
        }
      )
    )
  )
