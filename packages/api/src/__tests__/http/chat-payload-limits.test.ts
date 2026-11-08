import { schedulesFromPlants } from '@lily/api/__tests__/fixtures/care-schedules'
import { mockPlants } from '@lily/api/__tests__/fixtures/plants'
import { createMockAiService } from '@lily/api/__tests__/mocks/ai.service'
import { mockUserProfile } from '@lily/api/__tests__/mocks/auth'
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
import { createMockUsageTracker } from '@lily/api/__tests__/mocks/usage-tracker'
import { createMockUserRepository } from '@lily/api/__tests__/mocks/user.repository'
import type { Api } from '@lily/api/api'
import { AIChatApi } from '@lily/api/services/ai-chat/api'
import { ChatTurns } from '@lily/api/services/ai-chat/chat-turns'
import { AIChatApiLive } from '@lily/api/services/ai-chat/handlers'
import {
  Authentication,
  CurrentUser,
} from '@lily/api/services/auth/middleware.types'
import {
  CHAT_MESSAGE_MAX_LENGTH,
  CHAT_TITLE_MAX_LENGTH,
  type ChatConversation,
  type ChatMessage,
} from '@lily/shared/ai-chat'
import { Effect, FileSystem, Layer, Path, Redacted } from 'effect'
import { Etag, HttpPlatform, HttpRouter } from 'effect/http'
import { HttpApi, HttpApiBuilder } from 'effect/http-api'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

const userId = 'user-1'

const conversation: ChatConversation = {
  id: crypto.randomUUID(),
  userId,
  kind: 'general',
  createdAt: new Date('2026-01-01T00:00:00Z'),
  lastMessageAt: new Date('2026-01-01T00:00:00Z'),
}

const TestApi = HttpApi.make('chatPayloadLimits').add(AIChatApi)

const AuthLive = Layer.succeed(
  Authentication,
  Authentication.of({
    bearer: (httpEffect, { credential }) =>
      Effect.provideService(httpEffect, CurrentUser, {
        ...mockUserProfile,
        id: Redacted.value(credential),
      }),
  })
)

const PlatformLive = Layer.mergeAll(
  Path.layer,
  Etag.layer,
  HttpPlatform.layer
).pipe(Layer.provideMerge(FileSystem.layerNoop({})))

const messages: ChatMessage[] = []
const conversations: ChatConversation[] = []

const ServicesLive = Layer.mergeAll(
  createMockChatRepository({ messages, conversations }),
  createMockAiService(),
  createMockEventBus(),
  createMockPlantRepository({ plants: mockPlants }),
  createMockCareLogRepository([]),
  createMockDiagnosisRepository([]),
  createMockCarePlanRepository(),
  createMockUserRepository([]),
  createMockUsageTracker({ limitReached: false }),
  MockRagServiceLive,
  createMockCareScheduleRepository({
    schedules: schedulesFromPlants(mockPlants),
    plants: mockPlants,
  }),
  createMockGCSService(),
  createMockDelegationRepository({}),
  createMockCanopyRepository(),
  ChatTurns.layer
)

const makeHandler = () =>
  HttpRouter.toWebHandler(
    HttpApiBuilder.layer(TestApi).pipe(
      Layer.provide(AIChatApiLive(TestApi as unknown as Api)),
      Layer.provide(AuthLive),
      Layer.provide(ServicesLive),
      Layer.provide(PlatformLive)
    ) as unknown as Layer.Layer<never>,
    { disableLogger: true }
  )

describe('chat payload limits over HTTP', () => {
  let web: ReturnType<typeof makeHandler>

  const post = (path: string, body: unknown) =>
    web.handler(
      new Request(`http://lily.test${path}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${userId}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify(body),
      })
    )

  const streamPath = `/chat/conversations/${conversation.id}/stream`

  beforeAll(() => {
    web = makeHandler()
  })

  beforeEach(() => {
    messages.length = 0
    conversations.length = 0
    conversations.push(conversation)
  })

  afterAll(async () => {
    await web.dispose()
  })

  it('streams and saves a message at the length limit', async () => {
    const res = await post(streamPath, {
      message: 'a'.repeat(CHAT_MESSAGE_MAX_LENGTH),
    })
    await res.text()

    expect(res.status).toBe(200)
    expect(messages[0]?.content).toHaveLength(CHAT_MESSAGE_MAX_LENGTH)
  })

  it('answers 400 for a message over the limit and saves nothing', async () => {
    const res = await post(streamPath, {
      message: 'a'.repeat(CHAT_MESSAGE_MAX_LENGTH + 1),
    })
    await res.text()

    expect(res.status).toBe(400)
    expect(messages).toEqual([])
  })

  it('answers 400 for a conversation title over the limit and creates nothing', async () => {
    const res = await post('/chat/conversations', {
      kind: 'general',
      title: 'a'.repeat(CHAT_TITLE_MAX_LENGTH + 1),
    })
    await res.text()

    expect(res.status).toBe(400)
    expect(conversations).toEqual([conversation])
  })
})
