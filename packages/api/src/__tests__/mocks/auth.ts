import { HttpServerRequest } from '@effect/platform'
import { Auth } from '@lily/api/services/auth/auth'
import type { UserProfile } from '@lily/shared/auth'
import { Effect, Layer, Option, pipe } from 'effect'

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
  const emptyObj = {}
  const options: MockAuthOptions =
    sessionOrOptions === null ||
    ('user' in
      pipe(
        Option.fromNullable(sessionOrOptions),
        Option.getOrElse(() => emptyObj)
      ) &&
      'session' in
        pipe(
          Option.fromNullable(sessionOrOptions),
          Option.getOrElse(() => emptyObj)
        ))
      ? { session: sessionOrOptions as MockSession | null }
      : (sessionOrOptions as MockAuthOptions)

  const mockClient: MockAuthClient = {
    api: {
      signInMagicLink: async () =>
        pipe(
          Option.fromNullable(options.magicLinkResponse),
          Option.getOrElse(() => ({ message: 'Magic link sent' }))
        ),
      magicLinkVerify: async () =>
        pipe(
          Option.fromNullable(options.verifyResponse),
          Option.getOrElse(() => ({
            token: 'mock-token',
            user: {
              id: 'user-1',
              name: 'Test User',
              email: 'test@example.com',
              username: 'testuser',
              createdAt: new Date(),
              updatedAt: new Date(),
              role: 'user' as const,
              status: 'active' as const,
            },
          }))
        ),
      sendVerificationEmail: async () => {
        if (options.sendVerificationEmailError) {
          throw new Error('Failed to send verification email')
        }
        return pipe(
          Option.fromNullable(options.sendVerificationEmailResponse),
          Option.getOrElse(() => ({ status: true }))
        )
      },
      verifyEmail: async () => {
        if (options.verifyEmailError) {
          throw new Error('Invalid or expired verification token')
        }
        return pipe(
          Option.fromNullable(options.verifyEmailResponse),
          Option.getOrElse(() => ({
            user: {
              id: 'user-1',
              name: 'Test User',
              email: 'test@example.com',
              username: 'testuser',
              createdAt: new Date(),
              updatedAt: new Date(),
              role: 'user' as const,
              status: 'active' as const,
            },
          }))
        )
      },
    },
  }

  const mockService: AuthService = {
    client: Effect.succeed(mockClient),
    session: Effect.succeed(
      pipe(Option.fromNullable(options.session), Option.getOrNull)
    ),
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
