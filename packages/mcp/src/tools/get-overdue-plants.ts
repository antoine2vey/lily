import { PlantRepository } from '@lily/api/repositories/plant.repository'
import { CurrentUser } from '@lily/api/services/auth/middleware.types'
import { formatIsoDate } from '@lily/shared'
import { Array, Effect, Option, pipe } from 'effect'

/**
 * Returns plants that are overdue for care.
 * Uses the 'overdue' filter on the plant repository.
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
      return 'No overdue plants! All your plants are on schedule.'
    }

    const lines = Array.map(result.items, (plant) => {
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

      return `- **${plant.name}**${room}: ${scheduleInfo} (ID: ${plant.id})`
    })

    return `## Overdue Plants (${result.items.length})\n\n${Array.join(lines, '\n')}`
  }).pipe(Effect.withSpan('MCP.getOverduePlants'))
