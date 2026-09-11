import { Option, pipe } from 'effect'
import { useEffectQuery } from '@/utils/client'

/** One conversation by id; gives the chat screen its `kind` and `plantId`. */
export function useConversation(conversationId?: string) {
  return useEffectQuery(
    'aiChat',
    'getConversation',
    {
      path: {
        conversationId: pipe(
          Option.fromNullable(conversationId),
          Option.getOrElse(() => '')
        ),
      },
    },
    { enabled: Boolean(conversationId), staleTime: 60_000 }
  )
}
