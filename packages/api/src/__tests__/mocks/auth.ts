import { HttpServerRequest } from '@effect/platform'
import { Auth } from '@lily/db/lib/auth'
import type { UserProfile } from '@lily/shared/auth'
import { Effect, Layer } from 'effect'

interface MockSession {
  user: UserProfile
  session: {
    id: string
    userId: string
    expiresAt: Date
  }
}

type AuthService = {
  readonly client: Effect.Effect<unknown>
  readonly session: Effect.Effect<MockSession | null>
}

export const createMockAuth = (
  session: MockSession | null
): Layer.Layer<Auth> => {
  const mockService: AuthService = {
    client: Effect.succeed({}),
    session: Effect.succeed(session),
  }

  return Layer.succeed(Auth, mockService as unknown as typeof Auth.Service)
}

export const createMockHttpServerRequest =
  (): Layer.Layer<HttpServerRequest.HttpServerRequest> => {
    const mockRequest = {
      headers: {
        'content-type': 'application/json',
      },
      method: 'GET',
      url: 'http://localhost:3000/test',
    } as unknown as HttpServerRequest.HttpServerRequest

    return Layer.succeed(HttpServerRequest.HttpServerRequest, mockRequest)
  }
