import { ApiClient } from '@lily/mcp/api-client'
import { escapeInlineMarkdown, ownershipSuffix } from '@lily/mcp/tools/markdown'
import { toPlantSummary } from '@lily/mcp/widgets/mappers'
import type { PlantSummary } from '@lily/mcp/widgets/schemas'
import { endOfDay, localDayKey } from '@lily/shared'
import type { PlantCareSchedule } from '@lily/shared/plant'
import { Array, DateTime, Effect, Filter, Match, Option, pipe } from 'effect'

interface UserDay {
  readonly now: DateTime.DateTime
  readonly end: DateTime.DateTime
  readonly timezone: string
}

const dueLabel = (
  schedule: PlantCareSchedule,
  today: UserDay
): Option.Option<string> =>
  Option.flatMap(Option.fromNullishOr(schedule.nextCareAt), (date) =>
    pipe(
      Match.value(DateTime.makeUnsafe(date)),
      Match.when(
        (due) => DateTime.isLessThan(due, today.now),
        (due) =>
          Option.some(
            `${schedule.careType} overdue since ${localDayKey(due, today.timezone)}`
          )
      ),
      Match.when(
        (due) => DateTime.isLessThanOrEqualTo(due, today.end),
        () => Option.some(`${schedule.careType} due today`)
      ),
      Match.orElse(() => Option.none())
    )
  )

/**
 * Returns plants that are overdue for care via the API.
 * Returns both markdown text and structured data for widget rendering.
 */
export const getOverduePlantsEffect = Effect.fn('MCP.getOverduePlants')(
  function* () {
    const apiClient = yield* ApiClient

    const [result, timezone] = yield* Effect.all(
      [
        apiClient.listPlants({ filter: 'overdue', limit: '100' }),
        apiClient.getUserTimezone(),
      ],
      { concurrency: 'unbounded' }
    )

    if (Array.isReadonlyArrayEmpty(result.items)) {
      return {
        text: 'No overdue plants! All your plants are on schedule.',
        plants: [] as readonly PlantSummary[],
      }
    }

    const now = DateTime.nowUnsafe()
    const today: UserDay = { now, end: endOfDay(now, timezone), timezone }

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
          Array.filterMap(
            Filter.fromPredicateOption((s: PlantCareSchedule) =>
              dueLabel(s, today)
            )
          ),
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
