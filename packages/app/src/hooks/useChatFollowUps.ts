import type { LanguageCode } from '@lily/shared'
import { useQuery } from '@tanstack/react-query'
import { Result } from 'effect'
import type { PlantSuggestions } from '@/hooks/useChatSuggestions'
import { useLocalization } from '@/hooks/useLocalization'
import { effectQueryKey, runApiEffect } from '@/utils/client'

export const FOLLOW_UPS_KEY = ['aiChat', 'listChatFollowUps'] as const
const KEEP_FOR_THE_VISIT = Number.POSITIVE_INFINITY

export const requestChatFollowUps = (language: LanguageCode) =>
  runApiEffect('aiChat', 'requestChatFollowUps', { payload: { language } })

export function useChatFollowUps(plantId: string): PlantSuggestions {
  const { language } = useLocalization()
  const params = { query: { plantId, language } }
  const { data } = useQuery({
    queryKey: effectQueryKey('aiChat', 'listChatFollowUps', params),
    queryFn: () => runApiEffect('aiChat', 'listChatFollowUps', params),
    staleTime: KEEP_FOR_THE_VISIT,
  })
  if (data === undefined) return { _tag: 'Loading' }
  return Result.match(data, {
    onFailure: () => ({ _tag: 'Failed' }),
    onSuccess: ({ suggestions }) => ({ _tag: 'Loaded', suggestions }),
  })
}
