import { ApiClient } from '@lily/mcp/api-client'
import { escapeInlineMarkdown, ownershipSuffix } from '@lily/mcp/tools/markdown'
import { toPlantSummary } from '@lily/mcp/widgets/mappers'
import type { PlantSummary } from '@lily/mcp/widgets/schemas'
import type { PlantCareSchedule } from '@lily/shared/plant'
import { Array, Effect, Filter, Match, Option, pipe } from 'effect'

const dueLabel = (schedule: PlantCareSchedule): Option.Option<string> =>
  pipe(
    Option.all({
      status: Option.fromNullishOr(schedule.status),
      dueDay: Option.fromNullishOr(schedule.dueDay),
    }),
    Option.flatMap(({ status, dueDay }) =>
      Match.valueTags(status, {
        Overdue: () =>
          Option.some(`${schedule.careType} overdue since ${dueDay}`),
        DueToday: () => Option.some(`${schedule.careType} due today`),
        Upcoming: () => Option.none(),
      })
    )
  )

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

    if (Array.isReadonlyArrayEmpty(result.items)) {
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
          Option.fromNullishOr(plant.room),
          Option.map(
            (r) => ` (${escapeInlineMarkdown(`${r.icon} ${r.name}`)})`
          ),
          Option.getOrElse(() => '')
        )

        const scheduleInfo = pipe(
          plant.schedules,
          Array.filterMap(Filter.fromPredicateOption(dueLabel)),
          Array.join(', ')
        )

        acc.plants.push(toPlantSummary(plant))
        acc.lines.push(
          `- **${escapeInlineMarkdown(plant.name)}**${room}: ${scheduleInfo}${ownershipSuffix(plant)} (ID: ${plant.id})`
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
