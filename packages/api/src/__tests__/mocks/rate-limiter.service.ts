import { RateLimitExceededError } from '@lily/api/services/rate-limiter/errors'
import {
  type IRateLimiterService,
  RateLimiterService,
} from '@lily/api/services/rate-limiter/service'
import { Effect, Layer, Option, pipe } from 'effect'

export interface MockRateLimiterServiceOptions {
  shouldExceedLimit?: boolean
  retryAfter?: number
}

// Track rate limit state per key for more realistic mocking
const rateLimitState = new Map<string, { count: number; windowStart: Date }>()

export const createMockRateLimiterService = (
  options: MockRateLimiterServiceOptions = {}
): Layer.Layer<RateLimiterService> => {
  // Reset state for each mock instance
  rateLimitState.clear()

  const service: IRateLimiterService = {
    checkRateLimit: (key, config) =>
      Effect.gen(function* () {
        if (options.shouldExceedLimit) {
          const retryAfter = pipe(
            Option.fromNullable(options.retryAfter),
            Option.getOrElse(() => 60)
          )
          return yield* new RateLimitExceededError({
            message: `Rate limit exceeded. Please try again in ${retryAfter} seconds.`,
            retryAfter,
          })
        }

        // Simulate rate limit tracking
        const now = new Date()
        const existing = rateLimitState.get(key)

        if (!existing) {
          rateLimitState.set(key, { count: 1, windowStart: now })
          return
        }

        const windowExpired =
          now.getTime() - existing.windowStart.getTime() >
          config.windowSeconds * 1000

        if (windowExpired) {
          rateLimitState.set(key, { count: 1, windowStart: now })
          return
        }

        if (existing.count >= config.maxRequests) {
          const retryAfter = Math.ceil(
            (existing.windowStart.getTime() +
              config.windowSeconds * 1000 -
              now.getTime()) /
              1000
          )
          return yield* new RateLimitExceededError({
            message: `Rate limit exceeded. Please try again in ${retryAfter} seconds.`,
            retryAfter,
          })
        }

        rateLimitState.set(key, {
          count: existing.count + 1,
          windowStart: existing.windowStart,
        })
      }),

    resetRateLimit: (key) =>
      Effect.sync(() => {
        rateLimitState.delete(key)
      }),
  }

  return Layer.succeed(RateLimiterService, service)
}

// Helper to clear all rate limit state (useful between tests)
export const clearRateLimitState = () => {
  rateLimitState.clear()
}
