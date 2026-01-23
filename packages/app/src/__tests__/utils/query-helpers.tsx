import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  type RenderHookOptions,
  renderHook,
} from '@testing-library/react-native'
import type { ReactNode } from 'react'
import React from 'react'

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
 * Mock a successful query response
 */
export function mockQuerySuccess<T>(data: T) {
  return {
    data,
    isLoading: false,
    isError: false,
    error: null,
    isFetching: false,
    isSuccess: true,
    isPending: false,
    refetch: jest.fn().mockResolvedValue({ data }),
  }
}

/**
 * Mock a loading query state
 */
export function mockQueryLoading() {
  return {
    data: undefined,
    isLoading: true,
    isError: false,
    error: null,
    isFetching: true,
    isSuccess: false,
    isPending: true,
    refetch: jest.fn(),
  }
}

/**
 * Mock an error query state
 */
export function mockQueryError(error: Error = new Error('Query failed')) {
  return {
    data: undefined,
    isLoading: false,
    isError: true,
    error,
    isFetching: false,
    isSuccess: false,
    isPending: false,
    refetch: jest.fn(),
  }
}

/**
 * Mock a successful mutation
 */
export function mockMutationSuccess<T>() {
  return {
    mutate: jest.fn(),
    mutateAsync: jest.fn().mockResolvedValue({} as T),
    isLoading: false,
    isPending: false,
    isError: false,
    error: null,
    isSuccess: true,
    reset: jest.fn(),
  }
}

/**
 * Mock a loading mutation state
 */
export function mockMutationLoading() {
  return {
    mutate: jest.fn(),
    mutateAsync: jest.fn(),
    isLoading: true,
    isPending: true,
    isError: false,
    error: null,
    isSuccess: false,
    reset: jest.fn(),
  }
}

/**
 * Mock an error mutation state
 */
export function mockMutationError(error: Error = new Error('Mutation failed')) {
  return {
    mutate: jest.fn(),
    mutateAsync: jest.fn().mockRejectedValue(error),
    isLoading: false,
    isPending: false,
    isError: true,
    error,
    isSuccess: false,
    reset: jest.fn(),
  }
}

/**
 * Helper to wait for a query to settle
 */
export async function waitForQuery(queryClient: QueryClient): Promise<void> {
  await queryClient.getQueryCache().onFocus()
  await new Promise((resolve) => setTimeout(resolve, 0))
}
