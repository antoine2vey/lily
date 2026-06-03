import { createMockChatRepository } from '@lily/api/__tests__/mocks/chat.repository'
import { listUserConversationMessages } from '@lily/api/services/admin/endpoints/list-user-conversation-messages'
import type { ChatConversation, ChatMessage } from '@lily/shared/ai-chat'
import { Effect, Exit } from 'effect'
import { describe, expect, it } from 'vitest'

const conv = (id: string, userId: string): ChatConversation => ({
  id,
  userId,
  kind: 'general',
  createdAt: new Date(),
  lastMessageAt: new Date(),
})

const msg = (
  id: string,
  conversationId: string,
  userId: string
): ChatMessage => ({
  id,
  role: 'user',
  content: 'hello',
  conversationId,
  userId,
  createdAt: new Date(),
})

describe('listUserConversationMessages', () => {
  it('returns messages when the conversation belongs to the user', async () => {
    const conversations = [conv('c1', 'user-1')]
    const messages = [msg('m1', 'c1', 'user-1'), msg('m2', 'c1', 'user-1')]

    const result = await Effect.runPromise(
      listUserConversationMessages('user-1', 'c1', {
        page: '1',
        limit: '20',
      }).pipe(
        Effect.provide(createMockChatRepository({ messages, conversations }))
      )
    )

    expect(result.total).toBe(2)
    expect(result.items.length).toBe(2)
  })

  it('fails with ConversationNotFoundError when it belongs to another user', async () => {
    const conversations = [conv('c1', 'user-2')]

    const result = await Effect.runPromiseExit(
      listUserConversationMessages('user-1', 'c1', {
        page: '1',
        limit: '20',
      }).pipe(
        Effect.provide(
          createMockChatRepository({ messages: [], conversations })
        )
      )
    )

    expect(Exit.isFailure(result)).toBe(true)
  })

  it('fails with ConversationNotFoundError when the conversation is missing', async () => {
    const result = await Effect.runPromiseExit(
      listUserConversationMessages('user-1', 'missing', {
        page: '1',
        limit: '20',
      }).pipe(
        Effect.provide(
          createMockChatRepository({ messages: [], conversations: [] })
        )
      )
    )

    expect(Exit.isFailure(result)).toBe(true)
  })
})
