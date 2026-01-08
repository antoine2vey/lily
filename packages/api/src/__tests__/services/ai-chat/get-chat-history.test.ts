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

  it('should return chat history for plant and user', async () => {
    const result = await Effect.runPromise(
      getChatHistory('plant-1').pipe(Effect.provide(createTestLayer()))
    )

    expect(result.length).toBe(3)
    expect(result.every((msg) => msg.plantId === 'plant-1')).toBe(true)
    expect(result.every((msg) => msg.userId === 'user-1')).toBe(true)
  })

  it('should return empty array when no messages exist', async () => {
    const result = await Effect.runPromise(
      getChatHistory('plant-nonexistent').pipe(
        Effect.provide(createTestLayer())
      )
    )

    expect(result).toEqual([])
  })

  it('should only return messages for current user', async () => {
    const result = await Effect.runPromise(
      getChatHistory('plant-1').pipe(Effect.provide(createTestLayer()))
    )

    // user-2 has a message on plant-1 but should not be returned
    expect(result.every((msg) => msg.userId === 'user-1')).toBe(true)
    expect(result.some((msg) => msg.userId === 'user-2')).toBe(false)
  })

  it('should return messages sorted by createdAt ascending', async () => {
    const result = await Effect.runPromise(
      getChatHistory('plant-1').pipe(Effect.provide(createTestLayer()))
    )

    for (let i = 1; i < result.length; i++) {
      const current = result[i]
      const previous = result[i - 1]
      if (current && previous) {
        expect(current.createdAt.getTime()).toBeGreaterThanOrEqual(
          previous.createdAt.getTime()
        )
      }
    }
  })

  it('should return messages with correct structure', async () => {
    const result = await Effect.runPromise(
      getChatHistory('plant-1').pipe(Effect.provide(createTestLayer()))
    )

    expect(result[0]).toMatchObject({
      id: expect.any(String),
      role: expect.stringMatching(/^(user|assistant)$/),
      content: expect.any(String),
      plantId: 'plant-1',
      userId: 'user-1',
      createdAt: expect.any(Date),
    })
  })

  it('should return different history for different plants', async () => {
    const plant1Result = await Effect.runPromise(
      getChatHistory('plant-1').pipe(Effect.provide(createTestLayer()))
    )
    const plant2Result = await Effect.runPromise(
      getChatHistory('plant-2').pipe(Effect.provide(createTestLayer()))
    )

    expect(plant1Result.length).toBe(3)
    expect(plant2Result.length).toBe(1)
    expect(plant2Result[0]?.plantId).toBe('plant-2')
  })
})
