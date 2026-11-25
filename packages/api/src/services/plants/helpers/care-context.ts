import { CanopyRepository } from '@lily/api/repositories/canopy.repository'
import { UserRepository } from '@lily/api/repositories/user.repository'
import { DEFAULT_ZONE, type PlantOwner, type ZoneName } from '@lily/shared'
import { Effect, Match, Option, pipe } from 'effect'
import type { SqlError } from 'effect/sql/SqlError'

const careTimezone = (
  owner: PlantOwner
): Effect.Effect<ZoneName, SqlError, UserRepository | CanopyRepository> =>
  pipe(
    Match.value(owner),
    Match.tag('User', ({ userId }) =>
      Effect.map(
        Effect.flatMap(UserRepository, (repo) => repo.findById(userId)),
        (user) =>
          pipe(
            Option.fromNullishOr(user),
            Option.flatMap((u) => Option.fromNullishOr(u.timezone)),
            Option.getOrElse(() => DEFAULT_ZONE)
          )
      )
    ),
    Match.tag('Canopy', ({ canopyId }) =>
      Effect.map(
        Effect.flatMap(CanopyRepository, (repo) => repo.findById(canopyId)),
        (canopy) =>
          pipe(
            Option.fromNullishOr(canopy),
            Option.map((c) => c.timezone),
            Option.getOrElse(() => DEFAULT_ZONE)
          )
      )
    ),
    Match.exhaustive
  )

export const actorDayTimezone = (
  owner: PlantOwner,
  actorId: string
): Effect.Effect<ZoneName, SqlError, UserRepository | CanopyRepository> =>
  pipe(
    Match.value(owner),
    Match.tag('User', () => careTimezone({ _tag: 'User', userId: actorId })),
    Match.tag('Canopy', (canopyOwner) => careTimezone(canopyOwner)),
    Match.exhaustive
  )
