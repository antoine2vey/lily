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
import { RecordOutcome, Refusal } from '@lily/api/contexts/care'
import { completeCarePlanStep } from '@lily/api/services/care-plans/endpoints/complete-care-plan-step'
import { uncompleteCarePlanStep } from '@lily/api/services/care-plans/endpoints/uncomplete-care-plan-step'
import { withCarePlanStep } from '@lily/api/services/care-plans/helpers/with-care-plan-auth'
import { CareDay } from '@lily/shared'
import { Array, Effect, Layer, Option, References } from 'effect'
import { describe, expect, it } from 'vitest'

const userId = 'user-1'
const plantId = 'plant-1'
const today = CareDay.make('2026-11-12')

type CareAnswer = 'Recorded' | 'AlreadyCared' | 'Dead'

const outcomeOf = (answer: CareAnswer) => (id: string) =>
  answer === 'Recorded'
    ? RecordOutcome.Recorded({
        plantId: id,
        careLogId: 'care-1',
        careType: 'watering',
        day: today,
        dueDay: Option.none(),
      })
    : RecordOutcome.Skipped({
        plantId: id,
        reason:
          answer === 'Dead'
            ? Refusal.Dead({ plantId: id })
            : Refusal.AlreadyCared({
                plantId: id,
                careType: 'watering',
                day: today,
              }),
      })

const buildScenario = (answer: CareAnswer = 'Recorded') => {
  const testPlant = createTestPlant({ id: plantId, userId })
  const plan = createTestCarePlan({
    id: 'plan-1',
    plantId,
    userId,
    status: 'accepted',
  })
  const steps = [
    createTestCarePlanStep(plan.id, {
      id: 'step-water',
      position: 0,
      title: 'Water now',
      careType: 'watering',
    }),
    createTestCarePlanStep(plan.id, {
      id: 'step-check',
      position: 1,
      title: 'Check the leaves',
    }),
  ]
  const care = createStubCare(outcomeOf(answer))
  const layer = Layer.mergeAll(
    createMockCarePlanRepository({
      plans: [plan],
      steps,
      plants: [{ id: plantId, name: testPlant.name, imageUrl: null }],
    }),
    createMockPlantRepository({ plants: [testPlant], schedules: [] }),
    createMockDelegationRepository({}),
    createMockCanopyRepository(),
    createMockCurrentUser({ id: userId }),
    care.layer
  )
  return { layer, care }
}

const run = <A, E>(effect: Effect.Effect<A, E, never>) =>
  Effect.runPromise(
    effect.pipe(Effect.provideService(References.MinimumLogLevel, 'None'))
  )

const tick = (stepId: string) =>
  withCarePlanStep('plan-1', stepId, 'tick').pipe(
    Effect.flatMap(completeCarePlanStep)
  )

const stepOf = (
  plan: { readonly steps: ReadonlyArray<{ readonly id: string }> },
  stepId: string
) => Array.findFirst(plan.steps, (s) => s.id === stepId).pipe(Option.getOrThrow)

describe('completeCarePlanStep', () => {
  it('ticks a free-text step without recording a care', async () => {
    const { layer, care } = buildScenario()

    const plan = await run(tick('step-check').pipe(Effect.provide(layer)))

    expect(stepOf(plan, 'step-check')).toMatchObject({
      completedAt: expect.any(Date),
    })
    expect(plan.status).toBe('accepted')
    expect(care.commands).toEqual([])
  })

  it('records a care for today that names the step, for a care step', async () => {
    const { layer, care } = buildScenario()

    await run(tick('step-water').pipe(Effect.provide(layer)))

    expect(care.commands).toHaveLength(1)
    expect(care.commands[0]).toMatchObject({
      careType: 'watering',
      on: { _tag: 'Today' },
      planStep: { _tag: 'Step', id: 'step-water' },
    })
    expect(care.commands[0]?.permits[0]).toMatchObject({
      plantId,
      action: 'care',
      actor: { _tag: 'User', userId },
    })
  })

  it.each([
    ['was already cared for today', 'AlreadyCared' as const],
    ['is dead', 'Dead' as const],
  ])(
    'ticks a care step without a care when the plant %s',
    async (_, answer) => {
      const { layer } = buildScenario(answer)

      const plan = await run(tick('step-water').pipe(Effect.provide(layer)))

      const step = stepOf(plan, 'step-water')
      expect(step).toMatchObject({ completedAt: expect.any(Date) })
      expect(step).not.toHaveProperty('careLogId', expect.any(String))
    }
  )

  it('completes the plan once the last step is done, and reopens on undo', async () => {
    const { layer } = buildScenario('AlreadyCared')

    const { completed, reopened } = await run(
      Effect.gen(function* () {
        yield* tick('step-check')
        const completed = yield* tick('step-water')
        const reopened = yield* withCarePlanStep(
          'plan-1',
          'step-check',
          'tick'
        ).pipe(Effect.flatMap(uncompleteCarePlanStep))
        return { completed, reopened }
      }).pipe(Effect.provide(layer))
    )

    expect(completed.status).toBe('completed')
    expect(completed.completedAt).toBeInstanceOf(Date)
    expect(reopened.status).toBe('accepted')
    expect(reopened.completedAt).toBeUndefined()
  })

  it('does nothing for a step that is already completed', async () => {
    const { layer, care } = buildScenario('AlreadyCared')

    const plan = await run(
      Effect.gen(function* () {
        yield* tick('step-water')
        return yield* tick('step-water')
      }).pipe(Effect.provide(layer))
    )

    expect(plan.steps).toHaveLength(2)
    expect(care.commands).toHaveLength(1)
  })
})
