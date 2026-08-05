import { useQueryClient } from '@tanstack/react-query'
import { useEffectMutation, useEffectQuery } from '@/utils/client'
import { queryKeys } from '@/utils/query-keys'

export function useVacation() {
  return useEffectQuery('vacation', 'getVacation', {})
}

export function useSetVacation() {
  const queryClient = useQueryClient()

  return useEffectMutation('vacation', 'setVacation', {
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.vacation.all })
    },
  })
}

export function useCancelVacation() {
  const queryClient = useQueryClient()

  return useEffectMutation('vacation', 'cancelVacation', {
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.vacation.all })
      // Ending a vacation shifts care schedules — refresh tasks too
      queryClient.invalidateQueries({ queryKey: queryKeys.careTasks.all })
    },
  })
}
