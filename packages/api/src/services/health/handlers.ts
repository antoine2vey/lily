import { HttpApiBuilder } from '@effect/platform'
import type { Api } from '@lily/api/api'
import {
  RedisClient,
  RedisClientLive,
} from '@lily/api/services/message-queue/redis.provider'
import { PgDrizzle } from '@lily/db'
import { sql } from 'drizzle-orm'
import { Effect, Layer } from 'effect'

export const HealthApiLive = (api: Api) =>
  HttpApiBuilder.group(api, 'health', (handlers) =>
    Effect.gen(function* () {
      const db = yield* PgDrizzle.PgDrizzle
      const redis = yield* RedisClient

      return handlers.handle('check', () =>
        Effect.gen(function* () {
          // Check database
          const dbStatus = yield* Effect.tryPromise(() =>
            db.execute(sql`SELECT 1`)
          ).pipe(
            Effect.map(() => 'ok' as const),
            Effect.catchTag('UnknownException', () =>
              Effect.succeed('error' as const)
            )
          )

          // Check redis
          const redisStatus = yield* Effect.tryPromise(() => redis.ping()).pipe(
            Effect.map(() => 'ok' as const),
            Effect.catchTag('UnknownException', () =>
              Effect.succeed('error' as const)
            )
          )

          const status =
            dbStatus === 'ok' && redisStatus === 'ok' ? 'ok' : 'degraded'

          return { status, database: dbStatus, redis: redisStatus }
        })
      )
    })
  ).pipe(Layer.provide(RedisClientLive))
