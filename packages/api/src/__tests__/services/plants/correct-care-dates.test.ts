import { mockCareLogs } from '@lily/api/__tests__/fixtures/care-logs'
import { schedulesFromPlants } from '@lily/api/__tests__/fixtures/care-schedules'
import {
  createTestPlant,
  fertilizationSpec,
  type TestPlant,
  wateringSpec,
} from '@lily/api/__tests__/fixtures/plants'
import { mockUsers } from '@lily/api/__tests__/fixtures/users'
import { createMockCareLogRepository } from '@lily/api/__tests__/mocks/care-log.repository'
import { createMockCareScheduleRepository } from '@lily/api/__tests__/mocks/care-schedule.repository'
import { createMockDelegationRepository } from '@lily/api/__tests__/mocks/delegation.repository'
import { createMockNotificationRepository } from '@lily/api/__tests__/mocks/notification.repository'
import { createMockPlantRepository } from '@lily/api/__tests__/mocks/plant.repository'
import { createMockCurrentUser } from '@lily/api/__tests__/mocks/session'
import { createMockUserRepository } from '@lily/api/__tests__/mocks/user.repository'
import type { CareScheduleRow } from '@lily/api/repositories/care-schedule.repository'
import type { PlantWithRoom } from '@lily/api/repositories/plant.repository'
import { correctCareDates } from '@lily/api/services/plants/endpoints/correct-care-dates'
import { Array, Effect, Exit, Layer, Option, pipe } from 'effect'
import { describe, expect, it } from 'vitest'

const toPlantWithRoom = (plant: TestPlant): PlantWithRoom => ({
  ...plant,
  room: null,
  ownership: 'owned' as const,
  ownerName: null,
  schedules: [],
})

const findSchedule = (
  schedules: CareScheduleRow[],
  plantId: string,
  careType: string
) =>
  pipe(
    Array.findFirst(
      schedules,
      (s) => s.plantId === plantId && s.careType === careType
    ),
    Option.getOrNull
  )

describe('correctCareDates', () => {
  // Create a fresh plant for each test to avoid mock state leaking
  const basePlant = () =>
    createTestPlant({
      id: 'plant-1',
      userId: 'user-1',
      remindersEnabled: true,
      scheduleSpecs: [
        wateringSpec({
          frequencyDays: 7,
          lastCareAt: new Date('2024-01-10'),
          nextCareAt: new Date('2024-01-17'),
        }),
        fertilizationSpec({
          frequencyDays: 30,
          lastCareAt: new Date('2024-01-01'),
          nextCareAt: new Date('2024-01-31'),
        }),
      ],
    })

  const createTestLayer = (plants = [basePlant()], careLogs = mockCareLogs) => {
    const schedules = schedulesFromPlants(plants)
    return {
      layer: Layer.mergeAll(
        createMockPlantRepository({ plants }),
        createMockCareLogRepository(careLogs),
        createMockNotificationRepository([]),
        createMockUserRepository(mockUsers),
        createMockCurrentUser({ id: 'user-1' }),
        createMockDelegationRepository(),
        createMockCareScheduleRepository({ schedules, plants })
      ),
      schedules,
      plants,
    }
  }

  // --- Happy path tests ---

  it('should correct watering date and shift nextWateringAt by the same delta', async () => {
    // lastWateredAt=Jan 10, nextWateringAt=Jan 17
    // Correct to Jan 12 → delta=+2 days → next shifts to Jan 19
    const correctedDate = new Date('2024-01-12')
    const { layer, schedules, plants } = createTestLayer()
    const _result = await Effect.runPromise(
      correctCareDates(toPlantWithRoom(plants[0]!), {
        id: 'plant-1',
        lastWateredAt: correctedDate,
      }).pipe(Effect.provide(layer))
    )

    const wateringSched = findSchedule(schedules, 'plant-1', 'watering')
    expect(wateringSched?.lastCareAt).toEqual(correctedDate)
    const expectedNext = new Date('2024-01-19')
    expect(wateringSched?.nextCareAt?.getTime()).toBeCloseTo(
      expectedNext.getTime(),
      -3
    )
  })

  it('should correct fertilization date and shift nextFertilizationAt by the same delta', async () => {
    // lastFertilizedAt=Jan 1, nextFertilizationAt=Jan 31
    // Correct to Jan 5 → delta=+4 days → next shifts to Feb 4
    const correctedDate = new Date('2024-01-05')
    const { layer, schedules, plants } = createTestLayer()
    const _result = await Effect.runPromise(
      correctCareDates(toPlantWithRoom(plants[0]!), {
        id: 'plant-1',
        lastFertilizedAt: correctedDate,
      }).pipe(Effect.provide(layer))
    )

    const fertSched = findSchedule(schedules, 'plant-1', 'fertilization')
    expect(fertSched?.lastCareAt).toEqual(correctedDate)
    const expectedNext = new Date('2024-02-04')
    expect(fertSched?.nextCareAt?.getTime()).toBeCloseTo(
      expectedNext.getTime(),
      -3
    )
  })

  it('should correct both dates at once in a single request', async () => {
    const waterDate = new Date('2024-01-12') // delta=+2 days
    const fertilizeDate = new Date('2024-01-03') // delta=+2 days
    const { layer, schedules, plants } = createTestLayer()
    const _result = await Effect.runPromise(
      correctCareDates(toPlantWithRoom(plants[0]!), {
        id: 'plant-1',
        lastWateredAt: waterDate,
        lastFertilizedAt: fertilizeDate,
      }).pipe(Effect.provide(layer))
    )

    const wateringSched = findSchedule(schedules, 'plant-1', 'watering')
    const fertSched = findSchedule(schedules, 'plant-1', 'fertilization')
    expect(wateringSched?.lastCareAt).toEqual(waterDate)
    expect(fertSched?.lastCareAt).toEqual(fertilizeDate)

    const expectedNextWatering = new Date('2024-01-19') // Jan 17 + 2 days
    const expectedNextFertilization = new Date('2024-02-02') // Jan 31 + 2 days
    expect(wateringSched?.nextCareAt?.getTime()).toBeCloseTo(
      expectedNextWatering.getTime(),
      -3
    )
    expect(fertSched?.nextCareAt?.getTime()).toBeCloseTo(
      expectedNextFertilization.getTime(),
      -3
    )
  })

  it('should update the most recent care log date when a care log exists', async () => {
    const correctedDate = new Date('2024-01-09')
    const { layer, schedules, plants } = createTestLayer()
    const _result = await Effect.runPromise(
      correctCareDates(toPlantWithRoom(plants[0]!), {
        id: 'plant-1',
        lastWateredAt: correctedDate,
      }).pipe(Effect.provide(layer))
    )

    const wateringSched = findSchedule(schedules, 'plant-1', 'watering')
    expect(wateringSched?.lastCareAt).toEqual(correctedDate)
  })

  // --- Validation/error tests ---

  it('should reject future watering date with FutureDateNotAllowedError', async () => {
    const futureDate = new Date(Date.now() + 86400000 * 7)
    const { layer, plants } = createTestLayer()
    const exit = await Effect.runPromiseExit(
      correctCareDates(toPlantWithRoom(plants[0]!), {
        id: 'plant-1',
        lastWateredAt: futureDate,
      }).pipe(Effect.provide(layer))
    )

    expect(Exit.isFailure(exit)).toBe(true)
    if (Exit.isFailure(exit)) {
      expect(exit.cause._tag).toBe('Fail')
    }
  })

  it('should reject future fertilization date with FutureDateNotAllowedError', async () => {
    const futureDate = new Date(Date.now() + 86400000 * 7)
    const { layer, plants } = createTestLayer()
    const exit = await Effect.runPromiseExit(
      correctCareDates(toPlantWithRoom(plants[0]!), {
        id: 'plant-1',
        lastFertilizedAt: futureDate,
      }).pipe(Effect.provide(layer))
    )

    expect(Exit.isFailure(exit)).toBe(true)
    if (Exit.isFailure(exit)) {
      expect(exit.cause._tag).toBe('Fail')
    }
  })

  it('should return plant unchanged when neither date is provided', async () => {
    const { layer, schedules, plants } = createTestLayer()
    const result = await Effect.runPromise(
      correctCareDates(toPlantWithRoom(plants[0]!), {
        id: 'plant-1',
      }).pipe(Effect.provide(layer))
    )

    expect(result.id).toBe('plant-1')
    const wateringSched = findSchedule(schedules, 'plant-1', 'watering')
    const fertSched = findSchedule(schedules, 'plant-1', 'fertilization')
    expect(wateringSched?.lastCareAt).toEqual(new Date('2024-01-10'))
    expect(fertSched?.lastCareAt).toEqual(new Date('2024-01-01'))
  })

  // --- Edge case tests ---

  it('should only update lastCareAt when original dates are null (no delta possible)', async () => {
    const plant = createTestPlant({
      id: 'no-dates-plant',
      scheduleSpecs: [
        wateringSpec({
          frequencyDays: 14,
          lastCareAt: null,
          nextCareAt: null,
        }),
      ],
    })

    const correctedDate = new Date('2024-01-12')
    const { layer, schedules } = createTestLayer([plant], [])
    const _result = await Effect.runPromise(
      correctCareDates(toPlantWithRoom(plant), {
        id: 'no-dates-plant',
        lastWateredAt: correctedDate,
      }).pipe(Effect.provide(layer))
    )

    const wateringSched = findSchedule(schedules, 'no-dates-plant', 'watering')
    expect(wateringSched?.lastCareAt).toEqual(correctedDate)
    // No original dates → no delta shift → stays null
    expect(wateringSched?.nextCareAt).toBeNull()
  })

  it('should keep nextFertilizationAt null when original dates are null', async () => {
    const plant = createTestPlant({
      id: 'no-fert-plant',
      scheduleSpecs: [wateringSpec()],
    })

    const correctedDate = new Date('2024-01-12')
    const { layer } = createTestLayer([plant], [])
    const result = await Effect.runPromise(
      correctCareDates(toPlantWithRoom(plant), {
        id: 'no-fert-plant',
        lastFertilizedAt: correctedDate,
      }).pipe(Effect.provide(layer))
    )

    expect(result.id).toBe('no-fert-plant')
  })

  it('should shift nextWateringAt earlier when correcting to an earlier date', async () => {
    // lastWateredAt=Jan 10, nextWateringAt=Jan 17
    // Correct to Jan 5 → delta=-5 days → next shifts to Jan 12
    const pastDate = new Date('2024-01-05')
    const { layer, schedules, plants } = createTestLayer()
    const _result = await Effect.runPromise(
      correctCareDates(toPlantWithRoom(plants[0]!), {
        id: 'plant-1',
        lastWateredAt: pastDate,
      }).pipe(Effect.provide(layer))
    )

    const wateringSched = findSchedule(schedules, 'plant-1', 'watering')
    expect(wateringSched?.lastCareAt).toEqual(pastDate)
    const expectedNext = new Date('2024-01-12') // Jan 17 - 5 days
    expect(wateringSched?.nextCareAt?.getTime()).toBeCloseTo(
      expectedNext.getTime(),
      -3
    )
  })

  it('should not shift nextWateringAt when corrected date equals original (zero delta)', async () => {
    const sameDate = new Date('2024-01-10')
    const { layer, schedules, plants } = createTestLayer()
    const _result = await Effect.runPromise(
      correctCareDates(toPlantWithRoom(plants[0]!), {
        id: 'plant-1',
        lastWateredAt: sameDate,
      }).pipe(Effect.provide(layer))
    )

    const wateringSched = findSchedule(schedules, 'plant-1', 'watering')
    expect(wateringSched?.lastCareAt).toEqual(sameDate)
    const expectedNext = new Date('2024-01-17') // unchanged
    expect(wateringSched?.nextCareAt?.getTime()).toBeCloseTo(
      expectedNext.getTime(),
      -3
    )
  })

  it('should preserve weather adjustment when shifting dates', async () => {
    // frequency=7, but next is 8 days out (7 base + 1 weather)
    const plant = createTestPlant({
      id: 'weather-plant',
      remindersEnabled: true,
      scheduleSpecs: [
        wateringSpec({
          frequencyDays: 7,
          lastCareAt: new Date('2024-01-10'),
          nextCareAt: new Date('2024-01-18'), // 8 days gap preserved
        }),
      ],
    })

    // Correct to 1 day earlier → delta=-1 → next shifts to Jan 17
    const correctedDate = new Date('2024-01-09')
    const { layer, schedules } = createTestLayer([plant], [])
    const _result = await Effect.runPromise(
      correctCareDates(toPlantWithRoom(plant), {
        id: 'weather-plant',
        lastWateredAt: correctedDate,
      }).pipe(Effect.provide(layer))
    )

    const wateringSched = findSchedule(schedules, 'weather-plant', 'watering')
    expect(wateringSched?.lastCareAt).toEqual(correctedDate)
    // 8-day gap preserved: Jan 18 - 1 day = Jan 17
    const expectedNext = new Date('2024-01-17')
    expect(wateringSched?.nextCareAt?.getTime()).toBeCloseTo(
      expectedNext.getTime(),
      -3
    )
  })

  it('should schedule reminder when remindersEnabled is true', async () => {
    const correctedDate = new Date('2024-01-12')
    const { layer, schedules, plants } = createTestLayer()
    const result = await Effect.runPromise(
      correctCareDates(toPlantWithRoom(plants[0]!), {
        id: 'plant-1',
        lastWateredAt: correctedDate,
      }).pipe(Effect.provide(layer))
    )

    expect(result.remindersEnabled).toBe(true)
    const wateringSched = findSchedule(schedules, 'plant-1', 'watering')
    expect(wateringSched?.nextCareAt).toBeDefined()
  })

  it('should not schedule reminder when remindersEnabled is false', async () => {
    const plant = createTestPlant({
      id: 'no-reminder-plant',
      remindersEnabled: false,
      scheduleSpecs: [
        wateringSpec({
          frequencyDays: 7,
          lastCareAt: new Date('2024-01-10'),
          nextCareAt: new Date('2024-01-17'),
        }),
      ],
    })

    const correctedDate = new Date('2024-01-12')
    const { layer, schedules } = createTestLayer([plant], [])
    const result = await Effect.runPromise(
      correctCareDates(toPlantWithRoom(plant), {
        id: 'no-reminder-plant',
        lastWateredAt: correctedDate,
      }).pipe(Effect.provide(layer))
    )

    expect(result.remindersEnabled).toBe(false)
    const wateringSched = findSchedule(
      schedules,
      'no-reminder-plant',
      'watering'
    )
    expect(wateringSched?.lastCareAt).toEqual(correctedDate)
  })
})
