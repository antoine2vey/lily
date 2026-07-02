import {
  FetchHttpClient,
  type HttpApi,
  HttpApiClient,
  HttpClient,
  HttpClientRequest,
  type HttpClientResponse,
} from '@effect/platform'
import { Api } from '@lily/api/api'
import {
  type CareLogNotFoundError,
  type DeviceTokenNotFoundError,
  type GiftCodeAlreadyRedeemedError,
  type GiftCodeExhaustedError,
  type GiftCodeExpiredError,
  type GiftCodeInactiveError,
  type GiftCodeNotFoundError,
  type InvalidSubscriptionStatusError,
  type LimitExceededError,
  type NotificationNotFoundError,
  type PaymentProviderError,
  type PlantNotFoundError,
  type RoomNotFoundError,
  type SessionNotFoundError,
  type SubscriptionNotFoundError,
  UnauthorizedError,
  type UserNotFoundError,
} from '@lily/shared'
import {
  type UseMutationOptions,
  type UseQueryOptions,
  useMutation,
  useQuery,
} from '@tanstack/react-query'
import {
  Array as A,
  Cause,
  Clock,
  Deferred,
  Effect,
  Either,
  Exit,
  Match,
  Option,
  pipe,
  Ref,
  Schema,
  String as Str,
} from 'effect'
import * as SecureStore from 'expo-secure-store'
import {
  addAuthBreadcrumb,
  trackAuthAnomaly,
  trackForcedLogout,
} from '@/utils/auth-telemetry'

// Type helpers to extract HttpApi type parameters
type ExtractGroups<T> = T extends HttpApi.HttpApi<
  infer _Id,
  infer G,
  infer _E,
  infer _R
>
  ? G
  : never
type ExtractError<T> = T extends HttpApi.HttpApi<
  infer _Id,
  infer _G,
  infer E,
  infer _R
>
  ? E
  : never

export const ACCESS_TOKEN_KEY = 'lily_access_token'
export const REFRESH_TOKEN_KEY = 'lily_refresh_token'

const rawApiUrl = pipe(
  Option.fromNullable(process.env.EXPO_PUBLIC_API_URL),
  Option.getOrThrow
)

if (!rawApiUrl) {
  throw new Error(
    'EXPO_PUBLIC_API_URL is not set. Ensure it is configured in eas.json or .env'
  )
}

// Warn and strip trailing slash to prevent double-slash issues in API calls
if (pipe(rawApiUrl, Str.endsWith('/'))) {
  console.warn(
    `[API Client] EXPO_PUBLIC_API_URL should not end with a trailing slash: "${rawApiUrl}". Removing it automatically.`
  )
}

export const API_BASE_URL = pipe(rawApiUrl, Str.replace(/\/+$/, ''))

// Callback for auth failure (token refresh failed)
let onAuthFailure: (() => void) | null = null

/**
 * Set the callback to be invoked when token refresh fails.
 * This allows AuthContext to trigger logout when refresh tokens expire.
 */
export const setOnAuthFailure = (callback: (() => void) | null): void => {
  onAuthFailure = callback
}

/**
 * All possible API errors as discriminated union
 */
export type ApiFailure =
  | UnauthorizedError
  | SessionNotFoundError
  | LimitExceededError
  | PlantNotFoundError
  | RoomNotFoundError
  | UserNotFoundError
  | PaymentProviderError
  | CareLogNotFoundError
  | DeviceTokenNotFoundError
  | NotificationNotFoundError
  | SubscriptionNotFoundError
  | InvalidSubscriptionStatusError
  | GiftCodeNotFoundError
  | GiftCodeInactiveError
  | GiftCodeExpiredError
  | GiftCodeExhaustedError
  | GiftCodeAlreadyRedeemedError
  | { readonly _tag: 'NetworkError'; readonly message: string }
  | { readonly _tag: 'UnknownError'; readonly message: string }

/**
 * Known error tags for type narrowing
 */
const KNOWN_ERROR_TAGS = [
  'UnauthorizedError',
  'SessionNotFoundError',
  'LimitExceededError',
  'PlantNotFoundError',
  'RoomNotFoundError',
  'UserNotFoundError',
  'PaymentProviderError',
  'CareLogNotFoundError',
  'DeviceTokenNotFoundError',
  'NotificationNotFoundError',
  'SubscriptionNotFoundError',
  'InvalidSubscriptionStatusError',
  'GiftCodeNotFoundError',
  'GiftCodeInactiveError',
  'GiftCodeExpiredError',
  'GiftCodeExhaustedError',
  'GiftCodeAlreadyRedeemedError',
] as const

type KnownErrorTag = (typeof KNOWN_ERROR_TAGS)[number]

/**
 * Type guard to check if a value is a known API error
 */
function isKnownError(
  value: unknown
): value is ApiFailure & { _tag: KnownErrorTag } {
  if (value === null || typeof value !== 'object') {
    return false
  }

  // Access _tag directly - it may be a getter on the prototype
  const tagValue = (value as { _tag?: unknown })._tag

  if (typeof tagValue !== 'string') {
    return false
  }

  return A.contains(KNOWN_ERROR_TAGS, tagValue as KnownErrorTag)
}

/**
 * Extract a readable message from an unknown error.
 * Handles Error instances, ApiFailure objects, strings, and other types.
 */
export function extractErrorMessage(error: unknown): string {
  return getErrorMessage(error)
}

export function extractErrorField(
  error: unknown,
  field: string
): string | undefined {
  const result = Schema.decodeUnknownOption(
    Schema.Struct({ [field]: Schema.String })
  )(error)
  return Option.map(result, (r) => r[field]).pipe(Option.getOrUndefined)
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }
  if (typeof error === 'string') {
    return error
  }
  if (error !== null && typeof error === 'object') {
    // Access message directly - it may be a getter on the prototype
    const msg = (error as { message?: unknown }).message
    if (typeof msg === 'string') {
      return msg
    }
  }
  try {
    return JSON.stringify(error)
  } catch {
    return 'Unknown error occurred'
  }
}

/**
 * Try to extract a known error from a value, handling nested structures
 */
function tryExtractKnownError(value: unknown): Option.Option<ApiFailure> {
  // Direct check
  if (isKnownError(value)) {
    return Option.some(value)
  }

  if (value === null || typeof value !== 'object') {
    return Option.none()
  }

  // Check if it's wrapped in an object with an 'error' property
  const errorProp = (value as { error?: unknown }).error
  if (errorProp !== undefined && isKnownError(errorProp)) {
    return Option.some(errorProp)
  }

  // Check if it has a cause property (Effect error wrapping)
  const causeProp = (value as { cause?: unknown }).cause
  if (causeProp !== undefined && isKnownError(causeProp)) {
    return Option.some(causeProp)
  }

  return Option.none()
}

/**
 * Extract typed error from Effect Cause directly
 */
function extractApiFailureFromCause(cause: Cause.Cause<unknown>): ApiFailure {
  // Try to extract from Fail
  const failureOpt = Cause.failureOption(cause)

  if (Option.isSome(failureOpt)) {
    const failure = failureOpt.value

    // Check if it's a known error type
    if (isKnownError(failure)) {
      return failure
    }

    // Try nested extraction
    const extracted = tryExtractKnownError(failure)
    if (Option.isSome(extracted)) {
      return extracted.value
    }

    // Return with message from the failure
    return {
      _tag: 'UnknownError' as const,
      message: getErrorMessage(failure),
    }
  }

  // Try to extract from Die (defects)
  const defectOpt = Cause.dieOption(cause)
  if (Option.isSome(defectOpt)) {
    const defect = defectOpt.value
    if (isKnownError(defect)) {
      return defect
    }
    const extracted = tryExtractKnownError(defect)
    if (Option.isSome(extracted)) {
      return extracted.value
    }
    return {
      _tag: 'UnknownError' as const,
      message: getErrorMessage(defect),
    }
  }

  // Fallback
  return {
    _tag: 'UnknownError' as const,
    message: 'Unknown error occurred',
  }
}

/**
 * Check if an error is a 401 Unauthorized error
 */
function isUnauthorizedError(error: ApiFailure): boolean {
  return pipe(
    Match.value(error),
    Match.when({ _tag: 'UnauthorizedError' }, () => true),
    Match.when({ _tag: 'SessionNotFoundError' }, () => true),
    Match.orElse(() => false)
  )
}

/**
 * Check whether an unknown thrown value is (or wraps) a 401-style auth
 * error. Handles ApiFailure objects thrown by apiEffectRunner as well as
 * UnknownException wrappers from Effect.tryPromise.
 */
export function isAuthFailureError(error: unknown): boolean {
  return pipe(
    tryExtractKnownError(error),
    Option.map(isUnauthorizedError),
    Option.getOrElse(() => false)
  )
}

// Coordination for token refresh across concurrent callers:
// - `inFlight` makes the refresh single-flight
// - `lastRefresh` lets 401s that raced with a just-completed refresh reuse
//   its result instead of rotating the refresh token again — a cold-start
//   burst of expired-token requests collapses into a single rotation
type RefreshState = {
  readonly inFlight: Option.Option<Deferred.Deferred<string, ApiFailure>>
  readonly lastRefresh: Option.Option<{
    readonly token: string
    readonly atMillis: number
  }>
}

// A refresh that completed this recently satisfies new refresh requests
// directly (requests already in flight when it finished still carry the old
// access token and will 401 without needing another rotation)
const REFRESH_REUSE_WINDOW_MS = 10_000

// Global ref for refresh state (initialized lazily)
let refreshStateRef: Ref.Ref<RefreshState> | null = null

const getRefreshStateRef = Effect.gen(function* () {
  if (refreshStateRef === null) {
    refreshStateRef = yield* Ref.make<RefreshState>({
      inFlight: Option.none(),
      lastRefresh: Option.none(),
    })
  }
  return refreshStateRef
})

// This caller's role, decided atomically inside Ref.modify
type RefreshRole =
  | { readonly _tag: 'Reuse'; readonly token: string }
  | {
      readonly _tag: 'Await'
      readonly deferred: Deferred.Deferred<string, ApiFailure>
    }
  | { readonly _tag: 'Refresh' }

/**
 * Get the current access token from secure storage
 */
const getAccessToken = Effect.tryPromise({
  try: () => SecureStore.getItemAsync(ACCESS_TOKEN_KEY),
  catch: () => null,
})

/**
 * Refresh the access token using the stored refresh token.
 *
 * The server rotates the refresh token on every use and revokes the old one,
 * so exactly one refresh may run at a time and its result must be shared:
 * a duplicate request presenting the same (now revoked) token gets rejected
 * and would log the user out. The role decision below happens in a single
 * atomic Ref.modify so two concurrent callers can never both start a POST.
 */
const refreshAccessToken: Effect.Effect<string, ApiFailure> = Effect.gen(
  function* () {
    const stateRef = yield* getRefreshStateRef
    const nowMillis = yield* Clock.currentTimeMillis
    const deferred = yield* Deferred.make<string, ApiFailure>()

    const claimRefresh = (state: RefreshState): [RefreshRole, RefreshState] => [
      { _tag: 'Refresh' },
      { ...state, inFlight: Option.some(deferred) },
    ]

    const role = yield* Ref.modify(
      stateRef,
      (state): [RefreshRole, RefreshState] =>
        pipe(
          state.inFlight,
          Option.match({
            onSome: (existing): [RefreshRole, RefreshState] => [
              { _tag: 'Await', deferred: existing },
              state,
            ],
            onNone: (): [RefreshRole, RefreshState] =>
              pipe(
                state.lastRefresh,
                Option.match({
                  onSome: (last): [RefreshRole, RefreshState] =>
                    nowMillis - last.atMillis <= REFRESH_REUSE_WINDOW_MS
                      ? [{ _tag: 'Reuse', token: last.token }, state]
                      : claimRefresh(state),
                  onNone: () => claimRefresh(state),
                })
              ),
          })
        )
    )

    return yield* pipe(
      Match.value(role),
      Match.when({ _tag: 'Reuse' }, ({ token }) => Effect.succeed(token)),
      Match.when({ _tag: 'Await' }, ({ deferred: existing }) =>
        Deferred.await(existing)
      ),
      Match.when({ _tag: 'Refresh' }, () => performRefresh(stateRef, deferred)),
      Match.exhaustive
    )
  }
)

/**
 * The single in-flight refresh POST. Resolves `deferred` so concurrent
 * callers get the same outcome, and records the result in `lastRefresh`.
 */
const performRefresh = (
  stateRef: Ref.Ref<RefreshState>,
  deferred: Deferred.Deferred<string, ApiFailure>
): Effect.Effect<string, ApiFailure> =>
  Effect.tryPromise({
    try: async () => {
      const refreshToken = await SecureStore.getItemAsync(REFRESH_TOKEN_KEY)
      if (!refreshToken) {
        addAuthBreadcrumb('refresh_no_token_stored')
        throw new Error('No refresh token')
      }

      addAuthBreadcrumb('refresh_started')
      const response = await fetch(`${API_BASE_URL}/api/auth/refresh`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ refreshToken }),
      })

      if (!response.ok) {
        // Only clear tokens on auth errors, not server errors
        if (response.status === 401 || response.status === 403) {
          // Guard against wiping tokens another refresh just stored: only
          // clear storage if it still holds the token we presented
          const storedNow = await SecureStore.getItemAsync(REFRESH_TOKEN_KEY)
          if (storedNow !== null && storedNow !== refreshToken) {
            const currentAccess =
              await SecureStore.getItemAsync(ACCESS_TOKEN_KEY)
            if (currentAccess) {
              trackAuthAnomaly('refresh_race_recovered', {
                status: response.status,
              })
              return currentAccess
            }
          }
          await SecureStore.deleteItemAsync(ACCESS_TOKEN_KEY)
          await SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY)
          trackAuthAnomaly('refresh_rejected', { status: response.status })
        } else {
          // 429 (throttled) and 5xx land here — session stays intact
          trackAuthAnomaly('refresh_failed_transient', {
            status: response.status,
          })
        }
        throw new Error(`Refresh failed: ${response.status}`)
      }

      const data = await response.json()
      const newAccessToken = data.accessToken as string
      const newRefreshToken = data.refreshToken as string

      // Store both tokens (server rotates refresh tokens)
      await SecureStore.setItemAsync(ACCESS_TOKEN_KEY, newAccessToken)
      if (newRefreshToken) {
        await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, newRefreshToken)
      }

      addAuthBreadcrumb('refresh_succeeded')
      return newAccessToken
    },
    catch: (error): ApiFailure => {
      const message =
        error instanceof Error ? error.message : 'Token refresh failed'
      // Only treat as auth error if it was an actual auth failure
      const isAuthFailure =
        pipe(message, Str.includes('401')) ||
        pipe(message, Str.includes('403')) ||
        pipe(message, Str.includes('No refresh token'))

      if (isAuthFailure) {
        return new UnauthorizedError({ message })
      }
      // Network/server errors should not be treated as auth failures
      return {
        _tag: 'UnknownError' as const,
        message: `Token refresh failed: ${message}`,
      }
    },
  }).pipe(
    Effect.tapBoth({
      onSuccess: (token) =>
        Effect.gen(function* () {
          const atMillis = yield* Clock.currentTimeMillis
          yield* Ref.set(stateRef, {
            inFlight: Option.none(),
            lastRefresh: Option.some({ token, atMillis }),
          })
          yield* Deferred.succeed(deferred, token)
        }),
      onFailure: (error) =>
        Effect.gen(function* () {
          yield* Ref.update(stateRef, (state) => ({
            ...state,
            inFlight: Option.none(),
          }))
          yield* Deferred.fail(deferred, error)
        }),
    })
  )

/**
 * Promise-based token refresh for backwards compatibility with upload.ts
 * Returns null if refresh fails (for interop with existing error handling)
 */
export async function refreshAccessTokenAsync(): Promise<string | null> {
  const exit = await Effect.runPromiseExit(refreshAccessToken)
  return Exit.match(exit, {
    onSuccess: (token) => token,
    onFailure: () => null,
  })
}

type Client = HttpApiClient.Client<
  ExtractGroups<typeof Api>,
  ExtractError<typeof Api>,
  never
>

class ApiClient extends Effect.Service<ApiClient>()('ApiClient', {
  dependencies: [FetchHttpClient.layer],
  effect: Effect.gen(function* () {
    return {
      client: yield* HttpApiClient.make(Api, {
        baseUrl: API_BASE_URL,
        transformClient: (httpClient: HttpClient.HttpClient) =>
          HttpClient.mapRequestEffect(httpClient, (request) =>
            Effect.gen(function* () {
              const token = yield* getAccessToken
              return pipe(
                Option.fromNullable(token),
                Option.match({
                  onNone: () => request,
                  onSome: (t) =>
                    HttpClientRequest.setHeader(
                      request,
                      'Authorization',
                      `Bearer ${t}`
                    ),
                })
              )
            })
          ) as HttpClient.HttpClient,
      }),
    }
  }),
}) {}

type GetRequestParams<
  X extends keyof Client,
  Y extends keyof Client[X],
  // biome-ignore lint/suspicious/noExplicitAny: needed for conditional type matching
> = Client[X][Y] extends (...args: any[]) => any
  ? Parameters<Client[X][Y]>[0]
  : never

type GetReturnType<
  X extends keyof Client,
  Y extends keyof Client[X],
  // biome-ignore lint/suspicious/noExplicitAny: needed for conditional type matching
> = Client[X][Y] extends (...args: any[]) => any
  ? ReturnType<Client[X][Y]>
  : never

function apiEffect<X extends keyof Client, Y extends keyof Client[X]>(
  section: X,
  method: Y,
  params: GetRequestParams<X, Y>
): GetReturnType<X, Y> {
  return Effect.gen(function* () {
    const { client } = yield* ApiClient
    const sectionObj = client[section]
    const methodFn = sectionObj[method]
    if (typeof methodFn !== 'function') {
      throw new Error(
        `Method ${String(section)}.${String(method)} is not a function`
      )
    }
    return yield* methodFn(params)
  }) as GetReturnType<X, Y>
}

type ExcludeHttpResponseTuple<T> = Exclude<
  T,
  readonly [unknown, HttpClientResponse.HttpClientResponse]
>

type GetCleanSuccessType<
  X extends keyof Client,
  Y extends keyof Client[X],
> = ExcludeHttpResponseTuple<Effect.Effect.Success<GetReturnType<X, Y>>>

/**
 * Result type for API operations - Either<ApiFailure, Success>
 */
export type ApiResult<T> = Either.Either<T, ApiFailure>

/**
 * Unwrap an ApiResult, throwing if it's a Left (error)
 */
export function unwrapApiResult<T>(result: ApiResult<T>): T {
  return Either.match(result, {
    onLeft: (error) => {
      throw error
    },
    onRight: (value) => value,
  })
}

/**
 * Get the success value from an ApiResult, or undefined if it's a Left
 */
export function getApiResultData<T>(
  result: ApiResult<T> | undefined
): T | undefined {
  if (!result) return undefined
  return Either.match(result, {
    onLeft: () => undefined,
    onRight: (value) => value,
  })
}

/**
 * Get the error from an ApiResult, or undefined if it's a Right
 */
export function getApiResultError(
  result: ApiResult<unknown> | undefined
): ApiFailure | undefined {
  if (!result) return undefined
  return Either.match(result, {
    onLeft: (error) => error,
    onRight: () => undefined,
  })
}

/**
 * Check if an ApiResult is a success (Right)
 */
export function isApiResultSuccess<T>(
  result: ApiResult<T> | undefined
): result is Either.Right<ApiFailure, T> {
  return result !== undefined && Either.isRight(result)
}

/**
 * Check if an ApiResult is an error (Left)
 */
export function isApiResultError<T>(
  result: ApiResult<T> | undefined
): result is Either.Left<ApiFailure, T> {
  return result !== undefined && Either.isLeft(result)
}

/**
 * Run an API effect and throw on error (for use in AuthContext and other places
 * that need Promise-based API calls with throwing)
 */
export async function apiEffectRunner<
  X extends keyof Client,
  Y extends keyof Client[X],
>(
  section: X,
  method: Y,
  params: GetRequestParams<X, Y>
): Promise<GetCleanSuccessType<X, Y>> {
  const result = await runApiEffect(section, method, params)
  return unwrapApiResult(result)
}

/**
 * Run an API effect and return Either<ApiFailure, Success>
 */
export async function runApiEffect<
  X extends keyof Client,
  Y extends keyof Client[X],
>(
  section: X,
  method: Y,
  params: GetRequestParams<X, Y>,
  retryCount = 0
): Promise<ApiResult<GetCleanSuccessType<X, Y>>> {
  const program = apiEffect(section, method, params)

  const exit = await Effect.runPromiseExit(
    program.pipe(Effect.provide(ApiClient.Default))
  )

  return Exit.match(exit, {
    onSuccess: (value) => Either.right(value as GetCleanSuccessType<X, Y>),
    onFailure: (cause) => {
      const apiError = extractApiFailureFromCause(cause)

      // Check for 401 and attempt token refresh
      if (isUnauthorizedError(apiError) && retryCount === 0) {
        return handleTokenRefreshAndRetry(section, method, params)
      }

      return Either.left(apiError)
    },
  })
}

/**
 * Handle token refresh and retry the original request
 */
async function handleTokenRefreshAndRetry<
  X extends keyof Client,
  Y extends keyof Client[X],
>(
  section: X,
  method: Y,
  params: GetRequestParams<X, Y>
): Promise<ApiResult<GetCleanSuccessType<X, Y>>> {
  const refreshExit = await Effect.runPromiseExit(refreshAccessToken)

  return Exit.match(refreshExit, {
    onSuccess: () => runApiEffect(section, method, params, 1),
    onFailure: (cause) => {
      const error = Cause.failureOption(cause)
      const isAuthFailure = pipe(
        error,
        Option.map((e) => isUnauthorizedError(e)),
        Option.getOrElse(() => false)
      )

      if (isAuthFailure && onAuthFailure) {
        // Only trigger logout on actual auth failures, not network errors
        trackForcedLogout('refresh_rejected', {
          message: pipe(
            error,
            Option.map(extractErrorMessage),
            Option.getOrElse(() => 'unknown')
          ),
        })
        onAuthFailure()
      }

      return Either.left(
        pipe(
          error,
          Option.getOrElse(
            () =>
              new UnauthorizedError({
                message: 'Session expired. Please log in again.',
              })
          )
        )
      )
    },
  })
}

export function useEffectQuery<
  X extends keyof Client,
  Y extends keyof Client[X],
>(
  section: X,
  method: Y,
  params: GetRequestParams<X, Y>,
  useQueryParams?: Omit<
    UseQueryOptions<ApiResult<GetCleanSuccessType<X, Y>>, never>,
    'queryKey' | 'queryFn'
  >
) {
  const query = useQuery({
    queryKey: [section, method, params],
    queryFn: () => runApiEffect(section, method, params),
    ...useQueryParams,
  })

  // Unwrap the Either for convenience - maintains backwards compatibility
  const unwrappedData = getApiResultData(query.data)
  const apiError = getApiResultError(query.data)

  return {
    ...query,
    // Override data with unwrapped value for backwards compatibility
    data: unwrappedData,
    // Expose the raw Either result for typed error handling
    result: query.data,
    // Expose any API error from the Either
    apiError,
    // Whether the result is an API error (Left)
    isApiError: isApiResultError(query.data),
  }
}

export function useEffectMutation<
  X extends keyof Client,
  Y extends keyof Client[X],
>(
  section: X,
  method: Y,
  useMutationParams?: Omit<
    UseMutationOptions<
      ApiResult<GetCleanSuccessType<X, Y>>,
      never,
      GetRequestParams<X, Y>
    >,
    'mutationFn'
  >
) {
  const mutation = useMutation({
    mutationFn: (params: GetRequestParams<X, Y>) =>
      runApiEffect(section, method, params),
    ...useMutationParams,
  })

  // Unwrap the Either for convenience
  const unwrappedData = getApiResultData(mutation.data)
  const apiError = getApiResultError(mutation.data)

  return {
    ...mutation,
    // Override data with unwrapped value for backwards compatibility
    data: unwrappedData,
    // Expose the raw Either result for typed error handling
    result: mutation.data,
    // Expose any API error from the Either
    apiError,
    // Whether the result is an API error (Left)
    isApiError: isApiResultError(mutation.data),
  }
}
