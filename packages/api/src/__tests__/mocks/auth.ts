import { HttpServerRequest } from '@effect/platform'
import { Auth } from '@lily/api/services/auth/auth'
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

interface MockAuthClient {
  api: {
    signInMagicLink: (args: {
      body: { email: string; callbackURL: string }
      headers: unknown
    }) => Promise<{ message: string }>
    magicLinkVerify: (args: {
      query: { token: string; callbackURL: string; errorCallbackURL: string }
      headers: unknown
    }) => Promise<{ token: string; user: UserProfile }>
    sendVerificationEmail: (args: {
      body: { email: string }
      headers: unknown
    }) => Promise<{ status: boolean }>
    verifyEmail: (args: {
      query: { token: string }
      headers: unknown
    }) => Promise<{ user: UserProfile | null }>
  }
}

type AuthService = {
  readonly client: Effect.Effect<MockAuthClient>
  readonly session: Effect.Effect<MockSession | null>
}

export interface MockAuthOptions {
  session?: MockSession | null
  magicLinkResponse?: { message: string }
  verifyResponse?: { token: string; user: UserProfile }
  sendVerificationEmailResponse?: { status: boolean }
  verifyEmailResponse?: { user: UserProfile | null }
  sendVerificationEmailError?: boolean
  verifyEmailError?: boolean
}

export const createMockAuth = (
  sessionOrOptions: MockSession | null | MockAuthOptions
): Layer.Layer<Auth> => {
  // Handle backwards compatibility
  const options: MockAuthOptions =
    sessionOrOptions === null ||
    ('user' in (sessionOrOptions ?? {}) &&
      'session' in (sessionOrOptions ?? {}))
      ? { session: sessionOrOptions as MockSession | null }
      : (sessionOrOptions as MockAuthOptions)

  const mockClient: MockAuthClient = {
    api: {
      signInMagicLink: async () =>
        options.magicLinkResponse ?? { message: 'Magic link sent' },
      magicLinkVerify: async () =>
        options.verifyResponse ?? {
          token: 'mock-token',
          user: {
            id: 'user-1',
            name: 'Test User',
            email: 'test@example.com',
            username: 'testuser',
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        },
      sendVerificationEmail: async () => {
        if (options.sendVerificationEmailError) {
          throw new Error('Failed to send verification email')
        }
        return options.sendVerificationEmailResponse ?? { status: true }
      },
      verifyEmail: async () => {
        if (options.verifyEmailError) {
          throw new Error('Invalid or expired verification token')
        }
        return (
          options.verifyEmailResponse ?? {
            user: {
              id: 'user-1',
              name: 'Test User',
              email: 'test@example.com',
              username: 'testuser',
              createdAt: new Date(),
              updatedAt: new Date(),
            },
          }
        )
      },
    },
  }

  const mockService: AuthService = {
    client: Effect.succeed(mockClient),
    session: Effect.succeed(options.session ?? null),
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
