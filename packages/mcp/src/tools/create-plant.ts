import { ApiClient } from '@lily/mcp/api-client'
import { ownershipLabel } from '@lily/mcp/widgets/mappers'
import { LUMINOSITY_LUX_VALUES } from '@lily/shared'
import { Effect, Match, Option, pipe, Schema } from 'effect'

export class CreatePlantRefusedError extends Schema.TaggedError<CreatePlantRefusedError>()(
  'CreatePlantRefusedError',
  { message: Schema.String }
) {}

/**
 * Adds a plant the way the app's manual entry does when the user keeps its
 * defaults: bright indirect light, not marked pet safe, watering due now.
 */
export const createPlantEffect = Effect.fn('MCP.createPlant')(
  function* (params: {
    name: string
    wateringFrequencyDays: number
    petSafe?: boolean
    canopy?: boolean
  }) {
    const apiClient = yield* ApiClient
    const canopy = params.canopy === true

    const plant = yield* apiClient
      .createPlant({
        name: params.name,
        wateringFrequencyDays: params.wateringFrequencyDays,
        luxNeeded: LUMINOSITY_LUX_VALUES[3],
        petToxicityRating: params.petSafe === true ? 0 : 100,
        owner: canopy ? 'canopy' : 'me',
      })
      .pipe(
        Effect.catchTag('ExternalServiceError', (error) =>
          pipe(
            Match.value(error.statusCode),
            // POST /plants answers 404 only for a missing room or Canopy, and
            // this tool sends no room.
            Match.when(
              (status) => status === 404 && canopy,
              () =>
                Effect.fail(
                  new CreatePlantRefusedError({
                    message:
                      'You are not in a Canopy. Create or join one in the Lily app, or add the plant without the canopy option.',
                  })
                )
            ),
            Match.when(403, () =>
              Effect.fail(
                new CreatePlantRefusedError({
                  message: canopy
                    ? 'Your Canopy has reached its plant limit. The limit lifts while any member has Lily Premium.'
                    : 'You have reached your plant limit. Upgrade to Lily Premium in the Lily app to add more plants.',
                })
              )
            ),
            Match.orElse(() => Effect.fail(error))
          )
        )
      )

    const ownership = pipe(
      ownershipLabel(plant),
      Option.map((label) => ` | ${label}`),
      Option.getOrElse(() => '')
    )

    return {
      text: `Added **${plant.name}**${ownership} (ID: ${plant.id}). Watering every ${params.wateringFrequencyDays} days, starting today.`,
    }
  }
)
