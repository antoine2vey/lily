import { JWTError } from '@lily/api/services/jwt/errors'
import {
  type IJWTService,
  type JWTPayload,
  JWTService,
} from '@lily/api/services/jwt/service'
import { Effect, Layer, Option, pipe } from 'effect'

export interface MockJWTServiceOptions {
  signedToken?: string
  verifyResult?: JWTPayload
  refreshToken?: string
  refreshTokenHash?: string
  shouldFailSign?: boolean
  shouldFailVerify?: boolean
  verifyErrorCode?: 'EXPIRED_TOKEN' | 'INVALID_TOKEN'
}

export const createMockJWTService = (
  options: MockJWTServiceOptions = {}
): Layer.Layer<JWTService> => {
  const defaultPayload: JWTPayload = {
    sub: 'user-1',
    email: 'test@example.com',
    role: 'user',
    status: 'active',
  }

  const service: IJWTService = {
    signAccessToken: (input) =>
      Effect.gen(function* () {
        if (options.shouldFailSign) {
          return yield* new JWTError({
            message: 'Failed to sign token',
            code: 'INVALID_TOKEN',
          })
        }

        return pipe(
          Option.fromNullable(options.signedToken),
          Option.getOrElse(() => `mock-jwt-${input.userId}`)
        )
      }),

    verifyAccessToken: (token) =>
      Effect.gen(function* () {
        if (options.shouldFailVerify) {
          const code = pipe(
            Option.fromNullable(options.verifyErrorCode),
            Option.getOrElse(() => 'INVALID_TOKEN' as const)
          )
          return yield* new JWTError({
            message:
              code === 'EXPIRED_TOKEN' ? 'Token has expired' : 'Invalid token',
            code,
          })
        }

        // Simulate basic token validation
        if (!token || token.length === 0) {
          return yield* new JWTError({
            message: 'Invalid token',
            code: 'INVALID_TOKEN',
          })
        }

        return pipe(
          Option.fromNullable(options.verifyResult),
          Option.getOrElse(() => defaultPayload)
        )
      }),

    generateRefreshToken: () =>
      Effect.succeed(
        pipe(
          Option.fromNullable(options.refreshToken),
          Option.getOrElse(() => `${crypto.randomUUID()}${crypto.randomUUID()}`)
        )
      ),

    hashRefreshToken: (_token) =>
      Effect.succeed(
        pipe(
          Option.fromNullable(options.refreshTokenHash),
          Option.getOrElse(
            () =>
              'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
          )
        )
      ),
  }

  return Layer.succeed(JWTService, service)
}
