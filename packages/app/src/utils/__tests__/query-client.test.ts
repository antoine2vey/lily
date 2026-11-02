import { QueryClientProvider, useMutation } from '@tanstack/react-query'
import { renderHook } from '@testing-library/react-native'
import { createElement, type ReactNode } from 'react'
import { createQueryClient } from '@/utils/query-client'

// Long enough that a reintroduced retry fails on the call count, not on the timeout.
const REGRESSION_TIMEOUT_MS = 15_000

const renderWithAppClient = <T>(hook: () => T) => {
  const queryClient = createQueryClient()
  return renderHook(hook, {
    wrapper: ({ children }: { children: ReactNode }) =>
      createElement(QueryClientProvider, { client: queryClient }, children),
  })
}

describe('createQueryClient mutations', () => {
  it(
    'sends a failing mutation once',
    async () => {
      const mutationFn = jest.fn(async () => {
        throw new Error('Network request failed')
      })
      const { result } = renderWithAppClient(() => useMutation({ mutationFn }))

      await expect(result.current.mutateAsync()).rejects.toThrow(
        'Network request failed'
      )

      expect(mutationFn).toHaveBeenCalledTimes(1)
    },
    REGRESSION_TIMEOUT_MS
  )
})
