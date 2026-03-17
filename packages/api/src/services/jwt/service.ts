import { UserRole, UserStatus } from '@lily/shared'
import {
  Array,
  Config,
  Context,
  Effect,
  Layer,
  Option,
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

/**
 * JWT payload structure - minimal claims
 */
export type JWTPayload = typeof JWTPayloadSchema.Type

/**
 * Input for signing access tokens
 */
export interface SignAccessTokenInput {
  userId: string
  email: string
  role: typeof UserRole.Type
  status: typeof UserStatus.Type
}

/**
 * JWT Service configuration
 */
const JWTConfig = Config.all({
  secret: Config.redacted('JWT_SECRET'),
  issuer: Config.withDefault(Config.string('JWT_ISSUER'), 'lily-api'),
  accessTokenExpiry: Config.withDefault(
    Config.string('JWT_ACCESS_TOKEN_EXPIRY'),
    '15m'
  ),
})

/**
 * JWT Service interface
 */
export interface IJWTService {
  readonly signAccessToken: (
    input: SignAccessTokenInput
  ) => Effect.Effect<string, JWTError>
  readonly verifyAccessToken: (
    token: string
  ) => Effect.Effect<JWTPayload, JWTError>
  readonly generateRefreshToken: () => Effect.Effect<string, never>
  readonly hashRefreshToken: (token: string) => Effect.Effect<string, never>
}

/**
 * JWT Service context tag
 */
export class JWTService extends Context.Tag('JWTService')<
  JWTService,
  IJWTService
>() {}

/**
 * Live implementation of JWT Service
 */
export const JWTServiceLive = Layer.effect(
  JWTService,
  Effect.gen(function* () {
    const config = yield* JWTConfig

    const secretValue = Redacted.value(config.secret)
    const secretBytes = new TextEncoder().encode(secretValue)

    return {
      signAccessToken: (input: SignAccessTokenInput) =>
        Effect.gen(function* () {
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
        }).pipe(Effect.withSpan('JWTService.signAccessToken')),

      verifyAccessToken: (token: string) =>
        Effect.gen(function* () {
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
                message: `Invalid token: ${String(error)}`,
                code: 'INVALID_TOKEN',
              })
            },
          })

          return yield* Effect.try({
            try: () =>
              Schema.decodeUnknownSync(JWTPayloadSchema)(result.payload),
            catch: () =>
              new JWTError({
                message: 'Token payload missing required fields',
                code: 'INVALID_TOKEN',
              }),
          })
        }).pipe(Effect.withSpan('JWTService.verifyAccessToken')),

      generateRefreshToken: () =>
        Effect.sync(() => {
          // 244 bits of entropy (2 UUIDs concatenated)
          return `${crypto.randomUUID()}${crypto.randomUUID()}`
        }).pipe(Effect.withSpan('JWTService.generateRefreshToken')),

      hashRefreshToken: (token: string) =>
        Effect.gen(function* () {
          const encoder = new TextEncoder()
          const data = encoder.encode(token)
          const hashBuffer = yield* Effect.promise(() =>
            crypto.subtle.digest('SHA-256', data)
          )
          const hashArray = [...new Uint8Array(hashBuffer)]
          // Convert to hex string
          const hashHex = pipe(
            Array.map(hashArray, (b) => b.toString(16).padStart(2, '0')),
            Array.join('')
          )
          return hashHex
        }).pipe(Effect.withSpan('JWTService.hashRefreshToken')),
    }
  })
)
