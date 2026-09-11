import {
  createTestCarePlan,
  createTestCarePlanStep,
} from '@lily/api/__tests__/fixtures/care-plans'
import { createMockCarePlanRepository } from '@lily/api/__tests__/mocks/care-plan.repository'
import { createMockCurrentUser } from '@lily/api/__tests__/mocks/session'
import {
  withCarePlanAuth,
  withCarePlanStep,
} from '@lily/api/services/care-plans/helpers/with-care-plan-auth'
import { Effect, Exit, Layer } from 'effect'
import { describe, expect, it } from 'vitest'

const plan = createTestCarePlan({ id: 'plan-1', userId: 'user-1' })
const step = createTestCarePlanStep('plan-1', { id: 'step-1' })

const layer = (currentUserId = 'user-1') =>
  Layer.mergeAll(
    createMockCarePlanRepository({ plans: [plan], steps: [step] }),
    createMockCurrentUser({ id: currentUserId })
  )

const failureTag = (exit: Exit.Exit<unknown, unknown>) =>
  Exit.isFailure(exit) ? String(exit.cause) : 'success'

describe('withCarePlanAuth', () => {
  it('returns the plan with its steps for the owner', async () => {
    const result = await Effect.runPromise(
      withCarePlanAuth('plan-1').pipe(Effect.provide(layer()))
    )
    expect(result.id).toBe('plan-1')
    expect(result.steps).toHaveLength(1)
  })

  it('fails with CarePlanNotFoundError for an unknown plan', async () => {
    const exit = await Effect.runPromiseExit(
      withCarePlanAuth('nope').pipe(Effect.provide(layer()))
    )
    expect(failureTag(exit)).toContain('CarePlanNotFoundError')
  })

  it('hides the plan from another user', async () => {
    const exit = await Effect.runPromiseExit(
      withCarePlanAuth('plan-1').pipe(Effect.provide(layer('user-2')))
    )
    expect(failureTag(exit)).toContain('CarePlanNotFoundError')
  })
})

describe('withCarePlanStep', () => {
  it('returns the plan and the matching step', async () => {
    const result = await Effect.runPromise(
      withCarePlanStep('plan-1', 'step-1').pipe(Effect.provide(layer()))
    )
    expect(result.plan.id).toBe('plan-1')
    expect(result.step.id).toBe('step-1')
  })

  it('fails with CarePlanStepNotFoundError for a step of another plan', async () => {
    const exit = await Effect.runPromiseExit(
      withCarePlanStep('plan-1', 'step-elsewhere').pipe(Effect.provide(layer()))
    )
    expect(failureTag(exit)).toContain('CarePlanStepNotFoundError')
  })
})
