import type { SqlError } from '@effect/sql/SqlError'
import {
  type AccessToken,
  type AuthorizationCode,
  type OAuthClient,
  OAuthRepository,
} from '@lily/mcp/auth/oauth-repository'
import {
  Array,
  Context,
  DateTime,
  Duration,
  Effect,
  Layer,
  Match,
  Option,
  pipe,
  Schema,
} from 'effect'

// ── Configuration ──────────────────────────────────────────────────────

const ACCESS_TOKEN_LIFETIME_MS = 3600 * 1000 // 1 hour
const REFRESH_TOKEN_LIFETIME_MS = 30 * 24 * 3600 * 1000 // 30 days
const AUTH_CODE_LIFETIME_MS = 10 * 60 * 1000 // 10 minutes

// ── Interface ──────────────────────────────────────────────────────────

export interface IOAuthService {
  /** Look up a registered client by ID */
  readonly getClient: (
    clientId: string
  ) => Effect.Effect<Option.Option<OAuthClient>, SqlError>

  /** Register a new dynamic OAuth client */
  readonly registerClient: (params: {
    readonly redirect_uris: readonly string[]
    readonly client_name?: string
    readonly client_uri?: string
    readonly logo_uri?: string
    readonly scope?: string
    readonly grant_types?: readonly string[]
    readonly response_types?: readonly string[]
    readonly token_endpoint_auth_method?: string
  }) => Effect.Effect<OAuthClient, SqlError>

  /** Create an authorization code for a user after consent */
  readonly createAuthorizationCode: (params: {
    readonly clientId: string
    readonly userId: string
    readonly redirectUri: string
    readonly codeChallenge: string
    readonly scopes: readonly string[]
    readonly state?: string
    readonly resource?: string
  }) => Effect.Effect<string, SqlError>

  /** Exchange an authorization code for access + refresh tokens */
  readonly exchangeAuthorizationCode: (params: {
    readonly code: string
    readonly clientId: string
    readonly codeVerifier: string
  }) => Effect.Effect<
    {
      readonly access_token: string
      readonly token_type: 'Bearer'
      readonly expires_in: number
      readonly scope: string
      readonly refresh_token: string
    },
    OAuthError | SqlError
  >

  /** Exchange a refresh token for a new access token */
  readonly refreshAccessToken: (params: {
    readonly refreshToken: string
    readonly clientId: string
  }) => Effect.Effect<
    {
      readonly access_token: string
      readonly token_type: 'Bearer'
      readonly expires_in: number
      readonly scope: string
      readonly refresh_token: string
    },
    OAuthError | SqlError
  >

  /** Revoke an access or refresh token */
  readonly revokeToken: (params: {
    readonly token: string
    readonly token_type_hint?: 'access_token' | 'refresh_token'
  }) => Effect.Effect<void, SqlError>

  /** Validate a bearer token. Returns userId + scopes if valid */
  readonly validateBearerToken: (
    token: string
  ) => Effect.Effect<
    { readonly userId: string; readonly scopes: readonly string[] },
    OAuthError | SqlError
  >
}

// ── Error ──────────────────────────────────────────────────────────────

export class OAuthError extends Schema.TaggedError<OAuthError>()('OAuthError', {
  error: Schema.String,
  error_description: Schema.String,
}) {}

// ── Context Tag ────────────────────────────────────────────────────────

export class OAuthService extends Context.Tag('OAuthService')<
  OAuthService,
  IOAuthService
>() {}

// ── Helpers ────────────────────────────────────────────────────────────

const generateToken = () => crypto.randomUUID()

/**
 * Verify PKCE S256 code challenge against code verifier.
 * challenge = BASE64URL(SHA256(verifier))
 */
const verifyPkceS256 = (
  codeVerifier: string,
  codeChallenge: string
): Effect.Effect<boolean> =>
  Effect.promise(async () => {
    const encoder = new TextEncoder()
    const data = encoder.encode(codeVerifier)
    const digest = await crypto.subtle.digest('SHA-256', data)
    const base64 = btoa(String.fromCharCode(...new Uint8Array(digest)))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '')
    return base64 === codeChallenge
  })

// ── Live Layer ─────────────────────────────────────────────────────────

export const OAuthServiceLive = Layer.effect(
  OAuthService,
  Effect.gen(function* () {
    const repo = yield* OAuthRepository

    return {
      getClient: (clientId) => repo.getClient(clientId),

      registerClient: (params) => repo.registerClient(params),

      createAuthorizationCode: (params) =>
        Effect.gen(function* () {
          const code = generateToken()
          const expiresAt = DateTime.toDateUtc(
            DateTime.addDuration(
              DateTime.unsafeNow(),
              Duration.millis(AUTH_CODE_LIFETIME_MS)
            )
          )

          yield* repo.saveAuthorizationCode({
            authorizationCode: code,
            clientId: params.clientId,
            userId: params.userId,
            redirectUri: params.redirectUri,
            codeChallenge: params.codeChallenge,
            scopes: params.scopes,
            expiresAt,
            ...(params.state != null ? { state: params.state } : {}),
            ...(params.resource != null ? { resource: params.resource } : {}),
          })

          return code
        }).pipe(Effect.withSpan('OAuthService.createAuthorizationCode')),

      exchangeAuthorizationCode: (params) =>
        Effect.gen(function* () {
          // Atomically consume the code (DELETE ... RETURNING) to prevent
          // TOCTOU race conditions where two concurrent requests exchange
          // the same code. Only the first caller receives the row.
          const maybeCode = yield* repo.consumeAuthorizationCode(params.code)
          const authCode: AuthorizationCode = yield* Option.match(maybeCode, {
            onNone: () =>
              Effect.fail(
                new OAuthError({
                  error: 'invalid_grant',
                  error_description:
                    'Authorization code not found or already used',
                })
              ),
            onSome: Effect.succeed,
          })

          // Verify code hasn't expired
          const nowMs = DateTime.toEpochMillis(DateTime.unsafeNow())
          const codeExpiresAtMs = DateTime.toEpochMillis(
            DateTime.unsafeMake(authCode.expiresAt)
          )
          if (codeExpiresAtMs < nowMs) {
            return yield* Effect.fail(
              new OAuthError({
                error: 'invalid_grant',
                error_description: 'Authorization code expired',
              })
            )
          }

          // Verify client matches
          if (authCode.clientId !== params.clientId) {
            return yield* Effect.fail(
              new OAuthError({
                error: 'invalid_grant',
                error_description: 'Client mismatch',
              })
            )
          }

          // Verify PKCE
          const pkceValid = yield* verifyPkceS256(
            params.codeVerifier,
            authCode.codeChallenge
          )
          if (!pkceValid) {
            return yield* Effect.fail(
              new OAuthError({
                error: 'invalid_grant',
                error_description: 'PKCE verification failed',
              })
            )
          }

          // Issue tokens
          const accessTokenValue = generateToken()
          const refreshTokenValue = generateToken()
          const now = DateTime.unsafeNow()

          const accessExpiresAt = DateTime.toDateUtc(
            DateTime.addDuration(now, Duration.millis(ACCESS_TOKEN_LIFETIME_MS))
          )
          const refreshExpiresAt = DateTime.toDateUtc(
            DateTime.addDuration(
              now,
              Duration.millis(REFRESH_TOKEN_LIFETIME_MS)
            )
          )

          const accessToken: AccessToken = {
            token: accessTokenValue,
            clientId: authCode.clientId,
            userId: authCode.userId,
            scopes: authCode.scopes,
            expiresAt: accessExpiresAt,
            ...(authCode.resource != null
              ? { resource: authCode.resource }
              : {}),
          }

          const refreshToken = {
            token: refreshTokenValue,
            clientId: authCode.clientId,
            userId: authCode.userId,
            scopes: authCode.scopes,
            expiresAt: refreshExpiresAt,
            ...(authCode.resource != null
              ? { resource: authCode.resource }
              : {}),
          }

          yield* Effect.all(
            [
              repo.saveAccessToken(accessToken),
              repo.saveRefreshToken(refreshToken),
            ],
            { concurrency: 'unbounded' }
          )

          return {
            access_token: accessTokenValue,
            token_type: 'Bearer' as const,
            expires_in: Math.floor(ACCESS_TOKEN_LIFETIME_MS / 1000),
            scope: Array.join(authCode.scopes, ' '),
            refresh_token: refreshTokenValue,
          }
        }).pipe(Effect.withSpan('OAuthService.exchangeAuthorizationCode')),

      refreshAccessToken: (params) =>
        Effect.gen(function* () {
          // Atomically consume the refresh token (DELETE ... RETURNING)
          // to prevent race conditions where two concurrent requests
          // exchange the same token. Only the first caller receives the row.
          const maybeToken = yield* repo.consumeRefreshToken(
            params.refreshToken
          )
          const refreshToken = yield* Option.match(maybeToken, {
            onNone: () =>
              Effect.fail(
                new OAuthError({
                  error: 'invalid_grant',
                  error_description: 'Refresh token not found',
                })
              ),
            onSome: Effect.succeed,
          })

          // Verify not expired
          const refreshNowMs = DateTime.toEpochMillis(DateTime.unsafeNow())
          const expiresAtMs = DateTime.toEpochMillis(
            DateTime.unsafeMake(refreshToken.expiresAt)
          )
          if (expiresAtMs < refreshNowMs) {
            return yield* Effect.fail(
              new OAuthError({
                error: 'invalid_grant',
                error_description: 'Refresh token expired',
              })
            )
          }

          // Verify client matches
          if (refreshToken.clientId !== params.clientId) {
            return yield* Effect.fail(
              new OAuthError({
                error: 'invalid_grant',
                error_description: 'Client mismatch',
              })
            )
          }

          // Issue new tokens
          const accessTokenValue = generateToken()
          const newRefreshTokenValue = generateToken()
          const now = DateTime.unsafeNow()

          const accessExpiresAt = DateTime.toDateUtc(
            DateTime.addDuration(now, Duration.millis(ACCESS_TOKEN_LIFETIME_MS))
          )
          const newRefreshExpiresAt = DateTime.toDateUtc(
            DateTime.addDuration(
              now,
              Duration.millis(REFRESH_TOKEN_LIFETIME_MS)
            )
          )

          yield* Effect.all(
            [
              repo.saveAccessToken({
                token: accessTokenValue,
                clientId: refreshToken.clientId,
                userId: refreshToken.userId,
                scopes: refreshToken.scopes,
                expiresAt: accessExpiresAt,
                ...(refreshToken.resource != null
                  ? { resource: refreshToken.resource }
                  : {}),
              }),
              repo.saveRefreshToken({
                token: newRefreshTokenValue,
                clientId: refreshToken.clientId,
                userId: refreshToken.userId,
                scopes: refreshToken.scopes,
                expiresAt: newRefreshExpiresAt,
                ...(refreshToken.resource != null
                  ? { resource: refreshToken.resource }
                  : {}),
              }),
            ],
            { concurrency: 'unbounded' }
          )

          return {
            access_token: accessTokenValue,
            token_type: 'Bearer' as const,
            expires_in: Math.floor(ACCESS_TOKEN_LIFETIME_MS / 1000),
            scope: Array.join(refreshToken.scopes, ' '),
            refresh_token: newRefreshTokenValue,
          }
        }).pipe(Effect.withSpan('OAuthService.refreshAccessToken')),

      revokeToken: (params) =>
        pipe(
          // RFC 7009: succeed silently even if token not found.
          Match.value(params.token_type_hint),
          Match.when('refresh_token', () =>
            repo.revokeRefreshToken(params.token)
          ),
          Match.when('access_token', () =>
            repo.revokeAccessToken(params.token)
          ),
          Match.orElse(() =>
            Effect.all(
              [
                repo.revokeAccessToken(params.token),
                repo.revokeRefreshToken(params.token),
              ],
              { concurrency: 'unbounded' }
            ).pipe(Effect.asVoid)
          )
        ).pipe(Effect.withSpan('OAuthService.revokeToken')),

      validateBearerToken: (token) =>
        Effect.gen(function* () {
          const maybeToken = yield* repo.getAccessToken(token)
          const accessToken = yield* Option.match(maybeToken, {
            onNone: () =>
              Effect.fail(
                new OAuthError({
                  error: 'invalid_token',
                  error_description: 'Access token not found',
                })
              ),
            onSome: Effect.succeed,
          })

          const validateNowMs = DateTime.toEpochMillis(DateTime.unsafeNow())
          const tokenExpiresAtMs = DateTime.toEpochMillis(
            DateTime.unsafeMake(accessToken.expiresAt)
          )
          if (tokenExpiresAtMs < validateNowMs) {
            yield* repo.revokeAccessToken(token)
            return yield* Effect.fail(
              new OAuthError({
                error: 'invalid_token',
                error_description: 'Access token expired',
              })
            )
          }

          return {
            userId: accessToken.userId,
            scopes: accessToken.scopes,
          }
        }).pipe(Effect.withSpan('OAuthService.validateBearerToken')),
    }
  })
)
