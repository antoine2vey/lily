import type { ChatTransport, UIMessage } from 'ai'

const mockSent: Array<unknown> = []
const mockChatOptions: Array<{ transport: ChatTransport<UIMessage> }> = []

jest.mock('expo/fetch', () => ({
  fetch: (_url: string, init: { body: string }) => {
    mockSent.push(JSON.parse(init.body))
    return Promise.reject(new Error('the test reads the request only'))
  },
}))
jest.mock('@/utils/auth-fetch', () => ({
  withAuthRefresh: (fetch: typeof globalThis.fetch) => fetch,
}))
jest.mock('@/utils/client', () => ({ API_BASE_URL: 'http://api.test' }))
jest.mock('@ai-sdk/react', () => ({
  useChat: (options: { transport: ChatTransport<UIMessage> }) => {
    mockChatOptions.push(options)
    return { messages: [], setMessages: () => undefined }
  },
}))

import { renderHook } from '@testing-library/react-native'
import { useConversationChat } from '../useConversationChat'

const said = (
  id: string,
  role: UIMessage['role'],
  text: string
): UIMessage => ({
  id,
  role,
  parts: [{ type: 'text', text }],
})

const history = [
  said('m1', 'user', 'Is my Fern thirsty?'),
  said('m2', 'assistant', 'Water it today.'),
  said('m3', 'user', 'How much water?'),
]

const requestBodyFor = async (body?: Record<string, unknown>) => {
  mockSent.length = 0
  mockChatOptions.length = 0
  renderHook(() => useConversationChat({ conversationId: 'conv-fern' }))
  const transport = mockChatOptions.at(-1)?.transport
  if (transport === undefined) throw new Error('useChat got no transport')

  await transport
    .sendMessages({
      trigger: 'submit-message',
      chatId: 'conversation-conv-fern',
      messageId: undefined,
      messages: history,
      abortSignal: undefined,
      ...(body === undefined ? {} : { body }),
    })
    .catch(() => undefined)

  return mockSent[0]
}

describe('useConversationChat request body', () => {
  it('sends the last user message and the chip it came from', async () => {
    const sent = await requestBodyFor({
      suggestion: { id: '1:late:watering', source: 'follow_up' },
    })

    expect(sent).toEqual({
      message: 'How much water?',
      suggestion: { id: '1:late:watering', source: 'follow_up' },
    })
  })

  it('sends no suggestion for a typed message', async () => {
    const sent = await requestBodyFor()

    expect(sent).toEqual({ message: 'How much water?' })
  })

  it('sends the image of a message with a photo', async () => {
    const sent = await requestBodyFor({ imageKey: 'chat/fern.jpg' })

    expect(sent).toEqual({
      message: 'How much water?',
      imageKey: 'chat/fern.jpg',
    })
  })

  it('drops a suggestion that is not a chip tap', async () => {
    const sent = await requestBodyFor({
      suggestion: { id: '1:late:watering', source: 'typed' },
    })

    expect(sent).toEqual({ message: 'How much water?' })
  })
})
