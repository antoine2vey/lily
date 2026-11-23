import type { CareTask, CareTasksResponse } from '@lily/shared'
import type { QueryClient } from '@tanstack/react-query'
import { Array as Arr } from 'effect'
import { useEffectQuery } from '@/utils/client'
import {
  type CacheSnapshot,
  patchCachedResults,
} from '@/utils/optimistic-cache'
import { effectQueryKey } from '@/utils/query-keys'

export const CARE_TASKS_PARAMS = { query: { includeCanopy: 'true' } }

export const CARE_TASKS_QUERY_KEY = effectQueryKey(
  'careTasks',
  'getCareTasks',
  CARE_TASKS_PARAMS
)

export function useCareTasks() {
  return useEffectQuery('careTasks', 'getCareTasks', CARE_TASKS_PARAMS)
}

/**
 * Drop the overdue and today tasks a care action completes, and count each
 * one in `completedToday`. Returns the snapshot to restore if the API fails.
 */
export function completeCachedCareTasks(
  queryClient: QueryClient,
  isCompleted: (task: CareTask) => boolean
): CacheSnapshot {
  return patchCachedResults<CareTasksResponse>(
    queryClient,
    { queryKey: CARE_TASKS_QUERY_KEY, exact: true },
    (tasks) => {
      const isOpen = (task: CareTask) => !isCompleted(task)
      const overdue = Arr.filter(tasks.overdue, isOpen)
      const today = Arr.filter(tasks.today, isOpen)
      const completedNow =
        Arr.length(tasks.overdue) -
        Arr.length(overdue) +
        Arr.length(tasks.today) -
        Arr.length(today)
      return {
        ...tasks,
        overdue,
        today,
        completedToday: tasks.completedToday + completedNow,
      }
    }
  )
}
