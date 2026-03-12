import { PlantRepository } from '@lily/api/repositories/plant.repository'
import { CurrentUser } from '@lily/api/services/auth/middleware.types'
import { healthLabel } from '@lily/mcp/widgets/health'
import { toPlantSummary } from '@lily/mcp/widgets/mappers'
import type { PlantSummary } from '@lily/mcp/widgets/schemas'
import { Array, Effect, Match, Option, pipe } from 'effect'

/**
 * Lists all plants for the authenticated user.
 * Returns both markdown text and structured data for widget rendering.
 */
export const listPlantsEffect = (params: {
  filter?: 'all' | 'needsAttention' | 'overdue'
}) =>
  Effect.gen(function* () {
    const plantRepo = yield* PlantRepository
    const currentUser = yield* CurrentUser
    const userId = currentUser.id
    const timezone = pipe(
      Option.fromNullable(currentUser.timezone),
      Option.getOrElse(() => 'UTC')
    )

    const result = yield* plantRepo.findAll({
      userId,
      timezone,
      filter: pipe(
        Option.fromNullable(params.filter),
        Option.getOrElse(() => 'all' as const)
      ),
      limit: 100,
      includeCaretaking: true,
    })

    if (Array.isEmptyArray(result.items)) {
      return {
        text: 'You have no plants yet. Add some plants in the Lily app to get started!',
        plants: [] as readonly PlantSummary[],
      }
    }

    // Map to { summary, line } pairs, then extract separately below
    const mapped = Array.map(result.items, (plant) => {
      const summary = toPlantSummary(plant)

      const healthBadge = `[${healthLabel(plant.health)}]`

      const roomOpt = Option.fromNullable(plant.room)
      const room = pipe(
        roomOpt,
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

      const line = `- **${plant.name}** ${healthBadge}${room}${ownership} (ID: ${plant.id})`

      return { summary, line }
    })

    const plants = Array.map(mapped, (m) => m.summary)
    const lines = Array.map(mapped, (m) => m.line)

    return {
      text: `## Your Plants (${Array.length(result.items)})\n\n${Array.join(lines, '\n')}`,
      plants,
    }
  }).pipe(Effect.withSpan('MCP.listPlants'))
