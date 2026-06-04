import { useQuery } from '@tanstack/react-query'
import { Array, Either } from 'effect'
import { runApiEffect } from '@/utils/client'

// Same key/fetcher as `useEffectQuery('careTasks', 'getCareTasks', {})` in
// useCareTasks, so this observer shares that query's cache entry.
const CARE_TASKS_QUERY_KEY = ['careTasks', 'getCareTasks', {}] as const

export interface CareTabBadge {
  /** Whether to render a badge at all (overdue + due-today > 0). */
  visible: boolean
  /** The count to render, or `null` for a dot-only badge. */
  count: number | null
}

/**
 * Care-tab badge state, tuned per platform to avoid the iOS Liquid Glass flicker.
 *
 * On the iOS 26 Liquid Glass tab bar, ANY re-render of the tab layout re-applies
 * the native bar appearance and flickers it (see memory: native-tabs-badge-flicker).
 * So when `withCount` is false we `select` a BOOLEAN — React Query then notifies
 * only when it flips 0↔>0, so a burst of completions causes ZERO re-renders and the
 * dot never flickers. (Returning a primitive guarantees the `Object.is` bail-out.)
 *
 * On Android / non-Liquid-Glass iOS (`withCount: true`) the bar doesn't flicker on
 * re-render, so we select the live COUNT and render the exact number.
 */
export function useCareTabBadge(withCount: boolean): CareTabBadge {
  const { data } = useQuery({
    queryKey: CARE_TASKS_QUERY_KEY,
    queryFn: () => runApiEffect('careTasks', 'getCareTasks', {}),
    select: (result) => {
      const count = Either.match(result, {
        onLeft: () => 0,
        onRight: (tasks) =>
          Array.length(tasks.overdue) + Array.length(tasks.today),
      })
      return withCount ? count : count > 0
    },
  })

  if (withCount) {
    const count = typeof data === 'number' ? data : 0
    return { visible: count > 0, count }
  }
  return { visible: data === true, count: null }
}
