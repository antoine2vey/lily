import {
  FetchHttpClient,
  type HttpApi,
  HttpApiClient,
  type HttpClientResponse,
} from '@effect/platform'
import { Api } from '@lily/api/api'
import {
  type UseMutationOptions,
  type UseQueryOptions,
  useMutation,
  useQuery,
} from '@tanstack/react-query'
import { Cause, Effect, Layer, Runtime } from 'effect'
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

export const API_BASE_URL = 'http://192.168.1.85:3000'

// Flag to prevent multiple simultaneous refresh attempts
let isRefreshing = false
let refreshPromise: Promise<string | null> | null = null

/**
 * Attempt to refresh the access token using the stored refresh token
 */
const refreshAccessToken = async (): Promise<string | null> => {
  // If already refreshing, wait for the existing promise
  if (isRefreshing && refreshPromise) {
    return refreshPromise
  }

  isRefreshing = true
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
      isRefreshing = false
      refreshPromise = null
    }
  })()

  return refreshPromise
}

// Create a custom fetch layer that injects the auth token
const createAuthFetchLayer = () =>
  FetchHttpClient.layer.pipe(
    Layer.provide(
      Layer.effect(
        FetchHttpClient.RequestInit,
        Effect.gen(function* () {
          const token = yield* Effect.tryPromise({
            try: () => SecureStore.getItemAsync(ACCESS_TOKEN_KEY),
            catch: () => null,
          })

          const headers: Record<string, string> = {}
          if (token) {
            headers.Authorization = `Bearer ${token}`
          }

          return {
            credentials: 'include' as RequestCredentials,
            headers,
          }
        })
      )
    )
  )

type Client = HttpApiClient.Client<
  ExtractGroups<typeof Api>,
  ExtractError<typeof Api>,
  never
>

class ApiClient extends Effect.Service<ApiClient>()('ApiClient', {
  dependencies: [createAuthFetchLayer()],
  effect: Effect.gen(function* () {
    return {
      client: yield* HttpApiClient.make(Api, {
        baseUrl: API_BASE_URL,
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
