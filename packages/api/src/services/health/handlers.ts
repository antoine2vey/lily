import type { Api } from '@lily/api/api'
import {
  type HealthApiGroup,
  NotReadyError,
} from '@lily/api/services/health/api'
import { RedisClient } from '@lily/api/services/message-queue/redis.provider'
import * as PgDrizzle from '@lily/db/effect-drizzle'
import { sql } from 'drizzle-orm'
import { Effect } from 'effect'
import { HttpApiBuilder } from 'effect/http-api'

// A platform healthcheck must get an answer even when a dependency hangs:
// the shared pool can be exhausted, and ioredis queues commands while
// offline instead of failing them.
const DEPENDENCY_TIMEOUT = '1 second'

const pingDatabase = (db: PgDrizzle.PgDrizzle['Service']) =>
  db.execute(sql`SELECT 1`).pipe(
    Effect.timeout(DEPENDENCY_TIMEOUT),
    Effect.as('ok' as const),
    Effect.catchTags({
      SqlError: () => Effect.succeed('error' as const),
      TimeoutError: () => Effect.succeed('error' as const),
    })
  )

const pingRedis = (redis: RedisClient['Service']) =>
  Effect.tryPromise(() => redis.ping()).pipe(
    Effect.timeout(DEPENDENCY_TIMEOUT),
    Effect.as('ok' as const),
    Effect.catchTags({
      UnknownError: () => Effect.succeed('error' as const),
      TimeoutError: () => Effect.succeed('error' as const),
    })
  )

export const healthHandlers = (
  handlers: HttpApiBuilder.Handlers.FromGroup<typeof HealthApiGroup>
) =>
  Effect.gen(function* () {
    const db = yield* PgDrizzle.PgDrizzle
    const redisClient = yield* RedisClient

    const checkReadiness = Effect.gen(function* () {
      const { database, redis } = yield* Effect.all(
        { database: pingDatabase(db), redis: pingRedis(redisClient) },
        { concurrency: 'unbounded' }
      )
      if (database === 'ok' && redis === 'ok') {
        return { status: 'ok' as const, database, redis }
      }
      return yield* new NotReadyError({ status: 'degraded', database, redis })
    })

    return handlers
      .handle('live', () => Effect.succeed({ status: 'ok' as const }))
      .handle('ready', () => checkReadiness)
      .handle('check', () => checkReadiness)
  })

export const HealthApiLive = (api: Api) =>
  HttpApiBuilder.group(api, 'health', healthHandlers)
