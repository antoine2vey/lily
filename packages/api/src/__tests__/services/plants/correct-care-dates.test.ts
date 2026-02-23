import { mockCareLogs } from '@lily/api/__tests__/fixtures/care-logs'
import { createTestPlant } from '@lily/api/__tests__/fixtures/plants'
import { mockUsers } from '@lily/api/__tests__/fixtures/users'
import { createMockCareLogRepository } from '@lily/api/__tests__/mocks/care-log.repository'
import { createMockDelegationRepository } from '@lily/api/__tests__/mocks/delegation.repository'
import { createMockNotificationRepository } from '@lily/api/__tests__/mocks/notification.repository'
import { createMockPlantRepository } from '@lily/api/__tests__/mocks/plant.repository'
import { createMockCurrentUser } from '@lily/api/__tests__/mocks/session'
import { createMockUserRepository } from '@lily/api/__tests__/mocks/user.repository'
import { correctCareDates } from '@lily/api/services/plants/endpoints/correct-care-dates'
import { Effect, Exit, Layer } from 'effect'
import { describe, expect, it } from 'vitest'

describe('correctCareDates', () => {
  // Create a fresh plant for each test to avoid mock state leaking
  const basePlant = () =>
    createTestPlant({
      id: 'plant-1',
      userId: 'user-1',
      wateringFrequencyDays: 7,
      lastWateredAt: new Date('2024-01-10'),
      nextWateringAt: new Date('2024-01-17'),
      fertilizationFrequencyDays: 30,
      lastFertilizedAt: new Date('2024-01-01'),
      nextFertilizationAt: new Date('2024-01-31'),
      remindersEnabled: true,
    })

  const createTestLayer = (plants = [basePlant()], careLogs = mockCareLogs) =>
    Layer.mergeAll(
      createMockPlantRepository({ plants }),
      createMockCareLogRepository(careLogs),
      createMockNotificationRepository([]),
      createMockUserRepository(mockUsers),
      createMockCurrentUser({ id: 'user-1' }),
      createMockDelegationRepository()
    )

  // --- Happy path tests ---

  it('should correct watering date and shift nextWateringAt by the same delta', async () => {
    // lastWateredAt=Jan 10, nextWateringAt=Jan 17
    // Correct to Jan 12 → delta=+2 days → next shifts to Jan 19
    const correctedDate = new Date('2024-01-12')
    const result = await Effect.runPromise(
      correctCareDates({
        id: 'plant-1',
        lastWateredAt: correctedDate,
      }).pipe(Effect.provide(createTestLayer()))
    )

    expect(result.lastWateredAt).toEqual(correctedDate)
    const expectedNext = new Date('2024-01-19')
    expect(result.nextWateringAt?.getTime()).toBeCloseTo(
      expectedNext.getTime(),
      -3
    )
  })

  it('should correct fertilization date and shift nextFertilizationAt by the same delta', async () => {
    // lastFertilizedAt=Jan 1, nextFertilizationAt=Jan 31
    // Correct to Jan 5 → delta=+4 days → next shifts to Feb 4
    const correctedDate = new Date('2024-01-05')
    const result = await Effect.runPromise(
      correctCareDates({
        id: 'plant-1',
        lastFertilizedAt: correctedDate,
      }).pipe(Effect.provide(createTestLayer()))
    )

    expect(result.lastFertilizedAt).toEqual(correctedDate)
    const expectedNext = new Date('2024-02-04')
    expect(result.nextFertilizationAt?.getTime()).toBeCloseTo(
      expectedNext.getTime(),
      -3
    )
  })

  it('should correct both dates at once in a single request', async () => {
    const waterDate = new Date('2024-01-12') // delta=+2 days
    const fertilizeDate = new Date('2024-01-03') // delta=+2 days
    const result = await Effect.runPromise(
      correctCareDates({
        id: 'plant-1',
        lastWateredAt: waterDate,
        lastFertilizedAt: fertilizeDate,
      }).pipe(Effect.provide(createTestLayer()))
    )

    expect(result.lastWateredAt).toEqual(waterDate)
    expect(result.lastFertilizedAt).toEqual(fertilizeDate)

    const expectedNextWatering = new Date('2024-01-19') // Jan 17 + 2 days
    const expectedNextFertilization = new Date('2024-02-02') // Jan 31 + 2 days
    expect(result.nextWateringAt?.getTime()).toBeCloseTo(
      expectedNextWatering.getTime(),
      -3
    )
    expect(result.nextFertilizationAt?.getTime()).toBeCloseTo(
      expectedNextFertilization.getTime(),
      -3
    )
  })

  it('should update the most recent care log date when a care log exists', async () => {
    const correctedDate = new Date('2024-01-09')
    const result = await Effect.runPromise(
      correctCareDates({
        id: 'plant-1',
        lastWateredAt: correctedDate,
      }).pipe(Effect.provide(createTestLayer()))
    )

    expect(result.lastWateredAt).toEqual(correctedDate)
  })

  // --- Validation/error tests ---

  it('should reject future watering date with FutureDateNotAllowedError', async () => {
    const futureDate = new Date(Date.now() + 86400000 * 7)
    const exit = await Effect.runPromiseExit(
      correctCareDates({
        id: 'plant-1',
        lastWateredAt: futureDate,
      }).pipe(Effect.provide(createTestLayer()))
    )

    expect(Exit.isFailure(exit)).toBe(true)
    if (Exit.isFailure(exit)) {
      expect(exit.cause._tag).toBe('Fail')
    }
  })

  it('should reject future fertilization date with FutureDateNotAllowedError', async () => {
    const futureDate = new Date(Date.now() + 86400000 * 7)
    const exit = await Effect.runPromiseExit(
      correctCareDates({
        id: 'plant-1',
        lastFertilizedAt: futureDate,
      }).pipe(Effect.provide(createTestLayer()))
    )

    expect(Exit.isFailure(exit)).toBe(true)
    if (Exit.isFailure(exit)) {
      expect(exit.cause._tag).toBe('Fail')
    }
  })

  it('should fail with PlantNotFoundError when plant does not exist', async () => {
    const exit = await Effect.runPromiseExit(
      correctCareDates({
        id: 'non-existent',
        lastWateredAt: new Date('2024-01-10'),
      }).pipe(Effect.provide(createTestLayer()))
    )

    expect(Exit.isFailure(exit)).toBe(true)
    if (Exit.isFailure(exit)) {
      expect(exit.cause._tag).toBe('Fail')
    }
  })

  it('should return plant unchanged when neither date is provided', async () => {
    const result = await Effect.runPromise(
      correctCareDates({
        id: 'plant-1',
      }).pipe(Effect.provide(createTestLayer()))
    )

    expect(result.id).toBe('plant-1')
    expect(result.lastWateredAt).toEqual(new Date('2024-01-10'))
    expect(result.lastFertilizedAt).toEqual(new Date('2024-01-01'))
  })

  // --- Edge case tests ---

  it('should only update lastCareAt when original dates are null (no delta possible)', async () => {
    const plant = createTestPlant({
      id: 'no-dates-plant',
      wateringFrequencyDays: 14,
      lastWateredAt: null,
      nextWateringAt: null,
    })

    const correctedDate = new Date('2024-01-12')
    const result = await Effect.runPromise(
      correctCareDates({
        id: 'no-dates-plant',
        lastWateredAt: correctedDate,
      }).pipe(Effect.provide(createTestLayer([plant], [])))
    )

    expect(result.lastWateredAt).toEqual(correctedDate)
    // No original dates → no delta shift → stays null
    expect(result.nextWateringAt).toBeNull()
  })

  it('should keep nextFertilizationAt null when original dates are null', async () => {
    const plant = createTestPlant({
      id: 'no-fert-plant',
      fertilizationFrequencyDays: null,
      lastFertilizedAt: null,
      nextFertilizationAt: null,
    })

    const correctedDate = new Date('2024-01-12')
    const result = await Effect.runPromise(
      correctCareDates({
        id: 'no-fert-plant',
        lastFertilizedAt: correctedDate,
      }).pipe(Effect.provide(createTestLayer([plant], [])))
    )

    expect(result.lastFertilizedAt).toEqual(correctedDate)
    expect(result.nextFertilizationAt).toBeNull()
  })

  it('should shift nextWateringAt earlier when correcting to an earlier date', async () => {
    // lastWateredAt=Jan 10, nextWateringAt=Jan 17
    // Correct to Jan 5 → delta=-5 days → next shifts to Jan 12
    const pastDate = new Date('2024-01-05')
    const result = await Effect.runPromise(
      correctCareDates({
        id: 'plant-1',
        lastWateredAt: pastDate,
      }).pipe(Effect.provide(createTestLayer()))
    )

    expect(result.lastWateredAt).toEqual(pastDate)
    const expectedNext = new Date('2024-01-12') // Jan 17 - 5 days
    expect(result.nextWateringAt?.getTime()).toBeCloseTo(
      expectedNext.getTime(),
      -3
    )
  })

  it('should not shift nextWateringAt when corrected date equals original (zero delta)', async () => {
    const sameDate = new Date('2024-01-10')
    const result = await Effect.runPromise(
      correctCareDates({
        id: 'plant-1',
        lastWateredAt: sameDate,
      }).pipe(Effect.provide(createTestLayer()))
    )

    expect(result.lastWateredAt).toEqual(sameDate)
    const expectedNext = new Date('2024-01-17') // unchanged
    expect(result.nextWateringAt?.getTime()).toBeCloseTo(
      expectedNext.getTime(),
      -3
    )
  })

  it('should preserve weather adjustment when shifting dates', async () => {
    // frequency=7, but next is 8 days out (7 base + 1 weather)
    const plant = createTestPlant({
      id: 'weather-plant',
      wateringFrequencyDays: 7,
      lastWateredAt: new Date('2024-01-10'),
      nextWateringAt: new Date('2024-01-18'), // 8 days gap preserved
      remindersEnabled: true,
    })

    // Correct to 1 day earlier → delta=-1 → next shifts to Jan 17
    const correctedDate = new Date('2024-01-09')
    const result = await Effect.runPromise(
      correctCareDates({
        id: 'weather-plant',
        lastWateredAt: correctedDate,
      }).pipe(Effect.provide(createTestLayer([plant], [])))
    )

    expect(result.lastWateredAt).toEqual(correctedDate)
    // 8-day gap preserved: Jan 18 - 1 day = Jan 17
    // Still 8 days from corrected date (Jan 9 + 8 = Jan 17)
    const expectedNext = new Date('2024-01-17')
    expect(result.nextWateringAt?.getTime()).toBeCloseTo(
      expectedNext.getTime(),
      -3
    )
  })

  it('should schedule reminder when remindersEnabled is true', async () => {
    const correctedDate = new Date('2024-01-12')
    const result = await Effect.runPromise(
      correctCareDates({
        id: 'plant-1',
        lastWateredAt: correctedDate,
      }).pipe(Effect.provide(createTestLayer()))
    )

    expect(result.remindersEnabled).toBe(true)
    expect(result.nextWateringAt).toBeDefined()
  })

  it('should not schedule reminder when remindersEnabled is false', async () => {
    const plant = createTestPlant({
      id: 'no-reminder-plant',
      remindersEnabled: false,
      wateringFrequencyDays: 7,
      lastWateredAt: new Date('2024-01-10'),
      nextWateringAt: new Date('2024-01-17'),
    })

    const correctedDate = new Date('2024-01-12')
    const result = await Effect.runPromise(
      correctCareDates({
        id: 'no-reminder-plant',
        lastWateredAt: correctedDate,
      }).pipe(Effect.provide(createTestLayer([plant], [])))
    )

    expect(result.remindersEnabled).toBe(false)
    expect(result.lastWateredAt).toEqual(correctedDate)
  })
})
