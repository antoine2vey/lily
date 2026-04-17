import type { AiChatVolumeResponse } from '@lily/shared/admin/analytics'
import { useQuery } from '@tanstack/react-query'
import { apiRequest } from '@/lib/api-client'
import {
  resolvePresetRange,
  useAnalyticsFilters,
} from './use-analytics-filters'

export const useAiChatVolume = () => {
  const { preset } = useAnalyticsFilters()
  return useQuery({
    queryKey: ['analytics', 'ai-chat-volume', preset],
    queryFn: () => {
      const { from, to } = resolvePresetRange(preset)
      return apiRequest<AiChatVolumeResponse>(
        `/api/admin/analytics/ai-chat-volume?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`
      )
    },
    staleTime: 5 * 60 * 1000,
  })
}
