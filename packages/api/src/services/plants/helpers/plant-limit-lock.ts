import type { CanopyRepository } from '@lily/api/repositories/canopy.repository'
import { CurrentUser } from '@lily/api/services/auth/middleware.types'
import { lockMyCanopy } from '@lily/api/services/canopy/helpers/membership'
import { CanopyNotFoundError, type PlantOwner } from '@lily/shared'
import { Effect, Match } from 'effect'
import * as SqlClient from 'effect/sql/SqlClient'
import type { SqlError } from 'effect/sql/SqlError'

const PLANT_LIMIT_LOCK_KEYSPACE = 1

const lockUser = (sql: SqlClient.SqlClient, userId: string) =>
  Effect.asVoid(
    sql`SELECT pg_advisory_xact_lock(${PLANT_LIMIT_LOCK_KEYSPACE}, hashtext(${userId}))`
  )

export const withUserLock =
  (userId: string) =>
  <A, E, R>(
    effect: Effect.Effect<A, E, R>
  ): Effect.Effect<A, E | SqlError, R | SqlClient.SqlClient> =>
    Effect.flatMap(SqlClient.SqlClient, (sql) =>
      sql.withTransaction(Effect.andThen(lockUser(sql, userId), effect))
    )

export const withPlantLimitLock =
  (owner: PlantOwner) =>
  <A, E, R>(
    effect: Effect.Effect<A, E, R>
  ): Effect.Effect<
    A,
    E | SqlError | CanopyNotFoundError,
    R | SqlClient.SqlClient | CanopyRepository | CurrentUser
  > =>
    Effect.flatMap(SqlClient.SqlClient, (sql) =>
      sql.withTransaction(
        Match.value(owner).pipe(
          Match.tag('User', ({ userId }) => lockUser(sql, userId)),
          Match.tag('Canopy', ({ canopyId }) =>
            Effect.flatMap(CurrentUser, ({ id }) => lockMyCanopy(id)).pipe(
              Effect.flatMap(({ canopy }) =>
                canopy.id === canopyId
                  ? Effect.void
                  : Effect.fail(new CanopyNotFoundError())
              )
            )
          ),
          Match.exhaustive,
          Effect.andThen(effect)
        )
      )
    )
