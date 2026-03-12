import { PlantRepository } from '@lily/api/repositories/plant.repository'
import { CurrentUser } from '@lily/api/services/auth/middleware.types'
import { toPlantSummary } from '@lily/mcp/widgets/mappers'
import type { PlantSummary } from '@lily/mcp/widgets/schemas'
import { formatIsoDate } from '@lily/shared'
import { Array, Effect, Option, pipe } from 'effect'

/**
 * Returns plants that are overdue for care.
 * Returns both markdown text and structured data for widget rendering.
 */
export const getOverduePlantsEffect = () =>
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
      filter: 'overdue',
      limit: 100,
    })

    if (Array.isEmptyArray(result.items)) {
      return {
        text: 'No overdue plants! All your plants are on schedule.',
        plants: [] as readonly PlantSummary[],
      }
    }

    // Map to { summary, line } pairs, then extract separately below
    const mapped = Array.map(result.items, (plant) => {
      const summary = toPlantSummary(plant)

      const roomOpt = Option.fromNullable(plant.room)
      const room = pipe(
        roomOpt,
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

      const line = `- **${plant.name}**${room}: ${scheduleInfo} (ID: ${plant.id})`

      return { summary, line }
    })

    const plants = Array.map(mapped, (m) => m.summary)
    const lines = Array.map(mapped, (m) => m.line)

    return {
      text: `## Overdue Plants (${Array.length(result.items)})\n\n${Array.join(lines, '\n')}`,
      plants,
    }
  }).pipe(Effect.withSpan('MCP.getOverduePlants'))
