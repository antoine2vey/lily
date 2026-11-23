import { UserRole, UserStatus } from '@lily/shared'
import {
  Array,
  Config,
  Context,
  Effect,
  Layer,
  pipe,
  Redacted,
  Schema,
} from 'effect'
import * as jose from 'jose'
import { JWTError } from './errors'

const JWTPayloadSchema = Schema.Struct({
  sub: Schema.String,
  email: Schema.String,
  role: UserRole,
  status: UserStatus,
})

export type JWTPayload = typeof JWTPayloadSchema.Type

export interface SignAccessTokenInput {
  userId: string
  email: string
  role: UserRole
  status: UserStatus
}

const JWTConfig = Config.all({
  secret: Config.Redacted('JWT_SECRET'),
  issuer: Config.withDefault(Config.String('JWT_ISSUER'), 'lily-api'),
  accessTokenExpiry: Config.withDefault(
    Config.String('JWT_ACCESS_TOKEN_EXPIRY'),
    '15m'
  ),
})

export interface IJWTService {
  readonly signAccessToken: (
    input: SignAccessTokenInput
  ) => Effect.Effect<string, JWTError>
  readonly verifyAccessToken: (
    token: string
  ) => Effect.Effect<JWTPayload, JWTError>
  readonly generateRefreshToken: Effect.Effect<string, never>
  readonly hashRefreshToken: (token: string) => Effect.Effect<string, never>
}

export class JWTService extends Context.Service<JWTService, IJWTService>()(
  'JWTService'
) {}

export const JWTServiceLive = Layer.effect(
  JWTService,
  Effect.gen(function* () {
    const config = yield* JWTConfig

    const secretValue = Redacted.value(config.secret)
    const secretBytes = new TextEncoder().encode(secretValue)

    return {
      signAccessToken: Effect.fn('JWTService.signAccessToken')(function* (
        input: SignAccessTokenInput
      ) {
        const token = yield* Effect.tryPromise({
          try: () =>
            new jose.SignJWT({
              sub: input.userId,
              email: input.email,
              role: input.role,
              status: input.status,
            })
              .setProtectedHeader({ alg: 'HS256' })
              .setIssuedAt()
              .setIssuer(config.issuer)
              .setExpirationTime(config.accessTokenExpiry)
              .sign(secretBytes),
          catch: (error) =>
            new JWTError({
              message: `Failed to sign token: ${String(error)}`,
              code: 'INVALID_TOKEN',
            }),
        })

        return token
      }),

      verifyAccessToken: Effect.fn('JWTService.verifyAccessToken')(function* (
        token: string
      ) {
        const result = yield* Effect.tryPromise({
          try: () =>
            jose.jwtVerify(token, secretBytes, {
              issuer: config.issuer,
            }),
          catch: (error) => {
            if (error instanceof jose.errors.JWTExpired) {
              return new JWTError({
                message: 'Token has expired',
                code: 'EXPIRED_TOKEN',
              })
            }
            return new JWTError({
              message: 'Invalid token',
              code: 'INVALID_TOKEN',
            })
          },
        })

        return yield* Schema.decodeUnknownEffect(JWTPayloadSchema)(
          result.payload
        ).pipe(
          Effect.mapError(
            () =>
              new JWTError({
                message: 'Token payload missing required fields',
                code: 'INVALID_TOKEN',
              })
          )
        )
      }),

      generateRefreshToken: Effect.sync(() => {
        // 244 bits of entropy (2 UUIDs concatenated)
        return `${crypto.randomUUID()}${crypto.randomUUID()}`
      }).pipe(Effect.withSpan('JWTService.generateRefreshToken')),

      hashRefreshToken: Effect.fn('JWTService.hashRefreshToken')(function* (
        token: string
      ) {
        const encoder = new TextEncoder()
        const data = encoder.encode(token)
        const hashBuffer = yield* Effect.promise(() =>
          crypto.subtle.digest('SHA-256', data)
        )
        const hashArray = [...new Uint8Array(hashBuffer)]
        const hashHex = pipe(
          Array.map(hashArray, (b) => b.toString(16).padStart(2, '0')),
          Array.join('')
        )
        return hashHex
      }),
    }
  })
)
