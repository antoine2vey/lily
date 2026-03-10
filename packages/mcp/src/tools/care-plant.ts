import { PlantRepository } from '@lily/api/repositories/plant.repository'
import { createCareLog } from '@lily/api/services/care-logs/endpoints/create-care-log'
import { nowAsDate } from '@lily/shared'
import { Array, Effect, Match, Option, pipe } from 'effect'

/**
 * Records a care event (watering or fertilization) for a plant.
 * More general than waterPlant — supports multiple care types.
 */
export const carePlantEffect = (params: {
  plantId: string
  type: 'watering' | 'fertilization'
  notes?: string
}) =>
  Effect.gen(function* () {
    const plantRepo = yield* PlantRepository

    const plant = yield* plantRepo.findById(params.plantId)
    if (!plant) {
      return 'Plant not found. Please check the plant ID.'
    }

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
      Option.map((s) => `Next ${params.type} in ~${s.frequencyDays} days.`),
      Option.getOrElse(() => '')
    )

    return `${careLabel} **${plant.name}** successfully! ${nextCare}`
  }).pipe(Effect.withSpan('MCP.carePlant'))
