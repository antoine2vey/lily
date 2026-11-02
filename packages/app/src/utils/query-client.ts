import { QueryClient } from '@tanstack/react-query'

export const createQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: {
        retry: (failureCount, error) => {
          // Don't retry on 401 errors - let apiEffectRunner handle token refresh
          const msg = error instanceof Error ? error.message : String(error)
          if (msg.includes('401') || msg.includes('Unauthorized')) {
            return false
          }
          return failureCount < 3
        },
      },
      mutations: {
        retry: (failureCount, error) => {
          // Don't retry on 401 errors for mutations either
          const msg = error instanceof Error ? error.message : String(error)
          if (msg.includes('401') || msg.includes('Unauthorized')) {
            return false
          }
          return failureCount < 3
        },
      },
    },
  })
