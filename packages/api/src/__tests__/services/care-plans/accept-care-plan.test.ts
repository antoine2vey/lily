import {
  createTestCarePlan,
  createTestCarePlanStep,
} from '@lily/api/__tests__/fixtures/care-plans'
import {
  createTestCareLine,
  createTestCarePlant,
} from '@lily/api/__tests__/fixtures/care-plants'
import { createTestPlant } from '@lily/api/__tests__/fixtures/plants'
import { createMockCanopyRepository } from '@lily/api/__tests__/mocks/canopy.repository'
import { createInMemoryCare } from '@lily/api/__tests__/mocks/care'
import { createCarePlanRows } from '@lily/api/__tests__/mocks/care-plan.repository'
import { createMockDelegationRepository } from '@lily/api/__tests__/mocks/delegation.repository'
import { createMockPlantRepository } from '@lily/api/__tests__/mocks/plant.repository'
import { createMockCurrentUser } from '@lily/api/__tests__/mocks/session'
import type { CarePlanStepRow } from '@lily/api/repositories/care-plan.repository'
import { acceptCarePlan } from '@lily/api/services/care-plans/endpoints/accept-care-plan'
import { withCarePlanAuth } from '@lily/api/services/care-plans/helpers/with-care-plan-auth'
import type { CareType } from '@lily/shared'
import { Effect, Exit, Layer, Option, pipe } from 'effect'
import { describe, expect, it } from 'vitest'

const userId = 'user-1'
const plantId = 'plant-1'

const wateringDue = new Date('2024-02-01T00:00:00Z')
const mistingDue = new Date('2024-02-03T00:00:00Z')
const dueBeforeAccept = '2026-11-10'

const datedSteps = (
  overrides: { readonly [id: string]: Partial<CarePlanStepRow> } = {}
) => [
  createTestCarePlanStep('plan-1', {
    id: 'step-water',
    position: 0,
    title: 'Water lightly',
    careType: 'watering',
    dueDate: wateringDue,
    ...overrides['step-water'],
  }),
  createTestCarePlanStep('plan-1', {
    id: 'step-mist',
    position: 1,
    title: 'Mist the leaves',
    careType: 'misting',
    dueDate: mistingDue,
    ...overrides['step-mist'],
  }),
  createTestCarePlanStep('plan-1', {
    id: 'step-check',
    position: 2,
    title: 'Check for new growth',
    ...overrides['step-check'],
  }),
]

const accept = (
  planOverrides: Parameters<typeof createTestCarePlan>[0] = {},
  currentUserId = userId,
  steps = datedSteps()
) => {
  const plant = createTestPlant({ id: plantId, userId })
  const plan = createTestCarePlan({
    id: 'plan-1',
    plantId,
    userId,
    ...planOverrides,
  })
  const plans = createCarePlanRows({
    plans: [plan],
    steps,
    plants: [{ id: plantId, name: plant.name, imageUrl: null }],
  })
  const care = createInMemoryCare(
    [
      createTestCarePlant(plantId, {
        lines: [
          createTestCareLine('watering', { dueDay: dueBeforeAccept }),
          createTestCareLine('misting', { dueDay: dueBeforeAccept }),
        ],
      }),
    ],
    { plans }
  )

  return {
    care,
    effect: withCarePlanAuth('plan-1', 'manage').pipe(
      Effect.flatMap(acceptCarePlan),
      Effect.provide(
        Layer.mergeAll(
          care.layer,
          plans.layer,
          createMockPlantRepository({ plants: [plant] }),
          createMockDelegationRepository({}),
          createMockCanopyRepository(),
          createMockCurrentUser({ id: currentUserId })
        )
      )
    ),
  }
}

const dueDayOf = (
  care: ReturnType<typeof createInMemoryCare>,
  careType: CareType
) =>
  pipe(
    Option.fromNullishOr(care.plants.get(plantId)),
    Option.flatMap((plant) => Option.fromNullishOr(plant.lines.get(careType))),
    Option.flatMap((line) => line.schedule),
    Option.map((schedule) => schedule.dueDay),
    Option.getOrNull
  )

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

    expect(dueDayOf(care, 'watering')).toBe('2024-02-01')
    expect(dueDayOf(care, 'misting')).toBe('2024-02-03')
    expect(care.events).toEqual([
      expect.objectContaining({
        _tag: 'ScheduleChanged',
        careType: 'watering',
        reason: 'carePlan',
      }),
      expect.objectContaining({
        _tag: 'ScheduleChanged',
        careType: 'misting',
        reason: 'carePlan',
      }),
    ])
  })

  it('rejects a plan that is not proposed and moves no due day', async () => {
    const { care, effect } = accept({ status: 'accepted' })

    const exit = await Effect.runPromiseExit(effect)

    expect(Exit.isFailure(exit)).toBe(true)
    if (Exit.isFailure(exit)) {
      expect(String(exit.cause)).toContain('CarePlanNotProposedError')
    }
    expect(dueDayOf(care, 'watering')).toBe(dueBeforeAccept)
    expect(dueDayOf(care, 'misting')).toBe(dueBeforeAccept)
    expect(care.writes).toEqual([])
  })

  it('is invisible to another user', async () => {
    const exit = await Effect.runPromiseExit(accept({}, 'user-2').effect)
    expect(Exit.isFailure(exit)).toBe(true)
    if (Exit.isFailure(exit)) {
      expect(String(exit.cause)).toContain('CarePlanNotFoundError')
    }
  })

  it('moves no due day for a step that is already done (a change: accept used to move it back to the done step date)', async () => {
    const { care, effect } = accept(
      {},
      userId,
      datedSteps({ 'step-water': { completedAt: new Date('2024-01-20') } })
    )

    await Effect.runPromise(effect)

    expect(dueDayOf(care, 'watering')).toBe(dueBeforeAccept)
    expect(dueDayOf(care, 'misting')).toBe('2024-02-03')
  })

  it('completes at once a plan whose steps are all done', async () => {
    const done = { completedAt: new Date('2024-01-20') }
    const { care, effect } = accept(
      {},
      userId,
      datedSteps({
        'step-water': done,
        'step-mist': done,
        'step-check': done,
      })
    )

    const result = await Effect.runPromise(effect)

    expect(result.status).toBe('completed')
    expect(result.acceptedAt).toBeInstanceOf(Date)
    expect(result.completedAt).toBeInstanceOf(Date)
    expect(dueDayOf(care, 'watering')).toBe(dueBeforeAccept)
  })
})
