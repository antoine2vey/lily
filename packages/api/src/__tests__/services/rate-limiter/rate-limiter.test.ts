import {
  clearRateLimitState,
  createMockRateLimiterService,
} from '@lily/api/__tests__/mocks/rate-limiter.service'
import { RateLimiterService } from '@lily/api/services/rate-limiter/service'
import { Effect } from 'effect'
import { afterEach, describe, expect, it } from 'vitest'

describe('RateLimiterService', () => {
  afterEach(() => {
    clearRateLimitState()
  })

  describe('checkRateLimit', () => {
    it('should allow request under limit', async () => {
      const result = await Effect.runPromiseExit(
        Effect.gen(function* () {
          const rateLimiter = yield* RateLimiterService
          yield* rateLimiter.checkRateLimit('test-key', {
            maxRequests: 5,
            windowSeconds: 60,
          })
        }).pipe(Effect.provide(createMockRateLimiterService()))
      )

      expect(result._tag).toBe('Success')
    })

    it('should fail with RateLimitExceededError when limit exceeded', async () => {
      const result = await Effect.runPromiseExit(
        Effect.gen(function* () {
          const rateLimiter = yield* RateLimiterService
          yield* rateLimiter.checkRateLimit('test-key', {
            maxRequests: 5,
            windowSeconds: 60,
          })
        }).pipe(
          Effect.provide(
            createMockRateLimiterService({
              shouldExceedLimit: true,
              retryAfter: 30,
            })
          )
        )
      )

      expect(result._tag).toBe('Failure')
    })

    it('should track request count per key', async () => {
      // Make multiple requests up to the limit
      const result = await Effect.runPromiseExit(
        Effect.gen(function* () {
          const rateLimiter = yield* RateLimiterService
          const config = { maxRequests: 3, windowSeconds: 60 }

          // First 3 requests should succeed
          yield* rateLimiter.checkRateLimit('test-key', config)
          yield* rateLimiter.checkRateLimit('test-key', config)
          yield* rateLimiter.checkRateLimit('test-key', config)

          // 4th request should fail
          yield* rateLimiter.checkRateLimit('test-key', config)
        }).pipe(Effect.provide(createMockRateLimiterService()))
      )

      expect(result._tag).toBe('Failure')
    })

    it('should track different keys independently', async () => {
      const result = await Effect.runPromise(
        Effect.gen(function* () {
          const rateLimiter = yield* RateLimiterService
          const config = { maxRequests: 2, windowSeconds: 60 }

          // Use up limit for key-a
          yield* rateLimiter.checkRateLimit('key-a', config)
          yield* rateLimiter.checkRateLimit('key-a', config)

          // key-b should still have full limit available
          yield* rateLimiter.checkRateLimit('key-b', config)
          yield* rateLimiter.checkRateLimit('key-b', config)

          return 'success'
        }).pipe(Effect.provide(createMockRateLimiterService()))
      )

      expect(result).toBe('success')
    })

    it('should include retryAfter in error', async () => {
      const result = await Effect.runPromiseExit(
        Effect.gen(function* () {
          const rateLimiter = yield* RateLimiterService
          yield* rateLimiter.checkRateLimit('test-key', {
            maxRequests: 5,
            windowSeconds: 60,
          })
        }).pipe(
          Effect.provide(
            createMockRateLimiterService({
              shouldExceedLimit: true,
              retryAfter: 45,
            })
          )
        )
      )

      expect(result._tag).toBe('Failure')
      if (result._tag === 'Failure') {
        // Extract the error from the cause
        const causeStr = String(result.cause)
        expect(causeStr).toContain('45')
      }
    })
  })

  describe('resetRateLimit', () => {
    it('should clear rate limit record', async () => {
      const result = await Effect.runPromise(
        Effect.gen(function* () {
          const rateLimiter = yield* RateLimiterService
          const config = { maxRequests: 2, windowSeconds: 60 }

          // Use up limit
          yield* rateLimiter.checkRateLimit('test-key', config)
          yield* rateLimiter.checkRateLimit('test-key', config)

          // Reset the limit
          yield* rateLimiter.resetRateLimit('test-key')

          // Should be able to make requests again
          yield* rateLimiter.checkRateLimit('test-key', config)

          return 'success'
        }).pipe(Effect.provide(createMockRateLimiterService()))
      )

      expect(result).toBe('success')
    })

    it('should only reset specified key', async () => {
      const result = await Effect.runPromiseExit(
        Effect.gen(function* () {
          const rateLimiter = yield* RateLimiterService
          const config = { maxRequests: 1, windowSeconds: 60 }

          // Use up limit for both keys
          yield* rateLimiter.checkRateLimit('key-a', config)
          yield* rateLimiter.checkRateLimit('key-b', config)

          // Reset only key-a
          yield* rateLimiter.resetRateLimit('key-a')

          // key-a should work
          yield* rateLimiter.checkRateLimit('key-a', config)

          // key-b should still be limited
          yield* rateLimiter.checkRateLimit('key-b', config)
        }).pipe(Effect.provide(createMockRateLimiterService()))
      )

      expect(result._tag).toBe('Failure')
    })
  })
})
