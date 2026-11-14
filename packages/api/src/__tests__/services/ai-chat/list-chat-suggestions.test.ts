import {
  createTestMembership,
  mockCanopyId,
} from '@lily/api/__tests__/fixtures/canopies'
import {
  createTestCarePlan,
  createTestCarePlanStep,
} from '@lily/api/__tests__/fixtures/care-plans'
import { schedulesFromPlants } from '@lily/api/__tests__/fixtures/care-schedules'
import { failureOf } from '@lily/api/__tests__/fixtures/exit'
import {
  createTestPlant,
  type TestPlant,
  wateringSpec,
} from '@lily/api/__tests__/fixtures/plants'
import { createMockCanopyRepository } from '@lily/api/__tests__/mocks/canopy.repository'
import { createMockCarePlanRepository } from '@lily/api/__tests__/mocks/care-plan.repository'
import { createMockDelegationRepository } from '@lily/api/__tests__/mocks/delegation.repository'
import { createMockPlantRepository } from '@lily/api/__tests__/mocks/plant.repository'
import { createMockCurrentUser } from '@lily/api/__tests__/mocks/session'
import type {
  CarePlanRow,
  CarePlanStepRow,
} from '@lily/api/repositories/care-plan.repository'
import { listChatSuggestions } from '@lily/api/services/ai-chat/endpoints/list-chat-suggestions'
import type { LanguageCode } from '@lily/shared'
import { PlantNotFoundError } from '@lily/shared/errors/plant'
import { Array, Effect, Layer, Option } from 'effect'
import { describe, expect, it } from 'vitest'

const alex = 'user-alex'
const lily = 'user-lily'
const stranger = 'user-stranger'

const longAgo = new Date('2024-01-01')

const alexPlant = createTestPlant({
  id: 'alex-plant',
  name: 'Fern',
  userId: alex,
  createdByUserId: alex,
  dateAdded: longAgo,
  scheduleSpecs: [],
})
const canopyPlant = createTestPlant({
  id: 'canopy-plant',
  name: 'Pothos',
  userId: null,
  canopyId: mockCanopyId,
  createdByUserId: lily,
  dateAdded: longAgo,
  scheduleSpecs: [],
})
const buriedPlant = createTestPlant({
  id: 'buried-plant',
  name: 'Basil',
  userId: alex,
  createdByUserId: alex,
  dateAdded: longAgo,
  diedAt: new Date('2024-06-01'),
  scheduleSpecs: [wateringSpec({ dueDay: '2024-06-01' })],
})

const members = [
  createTestMembership({ userId: alex, role: 'owner' }),
  createTestMembership({ userId: lily }),
]

const run = (
  userId: string,
  plantId: string,
  options: {
    readonly language?: LanguageCode
    readonly plans?: CarePlanRow[]
    readonly steps?: CarePlanStepRow[]
    readonly plants?: TestPlant[]
  } = {}
) => {
  const plants = options.plants ?? [alexPlant, canopyPlant, buriedPlant]
  return Effect.runPromiseExit(
    listChatSuggestions(plantId, options.language ?? 'en').pipe(
      Effect.provide(
        Layer.mergeAll(
          createMockPlantRepository({
            plants,
            schedules: schedulesFromPlants(plants),
            memberships: members,
          }),
          createMockCurrentUser({ id: userId }),
          createMockCanopyRepository(members),
          createMockDelegationRepository({}),
          createMockCarePlanRepository({
            plans: options.plans ?? [],
            steps: options.steps ?? [],
          })
        )
      )
    )
  )
}

const succeeded = async (result: ReturnType<typeof run>) => {
  const exit = await result
  if (exit._tag === 'Failure') throw new Error('expected suggestions')
  return exit.value.suggestions
}

const ids = async (result: ReturnType<typeof run>) =>
  Array.map(await succeeded(result), (s) => s.id)

describe('listChatSuggestions', () => {
  it('suggests to the owner of a plant', async () => {
    expect(await succeeded(run(alex, 'alex-plant'))).toEqual([
      { id: 'care', text: 'How do I care for Fern?' },
      { id: 'propagate', text: 'How do I propagate Fern?' },
      { id: 'common-problems', text: 'What are common problems with Fern?' },
      { id: 'when-to-repot', text: 'When should I repot Fern?' },
    ])
  })

  it('suggests to a member of the canopy that owns the plant', async () => {
    expect(await ids(run(alex, 'canopy-plant'))).toHaveLength(4)
    expect(await ids(run(lily, 'canopy-plant'))).toHaveLength(4)
  })

  it('answers a stranger as if the plant did not exist', async () => {
    expect(failureOf(await run(stranger, 'alex-plant'))).toBeInstanceOf(
      PlantNotFoundError
    )
    expect(failureOf(await run(lily, 'alex-plant'))).toBeInstanceOf(
      PlantNotFoundError
    )
  })

  it('answers a missing plant with PlantNotFoundError', async () => {
    expect(failureOf(await run(alex, 'no-such-plant'))).toBeInstanceOf(
      PlantNotFoundError
    )
  })

  it('suggests in the language the app asks for', async () => {
    const [first] = await succeeded(run(alex, 'alex-plant', { language: 'fr' }))
    expect(first?.text).toBe('Comment entretenir Fern ?')
  })

  it('reads overdue care from the stored due day', async () => {
    const plant = {
      ...alexPlant,
      scheduleSpecs: [wateringSpec({ dueDay: '2024-06-01' })],
    }
    expect(await ids(run(alex, 'alex-plant', { plants: [plant] }))).toContain(
      'overdue-watering'
    )
  })

  it('suggests no care for a dead plant', async () => {
    expect(await ids(run(alex, 'buried-plant'))).not.toContain(
      'overdue-watering'
    )
  })

  it('suggests the next plan step of an accepted plan the viewer may see', async () => {
    const plan = createTestCarePlan({
      plantId: 'canopy-plant',
      userId: lily,
      status: 'accepted',
    })
    const steps = [createTestCarePlanStep(plan.id)]

    expect(
      await ids(run(alex, 'canopy-plant', { plans: [plan], steps }))
    ).toContain('care-plan-next')
  })

  it('leaves out a plan the viewer may not see, or one with every step done', async () => {
    const proposed = createTestCarePlan({
      plantId: 'canopy-plant',
      userId: lily,
      status: 'proposed',
    })
    const done = createTestCarePlan({
      plantId: 'canopy-plant',
      userId: alex,
      status: 'accepted',
    })
    const steps = [
      createTestCarePlanStep(proposed.id),
      createTestCarePlanStep(done.id, { completedAt: new Date('2024-02-01') }),
    ]

    expect(
      await ids(run(alex, 'canopy-plant', { plans: [proposed, done], steps }))
    ).not.toContain('care-plan-next')
  })
})
