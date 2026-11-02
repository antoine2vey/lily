import { QueryClient } from '@tanstack/react-query'

export const createQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: {
        retry: (failureCount, error) => {
          const msg = error instanceof Error ? error.message : String(error)
          if (msg.includes('401') || msg.includes('Unauthorized')) {
            return false
          }
          return failureCount < 3
        },
      },
    },
  })
