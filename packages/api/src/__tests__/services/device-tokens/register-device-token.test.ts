import { mockDeviceTokens } from '@lily/api/__tests__/fixtures/device-tokens'
import { createMockDeviceTokenRepository } from '@lily/api/__tests__/mocks/device-token.repository'
import { createMockCurrentUser } from '@lily/api/__tests__/mocks/session'
import { DeviceTokenRepository } from '@lily/api/repositories/device-token.repository'
import { registerDeviceToken } from '@lily/api/services/device-tokens/endpoints/register-device-token'
import { Effect, Layer } from 'effect'
import { describe, expect, it } from 'vitest'

describe('registerDeviceToken', () => {
  const createTestLayer = (userId: string = 'user-1') =>
    Layer.mergeAll(
      createMockDeviceTokenRepository([...mockDeviceTokens]),
      createMockCurrentUser({ id: userId })
    )

  it('inserts a new device token when none exists', async () => {
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

  it('reactivates the same row when same user re-registers', async () => {
    const layer = createTestLayer('user-1')
    const result = await Effect.runPromise(
      registerDeviceToken({
        token: 'expo-push-token-123',
        platform: 'ios',
      }).pipe(Effect.provide(layer))
    )

    expect(result.token).toBe('expo-push-token-123')
    expect(result.id).toBe('token-1')
    expect(result.isActive).toBe(true)

    // Idempotent: registering twice still returns the same row id
    const second = await Effect.runPromise(
      registerDeviceToken({
        token: 'expo-push-token-123',
        platform: 'ios',
      }).pipe(Effect.provide(layer))
    )
    expect(second.id).toBe('token-1')
  })

  it('flips isActive back to true when re-registering an inactive token', async () => {
    const firstToken = mockDeviceTokens[0]
    if (!firstToken) throw new Error('Test setup: missing mock token')
    const layer = Layer.mergeAll(
      createMockDeviceTokenRepository([{ ...firstToken, isActive: false }]),
      createMockCurrentUser({ id: 'user-1' })
    )

    const result = await Effect.runPromise(
      registerDeviceToken({
        token: 'expo-push-token-123',
        platform: 'ios',
      }).pipe(Effect.provide(layer))
    )

    expect(result.isActive).toBe(true)
  })

  it('reassigns existing token to current user (sign-out + sign-in on same device)', async () => {
    // 'expo-push-token-123' currently belongs to user-1 in the fixture; user-3 claims it.
    const layer = createTestLayer('user-3')
    const result = await Effect.runPromise(
      registerDeviceToken({
        token: 'expo-push-token-123',
        platform: 'ios',
      }).pipe(Effect.provide(layer))
    )

    // Same row id (reassigned, not duplicated — Postgres unique constraint preserved)
    expect(result.id).toBe('token-1')
    expect(result.userId).toBe('user-3')
    expect(result.isActive).toBe(true)
  })

  it('reassignment leaves the previous user with no claim to this device', async () => {
    const layer = createTestLayer('user-3')

    await Effect.runPromise(
      registerDeviceToken({
        token: 'expo-push-token-123',
        platform: 'ios',
      }).pipe(Effect.provide(layer))
    )

    // Verify by querying the repo: user-1 no longer owns this token
    const remaining = await Effect.runPromise(
      Effect.gen(function* () {
        const repo = yield* DeviceTokenRepository
        return yield* repo.findByUserId('user-1')
      }).pipe(Effect.provide(layer))
    )
    expect(
      remaining.find((t) => t.token === 'expo-push-token-123')
    ).toBeUndefined()
  })

  it('updates platform when reassigning', async () => {
    // Device might literally swap (iOS user signs out, new owner is on Android variant)
    const layer = createTestLayer('user-3')
    const result = await Effect.runPromise(
      registerDeviceToken({
        token: 'expo-push-token-123',
        platform: 'android',
      }).pipe(Effect.provide(layer))
    )
    expect(result.platform).toBe('android')
    expect(result.id).toBe('token-1')
  })

  it('supports android platform on first registration', async () => {
    const result = await Effect.runPromise(
      registerDeviceToken({
        token: 'android-token',
        platform: 'android',
      }).pipe(Effect.provide(createTestLayer()))
    )

    expect(result.platform).toBe('android')
  })

  it('supports web platform on first registration', async () => {
    const result = await Effect.runPromise(
      registerDeviceToken({
        token: 'web-token',
        platform: 'web',
      }).pipe(Effect.provide(createTestLayer()))
    )

    expect(result.platform).toBe('web')
  })

  it('handles very long token strings', async () => {
    const longToken = 'a'.repeat(500)
    const result = await Effect.runPromise(
      registerDeviceToken({
        token: longToken,
        platform: 'ios',
      }).pipe(Effect.provide(createTestLayer()))
    )
    expect(result.token).toBe(longToken)
  })

  it('sets isActive to true for newly created tokens', async () => {
    const result = await Effect.runPromise(
      registerDeviceToken({
        token: 'brand-new-token',
        platform: 'android',
      }).pipe(Effect.provide(createTestLayer()))
    )
    expect(result.isActive).toBe(true)
    expect(result.platform).toBe('android')
  })
})
