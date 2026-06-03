import { createMockChatRepository } from '@lily/api/__tests__/mocks/chat.repository'
import { listUserConversations } from '@lily/api/services/admin/endpoints/list-user-conversations'
import type { ChatConversation } from '@lily/shared/ai-chat'
import { Effect } from 'effect'
import { describe, expect, it } from 'vitest'

const conv = (id: string, userId: string): ChatConversation => ({
  id,
  userId,
  kind: 'general',
  createdAt: new Date(),
  lastMessageAt: new Date(),
})

describe('listUserConversations', () => {
  it("lists only the target user's conversations, paginated", async () => {
    const conversations = [
      conv('c1', 'user-1'),
      conv('c2', 'user-1'),
      conv('c-other', 'user-2'),
    ]

    const result = await Effect.runPromise(
      listUserConversations('user-1', { page: '1', limit: '20' }).pipe(
        Effect.provide(
          createMockChatRepository({ messages: [], conversations })
        )
      )
    )

    expect(result.total).toBe(2)
    expect(result.items.length).toBe(2)
  })
})
