import { ApiClient } from '@lily/mcp/api-client'
import { healthLabel } from '@lily/mcp/widgets/health'
import { toPlantSummary } from '@lily/mcp/widgets/mappers'
import type { PlantSummary } from '@lily/mcp/widgets/schemas'
import type { PlantFilter } from '@lily/shared'
import { Array, Effect, Match, Option, pipe } from 'effect'

/**
 * Lists all plants for the authenticated user via the API.
 * Returns both markdown text and structured data for widget rendering.
 */
export const listPlantsEffect = (params: { filter?: PlantFilter }) =>
  Effect.gen(function* () {
    const apiClient = yield* ApiClient

    const filter = pipe(
      Option.fromNullable(params.filter),
      Option.getOrElse(() => 'all' as const)
    )

    const result = yield* apiClient.listPlants({
      filter,
      includeCaretaking: 'true',
      limit: '100',
    })

    if (Array.isEmptyReadonlyArray(result.items)) {
      return {
        text: 'You have no plants yet. Add some plants in the Lily app to get started!',
        plants: [] as readonly PlantSummary[],
      }
    }

    const { plants, lines } = Array.reduce(
      result.items,
      { plants: [] as PlantSummary[], lines: [] as string[] },
      (acc, plant) => {
        const healthBadge = `[${healthLabel(plant.health)}]`

        const room = pipe(
          Option.fromNullable(plant.room),
          Option.map((r) => ` | ${r.icon} ${r.name}`),
          Option.getOrElse(() => '')
        )

        const ownership = pipe(
          Match.value(plant.ownership),
          Match.when(
            'caretaking',
            () =>
              ` | Caretaking for ${pipe(
                Option.fromNullable(plant.ownerName),
                Option.getOrElse(() => 'someone')
              )}`
          ),
          Match.orElse(() => '')
        )

        acc.plants.push(toPlantSummary(plant))
        acc.lines.push(
          `- **${plant.name}** ${healthBadge}${room}${ownership} (ID: ${plant.id})`
        )
        return acc
      }
    )

    return {
      text: `## Your Plants (${Array.length(result.items)})\n\n${Array.join(lines, '\n')}`,
      plants,
    }
  }).pipe(Effect.withSpan('MCP.listPlants'))
