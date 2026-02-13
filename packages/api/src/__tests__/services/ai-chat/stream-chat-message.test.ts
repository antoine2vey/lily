import type { HttpServerResponse } from '@effect/platform'
import { mockChatMessages } from '@lily/api/__tests__/fixtures/chat'
import { mockPlants } from '@lily/api/__tests__/fixtures/plants'
import { createMockAiService } from '@lily/api/__tests__/mocks/ai.service'
import { createMockCareLogRepository } from '@lily/api/__tests__/mocks/care-log.repository'
import { createMockChatRepository } from '@lily/api/__tests__/mocks/chat.repository'
import { createMockDiagnosisRepository } from '@lily/api/__tests__/mocks/diagnosis.repository'
import { createMockEventBus } from '@lily/api/__tests__/mocks/event-bus'
import { createMockGCSService } from '@lily/api/__tests__/mocks/gcs.service'
import {
  createMockLimitChecker,
  MockLimitCheckerLive,
} from '@lily/api/__tests__/mocks/limit-checker'
import { createMockPlantRepository } from '@lily/api/__tests__/mocks/plant.repository'
import { createMockCurrentUser } from '@lily/api/__tests__/mocks/session'
import { MockUsageTrackerLive } from '@lily/api/__tests__/mocks/usage-tracker'
import { streamChatMessage } from '@lily/api/services/ai-chat/endpoints/stream-chat-message'
import type { ChatMessage } from '@lily/shared/ai-chat'
import type { AppEvent } from '@lily/shared/server'
import { Effect, Layer, Stream } from 'effect'
import { describe, expect, it } from 'vitest'

/**
 * Drain the SSE stream body to trigger the onComplete callback
 * that persists chat messages. Returns collected SSE data lines.
 */
const drainSseStream = async (
  response: HttpServerResponse.HttpServerResponse
): Promise<string[]> => {
  const decoder = new TextDecoder()
  const chunks: string[] = []
  const body = response.body as unknown as {
    stream: Stream.Stream<Uint8Array, Error>
  }

  await Effect.runPromise(
    Stream.runForEach(body.stream, (chunk) => {
      chunks.push(decoder.decode(chunk))
      return Effect.void
    })
  )

  return chunks
}

describe('streamChatMessage', () => {
  const createTestLayer = (
    messages: ChatMessage[] = [...mockChatMessages],
    options: { aiChatLimitReached?: boolean } = {}
  ) =>
    Layer.mergeAll(
      createMockChatRepository({ messages }),
      createMockAiService({ plantChatResponse: 'AI response text' }),
      createMockEventBus(),
      createMockCurrentUser({ id: 'user-1' }),
      createMockPlantRepository({ plants: mockPlants }),
      createMockCareLogRepository([]),
      createMockDiagnosisRepository([]),
      options.aiChatLimitReached
        ? createMockLimitChecker({ aiChatLimitReached: true })
        : MockLimitCheckerLive,
      MockUsageTrackerLive,
      createMockGCSService()
    )

  it('should return a streaming response', async () => {
    const result = await Effect.runPromise(
      streamChatMessage('plant-1', { message: 'Hello plant!' }).pipe(
        Effect.provide(createTestLayer())
      )
    )

    // The result is an HttpServerResponse
    expect(result).toBeDefined()
    expect(result.headers).toBeDefined()
  })

  it('should return quota exceeded message when limit reached', async () => {
    const messages: ChatMessage[] = []
    const layer = Layer.mergeAll(
      createMockChatRepository({ messages }),
      createMockAiService({ plantChatResponse: 'Should not see this' }),
      createMockEventBus(),
      createMockCurrentUser({ id: 'user-1' }),
      createMockPlantRepository({ plants: mockPlants }),
      createMockCareLogRepository([]),
      createMockDiagnosisRepository([]),
      createMockLimitChecker({ aiChatLimitReached: true }),
      MockUsageTrackerLive,
      createMockGCSService()
    )

    const result = await Effect.runPromise(
      streamChatMessage('plant-1', { message: 'Test' }).pipe(
        Effect.provide(layer)
      )
    )

    // Response should be valid
    expect(result).toBeDefined()

    // Check that the user message and quota exceeded response were saved
    expect(messages.length).toBe(2)
    expect(messages[0]?.role).toBe('user')
    expect(messages[1]?.role).toBe('assistant')
    expect(messages[1]?.content).toBe('__QUOTA_EXCEEDED__')
  })

  it('should persist messages after consuming the stream', async () => {
    const messages: ChatMessage[] = []
    const publishedEvents: AppEvent[] = []
    const layer = Layer.mergeAll(
      createMockChatRepository({ messages }),
      createMockAiService({ plantChatResponse: 'AI says hello' }),
      createMockEventBus({ publishedEvents }),
      createMockCurrentUser({ id: 'user-1' }),
      createMockPlantRepository({ plants: mockPlants }),
      createMockCareLogRepository([]),
      createMockDiagnosisRepository([]),
      MockLimitCheckerLive,
      MockUsageTrackerLive,
      createMockGCSService()
    )

    const result = await Effect.runPromise(
      streamChatMessage('plant-1', { message: 'User says hi' }).pipe(
        Effect.provide(layer)
      )
    )

    // Drain the stream to trigger persistence via onComplete
    await drainSseStream(result)

    // Both user and assistant messages should be saved
    expect(messages.length).toBe(2)
    expect(messages[0]?.role).toBe('user')
    expect(messages[1]?.role).toBe('assistant')
    expect(messages[1]?.content).toBe('AI says hello')

    // ChatMessageSent event should have been published
    expect(publishedEvents.length).toBeGreaterThanOrEqual(1)
    expect(publishedEvents[0]?._tag).toBe('ChatMessageSent')
  })

  it('should retrieve previous chat history', async () => {
    const existingMessages: ChatMessage[] = [
      {
        id: 'msg-1',
        role: 'user',
        content: 'Previous message',
        plantId: 'plant-1',
        userId: 'user-1',
        createdAt: new Date(),
      },
    ]
    const layer = Layer.mergeAll(
      createMockChatRepository({ messages: existingMessages }),
      createMockAiService({ plantChatResponse: 'AI response' }),
      createMockEventBus(),
      createMockCurrentUser({ id: 'user-1' }),
      createMockPlantRepository({ plants: mockPlants }),
      createMockCareLogRepository([]),
      createMockDiagnosisRepository([]),
      MockLimitCheckerLive,
      MockUsageTrackerLive,
      createMockGCSService()
    )

    const result = await Effect.runPromise(
      streamChatMessage('plant-1', { message: 'New message' }).pipe(
        Effect.provide(layer)
      )
    )

    // Response should be valid - history is used internally for AI context
    expect(result).toBeDefined()
  })

  it('should use userId from CurrentUser context', async () => {
    const messages: ChatMessage[] = []
    const layer = Layer.mergeAll(
      createMockChatRepository({ messages }),
      createMockAiService({ plantChatResponse: 'Response' }),
      createMockEventBus(),
      createMockCurrentUser({ id: 'custom-user-id' }),
      createMockPlantRepository({ plants: mockPlants }),
      createMockCareLogRepository([]),
      createMockDiagnosisRepository([]),
      MockLimitCheckerLive,
      MockUsageTrackerLive,
      createMockGCSService()
    )

    const result = await Effect.runPromise(
      streamChatMessage('plant-1', { message: 'Test' }).pipe(
        Effect.provide(layer)
      )
    )

    // Drain stream to trigger persistence
    await drainSseStream(result)

    // Verify the custom user ID was used
    expect(messages.length).toBe(2)
    expect(messages[0]?.userId).toBe('custom-user-id')
    expect(messages[1]?.userId).toBe('custom-user-id')
  })

  it('should handle different plant IDs', async () => {
    const result = await Effect.runPromise(
      streamChatMessage('plant-xyz', { message: 'Hello' }).pipe(
        Effect.provide(createTestLayer())
      )
    )

    expect(result).toBeDefined()
  })

  it('should return content-type header for streaming response', async () => {
    const result = await Effect.runPromise(
      streamChatMessage('plant-1', { message: 'Test' }).pipe(
        Effect.provide(createTestLayer())
      )
    )

    // HttpServerResponse should have headers
    expect(result.headers).toBeDefined()
  })

  it('should handle empty message', async () => {
    const result = await Effect.runPromise(
      streamChatMessage('plant-1', { message: '' }).pipe(
        Effect.provide(createTestLayer())
      )
    )

    expect(result).toBeDefined()
  })

  describe('event publishing (quota exceeded path)', () => {
    it('should not publish events when quota is exceeded', async () => {
      const publishedEvents: AppEvent[] = []
      const layer = Layer.mergeAll(
        createMockChatRepository({ messages: [] }),
        createMockAiService({ plantChatResponse: 'AI response' }),
        createMockEventBus({ publishedEvents }),
        createMockCurrentUser({ id: 'user-1' }),
        createMockPlantRepository({ plants: mockPlants }),
        createMockCareLogRepository([]),
        createMockDiagnosisRepository([]),
        createMockLimitChecker({ aiChatLimitReached: true }),
        MockUsageTrackerLive,
        createMockGCSService()
      )

      await Effect.runPromise(
        streamChatMessage('plant-1', { message: 'Test' }).pipe(
          Effect.provide(layer)
        )
      )

      // Events are only published after successful stream completion
      // In quota exceeded case, no ChatMessageSent event should be published
      expect(publishedEvents.length).toBe(0)
    })
  })

  describe('quota exceeded message content', () => {
    it('should include upgrade suggestion in quota exceeded message', async () => {
      const messages: ChatMessage[] = []
      const layer = Layer.mergeAll(
        createMockChatRepository({ messages }),
        createMockAiService({ plantChatResponse: 'Should not see' }),
        createMockEventBus(),
        createMockCurrentUser({ id: 'user-1' }),
        createMockPlantRepository({ plants: mockPlants }),
        createMockCareLogRepository([]),
        createMockDiagnosisRepository([]),
        createMockLimitChecker({ aiChatLimitReached: true }),
        MockUsageTrackerLive,
        createMockGCSService()
      )

      await Effect.runPromise(
        streamChatMessage('plant-1', { message: 'Test' }).pipe(
          Effect.provide(layer)
        )
      )

      // Find the assistant message
      const assistantMessage = messages[1]
      expect(assistantMessage?.content).toBe('__QUOTA_EXCEEDED__')
    })
  })

  describe('persistence with tool results', () => {
    it('should link diagnoses to chat messages after stream', async () => {
      const messages: ChatMessage[] = []
      const publishedEvents: AppEvent[] = []
      const layer = Layer.mergeAll(
        createMockChatRepository({ messages }),
        createMockAiService({
          plantChatResponse: 'I see some issues.',
          mockSteps: [
            {
              text: 'I see some issues.',
              toolResults: [
                {
                  toolName: 'createDiagnosis',
                  toolCallId: 'call-1',
                  input: {
                    diseaseName: 'Powdery Mildew',
                    severity: 'MODERATE',
                    confidence: 85,
                    symptoms: ['White spots'],
                    treatmentSteps: ['Apply fungicide'],
                  },
                  output: { diagnosisId: 'diag-123' },
                },
              ],
            },
          ],
        }),
        createMockEventBus({ publishedEvents }),
        createMockCurrentUser({ id: 'user-1' }),
        createMockPlantRepository({ plants: mockPlants }),
        createMockCareLogRepository([]),
        createMockDiagnosisRepository([]),
        MockLimitCheckerLive,
        MockUsageTrackerLive,
        createMockGCSService()
      )

      const result = await Effect.runPromise(
        streamChatMessage('plant-1', { message: 'My plant looks sick' }).pipe(
          Effect.provide(layer)
        )
      )

      // Drain the stream to trigger persistence
      await drainSseStream(result)

      // Should have saved both messages
      expect(messages.length).toBe(2)

      // Should have published ChatMessageSent + DiseaseIdentified events
      const eventTags = publishedEvents.map((e) => e._tag)
      expect(eventTags).toContain('ChatMessageSent')
      expect(eventTags).toContain('DiseaseIdentified')
    })
  })
})
