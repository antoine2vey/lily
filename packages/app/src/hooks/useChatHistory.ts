import type { Message } from '@ai-sdk/react'
import { parseToNativeDate, StaleTime } from '@lily/shared'
import { Array, DateTime, Option, pipe } from 'effect'
import { useEffectQuery } from 'src/utils/client'

// Extended message type with imageUrl for display
export interface ChatMessageDisplay {
  id: string
  role: 'user' | 'assistant'
  content: string
  imageUrl?: string
  createdAt: Date
}

// Transform API message to Message format for AI SDK
const toMessage = (msg: {
  id: string
  role: 'user' | 'assistant'
  content: string
  createdAt: Date | string
}): Message => ({
  id: msg.id,
  role: msg.role,
  content: msg.content,
  createdAt:
    msg.createdAt instanceof Date
      ? msg.createdAt
      : pipe(
          parseToNativeDate(String(msg.createdAt)),
          Option.getOrElse(() => DateTime.toDateUtc(DateTime.unsafeMake(0)))
        ),
})

// Transform API message to display format for ChatMessage component
const toDisplayMessage = (msg: {
  id: string
  role: 'user' | 'assistant'
  content: string
  imageUrl?: string
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
          Option.getOrElse(() => DateTime.toDateUtc(DateTime.unsafeMake(0)))
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
    { enabled: !!plantId, staleTime: StaleTime.default }
  )

  // Transform to Message format for AI SDK initialMessages (chronological order)
  const initialMessages: Message[] = pipe(
    Option.fromNullable(query.data?.items),
    Option.map(Array.map(toMessage)),
    Option.getOrElse(() => [] as Message[])
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
