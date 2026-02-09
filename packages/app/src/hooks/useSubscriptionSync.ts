import { useQueryClient } from '@tanstack/react-query'
import { useCallback } from 'react'
import { queryKeys } from 'src/utils/query-keys'

export function useSubscriptionSync() {
  const queryClient = useQueryClient()

  const syncSubscription = useCallback(() => {
    queryClient.invalidateQueries({
      queryKey: queryKeys.subscriptions.current(),
    })
  }, [queryClient])

  return { syncSubscription }
}
