import {
  createTestCarePlan,
  createTestCarePlanStep,
} from '@lily/api/__tests__/fixtures/care-plans'
import { createTestChatMessage } from '@lily/api/__tests__/fixtures/chat'
import { createTestPlant } from '@lily/api/__tests__/fixtures/plants'
import { mockUser1 } from '@lily/api/__tests__/fixtures/users'
import { createMockCanopyRepository } from '@lily/api/__tests__/mocks/canopy.repository'
import { createInMemoryCare } from '@lily/api/__tests__/mocks/care'
import { createMockCareLogRepository } from '@lily/api/__tests__/mocks/care-log.repository'
import { createCarePlanRows } from '@lily/api/__tests__/mocks/care-plan.repository'
import { createMockCareScheduleRepository } from '@lily/api/__tests__/mocks/care-schedule.repository'
import { createMockChatRepository } from '@lily/api/__tests__/mocks/chat.repository'
import { createMockDelegationRepository } from '@lily/api/__tests__/mocks/delegation.repository'
import { createMockDiagnosisRepository } from '@lily/api/__tests__/mocks/diagnosis.repository'
import { createMockPlantRepository } from '@lily/api/__tests__/mocks/plant.repository'
import { createMockRagService } from '@lily/api/__tests__/mocks/rag.service'
import { createMockCurrentUser } from '@lily/api/__tests__/mocks/session'
import { createMockUserRepository } from '@lily/api/__tests__/mocks/user.repository'
import { previewPrompt } from '@lily/api/services/admin/endpoints/preview-prompt'
import { chatStream } from '@lily/api/services/ai-chat/plant-chat'
import type { UIMessage } from 'ai'
import { convertArrayToReadableStream, MockLanguageModelV4 } from 'ai/test'
import { Layer, ManagedRuntime } from 'effect'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const provider = vi.hoisted(() => ({
  model: undefined as unknown,
  modelIds: [] as unknown[],
}))

vi.mock('@ai-sdk/openai', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@ai-sdk/openai')>()
  return {
    ...actual,
    openai: new Proxy(actual.openai, {
      apply: (_target, _this, [modelId]) => {
        provider.modelIds.push(modelId)
        return provider.model
      },
    }),
  }
})

const USER_ID = 'user-1'
const PLANT_ID = 'plant-1'
const ZONE = 'Pacific/Auckland'
const QUESTION = 'Should I keep going with the plan?'

const conversation = {
  id: 'conversation-1',
  userId: USER_ID,
  kind: 'plant' as const,
  plantId: PLANT_ID,
  createdAt: new Date('2026-11-01T00:00:00.000Z'),
  lastMessageAt: new Date('2026-11-01T00:00:00.000Z'),
}

const plant = createTestPlant({
  id: PLANT_ID,
  name: 'Monstera',
  userId: USER_ID,
  dateAdded: new Date('2026-09-01T00:00:00.000Z'),
})

const plan = createTestCarePlan({
  plantId: PLANT_ID,
  userId: USER_ID,
  title: 'Recover from overwatering',
  status: 'accepted',
})

// 11:30 UTC on the 20th is already the 21st in Auckland, so a prompt built
// in UTC shows a different due day than the user's own.
const step = createTestCarePlanStep(plan.id, {
  title: 'Hold off watering',
  careType: 'watering',
  dueDate: new Date('2026-11-20T11:30:00.000Z'),
})

const usage = {
  inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 1, text: 1, reasoning: 0 },
}

const replyingModel = () =>
  new MockLanguageModelV4({
    doStream: {
      stream: convertArrayToReadableStream([
        { type: 'stream-start', warnings: [] },
        { type: 'text-start', id: 'text-1' },
        { type: 'text-delta', id: 'text-1', delta: 'Yes.' },
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
  const plans = createCarePlanRows({
    plants: [{ id: PLANT_ID, name: plant.name, imageUrl: null }],
    plans: [plan],
    steps: [step],
  })
  return ManagedRuntime.make(
    Layer.mergeAll(
      createInMemoryCare([], { plantRows: [plant], plans }).layer,
      plans.layer,
      createMockPlantRepository({ plants: [plant] }),
      createMockCurrentUser({ id: USER_ID }),
      createMockCanopyRepository([]),
      createMockDelegationRepository(),
      createMockUserRepository([{ ...mockUser1, id: USER_ID, timezone: ZONE }]),
      createMockCareLogRepository([]),
      createMockCareScheduleRepository(),
      createMockDiagnosisRepository([]),
      createMockRagService(),
      createMockChatRepository({
        conversations: [conversation],
        messages: [
          createTestChatMessage({
            id: 'message-1',
            conversationId: conversation.id,
            userId: USER_ID,
            content: QUESTION,
          }),
        ],
      })
    )
  )
}

const question: UIMessage = {
  id: 'message-1',
  role: 'user',
  parts: [{ type: 'text', text: QUESTION }],
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-11-20T09:00:00Z') })
  provider.modelIds = []
})

afterEach(() => {
  vi.useRealTimers()
})

describe('previewPrompt', () => {
  it('shows the system prompt and model the real chat sends for the same message', async () => {
    const runtime = world()
    const model = replyingModel()
    provider.model = model

    const { stream } = await runtime.runPromise(
      chatStream(conversation, [question])
    )
    await stream.consumeStream()
    const [sentSystem] = model.doStreamCalls[0]?.prompt ?? []

    const preview = await runtime.runPromise(previewPrompt('message-1'))

    expect(sentSystem?.role).toBe('system')
    expect(sentSystem?.content).toContain('Hold off watering')
    expect(preview.systemPrompt).toBe(sentSystem?.content)
    expect(preview.model).toBe(provider.modelIds[0])
    await runtime.dispose()
  })
})
