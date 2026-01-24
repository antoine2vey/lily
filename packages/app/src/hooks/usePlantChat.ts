import { type Message, useChat } from '@ai-sdk/react'
import { Array, Option, pipe } from 'effect'
import { fetch as expoFetch } from 'expo/fetch'
import * as SecureStore from 'expo-secure-store'
import { ACCESS_TOKEN_KEY, API_BASE_URL } from 'src/utils/client'

export type { Message }

interface UsePlantChatOptions {
  plantId: string
  initialMessages?: Message[]
}

interface AISdkRequestBody {
  messages?: Array<{ role: string; content: string }>
}

const safeParseJson = (body: string): Option.Option<AISdkRequestBody> => {
  try {
    return Option.some(JSON.parse(body) as AISdkRequestBody)
  } catch {
    return Option.none()
  }
}

/**
 * Extract the last user message from AI SDK's request format.
 * AI SDK sends { messages: [...] }, but our backend expects { message: string }
 */
const extractLastUserMessage = (body: string | undefined): string =>
  pipe(
    Option.fromNullable(body),
    Option.flatMap(safeParseJson),
    Option.flatMap((parsed) => Option.fromNullable(parsed.messages)),
    Option.flatMap((msgs) =>
      pipe(
        msgs,
        Array.filter((m) => m.role === 'user'),
        Array.last
      )
    ),
    Option.map((m) => m.content),
    Option.getOrElse(() => '')
  )

const getUrl = (input: RequestInfo | URL): string =>
  typeof input === 'string'
    ? input
    : input instanceof Request
      ? input.url
      : input.toString()

const buildAuthHeaders = async (): Promise<Record<string, string>> => {
  const token = await SecureStore.getItemAsync(ACCESS_TOKEN_KEY)
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  }
}

export function usePlantChat({
  plantId,
  initialMessages,
}: UsePlantChatOptions) {
  return useChat({
    id: `plant-chat-${plantId}`,
    initialMessages,
    streamProtocol: 'text',
    api: `${API_BASE_URL}/api/plants/${plantId}/chat/stream`,
    fetch: async (input, init) => {
      const headers = await buildAuthHeaders()
      const message = extractLastUserMessage(init?.body as string | undefined)

      return expoFetch(getUrl(input), {
        method: 'POST',
        headers,
        body: JSON.stringify({ message }),
      })
    },
  })
}
