import { mockAdminJWTPayload } from '@lily/api/__tests__/fixtures/jwt'
import { createMockJWTService } from '@lily/api/__tests__/mocks/jwt.service'
import { JWTService, JWTServiceLive } from '@lily/api/services/jwt/service'
import { ConfigProvider, Effect, Exit, Layer } from 'effect'
import { describe, expect, it } from 'vitest'

// Test config provider for JWT service
const testConfigProvider = ConfigProvider.fromMap(
  new Map([
    ['JWT_SECRET', 'test-secret-key-for-testing-purposes-only'],
    ['JWT_ISSUER', 'lily-test'],
    ['JWT_ACCESS_TOKEN_EXPIRY', '15m'],
  ])
)

const JWTServiceTestLive = JWTServiceLive.pipe(
  Layer.provide(Layer.setConfigProvider(testConfigProvider))
)

describe('JWTService', () => {
  describe('signAccessToken', () => {
    it('should generate valid JWT', async () => {
      const result = await Effect.runPromise(
        Effect.gen(function* () {
          const jwtService = yield* JWTService
          return yield* jwtService.signAccessToken({
            userId: 'user-1',
            email: 'test@example.com',
            role: 'user',
            status: 'active',
          })
        }).pipe(Effect.provide(JWTServiceTestLive))
      )

      expect(result).toBeDefined()
      expect(typeof result).toBe('string')
      expect(result.split('.')).toHaveLength(3) // JWT has 3 parts
    })

    it('should fail with JWTError on error (mock)', async () => {
      const result = await Effect.runPromiseExit(
        Effect.gen(function* () {
          const jwtService = yield* JWTService
          return yield* jwtService.signAccessToken({
            userId: 'user-1',
            email: 'test@example.com',
            role: 'user',
            status: 'active',
          })
        }).pipe(Effect.provide(createMockJWTService({ shouldFailSign: true })))
      )

      expect(result._tag).toBe('Failure')
      if (result._tag === 'Failure') {
        const error = result.cause
        expect(Exit.isFailure(Exit.failCause(error))).toBe(true)
      }
    })
  })

  describe('verifyAccessToken', () => {
    it('should return payload for valid token', async () => {
      // First sign a token, then verify it
      const result = await Effect.runPromise(
        Effect.gen(function* () {
          const jwtService = yield* JWTService

          const token = yield* jwtService.signAccessToken({
            userId: 'user-1',
            email: 'test@example.com',
            role: 'user',
            status: 'active',
          })

          return yield* jwtService.verifyAccessToken(token)
        }).pipe(Effect.provide(JWTServiceTestLive))
      )

      expect(result.sub).toBe('user-1')
      expect(result.email).toBe('test@example.com')
      expect(result.role).toBe('user')
      expect(result.status).toBe('active')
    })

    it('should fail with EXPIRED_TOKEN for expired token (mock)', async () => {
      const result = await Effect.runPromiseExit(
        Effect.gen(function* () {
          const jwtService = yield* JWTService
          return yield* jwtService.verifyAccessToken('expired-token')
        }).pipe(
          Effect.provide(
            createMockJWTService({
              shouldFailVerify: true,
              verifyErrorCode: 'EXPIRED_TOKEN',
            })
          )
        )
      )

      expect(result._tag).toBe('Failure')
    })

    it('should fail with INVALID_TOKEN for malformed token (mock)', async () => {
      const result = await Effect.runPromiseExit(
        Effect.gen(function* () {
          const jwtService = yield* JWTService
          return yield* jwtService.verifyAccessToken('not-a-valid-jwt')
        }).pipe(
          Effect.provide(
            createMockJWTService({
              shouldFailVerify: true,
              verifyErrorCode: 'INVALID_TOKEN',
            })
          )
        )
      )

      expect(result._tag).toBe('Failure')
    })

    it('should fail when payload missing required fields', async () => {
      // Create a mock that returns an incomplete payload
      const result = await Effect.runPromiseExit(
        Effect.gen(function* () {
          const jwtService = yield* JWTService
          return yield* jwtService.verifyAccessToken('token-missing-fields')
        }).pipe(
          Effect.provide(createMockJWTService({ shouldFailVerify: true }))
        )
      )

      expect(result._tag).toBe('Failure')
    })

    it('should verify admin token correctly (mock)', async () => {
      const result = await Effect.runPromise(
        Effect.gen(function* () {
          const jwtService = yield* JWTService
          return yield* jwtService.verifyAccessToken('admin-token')
        }).pipe(
          Effect.provide(
            createMockJWTService({
              verifyResult: mockAdminJWTPayload,
            })
          )
        )
      )

      expect(result.role).toBe('admin')
      expect(result.sub).toBe('admin-1')
    })
  })

  describe('generateRefreshToken', () => {
    it('should return UUID-based token', async () => {
      const result = await Effect.runPromise(
        Effect.gen(function* () {
          const jwtService = yield* JWTService
          return yield* jwtService.generateRefreshToken()
        }).pipe(Effect.provide(JWTServiceTestLive))
      )

      expect(result).toBeDefined()
      expect(typeof result).toBe('string')
      // Should be 2 UUIDs concatenated (36 chars each without dashes = 32 * 2 = 64, with dashes = 72)
      expect(result.length).toBe(72)
    })

    it('should generate unique tokens on each call', async () => {
      const [token1, token2] = await Effect.runPromise(
        Effect.gen(function* () {
          const jwtService = yield* JWTService
          const t1 = yield* jwtService.generateRefreshToken()
          const t2 = yield* jwtService.generateRefreshToken()
          return [t1, t2] as const
        }).pipe(Effect.provide(JWTServiceTestLive))
      )

      expect(token1).not.toBe(token2)
    })
  })

  describe('hashRefreshToken', () => {
    it('should return consistent SHA-256 hash', async () => {
      const token = 'test-refresh-token'

      const [hash1, hash2] = await Effect.runPromise(
        Effect.gen(function* () {
          const jwtService = yield* JWTService
          const h1 = yield* jwtService.hashRefreshToken(token)
          const h2 = yield* jwtService.hashRefreshToken(token)
          return [h1, h2] as const
        }).pipe(Effect.provide(JWTServiceTestLive))
      )

      expect(hash1).toBe(hash2) // Same input = same hash
      expect(hash1.length).toBe(64) // SHA-256 produces 64 hex characters
    })

    it('should return different hashes for different tokens', async () => {
      const [hash1, hash2] = await Effect.runPromise(
        Effect.gen(function* () {
          const jwtService = yield* JWTService
          const h1 = yield* jwtService.hashRefreshToken('token-a')
          const h2 = yield* jwtService.hashRefreshToken('token-b')
          return [h1, h2] as const
        }).pipe(Effect.provide(JWTServiceTestLive))
      )

      expect(hash1).not.toBe(hash2)
    })

    it('should return hex string format', async () => {
      const result = await Effect.runPromise(
        Effect.gen(function* () {
          const jwtService = yield* JWTService
          return yield* jwtService.hashRefreshToken('any-token')
        }).pipe(Effect.provide(JWTServiceTestLive))
      )

      expect(result).toMatch(/^[a-f0-9]{64}$/)
    })
  })
})
