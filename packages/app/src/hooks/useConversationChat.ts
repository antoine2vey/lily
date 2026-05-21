import { useChat } from '@ai-sdk/react'
import type { UIMessage } from 'ai'
import { DefaultChatTransport } from 'ai'
import { Array, Option, pipe } from 'effect'
import { fetch as expoFetch } from 'expo/fetch'
import * as SecureStore from 'expo-secure-store'
import type React from 'react'
import { useEffect, useMemo, useRef } from 'react'
import { ACCESS_TOKEN_KEY, API_BASE_URL } from '@/utils/client'

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
        fetch: expoFetch as typeof globalThis.fetch,
        headers: async () => {
          const token = await SecureStore.getItemAsync(ACCESS_TOKEN_KEY)
          return pipe(
            Option.fromNullable(token),
            Option.match({
              onNone: (): Record<string, string> => ({}),
              onSome: (t): Record<string, string> => ({
                Authorization: `Bearer ${t}`,
              }),
            })
          )
        },
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

          return {
            body: pipe(
              Option.fromNullable(imageKey),
              Option.match({
                onNone: () => ({ message }),
                onSome: (key) => ({ message, imageKey: key }),
              })
            ),
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
    chat.setMessages(initialMessages)
    syncedIdRef.current = conversationId
  }, [initialMessages, chat.setMessages, conversationId])

  return {
    ...chat,
    pendingImageUrl,
  }
}
