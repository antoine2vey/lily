import { CareLogRepository } from '@lily/api/repositories/care-log.repository'
import { assertPlantAccess } from '@lily/mcp/auth/plant-access'
import { formatIsoDate } from '@lily/shared'
import { Array, Effect, Match, Option, pipe } from 'effect'

/**
 * Returns detailed information about a specific plant including
 * care schedules and recent care history.
 */
export const getPlantDetailsEffect = (params: { plantId: string }) =>
  Effect.gen(function* () {
    const careLogRepo = yield* CareLogRepository
    const plant = yield* assertPlantAccess(params.plantId)

    const recentLogs = yield* careLogRepo.findByPlantId({
      plantId: params.plantId,
      limit: 5,
    })

    const health = pipe(
      Match.value(plant.health),
      Match.when('THRIVING', () => 'Thriving'),
      Match.when('HEALTHY', () => 'Healthy'),
      Match.when('NEEDS_ATTENTION', () => 'Needs Attention'),
      Match.when('SICK', () => 'Sick'),
      Match.when('RECOVERING', () => 'Recovering'),
      Match.exhaustive
    )

    const room = pipe(
      Option.fromNullable(plant.room),
      Option.map((r) => `${r.icon} ${r.name}`),
      Option.getOrElse(() => 'No room assigned')
    )

    const scheduleLines = Array.map(plant.schedules, (s) => {
      const nextCare = formatIsoDate(s.nextCareAt, 'Not scheduled')
      return `- **${s.careType}**: every ${s.frequencyDays} days (next: ${nextCare})`
    })

    const logLines = Array.map(recentLogs.items, (log) => {
      const date = formatIsoDate(log.date)
      const notes = pipe(
        Option.fromNullable(log.notes),
        Option.map((n) => ` — ${n}`),
        Option.getOrElse(() => '')
      )
      return `- ${date}: ${log.type}${notes}`
    })

    const sections = [
      `## ${plant.name}`,
      '',
      `- **Health**: ${health}`,
      `- **Room**: ${room}`,
      `- **Category**: ${pipe(
        Option.fromNullable(plant.category),
        Option.getOrElse(() => 'Unknown')
      )}`,
      `- **Added**: ${formatIsoDate(plant.dateAdded)}`,
      '',
      '### Care Ratings',
      `- Water needs: ${plant.wateringRating}/5`,
      `- Light needs: ${plant.lightingRating}/5`,
      `- Humidity needs: ${plant.humidityRating}/5`,
      `- Pet toxicity: ${plant.petToxicityRating}/5`,
    ]

    if (Array.isNonEmptyArray(scheduleLines)) {
      sections.push('', '### Care Schedule', ...scheduleLines)
    }

    if (Array.isNonEmptyArray(logLines)) {
      sections.push('', '### Recent Care History', ...logLines)
    }

    return Array.join(sections, '\n')
  }).pipe(
    Effect.catchTag('PlantNotFound', () =>
      Effect.succeed('Plant not found. Please check the plant ID.')
    ),
    Effect.withSpan('MCP.getPlantDetails')
  )
