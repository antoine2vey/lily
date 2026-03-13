import { ApiClient } from '@lily/mcp/api-client'
import type { CareFeedback } from '@lily/mcp/widgets/schemas'
import type { CareType } from '@lily/shared'
import { Array, Effect, Match, Option, pipe } from 'effect'

/**
 * Records a care event for a plant via the API.
 * Returns both markdown text and structured data for widget rendering.
 */
export const carePlantEffect = (params: {
  plantId: string
  type: CareType
  notes?: string
}) =>
  Effect.gen(function* () {
    const apiClient = yield* ApiClient

    const plant = yield* apiClient.carePlant(params.plantId, {
      careType: params.type,
      notes: params.notes,
    })

    const careLabel = pipe(
      Match.value(params.type),
      Match.when('watering', () => 'Watered'),
      Match.when('fertilization', () => 'Fertilized'),
      Match.when('misting', () => 'Misted'),
      Match.when('repotting', () => 'Repotted'),
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
  }).pipe(Effect.withSpan('MCP.carePlant'))
