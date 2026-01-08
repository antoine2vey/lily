import { mock } from 'bun:test'
import { HttpServerRequest } from '@effect/platform'
import { signOut } from '@lily/api/services/auth/endpoints/sign-out'
import { Effect, Layer } from 'effect'
import { describe, expect, it } from 'vitest'

// Mock the auth module using Bun's mock
mock.module('@lily/api/services/auth/auth', () => ({
  auth: {
    api: {
      signOut: mock(() => Promise.resolve({})),
    },
  },
}))

const createMockHttpServerRequest =
  (): Layer.Layer<HttpServerRequest.HttpServerRequest> => {
    const mockRequest = {
      headers: {
        cookie: 'session_token=test-token',
      },
      method: 'POST',
      url: 'http://localhost:3000/auth/sign-out',
    } as unknown as HttpServerRequest.HttpServerRequest

    return Layer.succeed(HttpServerRequest.HttpServerRequest, mockRequest)
  }

describe('signOut', () => {
  it('should return success message when sign out succeeds', async () => {
    const result = await Effect.runPromise(
      signOut().pipe(Effect.provide(createMockHttpServerRequest()))
    )

    expect(result.message).toBe('Successfully signed out')
  })

  it('should return object with message property', async () => {
    const result = await Effect.runPromise(
      signOut().pipe(Effect.provide(createMockHttpServerRequest()))
    )

    expect(result).toHaveProperty('message')
    expect(typeof result.message).toBe('string')
  })
})
