import { effectQueryKey, useEffectQuery } from '@/utils/client'

const CARE_TASKS_PARAMS = { query: {} }

export const CARE_TASKS_QUERY_KEY = effectQueryKey(
  'careTasks',
  'getCareTasks',
  CARE_TASKS_PARAMS
)

export function useCareTasks() {
  return useEffectQuery('careTasks', 'getCareTasks', CARE_TASKS_PARAMS)
}
