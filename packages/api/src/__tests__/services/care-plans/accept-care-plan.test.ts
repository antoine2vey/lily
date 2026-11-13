import {
  createTestCarePlan,
  createTestCarePlanStep,
} from '@lily/api/__tests__/fixtures/care-plans'
import { createTestPlant } from '@lily/api/__tests__/fixtures/plants'
import { createMockCanopyRepository } from '@lily/api/__tests__/mocks/canopy.repository'
import { createStubCare } from '@lily/api/__tests__/mocks/care'
import { createMockCarePlanRepository } from '@lily/api/__tests__/mocks/care-plan.repository'
import { createMockDelegationRepository } from '@lily/api/__tests__/mocks/delegation.repository'
import { createMockPlantRepository } from '@lily/api/__tests__/mocks/plant.repository'
import { createMockCurrentUser } from '@lily/api/__tests__/mocks/session'
import { DueMove } from '@lily/api/contexts/care'
import {
  acceptCarePlan,
  scheduleTargetsFromSteps,
} from '@lily/api/services/care-plans/endpoints/accept-care-plan'
import { withCarePlanAuth } from '@lily/api/services/care-plans/helpers/with-care-plan-auth'
import { DateTime, Effect, Exit, Layer } from 'effect'
import { describe, expect, it } from 'vitest'

const userId = 'user-1'
const plantId = 'plant-1'

const wateringDue = new Date('2024-02-01T00:00:00Z')
const mistingDue = new Date('2024-02-03T00:00:00Z')

const accept = (
  planOverrides: Parameters<typeof createTestCarePlan>[0] = {},
  currentUserId = userId
) => {
  const plant = createTestPlant({ id: plantId, userId })
  const plan = createTestCarePlan({
    id: 'plan-1',
    plantId,
    userId,
    ...planOverrides,
  })
  const steps = [
    createTestCarePlanStep(plan.id, {
      id: 'step-water',
      position: 0,
      title: 'Water lightly',
      careType: 'watering',
      dueDate: wateringDue,
    }),
    createTestCarePlanStep(plan.id, {
      id: 'step-mist',
      position: 1,
      title: 'Mist the leaves',
      careType: 'misting',
      dueDate: mistingDue,
    }),
    createTestCarePlanStep(plan.id, {
      id: 'step-check',
      position: 2,
      title: 'Check for new growth',
    }),
  ]
  const care = createStubCare()

  return {
    care,
    effect: withCarePlanAuth('plan-1', 'manage').pipe(
      Effect.flatMap(acceptCarePlan),
      Effect.provide(
        Layer.mergeAll(
          care.layer,
          createMockCarePlanRepository({
            plans: [plan],
            steps,
            plants: [{ id: plantId, name: plant.name, imageUrl: null }],
          }),
          createMockPlantRepository({ plants: [plant] }),
          createMockDelegationRepository({}),
          createMockCanopyRepository(),
          createMockCurrentUser({ id: currentUserId })
        )
      )
    ),
  }
}

describe('acceptCarePlan', () => {
  it('flips a proposed plan to accepted', async () => {
    const result = await Effect.runPromise(accept().effect)
    expect(result.status).toBe('accepted')
    expect(result.acceptedAt).toBeInstanceOf(Date)
    expect(result.steps).toHaveLength(3)
  })

  it('moves the due day of each dated care-typed step to its date', async () => {
    const { care, effect } = accept()

    await Effect.runPromise(effect)

    expect(care.moved).toEqual([
      {
        reason: 'carePlan',
        moves: [
          {
            plantId,
            careType: 'watering',
            move: DueMove.To({ instant: DateTime.makeUnsafe(wateringDue) }),
          },
          {
            plantId,
            careType: 'misting',
            move: DueMove.To({ instant: DateTime.makeUnsafe(mistingDue) }),
          },
        ],
      },
    ])
  })

  it('rejects a plan that is not proposed', async () => {
    const exit = await Effect.runPromiseExit(
      accept({ status: 'accepted' }).effect
    )
    expect(Exit.isFailure(exit)).toBe(true)
    if (Exit.isFailure(exit)) {
      expect(String(exit.cause)).toContain('CarePlanNotProposedError')
    }
  })

  it('is invisible to another user', async () => {
    const exit = await Effect.runPromiseExit(accept({}, 'user-2').effect)
    expect(Exit.isFailure(exit)).toBe(true)
    if (Exit.isFailure(exit)) {
      expect(String(exit.cause)).toContain('CarePlanNotFoundError')
    }
  })
})

describe('scheduleTargetsFromSteps', () => {
  it('keeps the earliest dated step per care type and drops undated ones', () => {
    const targets = scheduleTargetsFromSteps([
      {
        id: 'a',
        planId: 'p',
        position: 0,
        title: 'Water',
        careType: 'watering',
        dueDate: new Date('2024-02-05'),
      },
      {
        id: 'b',
        planId: 'p',
        position: 1,
        title: 'Water again',
        careType: 'watering',
        dueDate: new Date('2024-02-01'),
      },
      {
        id: 'c',
        planId: 'p',
        position: 2,
        title: 'Repot',
        careType: 'repotting',
      },
      { id: 'd', planId: 'p', position: 3, title: 'Look at it' },
    ])
    expect(targets).toEqual([
      { careType: 'watering', dueDate: new Date('2024-02-01') },
    ])
  })
})
