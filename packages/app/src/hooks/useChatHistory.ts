import { parseToNativeDate } from '@lily/shared'
import type { UIMessage } from 'ai'
import { Array, Option, pipe } from 'effect'
import { useEffectQuery } from '@/utils/client'

// Extended message type with imageUrl for display
export interface ChatMessageDisplay {
  id: string
  role: 'user' | 'assistant'
  content: string
  imageUrl?: string | undefined
  createdAt: Date
}

// Transform API message to UIMessage format for AI SDK
const toUIMessage = (msg: {
  id: string
  role: 'user' | 'assistant'
  content: string
  imageUrl?: string | undefined
  parts?: readonly unknown[] | undefined
  createdAt: Date | string
}): UIMessage => {
  // Build image file part from freshly resolved imageUrl
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

  // When stored parts exist (preserves tool calls, diagnosis cards, etc.),
  // use them but replace file parts with freshly signed imageUrl
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

// Transform API message to display format for ChatMessage component
const toDisplayMessage = (msg: {
  id: string
  role: 'user' | 'assistant'
  content: string
  imageUrl?: string | undefined
  createdAt: Date | string
}): ChatMessageDisplay => ({
  id: msg.id,
  role: msg.role,
  content: msg.content,
  imageUrl: msg.imageUrl,
  createdAt:
    msg.createdAt instanceof Date
      ? msg.createdAt
      : pipe(
          parseToNativeDate(String(msg.createdAt)),
          Option.getOrElse(() => new Date(0))
        ),
})

export function useChatHistory(plantId?: string) {
  const query = useEffectQuery(
    'aiChat',
    'getChatHistory',
    {
      path: {
        plantId: pipe(
          Option.fromNullable(plantId),
          Option.getOrElse(() => '')
        ),
      },
      urlParams: { page: '1', limit: '50' },
    },
    { enabled: !!plantId, staleTime: 0 }
  )

  // Transform to UIMessage format for AI SDK initialMessages (chronological order)
  const initialMessages: UIMessage[] = pipe(
    Option.fromNullable(query.data?.items),
    Option.map(Array.map(toUIMessage)),
    Option.getOrElse(() => [] as UIMessage[])
  )

  // Transform and reverse for inverted FlatList display
  const displayMessages: ChatMessageDisplay[] = pipe(
    Option.fromNullable(query.data?.items),
    Option.map(Array.map(toDisplayMessage)),
    Option.map(Array.reverse),
    Option.getOrElse(() => [] as ChatMessageDisplay[])
  )

  return {
    ...query,
    data: displayMessages,
    initialMessages,
  }
}
