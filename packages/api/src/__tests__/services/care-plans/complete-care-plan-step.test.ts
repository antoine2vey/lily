import {
  createTestCarePlan,
  createTestCarePlanStep,
} from '@lily/api/__tests__/fixtures/care-plans'
import {
  createTestPlant,
  type TestPlant,
  wateringSpec,
} from '@lily/api/__tests__/fixtures/plants'
import { createTestUser } from '@lily/api/__tests__/fixtures/users'
import { createMockCurrentUser } from '@lily/api/__tests__/mocks/auth'
import { createMockCareLogRepository } from '@lily/api/__tests__/mocks/care-log.repository'
import { createMockCarePlanRepository } from '@lily/api/__tests__/mocks/care-plan.repository'
import { createMockCareScheduleRepository } from '@lily/api/__tests__/mocks/care-schedule.repository'
import { createMockDelegationRepository } from '@lily/api/__tests__/mocks/delegation.repository'
import { createMockEventBus } from '@lily/api/__tests__/mocks/event-bus'
import { createMockNotificationRepository } from '@lily/api/__tests__/mocks/notification.repository'
import { createMockPlantRepository } from '@lily/api/__tests__/mocks/plant.repository'
import { createMockUserRepository } from '@lily/api/__tests__/mocks/user.repository'
import { createMockWeatherRepository } from '@lily/api/__tests__/mocks/weather.repository'
import { createMockWeatherCache } from '@lily/api/__tests__/mocks/weather-cache'
import { createMockWeatherProvider } from '@lily/api/__tests__/mocks/weather-provider'
import { CarePlanRepository } from '@lily/api/repositories/care-plan.repository'
import type { CareScheduleRow } from '@lily/api/repositories/care-schedule.repository'
import { CareScheduleRepository } from '@lily/api/repositories/care-schedule.repository'
import type { PlantWithRoom } from '@lily/api/repositories/plant.repository'
import { completeCarePlanStep } from '@lily/api/services/care-plans/endpoints/complete-care-plan-step'
import { uncompleteCarePlanStep } from '@lily/api/services/care-plans/endpoints/uncomplete-care-plan-step'
import { withCarePlanStep } from '@lily/api/services/care-plans/helpers/with-care-plan-auth'
import { executePlantCare } from '@lily/api/services/plants/helpers/execute-plant-care'
import { Array, Effect, Layer, Logger, LogLevel, Option } from 'effect'
import { describe, expect, it } from 'vitest'

const userId = 'user-1'
const plantId = 'plant-1'

const toPlantWithRoom = (plant: TestPlant): PlantWithRoom => ({
  ...plant,
  room: null,
  ownership: 'owned' as const,
  ownerName: null,
  schedules: [],
})

const wateringSchedule: CareScheduleRow = {
  id: 'schedule-water',
  plantId,
  careType: 'watering',
  frequencyDays: 7,
  lastCareAt: new Date('2024-01-01'),
  nextCareAt: new Date('2024-01-08'),
  createdAt: new Date(),
  updatedAt: new Date(),
}

interface Scenario {
  planStatus?: 'proposed' | 'accepted'
  // Seeds a watering log dated now so the care flow's one-per-day guard trips.
  wateredToday?: boolean
}

const buildScenario = (scenario: Scenario = {}) => {
  const testPlant = createTestPlant({
    id: plantId,
    userId,
    remindersEnabled: true,
    scheduleSpecs: [
      wateringSpec({
        frequencyDays: 7,
        lastCareAt: new Date('2024-01-01'),
        nextCareAt: new Date('2024-01-08'),
      }),
    ],
  })
  const plan = createTestCarePlan({
    id: 'plan-1',
    plantId,
    userId,
    status: scenario.planStatus ?? 'accepted',
  })
  const steps = [
    createTestCarePlanStep(plan.id, {
      id: 'step-water-1',
      position: 0,
      title: 'Water now',
      careType: 'watering',
    }),
    createTestCarePlanStep(plan.id, {
      id: 'step-water-2',
      position: 1,
      title: 'Water again next week',
      careType: 'watering',
    }),
    createTestCarePlanStep(plan.id, {
      id: 'step-check',
      position: 2,
      title: 'Check the leaves',
    }),
  ]
  const user = createTestUser({
    id: userId,
    careReminders: true,
    timezone: 'UTC',
    preferredNotificationTime: '09:00',
    doNotDisturb: false,
  })

  const layer = Layer.mergeAll(
    createMockCarePlanRepository({
      plans: [plan],
      steps,
      plants: [{ id: plantId, name: testPlant.name, imageUrl: null }],
    }),
    createMockPlantRepository({
      plants: [testPlant],
      schedules: [wateringSchedule],
    }),
    createMockCareScheduleRepository({
      schedules: [wateringSchedule],
      plants: [testPlant],
    }),
    createMockNotificationRepository([]),
    createMockCareLogRepository(
      scenario.wateredToday
        ? [
            {
              id: 'log-today',
              type: 'watering',
              date: new Date(),
              plantId,
              createdAt: new Date(),
              updatedAt: new Date(),
            },
          ]
        : []
    ),
    createMockUserRepository([user]),
    createMockDelegationRepository({}),
    createMockEventBus(),
    createMockCurrentUser({
      id: userId,
      name: 'Test User',
      firstName: null,
      lastName: null,
      email: 'test@example.com',
      username: 'testuser',
      createdAt: new Date(),
      updatedAt: new Date(),
      role: 'user',
      status: 'active',
    }),
    createMockWeatherProvider(),
    createMockWeatherCache(),
    createMockWeatherRepository()
  )

  return { layer, plant: toPlantWithRoom(testPlant) }
}

const run = <A, E>(effect: Effect.Effect<A, E, never>) =>
  Effect.runPromise(effect.pipe(Logger.withMinimumLogLevel(LogLevel.None)))

describe('completeCarePlanStep', () => {
  it('ticks a free-text step without touching care logs', async () => {
    const { layer } = buildScenario()
    const result = await run(
      withCarePlanStep('plan-1', 'step-check')
        .pipe(Effect.flatMap(completeCarePlanStep))
        .pipe(Effect.provide(layer))
    )
    const step = Array.findFirst(result.steps, (s) => s.id === 'step-check')
    expect(Option.isSome(step)).toBe(true)
    if (Option.isSome(step)) {
      expect(step.value.completedAt).toBeInstanceOf(Date)
      expect(step.value.careLogId).toBeUndefined()
    }
    expect(result.status).toBe('accepted')
  })

  it('runs the care flow for a care-typed step and links the care log', async () => {
    const { layer } = buildScenario()
    const { plan, schedule } = await run(
      Effect.gen(function* () {
        const plan = yield* withCarePlanStep('plan-1', 'step-water-1').pipe(
          Effect.flatMap(completeCarePlanStep)
        )
        const scheduleRepo = yield* CareScheduleRepository
        const schedule = yield* scheduleRepo.findByPlantAndType(
          plantId,
          'watering'
        )
        return { plan, schedule }
      }).pipe(Effect.provide(layer))
    )
    const step = Array.findFirst(plan.steps, (s) => s.id === 'step-water-1')
    if (Option.isSome(step)) {
      expect(step.value.completedAt).toBeInstanceOf(Date)
      expect(step.value.careLogId).toBeDefined()
    } else {
      throw new Error('step missing')
    }
    // The schedule advanced from the care flow, not from the plan step.
    expect(schedule?.lastCareAt?.getTime()).toBeGreaterThan(
      new Date('2024-01-01').getTime()
    )
    // Only the step that was tapped is marked, not the later watering step.
    const second = Array.findFirst(plan.steps, (s) => s.id === 'step-water-2')
    if (Option.isSome(second)) {
      expect(second.value.completedAt).toBeUndefined()
    }
  })

  it('still ticks a care-typed step when the plant was already cared for today', async () => {
    const { layer } = buildScenario({ wateredToday: true })
    // The care flow raises AlreadyCaredTodayError; the step must still be
    // ticked, without a second care log.
    const plan = await run(
      withCarePlanStep('plan-1', 'step-water-2')
        .pipe(Effect.flatMap(completeCarePlanStep))
        .pipe(Effect.provide(layer))
    )
    const second = Array.findFirst(plan.steps, (s) => s.id === 'step-water-2')
    if (Option.isSome(second)) {
      expect(second.value.completedAt).toBeInstanceOf(Date)
      expect(second.value.careLogId).toBeUndefined()
    } else {
      throw new Error('step missing')
    }
  })

  it('completes the plan once the last step is done, and reopens on undo', async () => {
    const { layer } = buildScenario()
    const { completed, reopened } = await run(
      Effect.gen(function* () {
        yield* withCarePlanStep('plan-1', 'step-check').pipe(
          Effect.flatMap(completeCarePlanStep)
        )
        yield* withCarePlanStep('plan-1', 'step-water-1').pipe(
          Effect.flatMap(completeCarePlanStep)
        )
        const completed = yield* withCarePlanStep(
          'plan-1',
          'step-water-2'
        ).pipe(Effect.flatMap(completeCarePlanStep))
        const reopened = yield* withCarePlanStep('plan-1', 'step-check').pipe(
          Effect.flatMap(uncompleteCarePlanStep)
        )
        return { completed, reopened }
      }).pipe(Effect.provide(layer))
    )
    expect(completed.status).toBe('completed')
    expect(completed.completedAt).toBeInstanceOf(Date)
    expect(reopened.status).toBe('accepted')
    expect(reopened.completedAt).toBeUndefined()
  })

  it('is idempotent for an already completed step', async () => {
    const { layer } = buildScenario()
    const plan = await run(
      Effect.gen(function* () {
        yield* withCarePlanStep('plan-1', 'step-check').pipe(
          Effect.flatMap(completeCarePlanStep)
        )
        return yield* withCarePlanStep('plan-1', 'step-check').pipe(
          Effect.flatMap(completeCarePlanStep)
        )
      }).pipe(Effect.provide(layer))
    )
    expect(plan.steps).toHaveLength(3)
  })
})

describe('executePlantCare cross-completion', () => {
  it('marks the earliest open step of the same care type on an accepted plan', async () => {
    const { layer, plant } = buildScenario()
    const stored = await run(
      Effect.gen(function* () {
        yield* executePlantCare(plant, { plantId, careType: 'watering' })
        const repo = yield* CarePlanRepository
        return yield* repo.findById('plan-1', userId)
      }).pipe(Effect.provide(layer))
    )
    const first = Array.findFirst(
      stored?.steps ?? [],
      (s) => s.id === 'step-water-1'
    )
    const second = Array.findFirst(
      stored?.steps ?? [],
      (s) => s.id === 'step-water-2'
    )
    if (Option.isSome(first) && Option.isSome(second)) {
      expect(first.value.completedAt).toBeInstanceOf(Date)
      expect(first.value.careLogId).toBeDefined()
      expect(second.value.completedAt).toBeUndefined()
    } else {
      throw new Error('steps missing')
    }
  })

  it('leaves proposed plans untouched', async () => {
    const { layer, plant } = buildScenario({ planStatus: 'proposed' })
    const stored = await run(
      Effect.gen(function* () {
        yield* executePlantCare(plant, { plantId, careType: 'watering' })
        const repo = yield* CarePlanRepository
        return yield* repo.findById('plan-1', userId)
      }).pipe(Effect.provide(layer))
    )
    expect(
      Array.every(stored?.steps ?? [], (s) => s.completedAt === undefined)
    ).toBe(true)
  })
})
