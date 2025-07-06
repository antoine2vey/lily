import {
  FetchHttpClient,
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
import { Effect, Layer } from 'effect'

const getClient = HttpApiClient.make(Api, {
  baseUrl: 'http://localhost:3000',
})

type Client = Effect.Effect.Success<typeof getClient>

const CustomFetchLive = FetchHttpClient.layer.pipe(
  Layer.provide(
    Layer.succeed(FetchHttpClient.RequestInit, {
      credentials: 'include',
    })
  )
)

class ApiClient extends Effect.Service<ApiClient>()('ApiClient', {
  dependencies: [CustomFetchLive],
  effect: Effect.gen(function* () {
    return {
      client: yield* HttpApiClient.make(Api, {
        baseUrl: 'http://localhost:3000',
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

export function apiEffectRunner<
  X extends keyof Client,
  Y extends keyof Client[X],
>(section: X, method: Y, params: GetRequestParams<X, Y>): PromiseSuccess<X, Y> {
  const program = apiEffect(section, method, params)
  return Effect.runPromise(program.pipe(Effect.provide(ApiClient.Default)))
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
    queryKey: [section, method],
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
