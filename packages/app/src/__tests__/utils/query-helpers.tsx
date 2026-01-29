import {
  QueryClient,
  QueryClientProvider,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query'
import {
  type RenderHookOptions,
  renderHook,
} from '@testing-library/react-native'
import type { ReactNode } from 'react'
import { mockEpochMillis } from './dates'

/**
 * Create a test query client with sensible defaults
 */
export function createTestQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
        staleTime: 0,
      },
      mutations: {
        retry: false,
      },
    },
  })
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
 * Mock a successful query response - returns UseQueryResult compatible type
 * Type assertion is centralized here so tests don't need `as any`
 */
export function mockQuerySuccess<T>(data: T): UseQueryResult<T, Error> {
  return {
    data,
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
  } as unknown as UseQueryResult<T, Error>
}

/**
 * Mock a loading query state - returns UseQueryResult compatible type
 */
export function mockQueryLoading<T = unknown>(): UseQueryResult<T, Error> {
  return {
    data: undefined,
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
  } as unknown as UseQueryResult<T, Error>
}

/**
 * Mock an error query state - returns UseQueryResult compatible type
 */
export function mockQueryError<T = unknown>(
  error: Error = new Error('Query failed')
): UseQueryResult<T, Error> {
  return {
    data: undefined,
    dataUpdatedAt: 0,
    error,
    errorUpdatedAt: mockEpochMillis(),
    errorUpdateCount: 1,
    failureCount: 1,
    failureReason: error,
    fetchStatus: 'idle',
    isError: true,
    isFetched: true,
    isFetchedAfterMount: true,
    isFetching: false,
    isInitialLoading: false,
    isLoading: false,
    isLoadingError: true,
    isPaused: false,
    isPending: false,
    isPlaceholderData: false,
    isRefetchError: false,
    isRefetching: false,
    isStale: false,
    isSuccess: false,
    refetch: jest.fn(),
    status: 'error',
  } as unknown as UseQueryResult<T, Error>
}

/**
 * Mock a successful mutation - returns UseMutationResult compatible type
 */
export function mockMutationSuccess<
  TData = unknown,
  TVariables = unknown,
>(): UseMutationResult<TData, Error, TVariables> {
  return {
    context: undefined,
    data: undefined,
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
    variables: undefined,
  } as unknown as UseMutationResult<TData, Error, TVariables>
}

/**
 * Mock a loading mutation state - returns UseMutationResult compatible type
 */
export function mockMutationLoading<
  TData = unknown,
  TVariables = unknown,
>(): UseMutationResult<TData, Error, TVariables> {
  return {
    context: undefined,
    data: undefined,
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
    variables: undefined,
  } as unknown as UseMutationResult<TData, Error, TVariables>
}

/**
 * Mock an error mutation state - returns UseMutationResult compatible type
 */
export function mockMutationError<TData = unknown, TVariables = unknown>(
  error: Error = new Error('Mutation failed')
): UseMutationResult<TData, Error, TVariables> {
  return {
    context: undefined,
    data: undefined,
    error,
    failureCount: 1,
    failureReason: error,
    isError: true,
    isIdle: false,
    isPaused: false,
    isPending: false,
    isSuccess: false,
    mutate: jest.fn(),
    mutateAsync: jest.fn().mockRejectedValue(error),
    reset: jest.fn(),
    status: 'error',
    submittedAt: mockEpochMillis(),
    variables: undefined,
  } as unknown as UseMutationResult<TData, Error, TVariables>
}

/**
 * Mock an idle mutation state - returns UseMutationResult compatible type
 */
export function mockMutationIdle<
  TData = unknown,
  TVariables = unknown,
>(): UseMutationResult<TData, Error, TVariables> {
  return {
    context: undefined,
    data: undefined,
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
    variables: undefined,
  } as unknown as UseMutationResult<TData, Error, TVariables>
}

/**
 * Helper to wait for a query to settle
 */
export async function waitForQuery(queryClient: QueryClient): Promise<void> {
  await queryClient.getQueryCache().onFocus()
  await new Promise((resolve) => setTimeout(resolve, 0))
}
