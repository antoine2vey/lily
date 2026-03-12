import { HttpClientError, HttpServerRequest } from '@effect/platform'
import { ApiClient, CurrentJwt, CurrentUserId } from '@lily/mcp/api-client'
import type { UserApiCredentials } from '@lily/mcp/auth/oauth-repository'
import { OAuthRepository } from '@lily/mcp/auth/oauth-repository'
import { OAuthError, OAuthService } from '@lily/mcp/auth/oauth-service'
import {
  Array,
  DateTime,
  Effect,
  String as EffectString,
  Option,
  pipe,
} from 'effect'

// ── JWT helpers ────────────────────────────────────────────────────────

/**
 * Decode the `exp` claim from a JWT payload without signature verification.
 * This is a heuristic for proactive refresh only — the API server is the
 * authoritative verifier of JWT validity and signature.
 */
const getJwtExp = (jwt: string): Option.Option<number> => {
  const parts = EffectString.split(jwt, '.')
  return pipe(
    Array.get(parts, 1),
    Option.flatMap((payload) => {
      try {
        const json = JSON.parse(atob(payload)) as { exp?: number }
        return Option.fromNullable(json.exp)
      } catch {
        return Option.none()
      }
    })
  )
}

/**
 * Compute JWT expiry status in a single pass: parses `exp` once,
 * reads the clock once, and returns the expired flag.
 */
const isJwtExpired = (jwt: string): boolean => {
  const nowSeconds = Math.floor(
    DateTime.toEpochMillis(DateTime.unsafeNow()) / 1000
  )
  return pipe(
    getJwtExp(jwt),
    Option.match({
      onNone: () => true,
      onSome: (exp) => exp <= nowSeconds,
    })
  )
}

// ── 401 detection ──────────────────────────────────────────────────────

/**
 * Check whether a defect is an HTTP 401 from the API server.
 * ApiClient uses `Effect.orDie` after `filterStatusOk`, so non-2xx
 * responses surface as defects carrying a `ResponseError` value.
 */
const isUnauthorizedDefect = (defect: unknown): boolean =>
  defect instanceof HttpClientError.ResponseError &&
  defect.response.status === 401

// ── API JWT refresh ────────────────────────────────────────────────────

/**
 * Refresh the API JWT via POST /api/auth/refresh (no JWT required)
 * and persist the new credentials.
 */
const refreshApiJwt = (creds: UserApiCredentials) =>
  Effect.gen(function* () {
    const apiClient = yield* ApiClient
    const repo = yield* OAuthRepository

    const result = yield* apiClient.refreshToken(creds.apiRefreshToken).pipe(
      Effect.catchAllDefect((defect) =>
        isUnauthorizedDefect(defect)
          ? Effect.fail(
              new OAuthError({
                error: 'api_refresh_failed',
                error_description:
                  'API token refresh failed — please re-authenticate',
              })
            )
          : Effect.die(defect)
      )
    )

    yield* repo.upsertUserApiCredentials({
      userId: creds.userId,
      apiJwt: result.accessToken,
      apiRefreshToken: result.refreshToken,
    })

    return result.accessToken
  }).pipe(Effect.withSpan('MCP.refreshApiJwt'))

/**
 * Refresh the API JWT for a user if it's expired.
 * Called from the OAuth token refresh endpoint.
 */
export const refreshApiJwtIfNeeded = (userId: string) =>
  Effect.gen(function* () {
    const repo = yield* OAuthRepository
    const maybeCreds = yield* repo.getUserApiCredentials(userId)

    yield* Option.match(maybeCreds, {
      onNone: () => Effect.void,
      onSome: (creds) =>
        isJwtExpired(creds.apiJwt)
          ? refreshApiJwt(creds).pipe(Effect.asVoid)
          : Effect.void,
    })
  }).pipe(Effect.withSpan('MCP.refreshApiJwtIfNeeded'))

// ── Main resolver ──────────────────────────────────────────────────────

interface AuthResult {
  readonly jwt: string
  readonly userId: string
}

/**
 * Resolve the API JWT and userId from the bearer token in the current
 * HTTP request.
 *
 * 1. Validate the OAuth bearer token → userId
 * 2. Look up stored API credentials for that user
 * 3. If the API JWT is expired (or forceRefresh), refresh transparently
 * 4. Return { jwt, userId }
 */
const resolveAuth = (forceRefresh: boolean) =>
  Effect.gen(function* () {
    const request = yield* HttpServerRequest.HttpServerRequest
    const oauthService = yield* OAuthService
    const repo = yield* OAuthRepository

    const authHeader = request.headers.authorization
    if (!authHeader || !pipe(authHeader, EffectString.startsWith('Bearer '))) {
      return yield* new OAuthError({
        error: 'invalid_token',
        error_description: 'Authentication required',
      })
    }

    const token = pipe(authHeader, EffectString.slice(7))
    const validation = yield* oauthService.validateBearerToken(token)

    const maybeCreds = yield* repo.getUserApiCredentials(validation.userId)
    const creds = yield* Option.match(maybeCreds, {
      onNone: () =>
        Effect.fail(
          new OAuthError({
            error: 'invalid_token',
            error_description:
              'No API credentials found — please re-authenticate',
          })
        ),
      onSome: Effect.succeed,
    })

    const jwt =
      forceRefresh || isJwtExpired(creds.apiJwt)
        ? yield* refreshApiJwt(creds)
        : creds.apiJwt

    return { jwt, userId: validation.userId } satisfies AuthResult
  }).pipe(
    Effect.catchTags({
      AccessTokenNotFound: (err) =>
        new OAuthError({
          error: err.error,
          error_description: err.error_description,
        }),
      AccessTokenExpired: (err) =>
        new OAuthError({
          error: err.error,
          error_description: err.error_description,
        }),
      SqlError: () =>
        new OAuthError({
          error: 'server_error',
          error_description: 'Authentication failed',
        }),
    }),
    Effect.withSpan('MCP.resolveAuth')
  )

// ── Auth provider ──────────────────────────────────────────────────────

/**
 * Resolve auth with automatic 401 retry.
 * Catches defects only on the auth resolution step (not the downstream effect)
 * to avoid masking unrelated defects from tool handlers.
 */
const resolveAuthWithRetry = pipe(
  resolveAuth(false),
  Effect.catchAllDefect((defect) =>
    isUnauthorizedDefect(defect) ? resolveAuth(true) : Effect.die(defect)
  )
)

/**
 * Provide `CurrentJwt` and `CurrentUserId` into context by resolving
 * the bearer token. On API 401 during resolution, force-refreshes and
 * retries once.
 */
export const provideAuth = <A, E, R>(
  self: Effect.Effect<A, E, R>
): Effect.Effect<
  A,
  E | OAuthError,
  | Exclude<R, CurrentJwt | CurrentUserId>
  | OAuthService
  | OAuthRepository
  | ApiClient
> =>
  pipe(
    resolveAuthWithRetry,
    Effect.flatMap((auth) =>
      pipe(
        self,
        Effect.provideService(CurrentJwt, auth.jwt),
        Effect.provideService(CurrentUserId, auth.userId)
      )
    )
  ) as Effect.Effect<
    A,
    E | OAuthError,
    | Exclude<R, CurrentJwt | CurrentUserId>
    | OAuthService
    | OAuthRepository
    | ApiClient
  >
