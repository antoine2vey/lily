import * as PgDrizzle from '@effect/sql-drizzle/Pg'
import { rateLimits } from '@lily/db/schema/auth'
import { nowAsDate } from '@lily/shared'
import { eq } from 'drizzle-orm'
import { Array, Context, Effect, Layer, Option, pipe } from 'effect'
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
export class RateLimiterService extends Context.Tag('RateLimiterService')<
  RateLimiterService,
  IRateLimiterService
>() {}

/**
 * Live implementation of Rate Limiter Service
 */
export const RateLimiterServiceLive = Layer.effect(
  RateLimiterService,
  Effect.gen(function* () {
    const db = yield* PgDrizzle.PgDrizzle

    return {
      checkRateLimit: (key: string, config: RateLimitConfig) =>
        Effect.gen(function* () {
          const currentTime = nowAsDate()
          const windowStart = new Date(
            currentTime.getTime() - config.windowSeconds * 1000
          )

          // Find existing rate limit record
          const records = yield* db
            .select()
            .from(rateLimits)
            .where(eq(rateLimits.key, key))

          const existingRecord = pipe(records, Array.head)

          if (Option.isNone(existingRecord)) {
            // Create new record
            yield* db.insert(rateLimits).values({
              key,
              count: 1,
              windowStart: currentTime,
            })
            return
          }

          const record = existingRecord.value

          // Check if window has expired
          if (record.windowStart < windowStart) {
            // Reset the window
            yield* db
              .update(rateLimits)
              .set({
                count: 1,
                windowStart: currentTime,
              })
              .where(eq(rateLimits.key, key))
            return
          }

          // Check if rate limit exceeded
          if (record.count >= config.maxRequests) {
            const retryAfter = Math.ceil(
              (record.windowStart.getTime() +
                config.windowSeconds * 1000 -
                currentTime.getTime()) /
                1000
            )
            return yield* Effect.fail(
              new RateLimitExceededError({
                message: `Rate limit exceeded. Please try again in ${retryAfter} seconds.`,
                retryAfter,
              })
            )
          }

          // Increment counter
          yield* db
            .update(rateLimits)
            .set({
              count: record.count + 1,
            })
            .where(eq(rateLimits.key, key))
        }).pipe(
          // Convert SQL errors to defects since they are unexpected infrastructure errors
          Effect.catchTag('SqlError', (e) => Effect.die(e)),
          Effect.withSpan('RateLimiterService.checkRateLimit')
        ),

      resetRateLimit: (key: string) =>
        Effect.gen(function* () {
          yield* db.delete(rateLimits).where(eq(rateLimits.key, key))
        }).pipe(
          // Convert SQL errors to defects
          Effect.catchTag('SqlError', (e) => Effect.die(e)),
          Effect.withSpan('RateLimiterService.resetRateLimit')
        ),
    }
  })
)
