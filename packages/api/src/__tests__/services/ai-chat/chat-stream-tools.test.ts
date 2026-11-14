import { createTestPlant } from '@lily/api/__tests__/fixtures/plants'
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
import { CarePlanRepository } from '@lily/api/repositories/care-plan.repository'
import { DiagnosisRepository } from '@lily/api/repositories/diagnosis.repository'
import { chatStream } from '@lily/api/services/ai-chat/plant-chat'
import type { ChatConversation } from '@lily/shared/ai-chat'
import type { UIMessage } from 'ai'
import { convertArrayToReadableStream, MockLanguageModelV4 } from 'ai/test'
import { Array, Deferred, Effect, Layer, ManagedRuntime, Option } from 'effect'
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
const PLANT_ID = 'plant-1'
const CALL_ID = 'call-1'

const conversation: ChatConversation = {
  id: 'conversation-1',
  userId: USER_ID,
  kind: 'plant',
  plantId: PLANT_ID,
  createdAt: new Date('2026-11-01T00:00:00.000Z'),
  lastMessageAt: new Date('2026-11-01T00:00:00.000Z'),
}

const question: UIMessage = {
  id: 'message-1',
  role: 'user',
  parts: [{ type: 'text', text: 'The leaves are yellow and the soil is wet.' }],
}

const usage = {
  inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 1, text: 1, reasoning: 0 },
}

const modelCalling = (toolName: string, input: unknown) =>
  new MockLanguageModelV4({
    doStream: [
      {
        stream: convertArrayToReadableStream([
          { type: 'stream-start', warnings: [] },
          {
            type: 'tool-call',
            toolCallId: CALL_ID,
            toolName,
            input: JSON.stringify(input),
          },
          {
            type: 'finish',
            finishReason: { unified: 'tool-calls', raw: undefined },
            usage,
          },
        ]),
      },
      {
        stream: convertArrayToReadableStream([
          { type: 'stream-start', warnings: [] },
          { type: 'text-start', id: 'text-1' },
          { type: 'text-delta', id: 'text-1', delta: 'Here is what to do.' },
          { type: 'text-end', id: 'text-1' },
          {
            type: 'finish',
            finishReason: { unified: 'stop', raw: undefined },
            usage,
          },
        ]),
      },
    ],
  })

const worldOf = (
  plant = createTestPlant({ id: PLANT_ID, name: 'Monstera', userId: USER_ID })
) => {
  const plans = createCarePlanRows({
    plants: [{ id: plant.id, name: plant.name, imageUrl: null }],
  })
  return ManagedRuntime.make(
    Layer.mergeAll(
      createInMemoryCare([], { plantRows: [plant], plans }).layer,
      plans.layer,
      createMockPlantRepository({ plants: [plant] }),
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

type World = ReturnType<typeof worldOf>

const converse = async (world: World, model: MockLanguageModelV4) => {
  provider.model = model
  const { stream, completionDeferred } = await world.runPromise(
    chatStream(conversation, [question])
  )
  await stream.consumeStream()
  return {
    stream,
    steps: await world.runPromise(Deferred.await(completionDeferred)),
  }
}

const CALL_AFTER_THE_TOOL_RAN = 1

const sentBackToTheModel = (model: MockLanguageModelV4) =>
  Array.flatMap(
    model.doStreamCalls[CALL_AFTER_THE_TOOL_RAN]?.prompt ?? [],
    (message) =>
      message.role === 'tool'
        ? Array.filter(message.content, (part) => part.type === 'tool-result')
        : []
  )

const plansOf = (world: World) =>
  world.runPromise(
    Effect.flatMap(CarePlanRepository, (repo) => repo.findByPlant(PLANT_ID))
  )

const diagnosesOf = (world: World) =>
  world.runPromise(
    Effect.flatMap(DiagnosisRepository, (repo) =>
      repo.findByPlantId({ plantId: PLANT_ID, author: Option.none() })
    ).pipe(Effect.map(({ items }) => items))
  )

const overwatered = {
  title: 'Recover from overwatering',
  steps: [
    { title: 'Hold off watering', careType: 'watering', dueInDays: 5 },
    { title: 'Move away from the window', careType: 'none' },
  ],
}

const rootRot = {
  diseaseName: 'Root rot',
  severity: 'HIGH',
  confidence: 85,
  symptoms: ['Yellow leaves', 'Mushy roots'],
  treatmentSteps: [
    { title: 'Remove affected roots', careType: 'none' },
    { title: 'Repot in fresh soil', careType: 'repotting', dueInDays: 0 },
  ],
}

describe('chatStream with a model that calls a tool', () => {
  it('runs proposeCarePlan: the plan is proposed and its id goes back to the model', async () => {
    const world = worldOf()
    const model = modelCalling('proposeCarePlan', overwatered)

    const { steps } = await converse(world, model)

    const [plan, ...others] = await plansOf(world)
    expect(others).toEqual([])
    expect(plan).toMatchObject({
      plantId: PLANT_ID,
      userId: USER_ID,
      title: 'Recover from overwatering',
      status: 'proposed',
      source: 'ai',
    })
    expect(
      Array.map(plan?.steps ?? [], ({ title, careType }) => [title, careType])
    ).toEqual([
      ['Hold off watering', 'watering'],
      ['Move away from the window', undefined],
    ])

    const result = { carePlanId: plan?.id, plantId: PLANT_ID }
    expect(sentBackToTheModel(model)).toEqual([
      {
        type: 'tool-result',
        toolCallId: CALL_ID,
        toolName: 'proposeCarePlan',
        output: { type: 'json', value: result },
      },
    ])
    expect(Array.flatMap(steps, (step) => step.toolResults)).toEqual([
      {
        toolName: 'proposeCarePlan',
        toolCallId: CALL_ID,
        input: overwatered,
        output: result,
      },
    ])
    await world.dispose()
  })

  it('runs createDiagnosis: the diagnosis and its plan are written and their ids go back to the model', async () => {
    const world = worldOf()
    const model = modelCalling('createDiagnosis', rootRot)

    await converse(world, model)

    const [diagnosis, ...otherDiagnoses] = await diagnosesOf(world)
    expect(otherDiagnoses).toEqual([])
    expect(diagnosis).toMatchObject({
      plantId: PLANT_ID,
      userId: USER_ID,
      diseaseName: 'Root rot',
      severity: 'HIGH',
      treatmentSteps: ['Remove affected roots', 'Repot in fresh soil'],
    })

    const [plan, ...otherPlans] = await plansOf(world)
    expect(otherPlans).toEqual([])
    expect(plan).toMatchObject({
      diagnosisId: diagnosis?.id,
      title: 'Root rot',
      status: 'proposed',
      source: 'ai',
      userId: USER_ID,
    })

    expect(sentBackToTheModel(model)).toEqual([
      {
        type: 'tool-result',
        toolCallId: CALL_ID,
        toolName: 'createDiagnosis',
        output: {
          type: 'json',
          value: { diagnosisId: diagnosis?.id, carePlanId: plan?.id },
        },
      },
    ])
    await world.dispose()
  })

  it('answers a proposal for a dead plant as a plant that does not exist, and writes no plan', async () => {
    const world = worldOf(
      createTestPlant({
        id: PLANT_ID,
        name: 'Monstera',
        userId: USER_ID,
        diedAt: new Date('2026-10-01T00:00:00.000Z'),
        deathCause: 'overwatering',
      })
    )
    const model = modelCalling('proposeCarePlan', overwatered)

    const { stream, steps } = await converse(world, model)

    expect(await plansOf(world)).toEqual([])
    expect(Array.flatMap(steps, (step) => step.toolResults)).toEqual([])

    const failures = Array.flatMap(await stream.steps, (step) =>
      Array.filter(step.content, (part) => part.type === 'tool-error')
    )
    expect(failures).toMatchObject([
      {
        toolCallId: CALL_ID,
        toolName: 'proposeCarePlan',
        error: { _tag: 'PlantNotFoundError', plantId: PLANT_ID },
      },
    ])
    expect(sentBackToTheModel(model)).toEqual([
      {
        type: 'tool-result',
        toolCallId: CALL_ID,
        toolName: 'proposeCarePlan',
        output: { type: 'error-text', value: 'PlantNotFoundError' },
      },
    ])
    await world.dispose()
  })
})
