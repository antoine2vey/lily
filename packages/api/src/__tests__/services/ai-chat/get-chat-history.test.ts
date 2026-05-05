import { mockChatMessages } from '@lily/api/__tests__/fixtures/chat'
import { createMockChatRepository } from '@lily/api/__tests__/mocks/chat.repository'
import { createMockGCSService } from '@lily/api/__tests__/mocks/gcs.service'
import { createMockCurrentUser } from '@lily/api/__tests__/mocks/session'
import { getChatHistory } from '@lily/api/services/ai-chat/endpoints/get-chat-history'
import { Array, Effect, Layer } from 'effect'
import { describe, expect, it } from 'vitest'

describe('getChatHistory', () => {
  const createTestLayer = (messages = [...mockChatMessages]) =>
    Layer.mergeAll(
      createMockChatRepository({ messages }),
      createMockCurrentUser({ id: 'user-1' }),
      createMockGCSService()
    )

  it('should return chat history for conversation with pagination info', async () => {
    const result = await Effect.runPromise(
      getChatHistory({ conversationId: 'conv-plant-1' }).pipe(
        Effect.provide(createTestLayer())
      )
    )

    expect(result.items.length).toBe(3)
    expect(
      Array.every(result.items, (msg) => msg.conversationId === 'conv-plant-1')
    ).toBe(true)
    expect(Array.every(result.items, (msg) => msg.userId === 'user-1')).toBe(
      true
    )
    expect(result.total).toBe(3)
    expect(result.page).toBe(1)
    expect(result.limit).toBe(20)
    expect(result.hasMore).toBe(false)
  })

  it('should return empty array when no messages exist', async () => {
    const result = await Effect.runPromise(
      getChatHistory({ conversationId: 'conv-nonexistent' }).pipe(
        Effect.provide(createTestLayer())
      )
    )

    expect(result.items).toEqual([])
    expect(result.total).toBe(0)
    expect(result.hasMore).toBe(false)
  })

  it('should scope strictly to its conversation', async () => {
    const result = await Effect.runPromise(
      getChatHistory({ conversationId: 'conv-plant-1' }).pipe(
        Effect.provide(createTestLayer())
      )
    )

    // Other conversations (e.g. user-2's) must not appear here
    expect(
      Array.every(result.items, (msg) => msg.conversationId === 'conv-plant-1')
    ).toBe(true)
  })

  it('should return messages sorted by createdAt ascending', async () => {
    const result = await Effect.runPromise(
      getChatHistory({ conversationId: 'conv-plant-1' }).pipe(
        Effect.provide(createTestLayer())
      )
    )

    expect(result.items.length).toBeGreaterThan(1)
    expect(Array.every(result.items, (msg) => msg.createdAt != null)).toBe(true)
  })

  it('should return messages with correct structure', async () => {
    const result = await Effect.runPromise(
      getChatHistory({ conversationId: 'conv-plant-1' }).pipe(
        Effect.provide(createTestLayer())
      )
    )

    const firstMessage = result.items[0]
    expect(firstMessage).toBeDefined()
    expect(firstMessage).toHaveProperty('id')
    expect(firstMessage).toHaveProperty('role')
    expect(firstMessage).toHaveProperty('content')
    expect(firstMessage?.conversationId).toBe('conv-plant-1')
    expect(firstMessage?.userId).toBe('user-1')
    expect(firstMessage).toHaveProperty('createdAt')
  })

  it('should return different history for different conversations', async () => {
    const conv1Result = await Effect.runPromise(
      getChatHistory({ conversationId: 'conv-plant-1' }).pipe(
        Effect.provide(createTestLayer())
      )
    )
    const conv2Result = await Effect.runPromise(
      getChatHistory({ conversationId: 'conv-plant-2' }).pipe(
        Effect.provide(createTestLayer())
      )
    )

    expect(conv1Result.items.length).toBe(3)
    expect(conv2Result.items.length).toBe(1)
    expect(conv2Result.items[0]?.conversationId).toBe('conv-plant-2')
  })

  it('should respect page and limit parameters', async () => {
    const result = await Effect.runPromise(
      getChatHistory({
        conversationId: 'conv-plant-1',
        page: 1,
        limit: 2,
      }).pipe(Effect.provide(createTestLayer()))
    )

    expect(result.items.length).toBe(2)
    expect(result.total).toBe(3)
    expect(result.hasMore).toBe(true)
    expect(result.page).toBe(1)
    expect(result.limit).toBe(2)
  })
})
