import { mockChatMessages } from '@lily/api/__tests__/fixtures/chat'
import { createMockAiService } from '@lily/api/__tests__/mocks/ai.service'
import { createMockChatRepository } from '@lily/api/__tests__/mocks/chat.repository'
import { createMockEventBus } from '@lily/api/__tests__/mocks/event-bus'
import { createMockPgDrizzle } from '@lily/api/__tests__/mocks/pg-drizzle'
import { createMockCurrentUser } from '@lily/api/__tests__/mocks/session'
import type { AppEvent } from '@lily/api/events'
import { sendChatMessage } from '@lily/api/services/ai-chat/endpoints/send-chat-message'
import { Effect, Layer } from 'effect'
import { describe, expect, it } from 'vitest'

describe('sendChatMessage', () => {
  const createTestLayer = (messages = [...mockChatMessages]) =>
    Layer.mergeAll(
      createMockChatRepository({ messages }),
      createMockAiService({ plantChatResponse: 'AI response text' }),
      createMockEventBus(),
      createMockCurrentUser({ id: 'user-1' }),
      createMockPgDrizzle()
    )

  it('should save user message and return AI response', async () => {
    const result = await Effect.runPromise(
      sendChatMessage('plant-1', { message: 'Hello plant!' }).pipe(
        Effect.provide(createTestLayer())
      )
    )

    expect(result.message.role).toBe('user')
    expect(result.message.content).toBe('Hello plant!')
    expect(result.message.plantId).toBe('plant-1')
    expect(result.message.userId).toBe('user-1')
    expect(result.response).toBe('AI response text')
  })

  it('should return message with generated id', async () => {
    const result = await Effect.runPromise(
      sendChatMessage('plant-1', { message: 'Test' }).pipe(
        Effect.provide(createTestLayer())
      )
    )

    expect(result.message.id).toBeTruthy()
    expect(typeof result.message.id).toBe('string')
  })

  it('should save both user and assistant messages to repository', async () => {
    const messages: typeof mockChatMessages = []
    const layer = Layer.mergeAll(
      createMockChatRepository({ messages }),
      createMockAiService({ plantChatResponse: 'AI says hello' }),
      createMockEventBus(),
      createMockCurrentUser({ id: 'user-1' }),
      createMockPgDrizzle()
    )

    await Effect.runPromise(
      sendChatMessage('plant-1', { message: 'User says hi' }).pipe(
        Effect.provide(layer)
      )
    )

    expect(messages.length).toBe(2)
    expect(messages[0]?.role).toBe('user')
    expect(messages[0]?.content).toBe('User says hi')
    expect(messages[1]?.role).toBe('assistant')
    expect(messages[1]?.content).toBe('AI says hello')
  })

  it('should publish ChatMessageSent event', async () => {
    const publishedEvents: AppEvent[] = []
    const layer = Layer.mergeAll(
      createMockChatRepository({ messages: [] }),
      createMockAiService(),
      createMockEventBus({ publishedEvents }),
      createMockCurrentUser({ id: 'user-1' }),
      createMockPgDrizzle()
    )

    await Effect.runPromise(
      sendChatMessage('plant-1', { message: 'Test' }).pipe(
        Effect.provide(layer)
      )
    )

    expect(publishedEvents.length).toBe(1)
    expect(publishedEvents[0]).toMatchObject({
      _tag: 'ChatMessageSent',
      userId: 'user-1',
      plantId: 'plant-1',
    })
  })

  it('should handle empty message', async () => {
    const result = await Effect.runPromise(
      sendChatMessage('plant-1', {}).pipe(Effect.provide(createTestLayer()))
    )

    expect(result.message.content).toBe('')
  })

  it('should set createdAt timestamp', async () => {
    const before = new Date()
    const result = await Effect.runPromise(
      sendChatMessage('plant-1', { message: 'Test' }).pipe(
        Effect.provide(createTestLayer())
      )
    )
    const after = new Date()

    expect(result.message.createdAt.getTime()).toBeGreaterThanOrEqual(
      before.getTime()
    )
    expect(result.message.createdAt.getTime()).toBeLessThanOrEqual(
      after.getTime()
    )
  })
})
