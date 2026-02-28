import * as PgDrizzle from '@effect/sql-drizzle/Pg'
import { rateLimits } from '@lily/db/schema/auth'
import { eq } from 'drizzle-orm'
import {
  Array,
  Context,
  DateTime,
  Duration,
  Effect,
  Layer,
  Option,
  pipe,
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
          const nowDt = DateTime.unsafeNow()
          const currentTime = DateTime.toDateUtc(nowDt)
          const windowStart = DateTime.toDateUtc(
            DateTime.subtract(nowDt, { seconds: config.windowSeconds })
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
          if (
            DateTime.lessThan(
              DateTime.unsafeMake(record.windowStart),
              DateTime.unsafeMake(windowStart)
            )
          ) {
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
            const windowEndDt = DateTime.addDuration(
              DateTime.unsafeMake(record.windowStart),
              Duration.seconds(config.windowSeconds)
            )
            const retryAfter = Math.ceil(
              DateTime.distance(nowDt, windowEndDt) / 1000
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
