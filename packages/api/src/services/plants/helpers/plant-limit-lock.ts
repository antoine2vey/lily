import { CanopyRepository } from '@lily/api/repositories/canopy.repository'
import { CanopyNotFoundError, type PlantOwner } from '@lily/shared'
import { Effect, Match } from 'effect'
import * as SqlClient from 'effect/sql/SqlClient'
import type { SqlError } from 'effect/sql/SqlError'

const PLANT_LIMIT_LOCK_KEYSPACE = 1

/**
 * Runs `effect` in a transaction that serializes every plant added to
 * `owner`, so a limit check and the insert or move it guards cannot
 * interleave with another one. A Canopy takes its row lock, which also
 * orders the write after any leave or dissolve of that Canopy; a Canopy
 * that no longer exists fails with `CanopyNotFoundError`.
 */
export const withPlantLimitLock =
  (owner: PlantOwner) =>
  <A, E, R>(
    effect: Effect.Effect<A, E, R>
  ): Effect.Effect<
    A,
    E | SqlError | CanopyNotFoundError,
    R | SqlClient.SqlClient | CanopyRepository
  > =>
    Effect.flatMap(SqlClient.SqlClient, (sql) =>
      sql.withTransaction(
        Match.value(owner).pipe(
          Match.tag('User', ({ userId }) =>
            Effect.asVoid(
              sql`SELECT pg_advisory_xact_lock(${PLANT_LIMIT_LOCK_KEYSPACE}, hashtext(${userId}))`
            )
          ),
          Match.tag('Canopy', ({ canopyId }) =>
            Effect.flatMap(CanopyRepository, (repo) =>
              repo.lock(canopyId)
            ).pipe(
              Effect.flatMap((canopy) =>
                canopy === null
                  ? Effect.fail(new CanopyNotFoundError())
                  : Effect.void
              )
            )
          ),
          Match.exhaustive,
          Effect.andThen(effect)
        )
      )
    )
