import { schedulesFromPlants } from '@lily/api/__tests__/fixtures/care-schedules'
import { mockPlants } from '@lily/api/__tests__/fixtures/plants'
import {
  type ChatStreamCall,
  createMockAiService,
} from '@lily/api/__tests__/mocks/ai.service'
import { mockUserProfile } from '@lily/api/__tests__/mocks/auth'
import { createMockCanopyRepository } from '@lily/api/__tests__/mocks/canopy.repository'
import { createInMemoryCare } from '@lily/api/__tests__/mocks/care'
import { createMockCareLogRepository } from '@lily/api/__tests__/mocks/care-log.repository'
import { createMockCarePlanRepository } from '@lily/api/__tests__/mocks/care-plan.repository'
import { createMockCareScheduleRepository } from '@lily/api/__tests__/mocks/care-schedule.repository'
import { createMockChatRepository } from '@lily/api/__tests__/mocks/chat.repository'
import { createMockChatFollowUpRepository } from '@lily/api/__tests__/mocks/chat-follow-up.repository'
import { createMockDelegationRepository } from '@lily/api/__tests__/mocks/delegation.repository'
import { createMockDiagnosisRepository } from '@lily/api/__tests__/mocks/diagnosis.repository'
import { createMockEventBus } from '@lily/api/__tests__/mocks/event-bus'
import {
  createMockGCSService,
  MOCK_BUCKET_NAMES,
} from '@lily/api/__tests__/mocks/gcs.service'
import { createMockPlantRepository } from '@lily/api/__tests__/mocks/plant.repository'
import { MockRagServiceLive } from '@lily/api/__tests__/mocks/rag.service'
import { createMockRateLimiterService } from '@lily/api/__tests__/mocks/rate-limiter.service'
import { createMockUsageTracker } from '@lily/api/__tests__/mocks/usage-tracker'
import { createMockUserRepository } from '@lily/api/__tests__/mocks/user.repository'
import { Api } from '@lily/api/api'
import { AIChatApi } from '@lily/api/services/ai-chat/api'
import { ChatTurns } from '@lily/api/services/ai-chat/chat-turns'
import { AIChatApiLive } from '@lily/api/services/ai-chat/handlers'
import {
  Authentication,
  CurrentUser,
} from '@lily/api/services/auth/middleware.types'
import { API_PREFIX } from '@lily/shared'
import type { ChatConversation, ChatMessage } from '@lily/shared/ai-chat'
import { Array, Effect, FileSystem, Layer, Path, Redacted } from 'effect'
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

const TestApi = HttpApi.make('Api').add(Api.groups.aiChat)

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
const chatStreamCalls: ChatStreamCall[] = []
const signedKeys: string[] = []
const ownFolder = `users/${userId}/chat/${conversation.id}`

const ServicesLive = Layer.mergeAll(
  createMockChatRepository({ messages, conversations: [conversation] }),
  createMockAiService({ chatStreamCalls }),
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
  createMockGCSService({ signedKeys }),
  createMockDelegationRepository({}),
  createMockCanopyRepository(),
  createInMemoryCare([]).layer,
  createMockChatFollowUpRepository(),
  createMockRateLimiterService(),
  FileSystem.layerNoop({}),
  ChatTurns.layer
)

const makeHandler = () =>
  HttpRouter.toWebHandler(
    HttpApiBuilder.layer(TestApi).pipe(
      Layer.provide(AIChatApiLive(Api)),
      Layer.provide(AuthLive),
      HttpRouter.provideRequest(ServicesLive),
      Layer.provide(PlatformLive)
    ),
    { disableLogger: true }
  )

const fileParts = (call: ChatStreamCall | undefined) =>
  Array.flatMap(call?.messages ?? [], (m) =>
    Array.filter(m.parts, (p) => p.type === 'file')
  )

describe('chat stream image source over HTTP', () => {
  let web: ReturnType<typeof makeHandler>

  const stream = (body: unknown) =>
    web.handler(
      new Request(
        `http://lily.test${API_PREFIX}/chat/conversations/${conversation.id}/stream`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${userId}`,
            'content-type': 'application/json',
          },
          body: JSON.stringify(body),
        }
      )
    )

  beforeAll(() => {
    web = makeHandler()
  })

  beforeEach(() => {
    messages.length = 0
    chatStreamCalls.length = 0
    signedKeys.length = 0
  })

  afterAll(async () => {
    await web.dispose()
  })

  it('sends the model the signed URL of an uploaded imageKey', async () => {
    const res = await stream({
      message: 'What is this?',
      imageKey: `${ownFolder}/photo.jpg`,
    })
    await res.text()

    expect(res.status).toBe(200)
    expect(signedKeys).toEqual([`${ownFolder}/photo.jpg`])
    expect(chatStreamCalls[0]?.imageOptions?.imageKey).toBe(
      `${ownFolder}/photo.jpg`
    )
    expect(fileParts(chatStreamCalls[0])).toHaveLength(1)
  })

  it.each([
    [
      "parent segments into another user's folder",
      `${ownFolder}/../../../user-2/chat/${conversation.id}/photo.jpg`,
    ],
    [
      'parent segments behind an unscoped chat prefix',
      `chat/${conversation.id}/../../users/user-2/identify/photo.jpg`,
    ],
    ['a current-folder segment', `${ownFolder}/./photo.jpg`],
    [
      'a URL whose encoded slash hides parent segments',
      `https://storage.googleapis.com/${MOCK_BUCKET_NAMES.ai}/${ownFolder}/..%2F..%2F..%2Fuser-2/identify/photo.jpg`,
    ],
    ['backslash parent segments', `${ownFolder}/..\\..\\photo.jpg`],
    ['a literal encoded slash', `${ownFolder}/..%2F..%2Fphoto.jpg`],
  ])(
    'answers 404 to %s without signing, calling the model or saving',
    async (_case, imageKey) => {
      const res = await stream({ message: 'What is this?', imageKey })
      await res.text()

      expect({
        status: res.status,
        signedKeys,
        modelCalls: chatStreamCalls.length,
        saved: messages.length,
      }).toEqual({ status: 404, signedKeys: [], modelCalls: 0, saved: 0 })
    }
  )

  it('ignores a client imageUrl and calls the model with no image', async () => {
    const res = await stream({
      message: 'What is this?',
      imageUrl: 'https://example.com/elsewhere.jpg',
    })
    await res.text()

    expect(res.status).toBe(200)
    expect(chatStreamCalls).toHaveLength(1)
    expect(chatStreamCalls[0]?.imageOptions).toBeUndefined()
    expect(fileParts(chatStreamCalls[0])).toEqual([])
  })
})
