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
    result: undefined,
    apiError: undefined,
    isApiError: false as const,
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

/**
 * Mock a loading mutation state - returns type compatible with useEffectMutation
 */
export function mockMutationLoading<TData = unknown, TVariables = unknown>() {
  return {
    context: undefined,
    data: undefined as TData | undefined,
    result: undefined,
    apiError: undefined,
    isApiError: false as const,
    error: null,
    failureCount: 0,
    failureReason: null,
    isError: false as const,
    isIdle: false as const,
    isPaused: false as const,
    isPending: true as const,
    isSuccess: false as const,
    mutate: jest.fn(),
    mutateAsync: jest.fn(),
    reset: jest.fn(),
    status: 'pending' as const,
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
) {
  return {
    context: undefined,
    data: undefined as TData | undefined,
    result: undefined,
    apiError: { _tag: 'UnknownError' as const, message: error.message },
    isApiError: true as const,
    error: null,
    failureCount: 1,
    failureReason: error,
    isError: false as const,
    isIdle: false as const,
    isPaused: false as const,
    isPending: false as const,
    isSuccess: true as const,
    mutate: jest.fn(),
    mutateAsync: jest.fn().mockResolvedValue(undefined),
    reset: jest.fn(),
    status: 'success' as const,
    submittedAt: mockEpochMillis(),
    variables: undefined as TVariables | undefined,
  }
}

/**
 * Mock an idle mutation state - returns type compatible with useEffectMutation
 */
export function mockMutationIdle<TData = unknown, TVariables = unknown>() {
  return {
    context: undefined,
    data: undefined as TData | undefined,
    result: undefined,
    apiError: undefined,
    isApiError: false as const,
    error: null,
    failureCount: 0,
    failureReason: null,
    isError: false as const,
    isIdle: true as const,
    isPaused: false as const,
    isPending: false as const,
    isSuccess: false as const,
    mutate: jest.fn(),
    mutateAsync: jest.fn(),
    reset: jest.fn(),
    status: 'idle' as const,
    submittedAt: 0,
    variables: undefined as TVariables | undefined,
  }
}
