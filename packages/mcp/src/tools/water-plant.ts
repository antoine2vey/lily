import { createCareLog } from '@lily/api/services/care-logs/endpoints/create-care-log'
import { assertPlantAccess } from '@lily/mcp/auth/plant-access'
import type { CareFeedback } from '@lily/mcp/widgets/schemas'
import { nowAsDate } from '@lily/shared'
import { Array, Effect, Option, pipe } from 'effect'

/**
 * Records a watering event for a specific plant.
 * Returns both markdown text and structured data for widget rendering.
 */
export const waterPlantEffect = (params: { plantId: string; notes?: string }) =>
  Effect.gen(function* () {
    const plant = yield* assertPlantAccess(params.plantId)

    yield* createCareLog(params.plantId, {
      type: 'watering',
      notes: params.notes,
      date: nowAsDate(),
    })

    const nextWatering = pipe(
      Array.findFirst(plant.schedules, (s) => s.careType === 'watering'),
      Option.map((s) => `${s.frequencyDays} days`),
      Option.getOrElse(() => 'not scheduled')
    )

    const feedback: CareFeedback = {
      plantName: plant.name,
      careType: 'watering',
      careLabel: 'Watered',
      nextCareEstimate: nextWatering,
    }

    return {
      text: `Watered **${plant.name}** successfully! Next watering in ~${nextWatering}.`,
      feedback,
    }
  }).pipe(
    Effect.catchTag('PlantNotFound', () =>
      Effect.succeed({
        text: 'Plant not found. Please check the plant ID.',
        feedback: null as CareFeedback | null,
      })
    ),
    Effect.withSpan('MCP.waterPlant')
  )
