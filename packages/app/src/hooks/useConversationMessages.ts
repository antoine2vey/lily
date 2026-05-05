import { parseToNativeDate } from '@lily/shared'
import type { UIMessage } from 'ai'
import { Array, Option, pipe } from 'effect'
import { useMemo } from 'react'
import { useEffectQuery } from '@/utils/client'

const toUIMessage = (msg: {
  id: string
  role: 'user' | 'assistant'
  content: string
  imageUrl?: string | undefined
  parts?: readonly unknown[] | undefined
  createdAt: Date | string
}): UIMessage => {
  const fileParts: UIMessage['parts'] = pipe(
    Option.fromNullable(msg.imageUrl),
    Option.match({
      onNone: () => [] as UIMessage['parts'],
      onSome: (url) =>
        [
          {
            type: 'file' as const,
            mediaType: 'image/jpeg',
            url,
          },
        ] as UIMessage['parts'],
    })
  )

  const parts: UIMessage['parts'] = pipe(
    Option.fromNullable(msg.parts),
    Option.filter(Array.isNonEmptyReadonlyArray),
    Option.match({
      onNone: () =>
        [
          ...fileParts,
          { type: 'text' as const, text: msg.content },
        ] as UIMessage['parts'],
      onSome: (storedParts) =>
        [
          ...fileParts,
          ...pipe(
            storedParts as unknown as UIMessage['parts'],
            Array.filter((p) => p.type !== 'file')
          ),
        ] as UIMessage['parts'],
    })
  )

  return {
    id: msg.id,
    role: msg.role,
    parts,
    metadata: {
      createdAt:
        msg.createdAt instanceof Date
          ? msg.createdAt.toISOString()
          : pipe(
              parseToNativeDate(String(msg.createdAt)),
              Option.map((d) => d.toISOString()),
              Option.getOrElse(() => String(msg.createdAt))
            ),
    },
  }
}

export function useConversationMessages(conversationId?: string) {
  const query = useEffectQuery(
    'aiChat',
    'getConversationMessages',
    {
      path: {
        conversationId: pipe(
          Option.fromNullable(conversationId),
          Option.getOrElse(() => '')
        ),
      },
      urlParams: { page: '1', limit: '50' },
    },
    { enabled: !!conversationId, staleTime: 0 }
  )

  const initialMessages = useMemo<UIMessage[]>(
    () =>
      pipe(
        Option.fromNullable(query.data?.items),
        Option.map(Array.map(toUIMessage)),
        Option.getOrElse(() => [] as UIMessage[])
      ),
    [query.data?.items]
  )

  return {
    ...query,
    initialMessages,
  }
}
