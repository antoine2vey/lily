import {
  createTestCarePlan,
  createTestCarePlanStep,
} from '@lily/api/__tests__/fixtures/care-plans'
import { schedulesFromPlants } from '@lily/api/__tests__/fixtures/care-schedules'
import {
  type DiagnosisRecord,
  mockDiagnoses,
} from '@lily/api/__tests__/fixtures/diagnoses'
import { failureOf } from '@lily/api/__tests__/fixtures/exit'
import {
  createTestPlant,
  fertilizationSpec,
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
import { createMockCurrentUser } from '@lily/api/__tests__/mocks/session'
import type {
  CarePlanRow,
  CarePlanStepRow,
} from '@lily/api/repositories/care-plan.repository'
import type {
  FollowUp,
  FollowUpBasis,
  FollowUpSet,
} from '@lily/api/services/ai-chat/follow-up-set'
import type { LanguageCode } from '@lily/shared'
import type { ChatConversation, ChatMessage } from '@lily/shared/ai-chat'
import { PlantNotFoundError } from '@lily/shared/errors/plant'
import { Array, Effect, Layer } from 'effect'
import { describe, expect, it, vi } from 'vitest'

vi.mock('ai', async (importOriginal) => ({
  ...(await importOriginal<typeof import('ai')>()),
  generateText: vi.fn(),
}))

import { listChatFollowUps } from '@lily/api/services/ai-chat/endpoints/list-chat-follow-ups'
import { generateText } from 'ai'

const alex = 'user-alex'
const stranger = 'user-stranger'
const HOUR = 60 * 60 * 1000
const hoursAgo = (hours: number) => new Date(Date.now() - hours * HOUR)

const healthyFern = createTestPlant({
  id: 'fern',
  name: 'Fern',
  userId: alex,
  createdByUserId: alex,
  scheduleSpecs: [],
})

const followUp = (text: string, basis: FollowUpBasis): FollowUp => ({
  id: text,
  text,
  basis,
})

const general = (text: string) => followUp(text, { kind: 'none' })

const setOf = (
  followUps: ReadonlyArray<FollowUp>,
  overrides: Partial<FollowUpSet> = {}
): FollowUpSet => ({
  userId: alex,
  plantId: 'fern',
  language: 'en',
  requestedAt: null,
  claimedUntil: null,
  generatedAt: hoursAgo(1),
  followUps,
  ...overrides,
})

const conversation: ChatConversation = {
  id: 'conv-fern',
  userId: alex,
  kind: 'plant',
  plantId: 'fern',
  createdAt: new Date('2024-02-01'),
  lastMessageAt: new Date('2024-02-01'),
}

const sent = (content: string, at: Date): ChatMessage => ({
  id: `msg-${content}-${at.getTime()}`,
  role: 'user',
  content,
  conversationId: conversation.id,
  userId: alex,
  createdAt: at,
})

const read = (world: {
  readonly sets: FollowUpSet[]
  readonly plant?: TestPlant
  readonly userId?: string
  readonly language?: LanguageCode
  readonly messages?: ChatMessage[]
  readonly diagnoses?: DiagnosisRecord[]
  readonly plans?: CarePlanRow[]
  readonly steps?: CarePlanStepRow[]
}) => {
  const plants = [world.plant ?? healthyFern]
  return Effect.runPromiseExit(
    listChatFollowUps('fern', world.language ?? 'en').pipe(
      Effect.provide(
        Layer.mergeAll(
          createMockChatFollowUpRepository(world.sets),
          createMockPlantRepository({
            plants,
            schedules: schedulesFromPlants(plants),
          }),
          createMockChatRepository({
            conversations: [conversation],
            messages: world.messages ?? [],
          }),
          createMockCurrentUser({ id: world.userId ?? alex }),
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
}

const texts = async (result: ReturnType<typeof read>) => {
  const exit = await result
  if (exit._tag === 'Failure') throw new Error('expected follow-ups')
  return Array.map(exit.value.suggestions, (suggestion) => suggestion.text)
}

const wateringLate = followUp('Should I water it now?', {
  kind: 'late',
  careType: 'watering',
})
const whySick = followUp('Why is it sick?', { kind: 'health', status: 'SICK' })
const aboutScale = followUp('How do I treat the scale?', {
  kind: 'diagnosis',
  diagnosisId: 'diagnosis-scale',
})
const nextStep = followUp('What is next in my plan?', { kind: 'carePlan' })
const anyTime = general('How much light does it need?')

const scale: DiagnosisRecord = {
  ...mockDiagnoses[0]!,
  id: 'diagnosis-scale',
  plantId: 'fern',
  userId: alex,
}

describe('listChatFollowUps', () => {
  it('serves the first four follow-ups of the set with their ids', async () => {
    const written = Array.makeBy(6, (n) => general(`Question ${n}?`))
    const exit = await read({ sets: [setOf(written)] })

    if (exit._tag === 'Failure') throw new Error('expected follow-ups')
    expect(exit.value.suggestions).toEqual(
      Array.map(Array.take(written, 4), ({ id, text }) => ({ id, text }))
    )
  })

  it('serves nothing when the user has no set for the plant', async () => {
    expect(await texts(read({ sets: [] }))).toEqual([])
  })

  it('serves nothing from a set that is requested but not written yet, without asking the model', async () => {
    const waiting = setOf([], { requestedAt: hoursAgo(0), generatedAt: null })

    expect(await texts(read({ sets: [waiting] }))).toEqual([])
    expect(vi.mocked(generateText)).not.toHaveBeenCalled()
  })

  it('serves nothing from a set written in another language', async () => {
    const english = setOf([anyTime], { language: 'en' })

    expect(await texts(read({ sets: [english], language: 'fr' }))).toEqual([])
    expect(await texts(read({ sets: [english], language: 'en' }))).toEqual([
      anyTime.text,
    ])
  })

  it('serves a set up to 3 days old and nothing from an older one', async () => {
    expect(
      await texts(
        read({ sets: [setOf([anyTime], { generatedAt: hoursAgo(71) })] })
      )
    ).toEqual([anyTime.text])
    expect(
      await texts(
        read({ sets: [setOf([anyTime], { generatedAt: hoursAgo(73) })] })
      )
    ).toEqual([])
  })

  it('serves nothing for a dead plant', async () => {
    const buried = { ...healthyFern, diedAt: new Date('2024-06-01') }

    expect(
      await texts(read({ sets: [setOf([anyTime])], plant: buried }))
    ).toEqual([])
  })

  it('answers a stranger as if the plant did not exist', async () => {
    expect(
      failureOf(await read({ sets: [setOf([anyTime])], userId: stranger }))
    ).toBeInstanceOf(PlantNotFoundError)
  })

  it('drops a follow-up the user has sent since the set was written', async () => {
    const set = setOf([general('Already asked?'), anyTime], {
      generatedAt: hoursAgo(2),
    })

    expect(
      await texts(
        read({ sets: [set], messages: [sent('Already asked?', hoursAgo(1))] })
      )
    ).toEqual([anyTime.text])
  })

  it('keeps a follow-up the user sent before the set was written', async () => {
    const set = setOf([general('Asked long ago?'), anyTime], {
      generatedAt: hoursAgo(2),
    })

    expect(
      await texts(
        read({ sets: [set], messages: [sent('Asked long ago?', hoursAgo(5))] })
      )
    ).toEqual(['Asked long ago?', anyTime.text])
  })

  describe('a follow-up about a late care', () => {
    const set = setOf([wateringLate, anyTime])

    it('is served while that care is overdue', async () => {
      const late = {
        ...healthyFern,
        scheduleSpecs: [wateringSpec({ dueDay: '2024-06-01' })],
      }
      expect(await texts(read({ sets: [set], plant: late }))).toEqual([
        wateringLate.text,
        anyTime.text,
      ])
    })

    it('is dropped once the care is no longer overdue, whatever else is late', async () => {
      const watered = {
        ...healthyFern,
        scheduleSpecs: [
          wateringSpec({ dueDay: '2099-01-01' }),
          fertilizationSpec({ dueDay: '2024-06-01' }),
        ],
      }
      expect(await texts(read({ sets: [set], plant: watered }))).toEqual([
        anyTime.text,
      ])
    })
  })

  describe('a follow-up about the condition', () => {
    const set = setOf([whySick, anyTime])

    it('is served while the plant has that condition', async () => {
      const sick = { ...healthyFern, health: 'SICK' as const }
      expect(await texts(read({ sets: [set], plant: sick }))).toEqual([
        whySick.text,
        anyTime.text,
      ])
    })

    it('is dropped once the condition changed', async () => {
      const recovering = { ...healthyFern, health: 'RECOVERING' as const }
      expect(await texts(read({ sets: [set], plant: recovering }))).toEqual([
        anyTime.text,
      ])
      expect(await texts(read({ sets: [set] }))).toEqual([anyTime.text])
    })
  })

  describe('a follow-up about a diagnosis', () => {
    const set = setOf([aboutScale, anyTime])

    it('is served while the diagnosis is among the latest of the plant', async () => {
      expect(await texts(read({ sets: [set], diagnoses: [scale] }))).toEqual([
        aboutScale.text,
        anyTime.text,
      ])
    })

    it('is dropped once the diagnosis is gone or three newer ones exist', async () => {
      const newer = Array.makeBy(3, (n) => ({
        ...scale,
        id: `diagnosis-newer-${n}`,
        createdAt: new Date(scale.createdAt.getTime() + (n + 1) * HOUR),
      }))

      expect(await texts(read({ sets: [set] }))).toEqual([anyTime.text])
      expect(
        await texts(read({ sets: [set], diagnoses: [scale, ...newer] }))
      ).toEqual([anyTime.text])
    })
  })

  describe('a follow-up about the care plan', () => {
    const set = setOf([nextStep, anyTime])
    const plan = createTestCarePlan({
      plantId: 'fern',
      userId: alex,
      status: 'accepted',
    })

    it('is served while an accepted plan has an open step', async () => {
      expect(
        await texts(
          read({
            sets: [set],
            plans: [plan],
            steps: [createTestCarePlanStep(plan.id)],
          })
        )
      ).toEqual([nextStep.text, anyTime.text])
    })

    it('is dropped once every step is done', async () => {
      expect(
        await texts(
          read({
            sets: [set],
            plans: [plan],
            steps: [
              createTestCarePlanStep(plan.id, {
                completedAt: new Date('2024-02-01'),
              }),
            ],
          })
        )
      ).toEqual([anyTime.text])
    })
  })

  it('fills the four places with the follow-ups that still apply', async () => {
    const set = setOf([
      wateringLate,
      whySick,
      general('One?'),
      general('Two?'),
      general('Three?'),
      general('Four?'),
    ])

    expect(await texts(read({ sets: [set] }))).toEqual([
      'One?',
      'Two?',
      'Three?',
      'Four?',
    ])
  })
})
