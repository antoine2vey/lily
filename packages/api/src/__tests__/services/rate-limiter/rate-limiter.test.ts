import {
  clearRateLimitState,
  createMockRateLimiterService,
} from '@lily/api/__tests__/mocks/rate-limiter.service'
import { RateLimiterService } from '@lily/api/services/rate-limiter/service'
import { failureOf } from '@lily/shared/testing'
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

      expect(failureOf(result)._tag).toBe('RateLimitExceededError')
    })

    it('should track request count per key', async () => {
      const result = await Effect.runPromiseExit(
        Effect.gen(function* () {
          const rateLimiter = yield* RateLimiterService
          const config = { maxRequests: 3, windowSeconds: 60 }

          yield* rateLimiter.checkRateLimit('test-key', config)
          yield* rateLimiter.checkRateLimit('test-key', config)
          yield* rateLimiter.checkRateLimit('test-key', config)

          yield* rateLimiter.checkRateLimit('test-key', config)
        }).pipe(Effect.provide(createMockRateLimiterService()))
      )

      expect(failureOf(result)._tag).toBe('RateLimitExceededError')
    })

    it('should track different keys independently', async () => {
      const result = await Effect.runPromise(
        Effect.gen(function* () {
          const rateLimiter = yield* RateLimiterService
          const config = { maxRequests: 2, windowSeconds: 60 }

          yield* rateLimiter.checkRateLimit('key-a', config)
          yield* rateLimiter.checkRateLimit('key-a', config)

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

      expect(failureOf(result)).toMatchObject({
        _tag: 'RateLimitExceededError',
        retryAfter: 45,
      })
    })
  })

  describe('resetRateLimit', () => {
    it('should clear rate limit record', async () => {
      const result = await Effect.runPromise(
        Effect.gen(function* () {
          const rateLimiter = yield* RateLimiterService
          const config = { maxRequests: 2, windowSeconds: 60 }

          yield* rateLimiter.checkRateLimit('test-key', config)
          yield* rateLimiter.checkRateLimit('test-key', config)

          yield* rateLimiter.resetRateLimit('test-key')

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

          yield* rateLimiter.checkRateLimit('key-a', config)
          yield* rateLimiter.checkRateLimit('key-b', config)

          yield* rateLimiter.resetRateLimit('key-a')

          yield* rateLimiter.checkRateLimit('key-a', config)

          yield* rateLimiter.checkRateLimit('key-b', config)
        }).pipe(Effect.provide(createMockRateLimiterService()))
      )

      expect(failureOf(result)._tag).toBe('RateLimitExceededError')
    })
  })
})
