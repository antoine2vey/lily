import { Canopy } from '@lily/api/contexts/canopy'
import { lockUser } from '@lily/api/kernel/locks'
import type { Outbox } from '@lily/api/kernel/outbox'
import { mintOwnerHeld, type OwnerHeld } from '@lily/api/kernel/owner'
import { transact } from '@lily/api/kernel/transact'
import { CanopyRepository } from '@lily/api/repositories/canopy.repository'
import type { CanopyOwner } from '@lily/api/repositories/helpers/plant-owner'
import { CurrentUser } from '@lily/api/services/auth/middleware.types'
import { CanopyNotFoundError, type PlantOwner } from '@lily/shared'
import { Effect, Match } from 'effect'
import type * as SqlClient from 'effect/sql/SqlClient'
import type { SqlError } from 'effect/sql/SqlError'

export const canopyOwnerOf = (
  userId: string
): Effect.Effect<
  CanopyOwner,
  CanopyNotFoundError | SqlError,
  CanopyRepository
> =>
  Effect.flatMap(CanopyRepository, (repo) =>
    repo.findMembershipByUser(userId)
  ).pipe(
    Effect.flatMap((membership) =>
      membership === null
        ? Effect.fail(new CanopyNotFoundError())
        : Effect.succeed({ _tag: 'Canopy', canopyId: membership.canopyId })
    )
  )

export const withUserLock =
  (userId: string) =>
  <A, E, R>(
    effect: Effect.Effect<A, E, R>
  ): Effect.Effect<A, E | SqlError, R | SqlClient.SqlClient | Outbox> =>
    transact(Effect.andThen(lockUser(userId), effect))

export const withOwnerLock =
  (owner: PlantOwner) =>
  <A, E, R>(
    body: (held: OwnerHeld) => Effect.Effect<A, E, R>
  ): Effect.Effect<
    A,
    E | SqlError | CanopyNotFoundError,
    R | SqlClient.SqlClient | Outbox | Canopy | CurrentUser
  > =>
    transact(
      Match.value(owner).pipe(
        Match.tag('User', ({ userId }) => lockUser(userId)),
        Match.tag('Canopy', ({ canopyId }) =>
          Effect.flatMap(
            Effect.all([Canopy, CurrentUser]),
            ([canopy, { id }]) => canopy.holdAsMember({ by: id, canopyId })
          )
        ),
        Match.exhaustive,
        Effect.andThen(() => body(mintOwnerHeld(owner)))
      )
    )
