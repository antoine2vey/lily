import { Array, Option, pipe } from 'effect'
import { useCallback } from 'react'
import { useConversations } from '@/hooks/useConversations'
import { getApiResultData } from '@/utils/client'

/**
 * Looks up an existing plant-kind conversation for the given plant id.
 *
 * Doesn't fetch on mount — only on demand via `findExisting()`. That call
 * forces a fresh network read so callers don't race the cache (e.g. a
 * just-created conversation that hasn't landed in the list yet).
 */
export function useConversationByPlant(plantId: string | undefined) {
  const query = useConversations({
    kind: 'plant',
    limit: 50,
    enabled: false,
  })

  const findExisting = useCallback(async () => {
    if (!plantId) return Option.none<string>()
    const refreshed = await query.refetch()
    const items = getApiResultData(refreshed.data)?.items
    return pipe(
      Option.fromNullable(items),
      Option.flatMap(Array.findFirst((c) => c.plantId === plantId)),
      Option.map((c) => c.id)
    )
  }, [plantId, query.refetch])

  return { findExisting }
}
