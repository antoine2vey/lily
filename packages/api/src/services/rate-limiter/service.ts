import * as PgDrizzle from '@lily/db/effect-drizzle'
import { rateLimits } from '@lily/db/schema/auth'
import { eq, sql } from 'drizzle-orm'
import {
  Array,
  Context,
  DateTime,
  Duration,
  Effect,
  Layer,
  Option,
} from 'effect'
import { RateLimitExceededError } from './errors'

/**
 * Rate limit configuration for different actions
 */
export interface RateLimitConfig {
  maxRequests: number
  windowSeconds: number
}

/**
 * Predefined rate limit configurations
 */
export const RATE_LIMITS = {
  MAGIC_LINK: { maxRequests: 3, windowSeconds: 60 },
  VERIFY: { maxRequests: 5, windowSeconds: 10 },
  REFRESH: { maxRequests: 10, windowSeconds: 60 },
} as const

/**
 * Rate limiter service interface
 */
export interface IRateLimiterService {
  readonly checkRateLimit: (
    key: string,
    config: RateLimitConfig
  ) => Effect.Effect<void, RateLimitExceededError>
  readonly resetRateLimit: (key: string) => Effect.Effect<void, never>
}

/**
 * Rate limiter context tag
 */
export class RateLimiterService extends Context.Service<
  RateLimiterService,
  IRateLimiterService
>()('RateLimiterService') {}

/**
 * Live implementation of Rate Limiter Service
 */
export const RateLimiterServiceLive = Layer.effect(
  RateLimiterService,
  Effect.gen(function* () {
    const db = yield* PgDrizzle.PgDrizzle

    return {
      checkRateLimit: Effect.fn('RateLimiterService.checkRateLimit')(
        function* (key: string, config: RateLimitConfig) {
          const nowDt = DateTime.nowUnsafe()
          const windowStart = DateTime.formatIso(
            DateTime.subtract(nowDt, { seconds: config.windowSeconds })
          )
          const windowExpired = sql`${rateLimits.windowStart} < ${windowStart}::timestamptz`

          const rows = yield* db
            .insert(rateLimits)
            .values({ key, count: 1, windowStart: DateTime.toDateUtc(nowDt) })
            .onConflictDoUpdate({
              target: rateLimits.key,
              set: {
                count: sql`CASE WHEN ${windowExpired} THEN 1 ELSE ${rateLimits.count} + 1 END`,
                windowStart: sql`CASE WHEN ${windowExpired} THEN excluded.window_start ELSE ${rateLimits.windowStart} END`,
              },
            })
            .returning({
              count: rateLimits.count,
              windowStart: rateLimits.windowStart,
            })

          const record = yield* Option.match(Array.head(rows), {
            onNone: () =>
              Effect.die(new Error('rate_limits upsert returned no row')),
            onSome: Effect.succeed,
          })

          if (record.count > config.maxRequests) {
            const windowEndDt = DateTime.addDuration(
              DateTime.makeUnsafe(record.windowStart),
              Duration.seconds(config.windowSeconds)
            )
            const retryAfter = Math.ceil(
              Duration.toMillis(DateTime.distance(nowDt, windowEndDt)) / 1000
            )
            return yield* new RateLimitExceededError({
              message: `Rate limit exceeded. Please try again in ${retryAfter} seconds.`,
              retryAfter,
            })
          }
        },
        Effect.catchTag('SqlError', (e) => Effect.die(e))
      ),

      resetRateLimit: Effect.fn('RateLimiterService.resetRateLimit')(
        function* (key: string) {
          yield* db.delete(rateLimits).where(eq(rateLimits.key, key))
        },
        Effect.catchTag('SqlError', (e) => Effect.die(e))
      ),
    }
  })
)
