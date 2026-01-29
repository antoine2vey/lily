import { useEffectQuery } from 'src/utils/client'

const StaleTime = {
  subscription: 1000 * 60 * 5, // 5 minutes
}

export function useSubscription() {
  return useEffectQuery(
    'subscriptions',
    'getCurrentSubscription',
    {},
    {
      staleTime: StaleTime.subscription,
    }
  )
}
