import {
  createTestCarePlan,
  createTestCarePlanStep,
} from '@lily/api/__tests__/fixtures/care-plans'
import { createTestPlant } from '@lily/api/__tests__/fixtures/plants'
import { createTestUser } from '@lily/api/__tests__/fixtures/users'
import { createMockCarePlanRepository } from '@lily/api/__tests__/mocks/care-plan.repository'
import { createMockCareScheduleRepository } from '@lily/api/__tests__/mocks/care-schedule.repository'
import { createMockDelegationRepository } from '@lily/api/__tests__/mocks/delegation.repository'
import { createMockNotificationRepository } from '@lily/api/__tests__/mocks/notification.repository'
import { createMockPlantRepository } from '@lily/api/__tests__/mocks/plant.repository'
import { createMockCurrentUser } from '@lily/api/__tests__/mocks/session'
import { createMockUserRepository } from '@lily/api/__tests__/mocks/user.repository'
import { CareScheduleRepository } from '@lily/api/repositories/care-schedule.repository'
import {
  acceptCarePlan,
  scheduleTargetsFromSteps,
} from '@lily/api/services/care-plans/endpoints/accept-care-plan'
import { withCarePlanAuth } from '@lily/api/services/care-plans/helpers/with-care-plan-auth'
import { Effect, Exit, Layer } from 'effect'
import { describe, expect, it } from 'vitest'

const userId = 'user-1'
const plantId = 'plant-1'

const wateringDue = new Date('2024-02-01T00:00:00Z')
const mistingDue = new Date('2024-02-03T00:00:00Z')

const buildLayer = (
  planOverrides: Parameters<typeof createTestCarePlan>[0] = {},
  currentUserId = userId
) => {
  const plant = createTestPlant({ id: plantId, userId, remindersEnabled: true })
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
  const wateringSchedule = {
    id: 'schedule-water',
    plantId,
    careType: 'watering' as const,
    frequencyDays: 7,
    lastCareAt: new Date('2024-01-01'),
    nextCareAt: new Date('2024-01-08'),
    createdAt: new Date(),
    updatedAt: new Date(),
  }
  const user = createTestUser({ id: userId, timezone: 'UTC' })

  return Layer.mergeAll(
    createMockCarePlanRepository({
      plans: [plan],
      steps,
      plants: [{ id: plantId, name: plant.name, imageUrl: null }],
    }),
    createMockCareScheduleRepository({
      schedules: [wateringSchedule],
      plants: [plant],
    }),
    createMockPlantRepository({
      plants: [plant],
      schedules: [wateringSchedule],
    }),
    createMockNotificationRepository([]),
    createMockUserRepository([user]),
    createMockDelegationRepository({}),
    createMockCurrentUser({ id: currentUserId })
  )
}

describe('acceptCarePlan', () => {
  it('flips a proposed plan to accepted', async () => {
    const result = await Effect.runPromise(
      withCarePlanAuth('plan-1')
        .pipe(Effect.flatMap(acceptCarePlan))
        .pipe(Effect.provide(buildLayer()))
    )
    expect(result.status).toBe('accepted')
    expect(result.acceptedAt).toBeInstanceOf(Date)
    expect(result.steps).toHaveLength(3)
  })

  it('moves an existing schedule to the dated care-typed step', async () => {
    const schedule = await Effect.runPromise(
      Effect.gen(function* () {
        yield* withCarePlanAuth('plan-1').pipe(Effect.flatMap(acceptCarePlan))
        const repo = yield* CareScheduleRepository
        return yield* repo.findByPlantAndType(plantId, 'watering')
      }).pipe(Effect.provide(buildLayer()))
    )
    expect(schedule?.nextCareAt?.toISOString()).toBe(wateringDue.toISOString())
  })

  it('does not create a schedule for a care type the plant does not track', async () => {
    const schedule = await Effect.runPromise(
      Effect.gen(function* () {
        yield* withCarePlanAuth('plan-1').pipe(Effect.flatMap(acceptCarePlan))
        const repo = yield* CareScheduleRepository
        return yield* repo.findByPlantAndType(plantId, 'misting')
      }).pipe(Effect.provide(buildLayer()))
    )
    expect(schedule).toBeNull()
  })

  it('rejects a plan that is not proposed', async () => {
    const exit = await Effect.runPromiseExit(
      withCarePlanAuth('plan-1')
        .pipe(Effect.flatMap(acceptCarePlan))
        .pipe(Effect.provide(buildLayer({ status: 'accepted' })))
    )
    expect(Exit.isFailure(exit)).toBe(true)
    if (Exit.isFailure(exit)) {
      expect(String(exit.cause)).toContain('CarePlanNotProposedError')
    }
  })

  it('is invisible to another user', async () => {
    const exit = await Effect.runPromiseExit(
      withCarePlanAuth('plan-1')
        .pipe(Effect.flatMap(acceptCarePlan))
        .pipe(Effect.provide(buildLayer({}, 'user-2')))
    )
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
