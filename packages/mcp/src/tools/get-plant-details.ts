import { ApiClient } from '@lily/mcp/api-client'
import { healthColor, healthLabel } from '@lily/mcp/widgets/health'
import type { PlantDetail } from '@lily/mcp/widgets/schemas'
import { formatIsoDate, isOverdue, isToday } from '@lily/shared'
import { Array, DateTime, Effect, Option, pipe } from 'effect'

/**
 * Returns detailed information about a specific plant including
 * care schedules and recent care history, all fetched via the API.
 * Returns both markdown text and structured data for widget rendering.
 */
export const getPlantDetailsEffect = Effect.fn('MCP.getPlantDetails')(
  function* (params: { plantId: string }) {
    const apiClient = yield* ApiClient

    // Fetch plant details and recent care logs in parallel
    const [plant, recentLogs] = yield* Effect.all(
      [
        apiClient.getPlant(params.plantId),
        apiClient.getCareLogs(params.plantId, { limit: '5' }),
      ],
      { concurrency: 'unbounded' }
    )

    const health = healthLabel(plant.health)
    const color = healthColor(plant.health)
    const roomOpt = Option.fromNullable(plant.room)

    const room = pipe(
      roomOpt,
      Option.map((r) => `${r.icon} ${r.name}`),
      Option.getOrElse(() => 'No room assigned')
    )

    const category = pipe(
      Option.fromNullable(plant.category),
      Option.getOrElse(() => 'Unknown')
    )

    // Single pass: build both markdown + structured for schedules
    const scheduleMapped = Array.map(plant.schedules, (s) => {
      const nextCare = formatIsoDate(s.nextCareAt, 'Not scheduled')
      return {
        line: `- **${s.careType}**: every ${s.frequencyDays} days (next: ${nextCare})`,
        structured: {
          careType: s.careType,
          frequencyDays: s.frequencyDays,
          nextCareAt: Option.getOrNull(
            Option.map(Option.fromNullable(s.nextCareAt), (d) =>
              formatIsoDate(d)
            )
          ),
        },
      }
    })

    // Single pass: build both markdown + structured for logs
    const logMapped = Array.map(recentLogs.items, (log) => {
      const date = formatIsoDate(log.date)
      const notes = pipe(
        Option.fromNullable(log.notes),
        Option.map((n) => ` — ${n}`),
        Option.getOrElse(() => '')
      )
      return {
        line: `- ${date}: ${log.type}${notes}`,
        structured: {
          date,
          type: log.type,
          notes: Option.getOrNull(Option.fromNullable(log.notes)),
        },
      }
    })

    const sections = [
      `## ${plant.name}`,
      '',
      `- **Health**: ${health}`,
      `- **Room**: ${room}`,
      `- **Category**: ${category}`,
      `- **Added**: ${formatIsoDate(plant.dateAdded)}`,
      '',
      '### Care Ratings',
      `- Water needs: ${plant.wateringRating}/5`,
      `- Light needs: ${plant.lightingRating}/5`,
      `- Humidity needs: ${plant.humidityRating}/5`,
      `- Pet toxicity: ${plant.petToxicityRating}/5`,
    ]

    const scheduleLines = Array.map(scheduleMapped, (m) => m.line)
    if (Array.isNonEmptyArray(scheduleLines)) {
      sections.push('', '### Care Schedule', ...scheduleLines)
    }

    const logLines = Array.map(logMapped, (m) => m.line)
    if (Array.isNonEmptyArray(logLines)) {
      sections.push('', '### Recent Care History', ...logLines)
    }

    // Check if a care type is due (today or overdue)
    const nowDt = DateTime.unsafeNow()
    const isCareTypeDue = (careType: string) =>
      Array.some(
        plant.schedules,
        (s) =>
          s.careType === careType &&
          pipe(
            Option.fromNullable(s.nextCareAt),
            Option.flatMap((d) => DateTime.make(d)),
            Option.match({
              onNone: () => false,
              onSome: (dt) => isOverdue(dt) || isToday(dt, nowDt, 'UTC'),
            })
          )
      )

    const plantDetail: PlantDetail = {
      id: plant.id,
      name: plant.name,
      healthLabel: health,
      healthColor: color,
      category: Option.getOrNull(Option.fromNullable(plant.category)),
      roomName: Option.getOrNull(Option.map(roomOpt, (r) => r.name)),
      roomIcon: Option.getOrNull(Option.map(roomOpt, (r) => r.icon)),
      dateAdded: formatIsoDate(plant.dateAdded),
      wateringRating: plant.wateringRating,
      lightingRating: plant.lightingRating,
      humidityRating: plant.humidityRating,
      petToxicityRating: plant.petToxicityRating,
      schedules: Array.map(scheduleMapped, (m) => m.structured),
      needsWatering: isCareTypeDue('watering'),
      needsFertilizing: isCareTypeDue('fertilization'),
      recentCare: Array.map(logMapped, (m) => m.structured),
    }

    return {
      text: Array.join(sections, '\n'),
      plant: plantDetail,
    }
  }
)
