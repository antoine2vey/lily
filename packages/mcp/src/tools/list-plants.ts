import { PlantRepository } from '@lily/api/repositories/plant.repository'
import { UserRepository } from '@lily/api/repositories/user.repository'
import { CurrentUser } from '@lily/api/services/auth/middleware.types'
import { Array, Effect, Match, Option, pipe } from 'effect'

/**
 * Lists all plants for the authenticated user.
 * Supports filtering by health status: 'all', 'needsAttention', or 'overdue'.
 */
export const listPlantsEffect = (params: {
  filter?: 'all' | 'needsAttention' | 'overdue'
}) =>
  Effect.gen(function* () {
    const plantRepo = yield* PlantRepository
    const userRepo = yield* UserRepository
    const { id: userId } = yield* CurrentUser

    const user = yield* userRepo.findById(userId)
    const timezone = pipe(
      Option.fromNullable(user),
      Option.flatMap((u) => Option.fromNullable(u.timezone)),
      Option.getOrElse(() => 'UTC')
    )

    const result = yield* plantRepo.findAll({
      userId,
      timezone,
      filter: params.filter ?? 'all',
      limit: 100,
      includeCaretaking: true,
    })

    if (Array.isEmptyArray(result.items)) {
      return 'You have no plants yet. Add some plants in the Lily app to get started!'
    }

    const lines = Array.map(result.items, (plant) => {
      const health = pipe(
        Match.value(plant.health),
        Match.when('THRIVING', () => '[Thriving]'),
        Match.when('HEALTHY', () => '[Healthy]'),
        Match.when('NEEDS_ATTENTION', () => '[Needs Attention]'),
        Match.when('SICK', () => '[Sick]'),
        Match.when('RECOVERING', () => '[Recovering]'),
        Match.exhaustive
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

      return `- **${plant.name}** ${health}${room}${ownership} (ID: ${plant.id})`
    })

    return `## Your Plants (${result.items.length})\n\n${Array.join(lines, '\n')}`
  }).pipe(Effect.withSpan('MCP.listPlants'))
