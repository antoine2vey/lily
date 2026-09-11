import { useQueryClient } from '@tanstack/react-query'
import { useEffectMutation } from '@/utils/client'
import { queryKeys } from '@/utils/query-keys'

// Plan mutations can move schedules (accept) or write care logs (complete a
// care-typed step), so the task list, plants and history all refetch.
function useInvalidateCarePlanQueries() {
  const queryClient = useQueryClient()
  return () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.carePlans.all })
    queryClient.invalidateQueries({ queryKey: queryKeys.careTasks.all })
    queryClient.invalidateQueries({ queryKey: queryKeys.plants.all })
    queryClient.invalidateQueries({ queryKey: queryKeys.careLogs.all })
  }
}

// Accept / dismiss run `onSettled`: a 409 means the card was showing a stale
// status (plan no longer proposed), and a refetch is exactly what fixes it.
export function useAcceptCarePlan() {
  const invalidate = useInvalidateCarePlanQueries()
  return useEffectMutation('carePlans', 'acceptCarePlan', {
    onSettled: invalidate,
  })
}

export function useDismissCarePlan() {
  const invalidate = useInvalidateCarePlanQueries()
  return useEffectMutation('carePlans', 'dismissCarePlan', {
    onSettled: invalidate,
  })
}

export function useDeleteCarePlan() {
  const invalidate = useInvalidateCarePlanQueries()
  return useEffectMutation('carePlans', 'deleteCarePlan', {
    onSuccess: invalidate,
  })
}

export function useCompleteCarePlanStep() {
  const invalidate = useInvalidateCarePlanQueries()
  return useEffectMutation('carePlans', 'completeCarePlanStep', {
    onSuccess: invalidate,
  })
}

export function useUncompleteCarePlanStep() {
  const invalidate = useInvalidateCarePlanQueries()
  return useEffectMutation('carePlans', 'uncompleteCarePlanStep', {
    onSuccess: invalidate,
  })
}

export function useDeleteCarePlanStep() {
  const invalidate = useInvalidateCarePlanQueries()
  return useEffectMutation('carePlans', 'deleteCarePlanStep', {
    onSuccess: invalidate,
  })
}
