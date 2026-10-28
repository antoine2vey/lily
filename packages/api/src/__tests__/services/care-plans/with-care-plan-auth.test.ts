import { createTestMembership } from '@lily/api/__tests__/fixtures/canopies'
import {
  createTestCarePlan,
  createTestCarePlanStep,
} from '@lily/api/__tests__/fixtures/care-plans'
import { createTestPlant } from '@lily/api/__tests__/fixtures/plants'
import { createMockCanopyRepository } from '@lily/api/__tests__/mocks/canopy.repository'
import { createMockCarePlanRepository } from '@lily/api/__tests__/mocks/care-plan.repository'
import { createMockDelegationRepository } from '@lily/api/__tests__/mocks/delegation.repository'
import { createMockPlantRepository } from '@lily/api/__tests__/mocks/plant.repository'
import { createMockCurrentUser } from '@lily/api/__tests__/mocks/session'
import type { CarePlanAction } from '@lily/api/services/care-plans/helpers/care-plan-access'
import {
  withCarePlanAuth,
  withCarePlanStep,
} from '@lily/api/services/care-plans/helpers/with-care-plan-auth'
import type { CarePlanStatus } from '@lily/shared/care-plan'
import { Effect, Exit, Layer } from 'effect'
import { describe, expect, it } from 'vitest'

const alex = 'user-alex'
const lily = 'user-lily'
const sam = 'user-sam'

const personalPlant = createTestPlant({
  id: 'plant-personal',
  userId: alex,
  createdByUserId: alex,
})
const canopyPlant = createTestPlant({
  id: 'plant-canopy',
  userId: null,
  canopyId: 'canopy-1',
  createdByUserId: alex,
})

const planOn = (plantId: string, status: CarePlanStatus) =>
  createTestCarePlan({ id: `plan-${status}`, plantId, userId: alex, status })

const layer = (
  viewerId: string,
  plan: ReturnType<typeof createTestCarePlan>,
  members: ReadonlyArray<string> = [alex, lily]
) =>
  Layer.mergeAll(
    createMockCarePlanRepository({
      plans: [plan],
      steps: [createTestCarePlanStep(plan.id, { id: 'step-1' })],
    }),
    createMockPlantRepository({ plants: [personalPlant, canopyPlant] }),
    createMockCanopyRepository(
      members.map((userId) =>
        createTestMembership({
          userId,
          role: userId === alex ? 'owner' : 'member',
        })
      )
    ),
    createMockDelegationRepository({}),
    createMockCurrentUser({ id: viewerId })
  )

const outcome = async (
  viewerId: string,
  plan: ReturnType<typeof createTestCarePlan>,
  action: CarePlanAction,
  members?: ReadonlyArray<string>
) => {
  const exit = await Effect.runPromiseExit(
    withCarePlanAuth(plan.id, action).pipe(
      Effect.provide(layer(viewerId, plan, members))
    )
  )
  return Exit.isSuccess(exit) ? exit.value.id : String(exit.cause)
}

describe('withCarePlanAuth', () => {
  it('lets the author manage and tick a plan on their own plant', async () => {
    const plan = planOn(personalPlant.id, 'proposed')
    expect(await outcome(alex, plan, 'manage')).toBe(plan.id)
    expect(await outcome(alex, plan, 'tick')).toBe(plan.id)
  })

  it('hides a plan on a personal plant from anyone but its author', async () => {
    const plan = planOn(personalPlant.id, 'accepted')
    expect(await outcome(lily, plan, 'tick')).toContain('CarePlanNotFoundError')
  })

  it('fails with CarePlanNotFoundError for an unknown plan', async () => {
    const plan = planOn(personalPlant.id, 'accepted')
    const exit = await Effect.runPromiseExit(
      withCarePlanAuth('nope', 'manage').pipe(Effect.provide(layer(alex, plan)))
    )
    expect(String(exit)).toContain('CarePlanNotFoundError')
  })

  it.each(['accepted', 'completed'] as const)(
    'lets another member tick, not manage, an %s plan on a Canopy plant',
    async (status) => {
      const plan = planOn(canopyPlant.id, status)
      expect(await outcome(lily, plan, 'tick')).toBe(plan.id)
      expect(await outcome(lily, plan, 'manage')).toContain(
        'CarePlanNotFoundError'
      )
    }
  )

  it.each(['proposed', 'dismissed'] as const)(
    'keeps a %s plan on a Canopy plant with its author',
    async (status) => {
      const plan = planOn(canopyPlant.id, status)
      expect(await outcome(lily, plan, 'tick')).toContain(
        'CarePlanNotFoundError'
      )
      expect(await outcome(alex, plan, 'manage')).toBe(plan.id)
    }
  )

  it('hides a Canopy plan from a user outside the Canopy', async () => {
    const plan = planOn(canopyPlant.id, 'accepted')
    expect(await outcome(sam, plan, 'tick')).toContain('CarePlanNotFoundError')
  })

  it('hides their own plan from an author who left the Canopy', async () => {
    const plan = planOn(canopyPlant.id, 'accepted')
    expect(await outcome(alex, plan, 'manage', [lily])).toContain(
      'CarePlanNotFoundError'
    )
  })
})

describe('withCarePlanStep', () => {
  it('returns the plan and the matching step', async () => {
    const plan = planOn(personalPlant.id, 'accepted')
    const result = await Effect.runPromise(
      withCarePlanStep(plan.id, 'step-1', 'tick').pipe(
        Effect.provide(layer(alex, plan))
      )
    )
    expect(result.plan.id).toBe(plan.id)
    expect(result.step.id).toBe('step-1')
  })

  it('fails with CarePlanStepNotFoundError for a step of another plan', async () => {
    const plan = planOn(personalPlant.id, 'accepted')
    const exit = await Effect.runPromiseExit(
      withCarePlanStep(plan.id, 'step-elsewhere', 'tick').pipe(
        Effect.provide(layer(alex, plan))
      )
    )
    expect(String(exit)).toContain('CarePlanStepNotFoundError')
  })
})
