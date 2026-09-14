import { ApiClient } from '@lily/mcp/api-client'
import { deathCauseLabel, healthLabel } from '@lily/mcp/widgets/health'
import { toPlantSummary } from '@lily/mcp/widgets/mappers'
import type { PlantSummary } from '@lily/mcp/widgets/schemas'
import type { PlantFilter } from '@lily/shared'
import { formatIsoDate } from '@lily/shared'
import { Array, Effect, Match, Option, pipe } from 'effect'

/**
 * Lists all plants for the authenticated user via the API.
 * Returns both markdown text and structured data for widget rendering.
 */
export const listPlantsEffect = Effect.fn('MCP.listPlants')(function* (params: {
  filter?: PlantFilter
}) {
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
      text:
        filter === 'dead'
          ? 'Your cemetery is empty — no plant has been lost yet.'
          : 'You have no plants yet. Add some plants in the Lily app to get started!',
      plants: [] as readonly PlantSummary[],
    }
  }

  const { plants, lines } = Array.reduce(
    result.items,
    { plants: [] as PlantSummary[], lines: [] as string[] },
    (acc, plant) => {
      // A plant in the cemetery shows when and why it died instead of health
      const healthBadge = pipe(
        Option.fromNullable(plant.diedAt),
        Option.match({
          onNone: () => `[${healthLabel(plant.health)}]`,
          onSome: (diedAt) =>
            `[In memory · died ${formatIsoDate(diedAt)} · ${deathCauseLabel(
              pipe(
                Option.fromNullable(plant.deathCause),
                Option.getOrElse(() => 'unknown')
              )
            )}]`,
        })
      )

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

  const heading = filter === 'dead' ? 'Your Cemetery' : 'Your Plants'

  return {
    text: `## ${heading} (${Array.length(result.items)})\n\n${Array.join(lines, '\n')}`,
    plants,
  }
})
