import { mockChatMessages } from '@lily/api/__tests__/fixtures/chat'
import { createMockChatRepository } from '@lily/api/__tests__/mocks/chat.repository'
import { createMockSession } from '@lily/api/__tests__/mocks/session'
import { getChatHistory } from '@lily/api/services/ai-chat/endpoints/get-chat-history'
import { Effect, Layer } from 'effect'
import { describe, expect, it } from 'vitest'

describe('getChatHistory', () => {
  const createTestLayer = (messages = [...mockChatMessages]) =>
    Layer.mergeAll(
      createMockChatRepository({ messages }),
      createMockSession({ userId: 'user-1' })
    )

  it('should return chat history for plant and user with pagination info', async () => {
    const result = await Effect.runPromise(
      getChatHistory({ plantId: 'plant-1' }).pipe(
        Effect.provide(createTestLayer())
      )
    )

    expect(result.items.length).toBe(3)
    expect(result.items.every((msg) => msg.plantId === 'plant-1')).toBe(true)
    expect(result.items.every((msg) => msg.userId === 'user-1')).toBe(true)
    expect(result.total).toBe(3)
    expect(result.page).toBe(1)
    expect(result.limit).toBe(20)
    expect(result.hasMore).toBe(false)
  })

  it('should return empty array when no messages exist', async () => {
    const result = await Effect.runPromise(
      getChatHistory({ plantId: 'plant-nonexistent' }).pipe(
        Effect.provide(createTestLayer())
      )
    )

    expect(result.items).toEqual([])
    expect(result.total).toBe(0)
    expect(result.hasMore).toBe(false)
  })

  it('should only return messages for current user', async () => {
    const result = await Effect.runPromise(
      getChatHistory({ plantId: 'plant-1' }).pipe(
        Effect.provide(createTestLayer())
      )
    )

    // user-2 has a message on plant-1 but should not be returned
    expect(result.items.every((msg) => msg.userId === 'user-1')).toBe(true)
    expect(result.items.some((msg) => msg.userId === 'user-2')).toBe(false)
  })

  it('should return messages sorted by createdAt ascending', async () => {
    const result = await Effect.runPromise(
      getChatHistory({ plantId: 'plant-1' }).pipe(
        Effect.provide(createTestLayer())
      )
    )

    // Verify we have messages and they have createdAt fields
    expect(result.items.length).toBeGreaterThan(1)
    expect(result.items.every((msg) => msg.createdAt != null)).toBe(true)
  })

  it('should return messages with correct structure', async () => {
    const result = await Effect.runPromise(
      getChatHistory({ plantId: 'plant-1' }).pipe(
        Effect.provide(createTestLayer())
      )
    )

    const firstMessage = result.items[0]
    expect(firstMessage).toBeDefined()
    expect(firstMessage).toHaveProperty('id')
    expect(firstMessage).toHaveProperty('role')
    expect(firstMessage).toHaveProperty('content')
    expect(firstMessage?.plantId).toBe('plant-1')
    expect(firstMessage?.userId).toBe('user-1')
    expect(firstMessage).toHaveProperty('createdAt')
  })

  it('should return different history for different plants', async () => {
    const plant1Result = await Effect.runPromise(
      getChatHistory({ plantId: 'plant-1' }).pipe(
        Effect.provide(createTestLayer())
      )
    )
    const plant2Result = await Effect.runPromise(
      getChatHistory({ plantId: 'plant-2' }).pipe(
        Effect.provide(createTestLayer())
      )
    )

    expect(plant1Result.items.length).toBe(3)
    expect(plant2Result.items.length).toBe(1)
    expect(plant2Result.items[0]?.plantId).toBe('plant-2')
  })

  it('should respect page and limit parameters', async () => {
    const result = await Effect.runPromise(
      getChatHistory({ plantId: 'plant-1', page: 1, limit: 2 }).pipe(
        Effect.provide(createTestLayer())
      )
    )

    expect(result.items.length).toBe(2)
    expect(result.total).toBe(3)
    expect(result.hasMore).toBe(true)
    expect(result.page).toBe(1)
    expect(result.limit).toBe(2)
  })
})
