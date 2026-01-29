import { useQueryClient } from '@tanstack/react-query'
import { useCallback } from 'react'

const SUBSCRIPTION_QUERY_KEY = ['subscriptions', 'getCurrentSubscription']

export function useSubscriptionSync() {
  const queryClient = useQueryClient()

  const syncSubscription = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: SUBSCRIPTION_QUERY_KEY })
  }, [queryClient])

  return { syncSubscription }
}
