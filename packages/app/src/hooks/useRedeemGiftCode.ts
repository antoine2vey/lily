import { useQueryClient } from '@tanstack/react-query'
import { useEffectMutation } from '@/utils/client'
import { queryKeys } from '@/utils/query-keys'

export function useRedeemGiftCode() {
  const queryClient = useQueryClient()

  return useEffectMutation('subscriptions', 'redeemGiftCode', {
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.subscriptions.current(),
      })
    },
  })
}
