import { ApiClient } from '@lily/mcp/api-client'
import { ownershipSuffix } from '@lily/mcp/widgets/mappers'
import { LUMINOSITY_LUX_VALUES } from '@lily/shared'
import { Effect, Match, pipe, Schema } from 'effect'

export class CreatePlantRefusedError extends Schema.TaggedError<CreatePlantRefusedError>()(
  'CreatePlantRefusedError',
  { message: Schema.String }
) {}

const BRIGHT_INDIRECT_LUX = LUMINOSITY_LUX_VALUES[3]
const PET_TOXICITY_RATING = { petSafe: 0, notMarkedSafe: 100 } as const

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
        luxNeeded: BRIGHT_INDIRECT_LUX,
        petToxicityRating:
          params.petSafe === true
            ? PET_TOXICITY_RATING.petSafe
            : PET_TOXICITY_RATING.notMarkedSafe,
        owner: canopy ? 'canopy' : 'me',
      })
      .pipe(
        Effect.catchTag('ExternalServiceError', (error) =>
          pipe(
            Match.value(error.statusCode),
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

    return {
      text: `Added **${plant.name}**${ownershipSuffix(plant)} (ID: ${plant.id}). Watering every ${params.wateringFrequencyDays} days, starting today.`,
    }
  }
)
