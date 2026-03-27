import { createTestSchedule } from '@lily/api/__tests__/fixtures/care-schedules'
import { createMockPlantRepository } from '@lily/api/__tests__/mocks/plant.repository'
import type { CareScheduleRow } from '@lily/api/repositories/care-schedule.repository'
import { checkOverduePlants } from '@lily/api/services/health-scheduler/scheduler'
import type { plants } from '@lily/db/schema'
import { Effect } from 'effect'
import { beforeEach, describe, expect, it, vi } from 'vitest'

type PlantRecord = typeof plants.$inferSelect

const createTestPlant = (
  overrides: Partial<PlantRecord> = {}
): PlantRecord => ({
  id: `plant-${crypto.randomUUID()}`,
  name: 'Test Plant',
  description: null,
  imageUrl: null,
  category: null,
  dateAdded: new Date(),
  updatedAt: new Date(),
  humidityRating: 50,
  lightingRating: 50,
  petToxicityRating: 0,
  wateringRating: 50,
  health: 'HEALTHY',
  remindersEnabled: true,
  isFavorite: false,
  potWidthCm: null,
  potHeightCm: null,
  roomId: null,
  userId: 'user-1',
  ...overrides,
})

/** Build schedule rows to represent a plant's care dates for the mock */
const buildSchedules = (
  plantId: string,
  opts: {
    nextWateringAt?: Date | null
    nextFertilizationAt?: Date | null
  } = {}
): CareScheduleRow[] => {
  const schedules: CareScheduleRow[] = []
  if (opts.nextWateringAt !== undefined && opts.nextWateringAt !== null) {
    schedules.push(
      createTestSchedule({
        plantId,
        careType: 'watering',
        frequencyDays: 7,
        nextCareAt: opts.nextWateringAt,
      })
    )
  }
  if (
    opts.nextFertilizationAt !== undefined &&
    opts.nextFertilizationAt !== null
  ) {
    schedules.push(
      createTestSchedule({
        plantId,
        careType: 'fertilization',
        frequencyDays: 30,
        nextCareAt: opts.nextFertilizationAt,
      })
    )
  }
  return schedules
}

describe('Health Scheduler', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2024-01-15T12:00:00Z'))
  })

  it('should mark overdue plants as NEEDS_ATTENTION', async () => {
    const overduePlant = createTestPlant({
      id: 'plant-1',
      health: 'HEALTHY',
    })
    const schedules = buildSchedules('plant-1', {
      nextWateringAt: new Date('2024-01-10T12:00:00Z'),
    })

    const plants = [overduePlant]

    await Effect.runPromise(
      checkOverduePlants.pipe(
        Effect.provide(createMockPlantRepository({ plants, schedules }))
      )
    )

    expect(plants[0]?.health).toBe('NEEDS_ATTENTION')
  })

  it('should mark THRIVING overdue plants as NEEDS_ATTENTION', async () => {
    const thrivingPlant = createTestPlant({
      id: 'plant-1',
      health: 'THRIVING',
    })
    const schedules = buildSchedules('plant-1', {
      nextWateringAt: new Date('2024-01-10T12:00:00Z'),
    })

    const plants = [thrivingPlant]

    await Effect.runPromise(
      checkOverduePlants.pipe(
        Effect.provide(createMockPlantRepository({ plants, schedules }))
      )
    )

    expect(plants[0]?.health).toBe('NEEDS_ATTENTION')
  })

  it('should not change health of plants that are not overdue', async () => {
    const futurePlant = createTestPlant({
      id: 'plant-1',
      health: 'HEALTHY',
    })
    const schedules = buildSchedules('plant-1', {
      nextWateringAt: new Date('2024-01-20T12:00:00Z'),
    })

    const plants = [futurePlant]

    await Effect.runPromise(
      checkOverduePlants.pipe(
        Effect.provide(createMockPlantRepository({ plants, schedules }))
      )
    )

    expect(plants[0]?.health).toBe('HEALTHY')
  })

  it('should not change health of plants already NEEDS_ATTENTION', async () => {
    const attentionPlant = createTestPlant({
      id: 'plant-1',
      health: 'NEEDS_ATTENTION',
    })
    const schedules = buildSchedules('plant-1', {
      nextWateringAt: new Date('2024-01-10T12:00:00Z'),
    })

    const plants = [attentionPlant]

    await Effect.runPromise(
      checkOverduePlants.pipe(
        Effect.provide(createMockPlantRepository({ plants, schedules }))
      )
    )

    // Should remain as NEEDS_ATTENTION (not re-marked)
    expect(plants[0]?.health).toBe('NEEDS_ATTENTION')
  })

  it('should not change health of SICK plants even if overdue', async () => {
    const sickPlant = createTestPlant({
      id: 'plant-1',
      health: 'SICK',
    })
    const schedules = buildSchedules('plant-1', {
      nextWateringAt: new Date('2024-01-10T12:00:00Z'),
    })

    const plants = [sickPlant]

    await Effect.runPromise(
      checkOverduePlants.pipe(
        Effect.provide(createMockPlantRepository({ plants, schedules }))
      )
    )

    // SICK status should be preserved (more severe than NEEDS_ATTENTION)
    expect(plants[0]?.health).toBe('SICK')
  })

  it('should not mark plants without nextWateringAt', async () => {
    const noSchedulePlant = createTestPlant({
      id: 'plant-1',
      health: 'HEALTHY',
    })
    // No schedules = no overdue

    const plants = [noSchedulePlant]

    await Effect.runPromise(
      checkOverduePlants.pipe(
        Effect.provide(createMockPlantRepository({ plants }))
      )
    )

    expect(plants[0]?.health).toBe('HEALTHY')
  })

  it('should reset NEEDS_ATTENTION to HEALTHY if schedule is in order', async () => {
    const plantInOrder = createTestPlant({
      id: 'plant-1',
      health: 'NEEDS_ATTENTION',
    })
    const schedules = buildSchedules('plant-1', {
      nextWateringAt: new Date('2024-01-20T12:00:00Z'),
    })

    const plants = [plantInOrder]

    await Effect.runPromise(
      checkOverduePlants.pipe(
        Effect.provide(createMockPlantRepository({ plants, schedules }))
      )
    )

    expect(plants[0]?.health).toBe('HEALTHY')
  })

  it('should reset NEEDS_ATTENTION to HEALTHY if no schedule is set', async () => {
    const noSchedulePlant = createTestPlant({
      id: 'plant-1',
      health: 'NEEDS_ATTENTION',
    })
    // No schedules = no overdue → should reset to HEALTHY

    const plants = [noSchedulePlant]

    await Effect.runPromise(
      checkOverduePlants.pipe(
        Effect.provide(createMockPlantRepository({ plants }))
      )
    )

    expect(plants[0]?.health).toBe('HEALTHY')
  })

  it('should not reset NEEDS_ATTENTION if plant is still overdue', async () => {
    const overduePlant = createTestPlant({
      id: 'plant-1',
      health: 'NEEDS_ATTENTION',
    })
    const schedules = buildSchedules('plant-1', {
      nextWateringAt: new Date('2024-01-10T12:00:00Z'),
    })

    const plants = [overduePlant]

    await Effect.runPromise(
      checkOverduePlants.pipe(
        Effect.provide(createMockPlantRepository({ plants, schedules }))
      )
    )

    // Should remain NEEDS_ATTENTION since it's still overdue
    expect(plants[0]?.health).toBe('NEEDS_ATTENTION')
  })

  it('should mark plant as NEEDS_ATTENTION if fertilization is overdue', async () => {
    const overdueFertilization = createTestPlant({
      id: 'plant-1',
      health: 'HEALTHY',
    })
    const schedules = [
      ...buildSchedules('plant-1', {
        nextWateringAt: new Date('2024-01-20T12:00:00Z'),
      }),
      ...buildSchedules('plant-1', {
        nextFertilizationAt: new Date('2024-01-10T12:00:00Z'),
      }),
    ]

    const plants = [overdueFertilization]

    await Effect.runPromise(
      checkOverduePlants.pipe(
        Effect.provide(createMockPlantRepository({ plants, schedules }))
      )
    )

    expect(plants[0]?.health).toBe('NEEDS_ATTENTION')
  })

  it('should not reset to HEALTHY if fertilization is still overdue', async () => {
    const overdueFertilization = createTestPlant({
      id: 'plant-1',
      health: 'NEEDS_ATTENTION',
    })
    const schedules = [
      ...buildSchedules('plant-1', {
        nextWateringAt: new Date('2024-01-20T12:00:00Z'),
      }),
      ...buildSchedules('plant-1', {
        nextFertilizationAt: new Date('2024-01-10T12:00:00Z'),
      }),
    ]

    const plants = [overdueFertilization]

    await Effect.runPromise(
      checkOverduePlants.pipe(
        Effect.provide(createMockPlantRepository({ plants, schedules }))
      )
    )

    // Should remain NEEDS_ATTENTION because fertilization is still overdue
    expect(plants[0]?.health).toBe('NEEDS_ATTENTION')
  })

  it('should reset to HEALTHY when both watering and fertilization are in order', async () => {
    const plantInOrder = createTestPlant({
      id: 'plant-1',
      health: 'NEEDS_ATTENTION',
    })
    const schedules = [
      ...buildSchedules('plant-1', {
        nextWateringAt: new Date('2024-01-20T12:00:00Z'),
      }),
      ...buildSchedules('plant-1', {
        nextFertilizationAt: new Date('2024-01-25T12:00:00Z'),
      }),
    ]

    const plants = [plantInOrder]

    await Effect.runPromise(
      checkOverduePlants.pipe(
        Effect.provide(createMockPlantRepository({ plants, schedules }))
      )
    )

    expect(plants[0]?.health).toBe('HEALTHY')
  })
})
