import {
  createTestCarePlan,
  createTestCarePlanStep,
} from '@lily/api/__tests__/fixtures/care-plans'
import {
  createTestCareLine,
  createTestCarePlant,
  TEST_CARE_TODAY,
} from '@lily/api/__tests__/fixtures/care-plants'
import { createTestPlant } from '@lily/api/__tests__/fixtures/plants'
import { createMockCanopyRepository } from '@lily/api/__tests__/mocks/canopy.repository'
import { createInMemoryCare } from '@lily/api/__tests__/mocks/care'
import { createCarePlanRows } from '@lily/api/__tests__/mocks/care-plan.repository'
import { createMockDelegationRepository } from '@lily/api/__tests__/mocks/delegation.repository'
import { createMockPlantRepository } from '@lily/api/__tests__/mocks/plant.repository'
import { createMockCurrentUser } from '@lily/api/__tests__/mocks/session'
import { LifeState } from '@lily/api/contexts/care/domain/care-plant'
import type { CareWrite } from '@lily/api/contexts/care/domain/decide'
import { completeCarePlanStep } from '@lily/api/services/care-plans/endpoints/complete-care-plan-step'
import { uncompleteCarePlanStep } from '@lily/api/services/care-plans/endpoints/uncomplete-care-plan-step'
import { withCarePlanStep } from '@lily/api/services/care-plans/helpers/with-care-plan-auth'
import type { CarePlanStatus } from '@lily/shared/care-plan'
import { Array, Effect, Exit, Layer, Option, References } from 'effect'
import { describe, expect, it } from 'vitest'

const userId = 'user-1'
const plantId = 'plant-1'

type PlantState = 'NotCaredToday' | 'CaredToday' | 'Dead'

const buildScenario = (
  state: PlantState = 'NotCaredToday',
  status: CarePlanStatus = 'accepted'
) => {
  const testPlant = createTestPlant({ id: plantId, userId })
  const plan = createTestCarePlan({ id: 'plan-1', plantId, userId, status })
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
  const plans = createCarePlanRows({
    plans: [plan],
    steps,
    plants: [{ id: plantId, name: testPlant.name, imageUrl: null }],
  })
  const care = createInMemoryCare(
    [
      createTestCarePlant(plantId, {
        life: state === 'Dead' ? LifeState.Dead() : LifeState.Living(),
        lines: [
          createTestCareLine('watering', {
            caredOn: state === 'CaredToday' ? [TEST_CARE_TODAY] : [],
          }),
        ],
      }),
    ],
    { plans }
  )
  const layer = Layer.mergeAll(
    plans.layer,
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

const untick = (stepId: string) =>
  withCarePlanStep('plan-1', stepId, 'tick').pipe(
    Effect.flatMap(uncompleteCarePlanStep)
  )

const stepOf = (
  plan: { readonly steps: ReadonlyArray<{ readonly id: string }> },
  stepId: string
) => Array.findFirst(plan.steps, (s) => s.id === stepId).pipe(Option.getOrThrow)

const caresRecorded = (writes: ReadonlyArray<CareWrite>) =>
  Array.filter(writes, (write) => write._tag === 'InsertCare')

const wateringHistory = (care: ReturnType<typeof createInMemoryCare>) =>
  care.plants.get(plantId)?.lines.get('watering')?.history ?? []

describe('completeCarePlanStep', () => {
  it('ticks a free-text step without recording a care', async () => {
    const { layer, care } = buildScenario()

    const plan = await run(tick('step-check').pipe(Effect.provide(layer)))

    expect(stepOf(plan, 'step-check')).toMatchObject({
      completedAt: expect.any(Date),
    })
    expect(plan.status).toBe('accepted')
    expect(caresRecorded(care.writes)).toEqual([])
  })

  it('records a care for today that names the step, for a care step', async () => {
    const { layer, care } = buildScenario()

    const plan = await run(tick('step-water').pipe(Effect.provide(layer)))

    const recorded = caresRecorded(care.writes)
    expect(recorded).toHaveLength(1)
    expect(recorded[0]).toMatchObject({
      plantId,
      careType: 'watering',
      day: TEST_CARE_TODAY,
      by: Option.some(userId),
    })
    expect(stepOf(plan, 'step-water')).toMatchObject({
      completedAt: expect.any(Date),
      careLogId: recorded[0]?.id,
    })
  })

  it('ticks a care step without a care when the plant was already cared for today', async () => {
    const { layer, care } = buildScenario('CaredToday')

    const plan = await run(tick('step-water').pipe(Effect.provide(layer)))

    const step = stepOf(plan, 'step-water')
    expect(step).toMatchObject({ completedAt: expect.any(Date) })
    expect(step).not.toHaveProperty('careLogId', expect.any(String))
    expect(caresRecorded(care.writes)).toEqual([])
  })

  it('answers that the plan does not exist when the plant is dead, and leaves the step open (a change: it used to tick without a care)', async () => {
    const { layer, care } = buildScenario('Dead')

    const exit = await Effect.runPromiseExit(
      tick('step-water').pipe(Effect.provide(layer))
    )

    expect(Exit.isFailure(exit)).toBe(true)
    if (Exit.isFailure(exit)) {
      expect(String(exit.cause)).toContain('CarePlanNotFoundError')
    }
    expect(care.writes).toEqual([])
  })

  it('completes the plan once the last step is done, and reopens on undo', async () => {
    const { layer } = buildScenario('CaredToday')

    const { completed, reopened } = await run(
      Effect.gen(function* () {
        yield* tick('step-check')
        const completed = yield* tick('step-water')
        const reopened = yield* untick('step-check')
        return { completed, reopened }
      }).pipe(Effect.provide(layer))
    )

    expect(completed.status).toBe('completed')
    expect(completed.completedAt).toBeInstanceOf(Date)
    expect(reopened.status).toBe('accepted')
    expect(reopened.completedAt).toBeUndefined()
  })

  it('does nothing for a step that is already completed', async () => {
    const { layer, care } = buildScenario()

    const plan = await run(
      Effect.gen(function* () {
        yield* tick('step-water')
        return yield* tick('step-water')
      }).pipe(Effect.provide(layer))
    )

    expect(plan.steps).toHaveLength(2)
    expect(caresRecorded(care.writes)).toHaveLength(1)
    expect(
      Array.filter(care.writes, (write) => write._tag === 'CompletePlanStep')
    ).toHaveLength(1)
  })

  it('ticks a step of a plan that was never accepted, and leaves the plan proposed', async () => {
    const { layer, care } = buildScenario('NotCaredToday', 'proposed')

    const plan = await run(
      Effect.gen(function* () {
        yield* tick('step-check')
        return yield* tick('step-water')
      }).pipe(Effect.provide(layer))
    )

    expect(plan.status).toBe('proposed')
    expect(
      Array.every(plan.steps, (step) => step.completedAt instanceof Date)
    ).toBe(true)
    expect(caresRecorded(care.writes)).toHaveLength(1)
  })

  it('keeps the care a tick recorded when the step is unticked', async () => {
    const { layer, care } = buildScenario()

    const plan = await run(
      Effect.gen(function* () {
        yield* tick('step-water')
        return yield* untick('step-water')
      }).pipe(Effect.provide(layer))
    )

    expect(stepOf(plan, 'step-water')).not.toHaveProperty(
      'completedAt',
      expect.any(Date)
    )
    expect(wateringHistory(care)).toEqual([
      expect.objectContaining({ day: TEST_CARE_TODAY }),
    ])
  })
})
