import type { LanguageCode } from '@lily/shared'
import type { ChatSuggestion } from '@lily/shared/ai-chat'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Result } from 'effect'
import { useCallback, useEffect } from 'react'
import { useLocalization } from '@/hooks/useLocalization'
import { effectQueryKey, runApiEffect } from '@/utils/client'

export type PlantSuggestions =
  | { readonly _tag: 'Loading' }
  | {
      readonly _tag: 'Loaded'
      readonly suggestions: ReadonlyArray<ChatSuggestion>
    }
  | { readonly _tag: 'Failed' }

const SUGGESTIONS_KEY = ['aiChat', 'listChatSuggestions'] as const
const NEVER_REPLACE_RENDERED_CHIPS = Number.POSITIVE_INFINITY

const suggestionsQuery = (plantId: string, language: LanguageCode) => {
  const params = { query: { plantId, language } }
  return {
    queryKey: effectQueryKey('aiChat', 'listChatSuggestions', params),
    queryFn: () => runApiEffect('aiChat', 'listChatSuggestions', params),
    staleTime: NEVER_REPLACE_RENDERED_CHIPS,
  }
}

export function useChatSuggestions(plantId: string): PlantSuggestions {
  const { language } = useLocalization()
  const { data } = useQuery(suggestionsQuery(plantId, language))
  if (data === undefined) return { _tag: 'Loading' }
  return Result.match(data, {
    onFailure: () => ({ _tag: 'Failed' }),
    onSuccess: ({ suggestions }) => ({ _tag: 'Loaded', suggestions }),
  })
}

export function useDropChatSuggestionsOnLeave() {
  const queryClient = useQueryClient()
  useEffect(
    () => () => queryClient.removeQueries({ queryKey: SUGGESTIONS_KEY }),
    [queryClient]
  )
}

export function usePrefetchChatSuggestions() {
  const queryClient = useQueryClient()
  const { language } = useLocalization()

  return useCallback(
    (plantId: string) =>
      queryClient.prefetchQuery(suggestionsQuery(plantId, language)),
    [queryClient, language]
  )
}
