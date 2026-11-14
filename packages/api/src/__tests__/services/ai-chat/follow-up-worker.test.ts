import {
  createTestCarePlan,
  createTestCarePlanStep,
} from '@lily/api/__tests__/fixtures/care-plans'
import { schedulesFromPlants } from '@lily/api/__tests__/fixtures/care-schedules'
import {
  type DiagnosisRecord,
  mockDiagnoses,
} from '@lily/api/__tests__/fixtures/diagnoses'
import {
  createTestPlant,
  type TestPlant,
  wateringSpec,
} from '@lily/api/__tests__/fixtures/plants'
import { createMockCanopyRepository } from '@lily/api/__tests__/mocks/canopy.repository'
import { createMockCarePlanRepository } from '@lily/api/__tests__/mocks/care-plan.repository'
import { createMockChatRepository } from '@lily/api/__tests__/mocks/chat.repository'
import { createMockChatFollowUpRepository } from '@lily/api/__tests__/mocks/chat-follow-up.repository'
import { createMockDelegationRepository } from '@lily/api/__tests__/mocks/delegation.repository'
import { createMockDiagnosisRepository } from '@lily/api/__tests__/mocks/diagnosis.repository'
import { createMockPlantRepository } from '@lily/api/__tests__/mocks/plant.repository'
import type {
  CarePlanRow,
  CarePlanStepRow,
} from '@lily/api/repositories/care-plan.repository'
import { ChatRepository } from '@lily/api/repositories/chat.repository'
import { ChatFollowUpRepository } from '@lily/api/repositories/chat-follow-up.repository'
import type {
  FollowUp,
  FollowUpSet,
} from '@lily/api/services/ai-chat/follow-up-set'
import type { ChatConversation, ChatMessage } from '@lily/shared/ai-chat'
import { Array, Effect, Layer } from 'effect'
import { SqlError, UnknownError } from 'effect/sql/SqlError'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('ai', async (importOriginal) => ({
  ...(await importOriginal<typeof import('ai')>()),
  generateText: vi.fn(),
}))

vi.mock('@ai-sdk/openai', () => ({
  openai: vi.fn(() => 'mock-model'),
}))

import { pollFollowUpRequests } from '@lily/api/services/ai-chat/follow-up-worker'
import { generateText } from 'ai'

const model = vi.mocked(generateText)

const alex = 'user-alex'
const lily = 'user-lily'
const requestedAt = new Date(Date.now() - 60_000)
const generatedLongAgo = new Date('2026-01-01T00:00:00Z')

const fern = createTestPlant({
  id: 'fern',
  name: 'Fern',
  userId: alex,
  createdByUserId: alex,
  scheduleSpecs: [],
})

const previous: ReadonlyArray<FollowUp> = [
  { id: '0:none', text: 'An older question?', basis: { kind: 'none' } },
]

const requestedSet = (
  plantId: string,
  overrides: Partial<FollowUpSet> = {}
): FollowUpSet => ({
  userId: alex,
  plantId,
  language: 'en',
  requestedAt,
  claimedUntil: null,
  generatedAt: null,
  followUps: [],
  ...overrides,
})

interface Chat {
  readonly conversation: ChatConversation
  readonly messages: ChatMessage[]
}

const questionsAbout = (
  plantId: string,
  questions: ReadonlyArray<string> = ['How often should I water it?']
): Chat => {
  const conversation: ChatConversation = {
    id: `conv-${plantId}`,
    userId: alex,
    kind: 'plant',
    plantId,
    createdAt: new Date('2024-02-01'),
    lastMessageAt: new Date('2024-02-01'),
  }
  return {
    conversation,
    messages: Array.map(questions, (content, index) => ({
      id: `msg-${plantId}-${index}`,
      role: 'user' as const,
      content,
      conversationId: conversation.id,
      userId: alex,
      createdAt: new Date(Date.UTC(2024, 1, 1, 0, index)),
    })),
  }
}

const modelWrites = (
  chips: ReadonlyArray<{ readonly text: string; readonly basis: string }>
) =>
  model.mockResolvedValueOnce({
    output: { chips },
    usage: { inputTokens: 300, outputTokens: 100 },
  } as Awaited<ReturnType<typeof generateText>>)

const databaseDown = new SqlError({
  reason: new UnknownError({
    cause: new Error('database unreachable'),
    message: 'database unreachable',
  }),
})

const failsFor = <A>(
  plantIds: ReadonlyArray<string>,
  plantId: string,
  run: Effect.Effect<A, SqlError>
) => (Array.contains(plantIds, plantId) ? Effect.fail(databaseDown) : run)

const poll = async (world: {
  readonly sets: FollowUpSet[]
  readonly plants?: TestPlant[]
  readonly chats?: ReadonlyArray<Chat>
  readonly diagnoses?: DiagnosisRecord[]
  readonly plans?: CarePlanRow[]
  readonly steps?: CarePlanStepRow[]
  readonly failsToReadQuestionsOf?: ReadonlyArray<string>
  readonly failsToReleaseSetOf?: ReadonlyArray<string>
}) => {
  const plants = world.plants ?? [fern]
  const chats = world.chats ?? [questionsAbout('fern')]
  const followUpSets = Layer.effect(
    ChatFollowUpRepository,
    Effect.map(ChatFollowUpRepository, (beneath) =>
      ChatFollowUpRepository.of({
        ...beneath,
        release: (set) =>
          failsFor(
            world.failsToReleaseSetOf ?? [],
            set.plantId,
            beneath.release(set)
          ),
      })
    )
  ).pipe(Layer.provide(createMockChatFollowUpRepository(world.sets)))
  const chatHistory = Layer.effect(
    ChatRepository,
    Effect.map(ChatRepository, (beneath) =>
      ChatRepository.of({
        ...beneath,
        findRecentQuestions: (params) =>
          failsFor(
            world.failsToReadQuestionsOf ?? [],
            params.plantId,
            beneath.findRecentQuestions(params)
          ),
      })
    )
  ).pipe(
    Layer.provide(
      createMockChatRepository({
        conversations: Array.map(chats, (chat) => chat.conversation),
        messages: Array.flatMap(chats, (chat) => chat.messages),
      })
    )
  )
  const hasMore = await Effect.runPromise(
    pollFollowUpRequests.pipe(
      Effect.provide(
        Layer.mergeAll(
          followUpSets,
          createMockPlantRepository({
            plants,
            schedules: schedulesFromPlants(plants),
          }),
          chatHistory,
          createMockCanopyRepository([]),
          createMockDelegationRepository({}),
          createMockCarePlanRepository({
            plans: world.plans ?? [],
            steps: world.steps ?? [],
          }),
          createMockDiagnosisRepository(world.diagnoses ?? [])
        )
      )
    )
  )
  return { hasMore, sets: world.sets }
}

interface ModelInput {
  readonly facts: ReadonlyArray<{ readonly id: string }>
  readonly recentQuestions: ReadonlyArray<string>
}

const sentToModel = () => {
  const [call] = model.mock.calls
  if (call === undefined) throw new Error('the model was not called')
  const [{ system, prompt }] = call
  return {
    system: String(system),
    input: JSON.parse(String(prompt)) as ModelInput,
  }
}

describe('pollFollowUpRequests', () => {
  beforeEach(() => {
    model.mockReset()
  })

  it('stores what the model wrote and closes the request', async () => {
    modelWrites([
      { text: 'How much light does my Fern need?', basis: 'none' },
      { text: '  Can I mist my Fern today?  ', basis: 'none' },
    ])

    const { sets } = await poll({ sets: [requestedSet('fern')] })

    expect(sets).toEqual([
      {
        userId: alex,
        plantId: 'fern',
        language: 'en',
        requestedAt: null,
        claimedUntil: null,
        generatedAt: expect.any(Date),
        followUps: [
          {
            id: '0:none',
            text: 'How much light does my Fern need?',
            basis: { kind: 'none' },
          },
          {
            id: '1:none',
            text: 'Can I mist my Fern today?',
            basis: { kind: 'none' },
          },
        ],
      },
    ])
    expect(sets[0]?.generatedAt?.getTime()).toBeGreaterThan(
      requestedAt.getTime()
    )
  })

  it('gives the model the facts of the plant and maps each fact id back to its basis', async () => {
    const sick = createTestPlant({
      id: 'fern',
      name: 'Fern',
      userId: alex,
      createdByUserId: alex,
      health: 'SICK',
      scheduleSpecs: [wateringSpec({ dueDay: '2024-06-01' })],
    })
    const diagnosis: DiagnosisRecord = {
      ...mockDiagnoses[0]!,
      id: 'diagnosis-scale',
      plantId: 'fern',
      userId: alex,
      diseaseName: 'Scale insects',
    }
    const plan = createTestCarePlan({
      plantId: 'fern',
      userId: alex,
      status: 'accepted',
    })
    modelWrites([
      { text: 'Should I water my Fern now?', basis: 'late:watering' },
      { text: 'Why is my Fern sick?', basis: 'health' },
      { text: 'How do I treat the scale insects?', basis: 'diagnosis:0' },
      { text: 'What is next in my care plan?', basis: 'carePlan' },
      { text: 'How much light does my Fern need?', basis: 'none' },
    ])

    const { sets } = await poll({
      sets: [requestedSet('fern', { language: 'fr' })],
      plants: [sick],
      chats: [questionsAbout('fern', ['Is it thirsty?', 'Why brown tips?'])],
      diagnoses: [diagnosis],
      plans: [plan],
      steps: [createTestCarePlanStep(plan.id)],
    })

    const { system, input } = sentToModel()
    expect(system).toContain('language with code "fr"')
    expect(Array.map(input.facts, (fact) => fact.id)).toEqual([
      'late:watering',
      'health',
      'diagnosis:0',
      'carePlan',
    ])
    expect(input.recentQuestions).toEqual(['Why brown tips?', 'Is it thirsty?'])
    expect(Array.map(sets[0]?.followUps ?? [], (one) => one.basis)).toEqual([
      { kind: 'late', careType: 'watering' },
      { kind: 'health', status: 'SICK' },
      { kind: 'diagnosis', diagnosisId: 'diagnosis-scale' },
      { kind: 'carePlan' },
      { kind: 'none' },
    ])
  })

  it('drops a follow-up that is too long, repeated or tied to no fact of the plant', async () => {
    modelWrites([
      { text: 'How much light does my Fern need?', basis: 'none' },
      { text: 'How much light does my Fern need?', basis: 'none' },
      { text: `Why ${'really '.repeat(9)}brown?`, basis: 'none' },
      { text: 'Should I water my Fern now?', basis: 'late:watering' },
      { text: '   ', basis: 'none' },
    ])

    const { sets } = await poll({ sets: [requestedSet('fern')] })

    expect(Array.map(sets[0]?.followUps ?? [], (one) => one.text)).toEqual([
      'How much light does my Fern need?',
    ])
  })

  it('keeps the previous set when the model fails, and closes the request', async () => {
    model.mockRejectedValueOnce(new Error('upstream unavailable'))

    const { sets } = await poll({
      sets: [
        requestedSet('fern', {
          generatedAt: generatedLongAgo,
          followUps: previous,
        }),
      ],
    })

    expect(sets).toEqual([
      {
        userId: alex,
        plantId: 'fern',
        language: 'en',
        requestedAt: null,
        claimedUntil: null,
        generatedAt: generatedLongAgo,
        followUps: previous,
      },
    ])
  })

  it('keeps the previous set when the model writes nothing usable', async () => {
    modelWrites([{ text: '', basis: 'none' }])

    const { sets } = await poll({
      sets: [
        requestedSet('fern', {
          generatedAt: generatedLongAgo,
          followUps: previous,
        }),
      ],
    })

    expect(sets[0]).toMatchObject({
      requestedAt: null,
      generatedAt: generatedLongAgo,
      followUps: previous,
    })
  })

  it('writes the other sets of a batch when one fails', async () => {
    const aloe = createTestPlant({
      id: 'aloe',
      name: 'Aloe',
      userId: alex,
      createdByUserId: alex,
      scheduleSpecs: [],
    })
    model.mockRejectedValueOnce(new Error('upstream unavailable'))
    modelWrites([{ text: 'How much sun does my Aloe need?', basis: 'none' }])

    const { sets } = await poll({
      sets: [
        requestedSet('fern'),
        requestedSet('aloe', { requestedAt: new Date() }),
      ],
      plants: [fern, aloe],
      chats: [questionsAbout('fern'), questionsAbout('aloe')],
    })

    expect(Array.map(sets, (set) => set.followUps.length).sort()).toEqual([
      0, 1,
    ])
    expect(Array.map(sets, (set) => set.requestedAt)).toEqual([null, null])
  })

  describe('when the database fails on one set of a batch', () => {
    const aloe = createTestPlant({
      id: 'aloe',
      name: 'Aloe',
      userId: alex,
      createdByUserId: alex,
      scheduleSpecs: [],
    })
    const batch = () => ({
      sets: [
        requestedSet('fern', {
          generatedAt: generatedLongAgo,
          followUps: previous,
        }),
        requestedSet('aloe', { requestedAt: new Date() }),
      ],
      plants: [fern, aloe],
      chats: [questionsAbout('fern'), questionsAbout('aloe')],
      failsToReadQuestionsOf: ['fern'],
    })
    const aloeWritten = {
      plantId: 'aloe',
      requestedAt: null,
      claimedUntil: null,
      followUps: [
        {
          id: '0:none',
          text: 'How much sun does my Aloe need?',
          basis: { kind: 'none' },
        },
      ],
    }

    it('still writes the other set and releases the failed one', async () => {
      modelWrites([{ text: 'How much sun does my Aloe need?', basis: 'none' }])

      const { sets } = await poll(batch())

      expect(sets).toEqual([
        expect.objectContaining({
          plantId: 'fern',
          requestedAt: null,
          claimedUntil: null,
          generatedAt: generatedLongAgo,
          followUps: previous,
        }),
        expect.objectContaining(aloeWritten),
      ])
    })

    it('leaves the failed set to its lease when it cannot be released either', async () => {
      modelWrites([{ text: 'How much sun does my Aloe need?', basis: 'none' }])

      const { sets } = await poll({ ...batch(), failsToReleaseSetOf: ['fern'] })

      expect(sets).toEqual([
        expect.objectContaining({
          plantId: 'fern',
          requestedAt,
          claimedUntil: expect.any(Date),
          followUps: previous,
        }),
        expect.objectContaining(aloeWritten),
      ])
    })
  })

  it.each([
    {
      why: 'the plant died',
      plants: [
        createTestPlant({
          id: 'fern',
          userId: alex,
          createdByUserId: alex,
          diedAt: new Date('2024-06-01'),
          scheduleSpecs: [],
        }),
      ],
      chats: [questionsAbout('fern')],
    },
    {
      why: 'the plant was removed',
      plants: [],
      chats: [questionsAbout('fern')],
    },
    {
      why: 'the user no longer reaches the plant',
      plants: [
        createTestPlant({
          id: 'fern',
          userId: lily,
          createdByUserId: lily,
          scheduleSpecs: [],
        }),
      ],
      chats: [questionsAbout('fern')],
    },
    {
      why: 'the conversation lost its messages',
      plants: [fern],
      chats: [questionsAbout('fern', [])],
    },
  ])(
    'closes the request without calling the model when $why',
    async ({ plants, chats }) => {
      const { sets } = await poll({
        sets: [
          requestedSet('fern', {
            generatedAt: generatedLongAgo,
            followUps: previous,
          }),
        ],
        plants,
        chats,
      })

      expect(model).not.toHaveBeenCalled()
      expect(sets[0]).toMatchObject({
        requestedAt: null,
        claimedUntil: null,
        generatedAt: generatedLongAgo,
        followUps: previous,
      })
    }
  )

  it('leaves a set alone that nobody requested or that another worker holds', async () => {
    const idle = requestedSet('fern', { requestedAt: null })
    const held = requestedSet('aloe', {
      claimedUntil: new Date(Date.now() + 60_000),
    })

    const { sets, hasMore } = await poll({ sets: [idle, held] })

    expect(model).not.toHaveBeenCalled()
    expect(sets).toEqual([idle, held])
    expect(hasMore).toBe(false)
  })

  it('says there is more to do when it claimed a full batch', async () => {
    const plants = Array.makeBy(5, (n) =>
      createTestPlant({
        id: `plant-${n}`,
        userId: alex,
        createdByUserId: alex,
        scheduleSpecs: [],
      })
    )
    model.mockResolvedValue({
      output: { chips: [{ text: 'How much light?', basis: 'none' }] },
      usage: { inputTokens: 300, outputTokens: 100 },
    } as Awaited<ReturnType<typeof generateText>>)

    const { sets, hasMore } = await poll({
      sets: Array.map(plants, (plant) => requestedSet(plant.id)),
      plants,
      chats: Array.map(plants, (plant) => questionsAbout(plant.id)),
    })

    expect(hasMore).toBe(true)
    expect(Array.filter(sets, (set) => set.requestedAt === null)).toHaveLength(
      4
    )
  })
})
