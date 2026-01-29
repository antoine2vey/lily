import { useQueryClient } from '@tanstack/react-query'
import { useEffectMutation } from 'src/utils/client'

export function useSyncSubscription() {
  const queryClient = useQueryClient()

  return useEffectMutation('subscriptions', 'syncSubscription', {
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['subscriptions'] })
    },
  })
}
