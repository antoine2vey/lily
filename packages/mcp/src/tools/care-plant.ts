import { createCareLog } from '@lily/api/services/care-logs/endpoints/create-care-log'
import { assertPlantAccess } from '@lily/mcp/auth/plant-access'
import type { CareFeedback } from '@lily/mcp/widgets/schemas'
import { nowAsDate } from '@lily/shared'
import { Array, Effect, Match, Option, pipe } from 'effect'

/**
 * Records a care event (watering or fertilization) for a plant.
 * Returns both markdown text and structured data for widget rendering.
 */
export const carePlantEffect = (params: {
  plantId: string
  type: 'watering' | 'fertilization'
  notes?: string
}) =>
  Effect.gen(function* () {
    const plant = yield* assertPlantAccess(params.plantId)

    yield* createCareLog(params.plantId, {
      type: params.type,
      notes: params.notes,
      date: nowAsDate(),
    })

    const careLabel = pipe(
      Match.value(params.type),
      Match.when('watering', () => 'Watered'),
      Match.when('fertilization', () => 'Fertilized'),
      Match.exhaustive
    )

    const nextCare = pipe(
      plant.schedules,
      Array.findFirst((s) => s.careType === params.type),
      Option.map((s) => `${s.frequencyDays} days`),
      Option.getOrElse(() => 'not scheduled')
    )

    const feedback: CareFeedback = {
      plantName: plant.name,
      careType: params.type,
      careLabel,
      nextCareEstimate: nextCare,
    }

    return {
      text: `${careLabel} **${plant.name}** successfully! Next ${params.type} in ~${nextCare}.`,
      feedback,
    }
  }).pipe(
    Effect.catchTag('PlantNotFound', () =>
      Effect.succeed({
        text: 'Plant not found. Please check the plant ID.',
        feedback: null as CareFeedback | null,
      })
    ),
    Effect.withSpan('MCP.carePlant')
  )
