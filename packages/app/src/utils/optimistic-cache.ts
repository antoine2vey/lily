import type { QueryClient, QueryFilters, QueryKey } from '@tanstack/react-query'
import { Array as Arr, Result } from 'effect'
import type { ApiResult } from '@/utils/client'

export type CacheSnapshot = ReadonlyArray<readonly [QueryKey, unknown]>

/**
 * Patch the success value of every cached `ApiResult` under `filters` and
 * return what was there before. Failed and empty entries stay as they are.
 *
 * Runs synchronously so the patch lands inside `mutate()`: a caller that
 * clears its own pending state right after `mutate()` never renders the
 * pre-patch data. `cancelQueries` reverts an in-flight fetch before it
 * returns, so the patch written next is not overwritten by that fetch.
 */
export function patchCachedResults<T>(
  queryClient: QueryClient,
  filters: QueryFilters,
  patch: (data: T) => T
): CacheSnapshot {
  void queryClient.cancelQueries(filters)
  const snapshot = queryClient.getQueriesData(filters)
  queryClient.setQueriesData<ApiResult<T>>(
    filters,
    (cached) => cached && Result.map(cached, patch)
  )
  return snapshot
}

export function restoreCachedResults(
  queryClient: QueryClient,
  snapshot: CacheSnapshot | undefined
): void {
  Arr.forEach(snapshot ?? [], ([key, value]) => {
    queryClient.setQueryData(key, value)
  })
}
