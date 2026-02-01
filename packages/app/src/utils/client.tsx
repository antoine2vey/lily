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
  type UseMutationOptions,
  type UseQueryOptions,
  useMutation,
  useQuery,
} from '@tanstack/react-query'
import { Cause, Effect, Option, pipe, Runtime } from 'effect'
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

// Shared promise for concurrent refresh requests
let refreshPromise: Promise<string | null> | null = null

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
 * Attempt to refresh the access token using the stored refresh token.
 * Uses a shared promise to prevent concurrent refresh attempts.
 */
export const refreshAccessToken = async (): Promise<string | null> => {
  // If already refreshing, wait for the existing promise
  if (refreshPromise) {
    return refreshPromise
  }

  // Create the promise immediately to prevent race conditions
  refreshPromise = (async () => {
    try {
      const refreshToken = await SecureStore.getItemAsync(REFRESH_TOKEN_KEY)
      if (!refreshToken) {
        return null
      }

      const response = await fetch(`${API_BASE_URL}/api/auth/refresh`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ refreshToken }),
      })

      if (!response.ok) {
        // Refresh failed, clear tokens
        await SecureStore.deleteItemAsync(ACCESS_TOKEN_KEY)
        await SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY)
        return null
      }

      const data = await response.json()
      const newAccessToken = data.accessToken

      // Store the new access token
      await SecureStore.setItemAsync(ACCESS_TOKEN_KEY, newAccessToken)

      return newAccessToken
    } catch (error) {
      console.error('Token refresh failed:', error)
      return null
    } finally {
      refreshPromise = null
    }
  })()

  return refreshPromise
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
        transformClient: (httpClient) =>
          HttpClient.mapRequestEffect(httpClient, (request) =>
            Effect.gen(function* () {
              const token = yield* Effect.tryPromise({
                try: () => SecureStore.getItemAsync(ACCESS_TOKEN_KEY),
                catch: () => null,
              })
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
          ),
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

type PromiseSuccess<
  X extends keyof Client,
  Y extends keyof Client[X],
> = Promise<GetCleanSuccessType<X, Y>>

export class ApiError extends Error {
  readonly _tag: string

  constructor(tag: string, message: string) {
    super(message)
    this._tag = tag
    this.name = 'ApiError'
  }
}

function toApiError(error: unknown): ApiError | unknown {
  if (!Runtime.isFiberFailure(error)) return error

  const cause = error[Runtime.FiberFailureCauseId] as Cause.Cause<{
    readonly _tag: string
    readonly message?: string
  }>
  const failure = Cause.failureOption(cause)

  if (failure._tag === 'None') return error

  return new ApiError(
    failure.value._tag,
    failure.value.message ?? error.message
  )
}

/**
 * Run an API effect with automatic token refresh on 401 errors
 */
export async function apiEffectRunner<
  X extends keyof Client,
  Y extends keyof Client[X],
>(
  section: X,
  method: Y,
  params: GetRequestParams<X, Y>,
  retryCount = 0
): PromiseSuccess<X, Y> {
  const program = apiEffect(section, method, params)

  try {
    return await Effect.runPromise(
      program.pipe(Effect.provide(ApiClient.Default))
    )
  } catch (error) {
    // Check if it's a 401 error and we haven't retried yet
    const errorMessage = error instanceof Error ? error.message : String(error)
    const is401 =
      errorMessage.includes('401') || errorMessage.includes('Unauthorized')

    if (is401 && retryCount === 0) {
      // Try to refresh the token
      const newToken = await refreshAccessToken()
      if (newToken) {
        // Retry the request with the new token
        return apiEffectRunner(section, method, params, retryCount + 1)
      }
      // Token refresh failed, trigger auth failure callback
      if (onAuthFailure) {
        onAuthFailure()
      }
    }

    // Re-throw with _tag preserved from Effect typed errors
    throw toApiError(error)
  }
}

export function useEffectQuery<
  X extends keyof Client,
  Y extends keyof Client[X],
>(
  section: X,
  method: Y,
  params: GetRequestParams<X, Y>,
  useQueryParams?: Omit<
    UseQueryOptions<GetCleanSuccessType<X, Y>, Error>,
    'queryKey' | 'queryFn'
  >
) {
  return useQuery({
    queryKey: [section, method, params],
    queryFn: () => apiEffectRunner(section, method, params),
    ...useQueryParams,
  })
}

export function useEffectMutation<
  X extends keyof Client,
  Y extends keyof Client[X],
>(
  section: X,
  method: Y,
  useMutationParams?: Omit<
    UseMutationOptions<
      GetCleanSuccessType<X, Y>,
      Error,
      GetRequestParams<X, Y>
    >,
    'mutationFn'
  >
) {
  return useMutation({
    mutationFn: (params: GetRequestParams<X, Y>) =>
      apiEffectRunner(section, method, params),
    ...useMutationParams,
  })
}
