import { PlantRepository } from '@lily/api/repositories/plant.repository'
import { CurrentUser } from '@lily/api/services/auth/middleware.types'
import { Effect, Option, pipe, Schema } from 'effect'

/**
 * Tagged error for plant access denial — plant does not exist or
 * does not belong to the authenticated user.
 */
export class PlantNotFound extends Schema.TaggedError<PlantNotFound>()(
  'PlantNotFound',
  {}
) {}

/**
 * Asserts the authenticated user has access to the given plant.
 *
 * Fetches the plant by ID and verifies ownership against CurrentUser.
 * Returns the full PlantWithRoom on success, or fails with PlantNotFound.
 *
 * Usage in tool effects:
 * ```ts
 * const plant = yield* assertPlantAccess(params.plantId)
 * ```
 * Then catch at the effect boundary:
 * ```ts
 * Effect.catchTag('PlantNotFound', () =>
 *   Effect.succeed('Plant not found. Please check the plant ID.')
 * )
 * ```
 */
export const assertPlantAccess = (plantId: string) =>
  Effect.gen(function* () {
    const plantRepo = yield* PlantRepository
    const { id: userId } = yield* CurrentUser

    const plant = yield* plantRepo.findById(plantId)

    return yield* pipe(
      Option.fromNullable(plant),
      Option.filter((p) => p.userId === userId),
      Option.match({
        onNone: () => Effect.fail(new PlantNotFound()),
        onSome: Effect.succeed,
      })
    )
  }).pipe(Effect.withSpan('MCP.assertPlantAccess'))
