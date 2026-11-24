import { createMockCanopyRepository } from '@lily/api/__tests__/mocks/canopy.repository'
import { createInMemoryCare } from '@lily/api/__tests__/mocks/care'
import { createMockCareLogRepository } from '@lily/api/__tests__/mocks/care-log.repository'
import { createCarePlanRows } from '@lily/api/__tests__/mocks/care-plan.repository'
import { createMockCareScheduleRepository } from '@lily/api/__tests__/mocks/care-schedule.repository'
import { createMockDelegationRepository } from '@lily/api/__tests__/mocks/delegation.repository'
import { createMockDiagnosisRepository } from '@lily/api/__tests__/mocks/diagnosis.repository'
import { createMockPlantRepository } from '@lily/api/__tests__/mocks/plant.repository'
import { createMockRagService } from '@lily/api/__tests__/mocks/rag.service'
import { createMockCurrentUser } from '@lily/api/__tests__/mocks/session'
import { createMockUserRepository } from '@lily/api/__tests__/mocks/user.repository'
import { chatStream } from '@lily/api/services/ai-chat/plant-chat'
import type { UIMessage } from 'ai'
import { convertArrayToReadableStream, MockLanguageModelV4 } from 'ai/test'
import { Array, Layer, ManagedRuntime } from 'effect'
import { describe, expect, it, vi } from 'vitest'

const provider = vi.hoisted(() => ({ model: undefined as unknown }))

vi.mock('@ai-sdk/openai', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@ai-sdk/openai')>()
  return {
    ...actual,
    openai: new Proxy(actual.openai, { apply: () => provider.model }),
  }
})

const USER_ID = 'user-1'
const SIGNED_URL = 'https://storage.example.com/signed/leaf.jpg'

const conversation = {
  id: 'conversation-1',
  userId: USER_ID,
  kind: 'general' as const,
  createdAt: new Date('2026-11-01T00:00:00.000Z'),
  lastMessageAt: new Date('2026-11-01T00:00:00.000Z'),
}

const usage = {
  inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 1, text: 1, reasoning: 0 },
}

const replyingModel = () =>
  new MockLanguageModelV4({
    supportedUrls: { 'image/*': [/^https?:\/\/.*$/] },
    doStream: {
      stream: convertArrayToReadableStream([
        { type: 'stream-start', warnings: [] },
        { type: 'text-start', id: 'text-1' },
        { type: 'text-delta', id: 'text-1', delta: 'A healthy leaf.' },
        { type: 'text-end', id: 'text-1' },
        {
          type: 'finish',
          finishReason: { unified: 'stop', raw: undefined },
          usage,
        },
      ]),
    },
  })

const world = () => {
  const plans = createCarePlanRows()
  return ManagedRuntime.make(
    Layer.mergeAll(
      createInMemoryCare([], { plantRows: [], plans }).layer,
      plans.layer,
      createMockPlantRepository({ plants: [] }),
      createMockCurrentUser({ id: USER_ID }),
      createMockCanopyRepository([]),
      createMockDelegationRepository(),
      createMockUserRepository([]),
      createMockCareLogRepository([]),
      createMockCareScheduleRepository(),
      createMockDiagnosisRepository([]),
      createMockRagService()
    )
  )
}

const photoTurn: UIMessage = {
  id: 'message-1',
  role: 'user',
  parts: [
    { type: 'file', mediaType: 'image/jpeg', url: SIGNED_URL },
    { type: 'text', text: 'What is this spot on the leaf?' },
  ],
}

describe('chatStream with a photo in the turn', () => {
  it('sends the photo to the model once', async () => {
    const runtime = world()
    const model = replyingModel()
    provider.model = model

    const { stream } = await runtime.runPromise(
      chatStream(conversation, [photoTurn], {
        imageUrl: SIGNED_URL,
        imageKey: undefined,
      })
    )
    await stream.consumeStream()

    const userParts = Array.flatMap(
      model.doStreamCalls[0]?.prompt ?? [],
      (message) => (message.role === 'user' ? message.content : [])
    )
    expect(userParts).toMatchObject([
      {
        type: 'file',
        mediaType: 'image/jpeg',
        data: { type: 'url', url: new URL(SIGNED_URL) },
      },
      { type: 'text', text: 'What is this spot on the leaf?' },
    ])
    expect(userParts).toHaveLength(2)
    await runtime.dispose()
  })
})
