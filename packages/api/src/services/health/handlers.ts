import type { Api } from '@lily/api/api'
import { RedisClient } from '@lily/api/services/message-queue/redis.provider'
import * as PgDrizzle from '@lily/db/effect-drizzle'
import { sql } from 'drizzle-orm'
import { Effect } from 'effect'
import { HttpApiBuilder } from 'effect/http-api'

export const HealthApiLive = (api: Api) =>
  HttpApiBuilder.group(api, 'health', (handlers) =>
    Effect.gen(function* () {
      const db = yield* PgDrizzle.PgDrizzle
      const redis = yield* RedisClient

      return handlers.handle('check', () =>
        Effect.gen(function* () {
          const dbStatus = yield* Effect.tryPromise(() =>
            db.execute(sql`SELECT 1`)
          ).pipe(
            Effect.map(() => 'ok' as const),
            Effect.catchTag('UnknownError', () =>
              Effect.succeed('error' as const)
            )
          )

          const redisStatus = yield* Effect.tryPromise(() => redis.ping()).pipe(
            Effect.map(() => 'ok' as const),
            Effect.catchTag('UnknownError', () =>
              Effect.succeed('error' as const)
            )
          )

          const status =
            dbStatus === 'ok' && redisStatus === 'ok' ? 'ok' : 'degraded'

          return { status, database: dbStatus, redis: redisStatus }
        })
      )
    })
  )
