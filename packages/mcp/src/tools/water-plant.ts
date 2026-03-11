import { createCareLog } from '@lily/api/services/care-logs/endpoints/create-care-log'
import { assertPlantAccess } from '@lily/mcp/auth/plant-access'
import { nowAsDate } from '@lily/shared'
import { Array, Effect, Option, pipe } from 'effect'

/**
 * Records a watering event for a specific plant.
 * Creates a care log entry and returns confirmation.
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

    return `Watered **${plant.name}** successfully! Next watering in ~${nextWatering}.`
  }).pipe(
    Effect.catchTag('PlantNotFound', () =>
      Effect.succeed('Plant not found. Please check the plant ID.')
    ),
    Effect.withSpan('MCP.waterPlant')
  )
