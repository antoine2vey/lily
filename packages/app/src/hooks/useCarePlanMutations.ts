import { nowAsDate } from '@lily/shared'
import type {
  CarePlan,
  CarePlanListResponse,
  CarePlanStep,
} from '@lily/shared/care-plan'
import { type QueryClient, useQueryClient } from '@tanstack/react-query'
import { Array as Arr } from 'effect'
import { useEffectMutation } from '@/utils/client'
import {
  patchCachedResults,
  restoreCachedResults,
} from '@/utils/optimistic-cache'
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

// Both plan lists (the Care tab's and a plant's) live under carePlans.all.
const patchCachedPlans = (
  queryClient: QueryClient,
  patch: (plans: ReadonlyArray<CarePlan>) => ReadonlyArray<CarePlan>
) =>
  patchCachedResults<CarePlanListResponse>(
    queryClient,
    { queryKey: queryKeys.carePlans.all },
    (list) => ({ ...list, items: patch(list.items) })
  )

const patchPlan =
  (planId: string, patch: (plan: CarePlan) => CarePlan) =>
  (plans: ReadonlyArray<CarePlan>) =>
    Arr.map(plans, (plan) => (plan.id === planId ? patch(plan) : plan))

const patchStep = (
  { planId, stepId }: { planId: string; stepId: string },
  patch: (step: CarePlanStep) => CarePlanStep
) =>
  patchPlan(planId, (plan) => ({
    ...plan,
    steps: Arr.map(plan.steps, (step) =>
      step.id === stepId ? patch(step) : step
    ),
  }))

export function useCompleteCarePlanStep() {
  const queryClient = useQueryClient()
  const invalidate = useInvalidateCarePlanQueries()
  return useEffectMutation('carePlans', 'completeCarePlanStep', {
    onMutate: ({ params }) =>
      patchCachedPlans(
        queryClient,
        patchStep(params, (step) => ({ ...step, completedAt: nowAsDate() }))
      ),
    onError: (_error, _variables, snapshot) =>
      restoreCachedResults(queryClient, snapshot),
    onSettled: invalidate,
  })
}

export function useUncompleteCarePlanStep() {
  const queryClient = useQueryClient()
  const invalidate = useInvalidateCarePlanQueries()
  return useEffectMutation('carePlans', 'uncompleteCarePlanStep', {
    onMutate: ({ params }) =>
      patchCachedPlans(
        queryClient,
        patchStep(params, ({ completedAt: _, ...open }) => open)
      ),
    onError: (_error, _variables, snapshot) =>
      restoreCachedResults(queryClient, snapshot),
    onSettled: invalidate,
  })
}

export function useDeleteCarePlan() {
  const queryClient = useQueryClient()
  const invalidate = useInvalidateCarePlanQueries()
  return useEffectMutation('carePlans', 'deleteCarePlan', {
    onMutate: ({ params: { planId } }) =>
      patchCachedPlans(queryClient, (plans) =>
        Arr.filter(plans, (plan) => plan.id !== planId)
      ),
    onError: (_error, _variables, snapshot) =>
      restoreCachedResults(queryClient, snapshot),
    onSettled: invalidate,
  })
}

export function useDeleteCarePlanStep() {
  const queryClient = useQueryClient()
  const invalidate = useInvalidateCarePlanQueries()
  return useEffectMutation('carePlans', 'deleteCarePlanStep', {
    onMutate: ({ params: { planId, stepId } }) =>
      patchCachedPlans(
        queryClient,
        patchPlan(planId, (plan) => ({
          ...plan,
          steps: Arr.filter(plan.steps, (step) => step.id !== stepId),
        }))
      ),
    onError: (_error, _variables, snapshot) =>
      restoreCachedResults(queryClient, snapshot),
    onSettled: invalidate,
  })
}
