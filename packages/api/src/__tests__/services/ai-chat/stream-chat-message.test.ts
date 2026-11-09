import { schedulesFromPlants } from '@lily/api/__tests__/fixtures/care-schedules'
import {
  mockChatMessages,
  mockPlantConversation,
} from '@lily/api/__tests__/fixtures/chat'
import { failureOf } from '@lily/api/__tests__/fixtures/exit'
import { mockPlants } from '@lily/api/__tests__/fixtures/plants'
import { createMockAiService } from '@lily/api/__tests__/mocks/ai.service'
import { createMockCanopyRepository } from '@lily/api/__tests__/mocks/canopy.repository'
import { createMockCareLogRepository } from '@lily/api/__tests__/mocks/care-log.repository'
import { createMockCarePlanRepository } from '@lily/api/__tests__/mocks/care-plan.repository'
import { createMockCareScheduleRepository } from '@lily/api/__tests__/mocks/care-schedule.repository'
import { createMockChatRepository } from '@lily/api/__tests__/mocks/chat.repository'
import { createMockDelegationRepository } from '@lily/api/__tests__/mocks/delegation.repository'
import { createMockDiagnosisRepository } from '@lily/api/__tests__/mocks/diagnosis.repository'
import { createMockEventBus } from '@lily/api/__tests__/mocks/event-bus'
import { createMockGCSService } from '@lily/api/__tests__/mocks/gcs.service'
import { createMockPlantRepository } from '@lily/api/__tests__/mocks/plant.repository'
import { MockRagServiceLive } from '@lily/api/__tests__/mocks/rag.service'
import { createMockCurrentUser } from '@lily/api/__tests__/mocks/session'
import { createMockUsageTracker } from '@lily/api/__tests__/mocks/usage-tracker'
import { createMockUserRepository } from '@lily/api/__tests__/mocks/user.repository'
import { ChatTurns } from '@lily/api/services/ai-chat/chat-turns'
import { streamChatMessage } from '@lily/api/services/ai-chat/endpoints/stream-chat-message'
import type { UsageField } from '@lily/shared'
import type { ChatMessage } from '@lily/shared/ai-chat'
import { ConversationNotFoundError } from '@lily/shared/ai-chat'
import type { AppEvent } from '@lily/shared/server'
import {
  Array,
  type Duration,
  Effect,
  Exit,
  Fiber,
  Layer,
  References,
  Stream,
} from 'effect'
import type { HttpServerResponse } from 'effect/http'
import { TestClock } from 'effect/testing'
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

const testConversation = mockPlantConversation

describe('streamChatMessage', () => {
  const createTestLayer = (
    opts: {
      messages?: ChatMessage[]
      publishedEvents?: AppEvent[]
      aiChatLimitReached?: boolean
      chatStreamError?: string
      saveChatFails?: boolean
      released?: UsageField[]
      plantChatResponse?: string
      userId?: string
      mockSteps?: readonly import('@lily/api/services/ai-chat/plant-chat').StepData[]
      uiChunks?: readonly Record<string, unknown>[]
    } = {}
  ) =>
    Layer.mergeAll(
      createMockChatRepository({
        messages: opts.messages ?? [...mockChatMessages],
        conversations: [testConversation],
        ...(opts.saveChatFails ? { saveChatFails: true } : {}),
      }),
      createMockAiService({
        plantChatResponse: opts.plantChatResponse ?? 'AI response text',
        ...(opts.mockSteps ? { mockSteps: opts.mockSteps } : {}),
        ...(opts.uiChunks ? { uiChunks: opts.uiChunks } : {}),
        ...(opts.chatStreamError
          ? { chatStreamError: opts.chatStreamError }
          : {}),
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
      createMockCarePlanRepository(),
      createMockUserRepository([]),
      createMockUsageTracker({
        limitReached: opts.aiChatLimitReached ?? false,
        onRelease: (field) => opts.released?.push(field),
      }),
      MockRagServiceLive,
      createMockCareScheduleRepository({
        schedules: schedulesFromPlants(mockPlants),
        plants: mockPlants,
      })
    ).pipe(
      Layer.merge(createMockGCSService()),
      Layer.merge(emptyDelegationMock),
      Layer.merge(createMockCanopyRepository()),
      Layer.merge(ChatTurns.layer)
    )

  it('should return a streaming response', async () => {
    const result = await Effect.runPromise(
      streamChatMessage(testConversation, { message: 'Hello plant!' }).pipe(
        Effect.provide(createTestLayer())
      )
    )

    // The result is an HttpServerResponse
    expect(result).toBeDefined()
    expect(result.headers).toBeDefined()
  })

  describe('imageKey', () => {
    const streamWithKey = (imageKey: string) =>
      Effect.runPromiseExit(
        streamChatMessage(testConversation, {
          message: 'What is this?',
          imageKey,
        }).pipe(Effect.provide(createTestLayer()))
      )

    it.each([
      `1770000000000-chat/${testConversation.id}/1770000000000-chat.jpg`,
      `chat/${testConversation.id}/1770000000000-a1b2.jpg`,
    ])('accepts a key uploaded to this conversation: %s', async (key) => {
      expect(Exit.isSuccess(await streamWithKey(key))).toBe(true)
    })

    it.each([
      '1770000000000-chat/another-conversation/1770000000000-chat.jpg',
      '1792786787517-scan-card-1792786787400.jpg',
      `../chat/${testConversation.id}/x.jpg`,
    ])('refuses a key from elsewhere in the bucket: %s', async (key) => {
      const exit = await streamWithKey(key)

      expect(failureOf(exit)).toBeInstanceOf(ConversationNotFoundError)
    })
  })

  it('streams the quota-exceeded reply and saves nothing when the limit is reached', async () => {
    const messages: ChatMessage[] = []

    const result = await Effect.runPromise(
      streamChatMessage(testConversation, { message: 'Test' }).pipe(
        Effect.provide(
          createTestLayer({
            messages,
            aiChatLimitReached: true,
            plantChatResponse: 'Should not see this',
          })
        )
      )
    )

    const body = (await drainSseStream(result)).join('')

    expect(body).toContain('"delta":"__QUOTA_EXCEEDED__"')
    expect(body).not.toContain('Should not see this')
    expect(messages).toEqual([])
  })

  it('should persist messages after consuming the stream', async () => {
    const messages: ChatMessage[] = []
    const publishedEvents: AppEvent[] = []

    const result = await Effect.runPromise(
      streamChatMessage(testConversation, { message: 'User says hi' }).pipe(
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
        conversationId: 'conv-plant-1',
        userId: 'user-1',
        createdAt: new Date(),
      },
    ]

    const result = await Effect.runPromise(
      streamChatMessage(testConversation, { message: 'New message' }).pipe(
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
      streamChatMessage(testConversation, { message: 'Test' }).pipe(
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
      streamChatMessage(
        { ...testConversation, id: 'conv-xyz', plantId: 'plant-xyz' },
        { message: 'Hello' }
      ).pipe(Effect.provide(createTestLayer()))
    )

    expect(result).toBeDefined()
  })

  it('should return content-type header for streaming response', async () => {
    const result = await Effect.runPromise(
      streamChatMessage(testConversation, { message: 'Test' }).pipe(
        Effect.provide(createTestLayer())
      )
    )

    // HttpServerResponse should have headers
    expect(result.headers).toBeDefined()
  })

  it('should handle empty message', async () => {
    const result = await Effect.runPromise(
      streamChatMessage(testConversation, { message: '' }).pipe(
        Effect.provide(createTestLayer())
      )
    )

    expect(result).toBeDefined()
  })

  it('strips providerMetadata from forwarded chunks and keeps the other fields', async () => {
    const toolOutput = {
      type: 'tool-output-available',
      toolCallId: 'call-1',
      output: { diagnosisId: 'diag-123' },
    }

    const result = await Effect.runPromise(
      streamChatMessage(testConversation, { message: 'Is it sick?' }).pipe(
        Effect.provide(
          createTestLayer({
            uiChunks: [
              {
                ...toolOutput,
                providerMetadata: { openai: { itemId: 'fc_1' } },
              },
            ],
          })
        )
      )
    )

    const chunks = await drainSseStream(result)

    expect(chunks).toEqual([
      `data: ${JSON.stringify(toolOutput)}\n\n`,
      'data: [DONE]\n\n',
    ])
  })

  describe('event publishing (quota exceeded path)', () => {
    it('should not publish events when quota is exceeded', async () => {
      const publishedEvents: AppEvent[] = []

      const _response = await Effect.runPromise(
        streamChatMessage(testConversation, { message: 'Test' }).pipe(
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

  describe('model failure', () => {
    it('saves the question, no reply, and refunds the chat when the model fails', async () => {
      const messages: ChatMessage[] = []
      const released: UsageField[] = []

      const result = await Effect.runPromise(
        streamChatMessage(testConversation, { message: 'Help my fern' }).pipe(
          Effect.provide(
            createTestLayer({
              messages,
              released,
              chatStreamError: 'OpenAI returned 500',
            })
          )
        )
      )

      const chunks = await drainSseStream(result)

      expect(chunks[0]).toContain('"type":"error"')
      expect(chunks[chunks.length - 1]).toBe('data: [DONE]\n\n')
      expect(messages.map((m) => m.role)).toEqual(['user'])
      expect(released).toEqual(['aiChats'])
    })

    it('refunds the chat and saves no reply when the model returns nothing', async () => {
      const messages: ChatMessage[] = []
      const released: UsageField[] = []

      const result = await Effect.runPromise(
        streamChatMessage(testConversation, { message: 'Hello?' }).pipe(
          Effect.provide(
            createTestLayer({
              messages,
              released,
              mockSteps: [{ text: '   ', toolResults: [] }],
            })
          )
        )
      )

      await drainSseStream(result)

      expect(messages.map((m) => m.role)).toEqual(['user'])
      expect(released).toEqual(['aiChats'])
    })

    it('keeps the charge for a non-empty reply', async () => {
      const messages: ChatMessage[] = []
      const released: UsageField[] = []

      const result = await Effect.runPromise(
        streamChatMessage(testConversation, { message: 'Hi' }).pipe(
          Effect.provide(
            createTestLayer({
              messages,
              released,
              plantChatResponse: 'Water it twice a week.',
            })
          )
        )
      )

      await drainSseStream(result)

      expect(messages.map((m) => m.role)).toEqual(['user', 'assistant'])
      expect(released).toEqual([])
    })
  })

  describe('shutdown', () => {
    const shutDownDuring = (
      opts: Parameters<typeof createTestLayer>[0] & {
        completesAfter: Duration.Input
      }
    ) =>
      Effect.runPromise(
        Effect.gen(function* () {
          const turn = yield* Effect.forkChild(
            streamChatMessage(testConversation, {
              message: 'Still there?',
            }).pipe(
              Effect.provide(
                Layer.merge(
                  createTestLayer(opts),
                  createMockAiService({ completesAfter: opts.completesAfter })
                )
              )
            )
          )
          yield* Effect.forEach(Array.range(1, 30), () =>
            TestClock.adjust('1 second')
          )
          return yield* Fiber.join(turn)
        }).pipe(
          Effect.provide(TestClock.layer()),
          Effect.provideService(References.MinimumLogLevel, 'None')
        )
      )

    it('saves the reply and keeps the charge when the turn ends within the drain deadline', async () => {
      const messages: ChatMessage[] = []
      const released: UsageField[] = []

      await shutDownDuring({ messages, released, completesAfter: '10 seconds' })

      expect(messages.map((m) => m.role)).toEqual(['user', 'assistant'])
      expect(released).toEqual([])
    })

    it('refunds the chat and saves no reply when the turn outlives the drain deadline', async () => {
      const messages: ChatMessage[] = []
      const released: UsageField[] = []

      await shutDownDuring({ messages, released, completesAfter: '1 minute' })

      expect(messages.map((m) => m.role)).toEqual(['user'])
      expect(released).toEqual(['aiChats'])
    })
  })

  describe('failure before the stream starts', () => {
    it('refunds the chat and fails when the question cannot be saved', async () => {
      const messages: ChatMessage[] = []
      const released: UsageField[] = []

      const exit = await Effect.runPromiseExit(
        streamChatMessage(testConversation, { message: 'Lost?' }).pipe(
          Effect.provide(
            createTestLayer({ messages, released, saveChatFails: true })
          )
        )
      )

      expect(Exit.isFailure(exit)).toBe(true)
      expect(messages).toEqual([])
      expect(released).toEqual(['aiChats'])
    })
  })

  describe('persistence order', () => {
    it('saves the user message before the stream is consumed', async () => {
      const messages: ChatMessage[] = []

      await Effect.runPromise(
        streamChatMessage(testConversation, { message: 'Saved first' }).pipe(
          Effect.provide(createTestLayer({ messages }))
        )
      )

      expect(messages.map((m) => m.role)).toContain('user')
      expect(messages.find((m) => m.role === 'user')?.content).toBe(
        'Saved first'
      )
    })
  })

  describe('persistence with tool results', () => {
    it('should link diagnoses to chat messages after stream', async () => {
      const messages: ChatMessage[] = []
      const publishedEvents: AppEvent[] = []

      const result = await Effect.runPromise(
        streamChatMessage(testConversation, {
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
