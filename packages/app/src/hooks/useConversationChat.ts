import { useChat } from '@ai-sdk/react'
import { ChatSuggestionTap } from '@lily/shared/ai-chat'
import type { UIMessage } from 'ai'
import { DefaultChatTransport } from 'ai'
import { Array, Option, pipe, Schema } from 'effect'
import { fetch as expoFetch } from 'expo/fetch'
import type React from 'react'
import { useEffect, useMemo, useRef } from 'react'
import { withAuthRefresh } from '@/utils/auth-fetch'
import { API_BASE_URL } from '@/utils/client'

export type { UIMessage }

interface UseConversationChatOptions {
  conversationId: string
  initialMessages?: UIMessage[] | undefined
}

const getMessageText = (msg: UIMessage): string =>
  pipe(
    msg.parts,
    Array.findFirst(
      (p): p is Extract<(typeof msg.parts)[number], { type: 'text' }> =>
        p.type === 'text'
    ),
    Option.map((p) => p.text),
    Option.getOrElse(() => '')
  )

const decodeSuggestion = Schema.decodeUnknownOption(ChatSuggestionTap)

export function useConversationChat({
  conversationId,
  initialMessages,
}: UseConversationChatOptions): ReturnType<typeof useChat> & {
  pendingImageUrl: React.RefObject<string | undefined>
} {
  const pendingImageUrl = useRef<string | undefined>(undefined)

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: `${API_BASE_URL}/api/chat/conversations/${conversationId}/stream`,
        fetch: withAuthRefresh(expoFetch as typeof globalThis.fetch),
        prepareSendMessagesRequest: async ({
          messages,
          body,
        }: {
          messages: UIMessage[]
          body?: Record<string, unknown> | undefined
        }) => {
          const message = pipe(
            messages,
            Array.filter((m: UIMessage) => m.role === 'user'),
            Array.last,
            Option.map(getMessageText),
            Option.getOrElse(() => '')
          )

          const imageKey = body?.imageKey as string | undefined
          const suggestion = decodeSuggestion(body?.suggestion)

          return {
            body: {
              message,
              ...Option.match(Option.fromNullishOr(imageKey), {
                onNone: () => ({}),
                onSome: (key) => ({ imageKey: key }),
              }),
              ...Option.match(suggestion, {
                onNone: () => ({}),
                onSome: (tap) => ({ suggestion: tap }),
              }),
            },
          }
        },
      }),
    [conversationId]
  )

  const chat = useChat({
    id: `conversation-${conversationId}`,
    transport,
  })

  const syncedIdRef = useRef<string | null>(null)
  useEffect(() => {
    if (syncedIdRef.current === conversationId) return
    if (initialMessages === undefined) return
    syncedIdRef.current = conversationId
    const sentBeforeHistoryLoaded = Array.isReadonlyArrayNonEmpty(chat.messages)
    if (sentBeforeHistoryLoaded) return
    chat.setMessages(initialMessages)
  }, [initialMessages, chat.messages, chat.setMessages, conversationId])

  return {
    ...chat,
    pendingImageUrl,
  }
}
