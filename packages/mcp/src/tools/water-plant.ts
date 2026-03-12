import { ApiClient } from '@lily/mcp/api-client'
import type { CareFeedback } from '@lily/mcp/widgets/schemas'
import { Array, Effect, Option, pipe } from 'effect'

/**
 * Records a watering event for a specific plant via the API.
 * Returns both markdown text and structured data for widget rendering.
 */
export const waterPlantEffect = (params: { plantId: string; notes?: string }) =>
  Effect.gen(function* () {
    const apiClient = yield* ApiClient

    const plant = yield* apiClient.waterPlant(params.plantId, {
      notes: params.notes,
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
  }).pipe(Effect.withSpan('MCP.waterPlant'))
