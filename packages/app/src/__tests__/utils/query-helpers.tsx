import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  type RenderHookOptions,
  renderHook,
} from '@testing-library/react-native'
import { Result } from 'effect'
import type { ReactNode } from 'react'
import { createQueryClient } from '@/utils/query-client'
import { mockEpochMillis } from './dates'

/**
 * Track all QueryClients created during tests for cleanup
 */
const testQueryClients: QueryClient[] = []

/**
 * Clear all tracked QueryClients - called in afterEach
 */
export function cleanupQueryClients(): void {
  for (const client of testQueryClients) {
    client.clear()
  }
  testQueryClients.length = 0
}

/**
 * Create a test query client with sensible defaults
 */
/**
 * `waitFor` options for a render that follows a request through the real API
 * client. Each request builds the client and captures stack traces
 * synchronously, which holds the event loop for over a second under Jest and
 * longer under load, and a re-render scheduled by a cache write waits behind
 * it. The default 1s window flakes there.
 */
export const afterApiRequest = { timeout: 10000 }

export function createTestQueryClient(): QueryClient {
  const client = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
        staleTime: 0,
      },
      mutations: {
        retry: false,
        gcTime: 0,
      },
    },
  })
  testQueryClients.push(client)
  return client
}

/**
 * A test client for seeded caches. It keeps entries no hook observes, so a
 * test can run a mutation and read them back, and a mounted query reads the
 * seed instead of fetching.
 */
export function createCacheTestQueryClient(): QueryClient {
  const client = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: Number.POSITIVE_INFINITY,
        staleTime: Number.POSITIVE_INFINITY,
      },
      mutations: { retry: false, gcTime: 0 },
    },
  })
  testQueryClients.push(client)
  return client
}

/**
 * The app's createQueryClient with cache GC off. Its 5-minute GC timers outlive
 * the test, and clear() does not cancel the ones on mutations.
 */
export function createTestAppQueryClient(): QueryClient {
  const client = createQueryClient()
  const defaults = client.getDefaultOptions()
  client.setDefaultOptions({
    queries: { ...defaults.queries, gcTime: 0 },
    mutations: { ...defaults.mutations, gcTime: 0 },
  })
  testQueryClients.push(client)
  return client
}

/**
 * Create a wrapper component with QueryClientProvider
 */
export function createQueryWrapper(queryClient?: QueryClient) {
  const client = queryClient ?? createTestQueryClient()

  return function QueryWrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>
  }
}

/**
 * Render a hook with QueryClientProvider
 */
export function renderQueryHook<TResult, TProps>(
  callback: (props: TProps) => TResult,
  options?: Omit<RenderHookOptions<TProps>, 'wrapper'> & {
    queryClient?: QueryClient
  }
) {
  const queryClient = options?.queryClient ?? createTestQueryClient()
  const wrapper = createQueryWrapper(queryClient)

  return {
    ...renderHook(callback, { ...options, wrapper }),
    queryClient,
  }
}

/**
 * Mock a successful query response - returns type compatible with useEffectQuery
 * Uses `as const` on literals to satisfy TanStack Query's literal types
 */
export function mockQuerySuccess<T>(data: T) {
  return {
    data,
    result: undefined,
    apiError: undefined,
    isApiError: false as const,
    dataUpdatedAt: mockEpochMillis(),
    error: null,
    errorUpdatedAt: 0,
    errorUpdateCount: 0,
    failureCount: 0,
    failureReason: null,
    fetchStatus: 'idle' as const,
    isError: false as const,
    isFetched: true as const,
    isFetchedAfterMount: true as const,
    isFetching: false as const,
    isInitialLoading: false as const,
    isLoading: false as const,
    isLoadingError: false as const,
    isPaused: false as const,
    isPending: false as const,
    isPlaceholderData: false as const,
    isRefetchError: false as const,
    isRefetching: false as const,
    isStale: false as const,
    isSuccess: true as const,
    refetch: jest.fn().mockResolvedValue({ data, status: 'success' }),
    status: 'success' as const,
    promise: Promise.resolve(data),
  }
}

/**
 * Mock a loading query state - returns type compatible with useEffectQuery
 */
export function mockQueryLoading<T = unknown>() {
  return {
    data: undefined as T | undefined,
    result: undefined,
    apiError: undefined,
    isApiError: false as const,
    dataUpdatedAt: 0,
    error: null,
    errorUpdatedAt: 0,
    errorUpdateCount: 0,
    failureCount: 0,
    failureReason: null,
    fetchStatus: 'fetching' as const,
    isError: false as const,
    isFetched: false as const,
    isFetchedAfterMount: false as const,
    isFetching: true as const,
    isInitialLoading: true as const,
    isLoading: true as const,
    isLoadingError: false as const,
    isPaused: false as const,
    isPending: true as const,
    isPlaceholderData: false as const,
    isRefetchError: false as const,
    isRefetching: false as const,
    isStale: false as const,
    isSuccess: false as const,
    refetch: jest.fn(),
    status: 'pending' as const,
    promise: new Promise<T>(() => {}),
  }
}

/**
 * Mock an error query state - returns type compatible with useEffectQuery
 * With typed errors, API errors are returned via apiError field
 */
export function mockQueryError<T = unknown>(
  error: Error = new Error('Query failed')
) {
  const rejectedPromise = Promise.reject(error)
  rejectedPromise.catch(() => {})

  return {
    data: undefined as T | undefined,
    result: undefined,
    apiError: { _tag: 'UnknownError' as const, message: error.message },
    isApiError: true as const,
    dataUpdatedAt: 0,
    error: null,
    errorUpdatedAt: mockEpochMillis(),
    errorUpdateCount: 1,
    failureCount: 1,
    failureReason: error,
    fetchStatus: 'idle' as const,
    isError: false as const,
    isFetched: true as const,
    isFetchedAfterMount: true as const,
    isFetching: false as const,
    isInitialLoading: false as const,
    isLoading: false as const,
    isLoadingError: false as const,
    isPaused: false as const,
    isPending: false as const,
    isPlaceholderData: false as const,
    isRefetchError: false as const,
    isRefetching: false as const,
    isStale: false as const,
    isSuccess: true as const,
    refetch: jest.fn(),
    status: 'success' as const,
    promise: rejectedPromise,
  }
}

/**
 * Mock a successful mutation - returns type compatible with useEffectMutation
 */
export function mockMutationSuccess<TData = unknown, TVariables = unknown>() {
  return {
    context: undefined,
    data: undefined as TData | undefined,
    error: null,
    failureCount: 0,
    failureReason: null,
    isError: false as const,
    isIdle: false as const,
    isPaused: false as const,
    isPending: false as const,
    isSuccess: true as const,
    mutate: jest.fn(),
    mutateAsync: jest.fn().mockResolvedValue({} as TData),
    reset: jest.fn(),
    status: 'success' as const,
    submittedAt: mockEpochMillis(),
    variables: undefined as TVariables | undefined,
  }
}

export type MockMutateOptions = {
  onSuccess?: (data: unknown) => void
  onError?: (error: unknown) => void
  onSettled?: () => void
}

export function mockSettle(
  outcome: Result.Result<unknown, unknown>,
  opts?: MockMutateOptions
) {
  Result.match(outcome, {
    onSuccess: (data) => opts?.onSuccess?.(data),
    onFailure: (error) => opts?.onError?.(error),
  })
  opts?.onSettled?.()
}
