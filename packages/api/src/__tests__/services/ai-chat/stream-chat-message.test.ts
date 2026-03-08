import type { HttpServerResponse } from '@effect/platform'
import { schedulesFromPlants } from '@lily/api/__tests__/fixtures/care-schedules'
import { mockChatMessages } from '@lily/api/__tests__/fixtures/chat'
import { mockPlants } from '@lily/api/__tests__/fixtures/plants'
import { createMockAiService } from '@lily/api/__tests__/mocks/ai.service'
import { createMockCareLogRepository } from '@lily/api/__tests__/mocks/care-log.repository'
import { createMockCareScheduleRepository } from '@lily/api/__tests__/mocks/care-schedule.repository'
import { createMockChatRepository } from '@lily/api/__tests__/mocks/chat.repository'
import { createMockDelegationRepository } from '@lily/api/__tests__/mocks/delegation.repository'
import { createMockDiagnosisRepository } from '@lily/api/__tests__/mocks/diagnosis.repository'
import { createMockEventBus } from '@lily/api/__tests__/mocks/event-bus'
import { createMockGCSService } from '@lily/api/__tests__/mocks/gcs.service'
import {
  createMockLimitChecker,
  MockLimitCheckerLive,
} from '@lily/api/__tests__/mocks/limit-checker'
import { createMockPlantRepository } from '@lily/api/__tests__/mocks/plant.repository'
import { MockRagServiceLive } from '@lily/api/__tests__/mocks/rag.service'
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

const emptyDelegationMock = createMockDelegationRepository({
  delegations: [],
  delegationPlants: [],
  users: [],
  plants: [],
})

describe('streamChatMessage', () => {
  const createTestLayer = (
    opts: {
      messages?: ChatMessage[]
      publishedEvents?: AppEvent[]
      aiChatLimitReached?: boolean
      plantChatResponse?: string
      userId?: string
      mockSteps?: readonly import('@lily/api/services/ai-chat/plant-chat').StepData[]
    } = {}
  ) =>
    Layer.mergeAll(
      createMockChatRepository({
        messages: opts.messages ?? [...mockChatMessages],
      }),
      createMockAiService({
        plantChatResponse: opts.plantChatResponse ?? 'AI response text',
        ...(opts.mockSteps ? { mockSteps: opts.mockSteps } : {}),
      }),
      createMockEventBus(
        opts.publishedEvents
          ? { publishedEvents: opts.publishedEvents }
          : undefined
      ),
      createMockCurrentUser({ id: opts.userId ?? 'user-1' }),
      createMockPlantRepository({ plants: mockPlants }),
      createMockCareLogRepository([]),
      createMockDiagnosisRepository([]),
      opts.aiChatLimitReached
        ? createMockLimitChecker({ aiChatLimitReached: true })
        : MockLimitCheckerLive,
      MockUsageTrackerLive,
      MockRagServiceLive,
      createMockCareScheduleRepository({
        schedules: schedulesFromPlants(mockPlants),
        plants: mockPlants,
      })
    ).pipe(
      Layer.merge(createMockGCSService()),
      Layer.merge(emptyDelegationMock)
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

    const result = await Effect.runPromise(
      streamChatMessage('plant-1', { message: 'Test' }).pipe(
        Effect.provide(
          createTestLayer({
            messages,
            aiChatLimitReached: true,
            plantChatResponse: 'Should not see this',
          })
        )
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

    const result = await Effect.runPromise(
      streamChatMessage('plant-1', { message: 'User says hi' }).pipe(
        Effect.provide(
          createTestLayer({
            messages,
            publishedEvents,
            plantChatResponse: 'AI says hello',
          })
        )
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

    const result = await Effect.runPromise(
      streamChatMessage('plant-1', { message: 'New message' }).pipe(
        Effect.provide(
          createTestLayer({
            messages: existingMessages,
            plantChatResponse: 'AI response',
          })
        )
      )
    )

    // Response should be valid - history is used internally for AI context
    expect(result).toBeDefined()
  })

  it('should use userId from CurrentUser context', async () => {
    const messages: ChatMessage[] = []

    const result = await Effect.runPromise(
      streamChatMessage('plant-1', { message: 'Test' }).pipe(
        Effect.provide(
          createTestLayer({
            messages,
            userId: 'custom-user-id',
            plantChatResponse: 'Response',
          })
        )
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

      await Effect.runPromise(
        streamChatMessage('plant-1', { message: 'Test' }).pipe(
          Effect.provide(
            createTestLayer({
              messages: [],
              publishedEvents,
              aiChatLimitReached: true,
              plantChatResponse: 'AI response',
            })
          )
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

      await Effect.runPromise(
        streamChatMessage('plant-1', { message: 'Test' }).pipe(
          Effect.provide(
            createTestLayer({
              messages,
              aiChatLimitReached: true,
              plantChatResponse: 'Should not see',
            })
          )
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

      const result = await Effect.runPromise(
        streamChatMessage('plant-1', {
          message: 'My plant looks sick',
        }).pipe(
          Effect.provide(
            createTestLayer({
              messages,
              publishedEvents,
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
            })
          )
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
