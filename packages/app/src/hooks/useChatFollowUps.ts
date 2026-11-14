import type { LanguageCode } from '@lily/shared'
import type { ChatSuggestion } from '@lily/shared/ai-chat'
import { useQuery } from '@tanstack/react-query'
import { Result } from 'effect'
import { useLocalization } from '@/hooks/useLocalization'
import { effectQueryKey, runApiEffect } from '@/utils/client'

export const FOLLOW_UPS_KEY = ['aiChat', 'listChatFollowUps'] as const
const KEEP_FOR_THE_VISIT = Number.POSITIVE_INFINITY

export const requestChatFollowUps = (language: LanguageCode) =>
  runApiEffect('aiChat', 'requestChatFollowUps', { payload: { language } })

export function useChatFollowUps(
  plantId: string
): ReadonlyArray<ChatSuggestion> {
  const { language } = useLocalization()
  const params = { query: { plantId, language } }
  const { data } = useQuery({
    queryKey: effectQueryKey('aiChat', 'listChatFollowUps', params),
    queryFn: () => runApiEffect('aiChat', 'listChatFollowUps', params),
    staleTime: KEEP_FOR_THE_VISIT,
  })
  if (data === undefined) return []
  return Result.match(data, {
    onFailure: () => [],
    onSuccess: ({ suggestions }) => suggestions,
  })
}
