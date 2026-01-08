import { mockDeviceTokens } from '@lily/api/__tests__/fixtures/device-tokens'
import { createMockDeviceTokenRepository } from '@lily/api/__tests__/mocks/device-token.repository'
import { createMockSession } from '@lily/api/__tests__/mocks/session'
import { registerDeviceToken } from '@lily/api/services/device-tokens/endpoints/register-device-token'
import { Effect, Layer } from 'effect'
import { describe, expect, it } from 'vitest'

describe('registerDeviceToken', () => {
  const createTestLayer = (userId: string = 'user-1') =>
    Layer.mergeAll(
      createMockDeviceTokenRepository([...mockDeviceTokens]),
      createMockSession({ userId })
    )

  it('should create a new device token', async () => {
    const result = await Effect.runPromise(
      registerDeviceToken({
        token: 'new-expo-token',
        platform: 'ios',
      }).pipe(Effect.provide(createTestLayer()))
    )

    expect(result.token).toBe('new-expo-token')
    expect(result.platform).toBe('ios')
    expect(result.userId).toBe('user-1')
    expect(result.isActive).toBe(true)
  })

  it('should return existing token if already registered', async () => {
    const result = await Effect.runPromise(
      registerDeviceToken({
        token: 'expo-push-token-123',
        platform: 'ios',
      }).pipe(Effect.provide(createTestLayer()))
    )

    expect(result.token).toBe('expo-push-token-123')
    expect(result.id).toBe('token-1')
    expect(result.isActive).toBe(true)
  })

  it('should update isActive to true when re-registering', async () => {
    const firstToken = mockDeviceTokens[0]
    if (!firstToken) throw new Error('Test setup: missing mock token')
    const tokens = [
      {
        ...firstToken,
        isActive: false,
      },
    ]

    const result = await Effect.runPromise(
      registerDeviceToken({
        token: 'expo-push-token-123',
        platform: 'ios',
      }).pipe(
        Effect.provide(
          Layer.mergeAll(
            createMockDeviceTokenRepository(tokens),
            createMockSession({ userId: 'user-1' })
          )
        )
      )
    )

    expect(result.isActive).toBe(true)
  })

  it('should create new token for different user', async () => {
    const result = await Effect.runPromise(
      registerDeviceToken({
        token: 'expo-push-token-123',
        platform: 'ios',
      }).pipe(Effect.provide(createTestLayer('user-3')))
    )

    expect(result.token).toBe('expo-push-token-123')
    expect(result.userId).toBe('user-3')
    expect(result.id).not.toBe('token-1')
  })

  it('should support android platform', async () => {
    const result = await Effect.runPromise(
      registerDeviceToken({
        token: 'android-token',
        platform: 'android',
      }).pipe(Effect.provide(createTestLayer()))
    )

    expect(result.platform).toBe('android')
  })

  it('should support web platform', async () => {
    const result = await Effect.runPromise(
      registerDeviceToken({
        token: 'web-token',
        platform: 'web',
      }).pipe(Effect.provide(createTestLayer()))
    )

    expect(result.platform).toBe('web')
  })
})
