import { ApiClient } from '@lily/mcp/api-client'
import { toPlantSummary } from '@lily/mcp/widgets/mappers'
import type { PlantSummary } from '@lily/mcp/widgets/schemas'
import { formatIsoDate } from '@lily/shared'
import { Array, Effect, Option, pipe } from 'effect'

/**
 * Returns plants that are overdue for care via the API.
 * Returns both markdown text and structured data for widget rendering.
 */
export const getOverduePlantsEffect = Effect.fn('MCP.getOverduePlants')(
  function* () {
    const apiClient = yield* ApiClient

    const result = yield* apiClient.listPlants({
      filter: 'overdue',
      limit: '100',
    })

    if (Array.isEmptyReadonlyArray(result.items)) {
      return {
        text: 'No overdue plants! All your plants are on schedule.',
        plants: [] as readonly PlantSummary[],
      }
    }

    const { plants, lines } = Array.reduce(
      result.items,
      { plants: [] as PlantSummary[], lines: [] as string[] },
      (acc, plant) => {
        const room = pipe(
          Option.fromNullable(plant.room),
          Option.map((r) => ` (${r.icon} ${r.name})`),
          Option.getOrElse(() => '')
        )

        const scheduleInfo = pipe(
          plant.schedules,
          Array.filterMap((s) =>
            pipe(
              Option.fromNullable(s.nextCareAt),
              Option.map(
                (d) => `${s.careType} overdue since ${formatIsoDate(d, '')}`
              )
            )
          ),
          Array.join(', ')
        )

        acc.plants.push(toPlantSummary(plant))
        acc.lines.push(
          `- **${plant.name}**${room}: ${scheduleInfo} (ID: ${plant.id})`
        )
        return acc
      }
    )

    return {
      text: `## Overdue Plants (${Array.length(result.items)})\n\n${Array.join(lines, '\n')}`,
      plants,
    }
  }
)
