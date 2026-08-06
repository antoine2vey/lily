import { useMutation, useQueryClient } from '@tanstack/react-query'
import { apiEffectRunner, useEffectQuery } from '@/utils/client'
import { queryKeys } from '@/utils/query-keys'

export function useVacation() {
  return useEffectQuery('vacation', 'getVacation', {})
}

// Both mutations use apiEffectRunner (throws on API failure) so callers'
// onError callbacks actually fire — useEffectMutation resolves with an
// Either and would report failures through onSuccess.
export function useSetVacation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (payload: { startDate: Date; endDate: Date }) =>
      apiEffectRunner('vacation', 'setVacation', { payload }),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.vacation.all })
    },
  })
}

export function useCancelVacation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: () => apiEffectRunner('vacation', 'cancelVacation', {}),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.vacation.all })
      // Ending a vacation shifts care schedules — refresh tasks too
      queryClient.invalidateQueries({ queryKey: queryKeys.careTasks.all })
    },
  })
}
