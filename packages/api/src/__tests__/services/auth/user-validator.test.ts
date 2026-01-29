import { createMockJWTService } from '@lily/api/__tests__/mocks/jwt.service'
import { createMockUserRepository } from '@lily/api/__tests__/mocks/user.repository'
import { validateUserFromToken } from '@lily/api/services/auth/user-validator'
import type { User } from '@lily/shared'
import { Effect, Exit, Layer, Redacted } from 'effect'
import { describe, expect, it } from 'vitest'

// Test fixtures
const mockUser: User = {
  id: 'user-123',
  email: 'test@example.com',
  name: 'Test User',
  emailVerified: true,
  image: null,
  bio: null,
  careReminders: true,
  weeklyDigest: true,
  achievementNotifications: true,
  tips: true,
  productUpdates: false,
  ads: false,
  doNotDisturb: false,
  doNotDisturbStart: '22:00',
  doNotDisturbEnd: '07:00',
  historyViewCount: 0,
  role: 'user',
  status: 'active',
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-15'),
  timezone: 'UTC',
  preferredNotificationTime: '09:00',
  publicProfile: true,
  shareGrowthData: true,
  personalizedTips: true,
}

const adminUser: User = {
  ...mockUser,
  id: 'admin-123',
  email: 'admin@example.com',
  role: 'admin',
}

const suspendedUser: User = {
  ...mockUser,
  id: 'suspended-123',
  email: 'suspended@example.com',
  status: 'suspended',
}

// Custom error class for testing
class TestAuthError extends Error {
  constructor(public readonly message: string) {
    super(message)
    this.name = 'TestAuthError'
  }
}

describe('validateUserFromToken', () => {
  describe('successful validation', () => {
    it('should validate and return user profile for active user', async () => {
      const mockLayers = Layer.merge(
        createMockJWTService({
          verifyResult: {
            sub: 'user-123',
            email: 'test@example.com',
            role: 'user',
            status: 'active',
          },
        }),
        createMockUserRepository([mockUser])
      )

      const result = await Effect.runPromise(
        validateUserFromToken({
          token: Redacted.make('valid-token'),
          createError: (msg) => new TestAuthError(msg),
        }).pipe(Effect.provide(mockLayers))
      )

      expect(result.user.id).toBe('user-123')
      expect(result.profile.id).toBe('user-123')
      expect(result.profile.email).toBe('test@example.com')
      expect(result.profile.role).toBe('user')
      expect(result.profile.status).toBe('active')
    })

    it('should validate admin user when requireAdmin is true', async () => {
      const mockLayers = Layer.merge(
        createMockJWTService({
          verifyResult: {
            sub: 'admin-123',
            email: 'admin@example.com',
            role: 'admin',
            status: 'active',
          },
        }),
        createMockUserRepository([adminUser])
      )

      const result = await Effect.runPromise(
        validateUserFromToken({
          token: Redacted.make('admin-token'),
          createError: (msg) => new TestAuthError(msg),
          requireAdmin: true,
        }).pipe(Effect.provide(mockLayers))
      )

      expect(result.profile.role).toBe('admin')
    })

    it('should return user profile with correct shape', async () => {
      const mockLayers = Layer.merge(
        createMockJWTService({
          verifyResult: {
            sub: 'user-123',
            email: 'test@example.com',
            role: 'user',
            status: 'active',
          },
        }),
        createMockUserRepository([mockUser])
      )

      const result = await Effect.runPromise(
        validateUserFromToken({
          token: Redacted.make('valid-token'),
          createError: (msg) => new TestAuthError(msg),
        }).pipe(Effect.provide(mockLayers))
      )

      // Verify profile has all expected fields
      expect(result.profile).toHaveProperty('id')
      expect(result.profile).toHaveProperty('email')
      expect(result.profile).toHaveProperty('name')
      expect(result.profile).toHaveProperty('createdAt')
      expect(result.profile).toHaveProperty('updatedAt')
      expect(result.profile).toHaveProperty('role')
      expect(result.profile).toHaveProperty('status')
    })
  })

  describe('token validation failures', () => {
    it('should fail when JWT verification fails', async () => {
      const mockLayers = Layer.merge(
        createMockJWTService({
          shouldFailVerify: true,
          verifyErrorCode: 'INVALID_TOKEN',
        }),
        createMockUserRepository([mockUser])
      )

      const result = await Effect.runPromiseExit(
        validateUserFromToken({
          token: Redacted.make('invalid-token'),
          createError: (msg) => new TestAuthError(msg),
        }).pipe(Effect.provide(mockLayers))
      )

      expect(Exit.isFailure(result)).toBe(true)
    })

    it('should fail when token is expired', async () => {
      const mockLayers = Layer.merge(
        createMockJWTService({
          shouldFailVerify: true,
          verifyErrorCode: 'EXPIRED_TOKEN',
        }),
        createMockUserRepository([mockUser])
      )

      const result = await Effect.runPromiseExit(
        validateUserFromToken({
          token: Redacted.make('expired-token'),
          createError: (msg) => new TestAuthError(msg),
        }).pipe(Effect.provide(mockLayers))
      )

      expect(Exit.isFailure(result)).toBe(true)
    })
  })

  describe('user status validation', () => {
    it('should fail when JWT payload has suspended status', async () => {
      const mockLayers = Layer.merge(
        createMockJWTService({
          verifyResult: {
            sub: 'user-123',
            email: 'test@example.com',
            role: 'user',
            status: 'suspended',
          },
        }),
        createMockUserRepository([mockUser])
      )

      const result = await Effect.runPromiseExit(
        validateUserFromToken({
          token: Redacted.make('valid-token'),
          createError: (msg) => new TestAuthError(msg),
        }).pipe(Effect.provide(mockLayers))
      )

      expect(Exit.isFailure(result)).toBe(true)
      if (Exit.isFailure(result) && result.cause._tag === 'Fail') {
        expect(result.cause.error.message).toContain('suspended')
      }
    })

    it('should fail when user in DB has suspended status', async () => {
      const mockLayers = Layer.merge(
        createMockJWTService({
          verifyResult: {
            sub: 'suspended-123',
            email: 'suspended@example.com',
            role: 'user',
            status: 'active', // Token says active but DB says suspended
          },
        }),
        createMockUserRepository([suspendedUser])
      )

      const result = await Effect.runPromiseExit(
        validateUserFromToken({
          token: Redacted.make('valid-token'),
          createError: (msg) => new TestAuthError(msg),
        }).pipe(Effect.provide(mockLayers))
      )

      expect(Exit.isFailure(result)).toBe(true)
      if (Exit.isFailure(result) && result.cause._tag === 'Fail') {
        expect(result.cause.error.message).toContain('suspended')
      }
    })
  })

  describe('user existence validation', () => {
    it('should fail when user not found in database', async () => {
      const mockLayers = Layer.merge(
        createMockJWTService({
          verifyResult: {
            sub: 'nonexistent-user',
            email: 'ghost@example.com',
            role: 'user',
            status: 'active',
          },
        }),
        createMockUserRepository([mockUser]) // User with different ID
      )

      const result = await Effect.runPromiseExit(
        validateUserFromToken({
          token: Redacted.make('valid-token'),
          createError: (msg) => new TestAuthError(msg),
        }).pipe(Effect.provide(mockLayers))
      )

      expect(Exit.isFailure(result)).toBe(true)
      if (Exit.isFailure(result) && result.cause._tag === 'Fail') {
        expect(result.cause.error.message).toContain('User not found')
      }
    })
  })

  describe('admin validation', () => {
    it('should fail when requireAdmin but JWT role is not admin', async () => {
      const mockLayers = Layer.merge(
        createMockJWTService({
          verifyResult: {
            sub: 'user-123',
            email: 'test@example.com',
            role: 'user', // Regular user, not admin
            status: 'active',
          },
        }),
        createMockUserRepository([mockUser])
      )

      const result = await Effect.runPromiseExit(
        validateUserFromToken({
          token: Redacted.make('valid-token'),
          createError: (msg) => new TestAuthError(msg),
          requireAdmin: true,
        }).pipe(Effect.provide(mockLayers))
      )

      expect(Exit.isFailure(result)).toBe(true)
      if (Exit.isFailure(result) && result.cause._tag === 'Fail') {
        expect(result.cause.error.message).toContain('Admin access required')
      }
    })

    it('should fail when requireAdmin but DB role is not admin', async () => {
      const mockLayers = Layer.merge(
        createMockJWTService({
          verifyResult: {
            sub: 'user-123',
            email: 'test@example.com',
            role: 'admin', // Token says admin, but DB says user
            status: 'active',
          },
        }),
        createMockUserRepository([mockUser]) // User has role 'user' in DB
      )

      const result = await Effect.runPromiseExit(
        validateUserFromToken({
          token: Redacted.make('valid-token'),
          createError: (msg) => new TestAuthError(msg),
          requireAdmin: true,
        }).pipe(Effect.provide(mockLayers))
      )

      expect(Exit.isFailure(result)).toBe(true)
      if (Exit.isFailure(result) && result.cause._tag === 'Fail') {
        expect(result.cause.error.message).toContain('Admin access required')
      }
    })
  })
})
