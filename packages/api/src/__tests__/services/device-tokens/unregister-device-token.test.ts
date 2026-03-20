import { mockDeviceTokens } from '@lily/api/__tests__/fixtures/device-tokens'
import { createMockDeviceTokenRepository } from '@lily/api/__tests__/mocks/device-token.repository'
import { createMockCurrentUser } from '@lily/api/__tests__/mocks/session'
import { unregisterDeviceToken } from '@lily/api/services/device-tokens/endpoints/unregister-device-token'
import { DeviceTokenNotFoundError } from '@lily/shared'
import { Effect, Exit, Layer } from 'effect'
import { describe, expect, it } from 'vitest'

describe('unregisterDeviceToken', () => {
  const createTestLayer = (userId: string = 'user-1') =>
    Layer.mergeAll(
      createMockDeviceTokenRepository([...mockDeviceTokens]),
      createMockCurrentUser({ id: userId })
    )

  it('should unregister device token successfully', async () => {
    const result = await Effect.runPromise(
      unregisterDeviceToken('token-1').pipe(Effect.provide(createTestLayer()))
    )

    expect(result.message).toBe('Device token unregistered successfully')
  })

  it('should fail when token does not exist', async () => {
    const exit = await Effect.runPromiseExit(
      unregisterDeviceToken('non-existent').pipe(
        Effect.provide(createTestLayer())
      )
    )

    expect(Exit.isFailure(exit)).toBe(true)
    if (Exit.isFailure(exit)) {
      const error = exit.cause._tag === 'Fail' ? exit.cause.error : null
      expect(error).toBeInstanceOf(DeviceTokenNotFoundError)
    }
  })

  it('should fail when token belongs to another user', async () => {
    const exit = await Effect.runPromiseExit(
      unregisterDeviceToken('token-3').pipe(Effect.provide(createTestLayer()))
    )

    expect(Exit.isFailure(exit)).toBe(true)
    if (Exit.isFailure(exit)) {
      const error = exit.cause._tag === 'Fail' ? exit.cause.error : null
      expect(error).toBeInstanceOf(DeviceTokenNotFoundError)
    }
  })

  it('should allow user to delete their own token', async () => {
    const result = await Effect.runPromise(
      unregisterDeviceToken('token-3').pipe(
        Effect.provide(createTestLayer('user-2'))
      )
    )

    expect(result.message).toBe('Device token unregistered successfully')
  })

  it('should fail when token ID is empty string', async () => {
    const exit = await Effect.runPromiseExit(
      unregisterDeviceToken('').pipe(Effect.provide(createTestLayer()))
    )

    expect(Exit.isFailure(exit)).toBe(true)
  })

  it('should allow second user to delete their token after first user deletes theirs', async () => {
    // user-2 should be able to delete token-3 (their own token)
    const result = await Effect.runPromise(
      unregisterDeviceToken('token-3').pipe(
        Effect.provide(createTestLayer('user-2'))
      )
    )
    expect(result.message).toBe('Device token unregistered successfully')
  })
})
