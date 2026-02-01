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
  type InvalidSubscriptionStatusError,
  type LimitExceededError,
  type NotificationNotFoundError,
  type PaymentProviderError,
  type PlantNotFoundError,
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
  Deferred,
  Effect,
  Either,
  Exit,
  Match,
  Option,
  pipe,
  Ref,
  Runtime,
} from 'effect'
import * as SecureStore from 'expo-secure-store'

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

export const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_URL ?? 'http://192.168.1.85:3000'

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
  | UserNotFoundError
  | PaymentProviderError
  | CareLogNotFoundError
  | DeviceTokenNotFoundError
  | NotificationNotFoundError
  | SubscriptionNotFoundError
  | InvalidSubscriptionStatusError
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
  'UserNotFoundError',
  'PaymentProviderError',
  'CareLogNotFoundError',
  'DeviceTokenNotFoundError',
  'NotificationNotFoundError',
  'SubscriptionNotFoundError',
  'InvalidSubscriptionStatusError',
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
 * Extract a readable message from an unknown error
 */
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

// State for coordinating concurrent refresh requests
type RefreshState = Option.Option<Deferred.Deferred<string, ApiFailure>>

// Global ref for refresh state (initialized lazily)
let refreshStateRef: Ref.Ref<RefreshState> | null = null

const getRefreshStateRef = Effect.gen(function* () {
  if (refreshStateRef === null) {
    refreshStateRef = yield* Ref.make<RefreshState>(Option.none())
  }
  return refreshStateRef
})

/**
 * Get the current access token from secure storage
 */
const getAccessToken = Effect.tryPromise({
  try: () => SecureStore.getItemAsync(ACCESS_TOKEN_KEY),
  catch: () => null,
})

/**
 * Refresh the access token using the stored refresh token.
 * Uses Deferred + Ref to coordinate concurrent refresh requests.
 */
const refreshAccessToken: Effect.Effect<string, ApiFailure> = Effect.gen(
  function* () {
    const stateRef = yield* getRefreshStateRef
    const currentState = yield* Ref.get(stateRef)

    // If already refreshing, wait for existing refresh
    if (Option.isSome(currentState)) {
      return yield* Deferred.await(currentState.value)
    }

    // Start new refresh
    const deferred = yield* Deferred.make<string, ApiFailure>()
    yield* Ref.set(stateRef, Option.some(deferred))

    const result = yield* Effect.tryPromise({
      try: async () => {
        const refreshToken = await SecureStore.getItemAsync(REFRESH_TOKEN_KEY)
        if (!refreshToken) {
          throw new Error('No refresh token')
        }

        const response = await fetch(`${API_BASE_URL}/api/auth/refresh`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ refreshToken }),
        })

        if (!response.ok) {
          // Clear tokens on refresh failure
          await SecureStore.deleteItemAsync(ACCESS_TOKEN_KEY)
          await SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY)
          throw new Error('Refresh failed')
        }

        const data = await response.json()
        const newAccessToken = data.accessToken as string

        // Store the new access token
        await SecureStore.setItemAsync(ACCESS_TOKEN_KEY, newAccessToken)

        return newAccessToken
      },
      catch: (): ApiFailure =>
        new UnauthorizedError({ message: 'Token refresh failed' }),
    }).pipe(
      Effect.tapBoth({
        onSuccess: (token) =>
          Effect.all([
            Deferred.succeed(deferred, token),
            Ref.set(stateRef, Option.none()),
          ]),
        onFailure: (error) =>
          Effect.all([
            Deferred.fail(deferred, error),
            Ref.set(stateRef, Option.none()),
          ]),
      })
    )

    return result
  }
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
async function runApiEffect<X extends keyof Client, Y extends keyof Client[X]>(
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
    onFailure: () => {
      // Token refresh failed, trigger auth failure callback
      if (onAuthFailure) {
        onAuthFailure()
      }
      return Either.left(
        new UnauthorizedError({
          message: 'Session expired. Please log in again.',
        })
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
