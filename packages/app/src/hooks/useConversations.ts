import type { ChatConversationKind } from '@lily/shared/ai-chat'
import { useEffectQuery } from '@/utils/client'

export function useConversations(
  opts: {
    kind?: ChatConversationKind
    page?: number
    limit?: number
    enabled?: boolean
  } = {}
) {
  return useEffectQuery(
    'aiChat',
    'listConversations',
    {
      urlParams: {
        page: String(opts.page ?? 1),
        limit: String(opts.limit ?? 20),
        ...(opts.kind ? { kind: opts.kind } : {}),
      },
    },
    { staleTime: 30_000, enabled: opts.enabled ?? true }
  )
}
