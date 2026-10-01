/**
 * Drizzle queries become `Effect<A, SqlError>` and run through the ambient
 * `SqlClient`, so `SqlClient.withTransaction` covers them.
 */
import { type DrizzleConfig, DrizzleQueryError } from 'drizzle-orm'
import { PgSelectBase } from 'drizzle-orm/pg-core'
import {
  drizzle,
  type PgRemoteDatabase,
  type RemoteCallback,
} from 'drizzle-orm/pg-proxy'
import { QueryPromise } from 'drizzle-orm/query-promise'
import { Context, Effect, Effectable, Layer, Match, Option } from 'effect'
import * as SqlClient from 'effect/sql/SqlClient'
import { isSqlError, SqlError, UnknownError } from 'effect/sql/SqlError'

// The pg-proxy callback is a plain Promise function that cannot see the
// calling fiber. A query parks its fiber's context here for the synchronous
// part of execute(), which is how SqlClient.withTransaction reaches it.
let currentContext: Option.Option<Context.Context<never>> = Option.none()

const isWrappedSqlError = (
  u: unknown
): u is DrizzleQueryError & { readonly cause: SqlError } =>
  u instanceof DrizzleQueryError && isSqlError(u.cause)

// drizzle >=0.44 wraps driver rejections in DrizzleQueryError. Unwrapping it
// keeps the PgClient's classified reason (UniqueViolation, ...).
const toSqlError = (cause: unknown): SqlError =>
  Match.value(cause).pipe(
    Match.when(isSqlError, (error) => error),
    Match.when(isWrappedSqlError, (error) => error.cause),
    Match.orElse(
      (cause) =>
        new SqlError({
          reason: new UnknownError({
            cause,
            message: 'Failed to execute QueryPromise',
          }),
        })
    )
  )

const PatchProto: object = Effectable.Prototype<QueryPromise<unknown>>({
  label: 'DrizzleQuery',
  evaluate(fiber) {
    return Effect.tryPromise({
      try: () => {
        const previous = currentContext
        currentContext = Option.some(fiber.context)
        try {
          return this.execute()
        } finally {
          currentContext = previous
        }
      },
      catch: toSqlError,
    })
  },
})

const patch = (prototype: object) => {
  if (Effect.TypeId in prototype) return
  Object.assign(prototype, PatchProto)
}

type Method = Parameters<RemoteCallback>[2]

const makeRemoteCallback = Effect.gen(function* () {
  const client = yield* SqlClient.SqlClient
  const constructionContext = yield* Effect.context<never>()
  const callback: RemoteCallback = (sql, params, method) => {
    const statement = client.unsafe(sql, params)
    const query = Match.type<Method>().pipe(
      // rows = [QueryResult]; unwrapPgRows relies on that.
      Match.when('execute', () =>
        Effect.map(statement.raw, (result) => ({ rows: [result] }))
      ),
      Match.when('all', () =>
        Effect.map(statement.values, (rows) => ({ rows: [...rows] }))
      ),
      Match.exhaustive
    )(method)
    const context = Option.getOrElse(currentContext, () => constructionContext)
    return Effect.runPromiseWith(context)(query)
  }
  return callback
})

export const make = <
  TSchema extends Record<string, unknown> = Record<string, never>,
>(
  config?: Omit<DrizzleConfig<TSchema>, 'logger'>
): Effect.Effect<PgRemoteDatabase<TSchema>, never, SqlClient.SqlClient> =>
  Effect.map(makeRemoteCallback, (callback) => drizzle(callback, config))

export class PgDrizzle extends Context.Service<PgDrizzle, PgRemoteDatabase>()(
  '@lily/db/effect-drizzle/PgDrizzle'
) {}

export const layer: Layer.Layer<PgDrizzle, never, SqlClient.SqlClient> =
  Layer.effect(PgDrizzle, make())

declare module 'drizzle-orm' {
  export interface QueryPromise<T> extends Effect.Effect<T, SqlError> {}
}

patch(QueryPromise.prototype)
patch(PgSelectBase.prototype)
