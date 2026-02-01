import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  type RenderHookOptions,
  renderHook,
} from '@testing-library/react-native'
import type { ReactNode } from 'react'
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
 * Type assertion is centralized here so tests don't need `as any`
 * Includes the extended fields (result, apiError, isApiError) from useEffectQuery
 *
 * Note: Returns `any` because TanStack Query types use literal boolean types
 * (e.g., `isError: false` not `isError: boolean`) which cannot be satisfied
 * by a generic mock object.
 */
export function mockQuerySuccess<T>(
  data: T
  // biome-ignore lint/suspicious/noExplicitAny: TanStack Query literal types require any
): any {
  return {
    data,
    result: undefined,
    apiError: undefined,
    isApiError: false,
    dataUpdatedAt: mockEpochMillis(),
    error: null,
    errorUpdatedAt: 0,
    errorUpdateCount: 0,
    failureCount: 0,
    failureReason: null,
    fetchStatus: 'idle',
    isError: false,
    isFetched: true,
    isFetchedAfterMount: true,
    isFetching: false,
    isInitialLoading: false,
    isLoading: false,
    isLoadingError: false,
    isPaused: false,
    isPending: false,
    isPlaceholderData: false,
    isRefetchError: false,
    isRefetching: false,
    isStale: false,
    isSuccess: true,
    refetch: jest.fn().mockResolvedValue({ data, status: 'success' }),
    status: 'success',
    promise: Promise.resolve(data),
  }
}

/**
 * Mock a loading query state - returns type compatible with useEffectQuery
 */
export function mockQueryLoading<T = unknown>(
  // biome-ignore lint/suspicious/noExplicitAny: TanStack Query literal types require any
): any {
  return {
    data: undefined as T | undefined,
    result: undefined,
    apiError: undefined,
    isApiError: false,
    dataUpdatedAt: 0,
    error: null,
    errorUpdatedAt: 0,
    errorUpdateCount: 0,
    failureCount: 0,
    failureReason: null,
    fetchStatus: 'fetching',
    isError: false,
    isFetched: false,
    isFetchedAfterMount: false,
    isFetching: true,
    isInitialLoading: true,
    isLoading: true,
    isLoadingError: false,
    isPaused: false,
    isPending: true,
    isPlaceholderData: false,
    isRefetchError: false,
    isRefetching: false,
    isStale: false,
    isSuccess: false,
    refetch: jest.fn(),
    status: 'pending',
    promise: new Promise<T>(() => {}),
  }
}

/**
 * Mock an error query state - returns type compatible with useEffectQuery
 * With typed errors, API errors are returned via apiError field
 */
export function mockQueryError<T = unknown>(
  error: Error = new Error('Query failed')
  // biome-ignore lint/suspicious/noExplicitAny: TanStack Query literal types require any
): any {
  const rejectedPromise = Promise.reject(error)
  rejectedPromise.catch(() => {})

  return {
    data: undefined as T | undefined,
    result: undefined,
    apiError: { _tag: 'UnknownError' as const, message: error.message },
    isApiError: true,
    dataUpdatedAt: 0,
    error: null,
    errorUpdatedAt: mockEpochMillis(),
    errorUpdateCount: 1,
    failureCount: 1,
    failureReason: error,
    fetchStatus: 'idle',
    isError: false,
    isFetched: true,
    isFetchedAfterMount: true,
    isFetching: false,
    isInitialLoading: false,
    isLoading: false,
    isLoadingError: false,
    isPaused: false,
    isPending: false,
    isPlaceholderData: false,
    isRefetchError: false,
    isRefetching: false,
    isStale: false,
    isSuccess: true,
    refetch: jest.fn(),
    status: 'success',
    promise: rejectedPromise,
  }
}

/**
 * Mock a successful mutation - returns type compatible with useEffectMutation
 * Includes the extended fields (result, apiError, isApiError)
 */
export function mockMutationSuccess<TData = unknown, TVariables = unknown>(
  // biome-ignore lint/suspicious/noExplicitAny: TanStack Query literal types require any
): any {
  return {
    context: undefined,
    data: undefined as TData | undefined,
    result: undefined,
    apiError: undefined,
    isApiError: false,
    error: null,
    failureCount: 0,
    failureReason: null,
    isError: false,
    isIdle: false,
    isPaused: false,
    isPending: false,
    isSuccess: true,
    mutate: jest.fn(),
    mutateAsync: jest.fn().mockResolvedValue({} as TData),
    reset: jest.fn(),
    status: 'success',
    submittedAt: mockEpochMillis(),
    variables: undefined as TVariables | undefined,
  }
}

/**
 * Mock a loading mutation state - returns type compatible with useEffectMutation
 */
export function mockMutationLoading<TData = unknown, TVariables = unknown>(
  // biome-ignore lint/suspicious/noExplicitAny: TanStack Query literal types require any
): any {
  return {
    context: undefined,
    data: undefined as TData | undefined,
    result: undefined,
    apiError: undefined,
    isApiError: false,
    error: null,
    failureCount: 0,
    failureReason: null,
    isError: false,
    isIdle: false,
    isPaused: false,
    isPending: true,
    isSuccess: false,
    mutate: jest.fn(),
    mutateAsync: jest.fn(),
    reset: jest.fn(),
    status: 'pending',
    submittedAt: mockEpochMillis(),
    variables: undefined as TVariables | undefined,
  }
}

/**
 * Mock an error mutation state - returns type compatible with useEffectMutation
 * With typed errors, API errors are returned via apiError field
 */
export function mockMutationError<TData = unknown, TVariables = unknown>(
  error: Error = new Error('Mutation failed')
  // biome-ignore lint/suspicious/noExplicitAny: TanStack Query literal types require any
): any {
  return {
    context: undefined,
    data: undefined as TData | undefined,
    result: undefined,
    apiError: { _tag: 'UnknownError' as const, message: error.message },
    isApiError: true,
    error: null,
    failureCount: 1,
    failureReason: error,
    isError: false,
    isIdle: false,
    isPaused: false,
    isPending: false,
    isSuccess: true,
    mutate: jest.fn(),
    mutateAsync: jest.fn().mockResolvedValue(undefined),
    reset: jest.fn(),
    status: 'success',
    submittedAt: mockEpochMillis(),
    variables: undefined as TVariables | undefined,
  }
}

/**
 * Mock an idle mutation state - returns type compatible with useEffectMutation
 */
export function mockMutationIdle<TData = unknown, TVariables = unknown>(
  // biome-ignore lint/suspicious/noExplicitAny: TanStack Query literal types require any
): any {
  return {
    context: undefined,
    data: undefined as TData | undefined,
    result: undefined,
    apiError: undefined,
    isApiError: false,
    error: null,
    failureCount: 0,
    failureReason: null,
    isError: false,
    isIdle: true,
    isPaused: false,
    isPending: false,
    isSuccess: false,
    mutate: jest.fn(),
    mutateAsync: jest.fn(),
    reset: jest.fn(),
    status: 'idle',
    submittedAt: 0,
    variables: undefined as TVariables | undefined,
  }
}
