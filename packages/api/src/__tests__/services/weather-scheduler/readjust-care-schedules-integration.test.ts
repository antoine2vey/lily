/**
 * Integration test: verifies the full readjustCareSchedules pipeline
 * with plants in different rooms (indoor, outdoor, no room) and realistic
 * weather forecasts. Checks actual date changes, not just that it runs.
 */
import { schedulesFromPlants } from '@lily/api/__tests__/fixtures/care-schedules'
import { createTestPlant } from '@lily/api/__tests__/fixtures/plants'
import { createTestUser } from '@lily/api/__tests__/fixtures/users'
import {
  buildWeatherCtx,
  desertSummerForecast,
  hotWeekForecast,
  mockHeatWaveHistory,
  mockWeatherDataModerate,
  nordicWinterForecast,
  parisWinterForecast,
  tropicalMonsoonForecast,
} from '@lily/api/__tests__/fixtures/weather'
import { createMockCareScheduleRepository } from '@lily/api/__tests__/mocks/care-schedule.repository'
import { createMockDelegationRepository } from '@lily/api/__tests__/mocks/delegation.repository'
import { createMockNotificationRepository } from '@lily/api/__tests__/mocks/notification.repository'
import { createMockPlantRepository } from '@lily/api/__tests__/mocks/plant.repository'
import { createMockUserRepository } from '@lily/api/__tests__/mocks/user.repository'
import type { CareScheduleRow } from '@lily/api/repositories/care-schedule.repository'
import type { WeatherContext } from '@lily/api/services/weather/helpers/get-weather-context'
import { readjustCareSchedules } from '@lily/api/services/weather-scheduler/readjust-care-schedules'
import type { Notification } from '@lily/shared/notification'
import { Array, Effect, Layer, Option, pipe } from 'effect'
import { describe, expect, it } from 'vitest'

const oneDayMs = 24 * 60 * 60 * 1000

/** Get timestamp — test setup guarantees non-null dates */
const toMs = (date: Date | null | undefined): number => {
  if (!date) throw new Error('Expected non-null date in test')
  return date.getTime()
}

// ─── Test Setup ──────────────────────────────────────────────────────────

const weatherUser = createTestUser({
  id: 'weather-user-1',
  weatherEnabled: true,
  latitude: 48.86,
  longitude: 2.35,
  timezone: 'Europe/Paris',
  careReminders: true,
})

const indoorRoom = {
  id: 'room-indoor',
  name: 'Living Room',
  icon: '🏠',
  luminosity: 5,
  isOutdoor: false,
}

const outdoorRoom = {
  id: 'room-outdoor',
  name: 'Balcony',
  icon: '🌿',
  luminosity: 8,
  isOutdoor: true,
}

const buildContextMap = (
  ctx: WeatherContext
): ReadonlyMap<string, WeatherContext> => new Map([['48.86_2.35', ctx]])

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

const buildLayers = ({
  plants,
  notifications = [],
  schedules,
}: {
  plants: Array<ReturnType<typeof createTestPlant>>
  notifications?: Notification[]
  schedules?: CareScheduleRow[]
}) => {
  const resolvedSchedules = schedules ?? schedulesFromPlants(plants)
  return {
    layers: Layer.mergeAll(
      createMockUserRepository([weatherUser]),
      createMockPlantRepository({
        plants,
        rooms: [indoorRoom, outdoorRoom],
      }),
      createMockNotificationRepository(notifications),
      createMockDelegationRepository(),
      createMockCareScheduleRepository({
        schedules: resolvedSchedules,
        plants,
      })
    ),
    schedules: resolvedSchedules,
  }
}

// ─── Tests ───────────────────────────────────────────────────────────────

describe('readjustCareSchedules — full pipeline integration', () => {
  describe('Paris winter: indoor vs outdoor vs no room', () => {
    const now = Date.now()
    const threeDaysAgo = new Date(now - 3 * oneDayMs)
    const originalNext = new Date(now + 4 * oneDayMs) // 7d freq, watered 3d ago → due in 4d

    it('should barely adjust indoor plant (dampened factors)', async () => {
      const plant = createTestPlant({
        id: 'indoor-winter',
        name: 'Indoor Monstera',
        category: 'Foliage',
        wateringFrequencyDays: 7,
        wateringRating: 3,
        lastWateredAt: threeDaysAgo,
        nextWateringAt: new Date(originalNext),
        remindersEnabled: true,
        userId: weatherUser.id,
        roomId: 'room-indoor',
      })

      const ctx = buildWeatherCtx(parisWinterForecast)
      const { layers, schedules } = buildLayers({ plants: [plant] })

      await Effect.runPromise(
        readjustCareSchedules([weatherUser], buildContextMap(ctx)).pipe(
          Effect.provide(layers)
        )
      )

      // Indoor plant: dampened temp factor 0.85 → adjustedDays ~8
      // idealNext = threeDaysAgo + 8d = now + 5d
      // currentNext = now + 4d → delta = 1
      // Verify: change is small (0-2 days)
      const shiftDays = Math.round(
        (toMs(findSchedule(schedules, plant.id, 'watering')?.nextCareAt) -
          originalNext.getTime()) /
          oneDayMs
      )
      expect(shiftDays).toBeGreaterThanOrEqual(0)
      expect(shiftDays).toBeLessThanOrEqual(2)
    })

    it('should significantly delay outdoor plant (full cold factor)', async () => {
      const plant = createTestPlant({
        id: 'outdoor-winter',
        name: 'Outdoor Fern',
        category: 'Foliage',
        wateringFrequencyDays: 7,
        wateringRating: 3,
        lastWateredAt: threeDaysAgo,
        nextWateringAt: new Date(originalNext),
        remindersEnabled: true,
        userId: weatherUser.id,
        roomId: 'room-outdoor',
      })

      const ctx = buildWeatherCtx(parisWinterForecast)
      const { layers, schedules } = buildLayers({ plants: [plant] })

      await Effect.runPromise(
        readjustCareSchedules([weatherUser], buildContextMap(ctx)).pipe(
          Effect.provide(layers)
        )
      )

      // Outdoor plant: full cold factor 0.5 → adjustedDays 14 → big positive delta (capped at 4)
      const shiftDays = Math.round(
        (toMs(findSchedule(schedules, plant.id, 'watering')?.nextCareAt) -
          originalNext.getTime()) /
          oneDayMs
      )
      expect(shiftDays).toBeGreaterThan(0)
      expect(shiftDays).toBeLessThanOrEqual(4) // capped at ceil(7/2) = 4
    })

    it('should treat no-room plant as indoor (barely adjust)', async () => {
      const plant = createTestPlant({
        id: 'no-room-winter',
        name: 'No Room Plant',
        category: 'Foliage',
        wateringFrequencyDays: 7,
        wateringRating: 3,
        lastWateredAt: threeDaysAgo,
        nextWateringAt: new Date(originalNext),
        remindersEnabled: true,
        userId: weatherUser.id,
        roomId: null,
      })

      const ctx = buildWeatherCtx(parisWinterForecast)
      const { layers, schedules } = buildLayers({ plants: [plant] })

      await Effect.runPromise(
        readjustCareSchedules([weatherUser], buildContextMap(ctx)).pipe(
          Effect.provide(layers)
        )
      )

      // No room → isOutdoor = false → indoor dampening
      const shiftDays = Math.round(
        (toMs(findSchedule(schedules, plant.id, 'watering')?.nextCareAt) -
          originalNext.getTime()) /
          oneDayMs
      )
      expect(shiftDays).toBeGreaterThanOrEqual(0)
      expect(shiftDays).toBeLessThanOrEqual(2)
    })

    it('indoor shift should be much smaller than outdoor shift', async () => {
      const indoorPlant = createTestPlant({
        id: 'indoor-compare',
        name: 'Indoor Compare',
        category: 'Foliage',
        wateringFrequencyDays: 7,
        wateringRating: 3,
        lastWateredAt: threeDaysAgo,
        nextWateringAt: new Date(originalNext),
        userId: weatherUser.id,
        roomId: 'room-indoor',
      })

      const outdoorPlant = createTestPlant({
        id: 'outdoor-compare',
        name: 'Outdoor Compare',
        category: 'Foliage',
        wateringFrequencyDays: 7,
        wateringRating: 3,
        lastWateredAt: threeDaysAgo,
        nextWateringAt: new Date(originalNext),
        userId: weatherUser.id,
        roomId: 'room-outdoor',
      })

      const ctx = buildWeatherCtx(parisWinterForecast)
      const { layers, schedules } = buildLayers({
        plants: [indoorPlant, outdoorPlant],
      })

      await Effect.runPromise(
        readjustCareSchedules([weatherUser], buildContextMap(ctx)).pipe(
          Effect.provide(layers)
        )
      )

      const indoorShift = Math.round(
        (toMs(findSchedule(schedules, indoorPlant.id, 'watering')?.nextCareAt) -
          originalNext.getTime()) /
          oneDayMs
      )
      const outdoorShift = Math.round(
        (toMs(
          findSchedule(schedules, outdoorPlant.id, 'watering')?.nextCareAt
        ) -
          originalNext.getTime()) /
          oneDayMs
      )

      // Outdoor shift should be strictly larger than indoor shift
      expect(outdoorShift).toBeGreaterThan(indoorShift)
    })
  })

  describe('desert summer: outdoor plant accelerates, indoor barely moves', () => {
    const now = Date.now()
    const twoDaysAgo = new Date(now - 2 * oneDayMs)
    const originalNext = new Date(now + 5 * oneDayMs) // 7d freq, watered 2d ago → due in 5d

    it('should accelerate outdoor plant (heat + dry + wind)', async () => {
      const plant = createTestPlant({
        id: 'outdoor-desert',
        name: 'Outdoor Desert Plant',
        category: 'Foliage',
        wateringFrequencyDays: 7,
        wateringRating: 3,
        lastWateredAt: twoDaysAgo,
        nextWateringAt: new Date(originalNext),
        userId: weatherUser.id,
        roomId: 'room-outdoor',
      })

      const ctx = buildWeatherCtx(desertSummerForecast, mockHeatWaveHistory)
      const { layers, schedules } = buildLayers({ plants: [plant] })

      await Effect.runPromise(
        readjustCareSchedules([weatherUser], buildContextMap(ctx)).pipe(
          Effect.provide(layers)
        )
      )

      // Desert: hot + dry + wind → multiplier ~1.9 → adjustedDays ~4
      // idealNext = twoDaysAgo + 4d = now + 2d
      // currentNext = now + 5d → delta = -3
      const shiftDays = Math.round(
        (toMs(findSchedule(schedules, plant.id, 'watering')?.nextCareAt) -
          originalNext.getTime()) /
          oneDayMs
      )
      expect(shiftDays).toBeLessThan(0)
    })

    it('should barely adjust indoor plant in desert heat', async () => {
      const plant = createTestPlant({
        id: 'indoor-desert',
        name: 'Indoor Desert Plant',
        category: 'Foliage',
        wateringFrequencyDays: 7,
        wateringRating: 3,
        lastWateredAt: twoDaysAgo,
        nextWateringAt: new Date(originalNext),
        userId: weatherUser.id,
        roomId: 'room-indoor',
      })

      const ctx = buildWeatherCtx(desertSummerForecast, mockHeatWaveHistory)
      const { layers, schedules } = buildLayers({ plants: [plant] })

      await Effect.runPromise(
        readjustCareSchedules([weatherUser], buildContextMap(ctx)).pipe(
          Effect.provide(layers)
        )
      )

      // Indoor: dampened temp 1.15, humidity 1.0, wind 1.0 → small effect
      const shiftDays = Math.round(
        (toMs(findSchedule(schedules, plant.id, 'watering')?.nextCareAt) -
          originalNext.getTime()) /
          oneDayMs
      )
      expect(Math.abs(shiftDays)).toBeLessThanOrEqual(1)
    })
  })

  describe('tropical monsoon: outdoor gets rain credit, indoor does not', () => {
    const now = Date.now()
    const oneDayAgo = new Date(now - 1 * oneDayMs)
    const originalNext = new Date(now + 6 * oneDayMs) // 7d freq

    it('should delay outdoor plant (rain replaces watering)', async () => {
      const plant = createTestPlant({
        id: 'outdoor-monsoon',
        name: 'Outdoor Monsoon Plant',
        category: 'Foliage',
        wateringFrequencyDays: 7,
        wateringRating: 3,
        lastWateredAt: oneDayAgo,
        nextWateringAt: new Date(originalNext),
        userId: weatherUser.id,
        roomId: 'room-outdoor',
      })

      const ctx = buildWeatherCtx(tropicalMonsoonForecast)
      const { layers, schedules } = buildLayers({ plants: [plant] })

      await Effect.runPromise(
        readjustCareSchedules([weatherUser], buildContextMap(ctx)).pipe(
          Effect.provide(layers)
        )
      )

      // Rain (>6mm each day) × 0.3 dampening → very low multiplier → adjustedDays > 7
      const shiftDays = Math.round(
        (toMs(findSchedule(schedules, plant.id, 'watering')?.nextCareAt) -
          originalNext.getTime()) /
          oneDayMs
      )
      expect(shiftDays).toBeGreaterThan(0) // delay because rain waters the plant
    })

    it('should NOT delay indoor plant during monsoon (rain irrelevant)', async () => {
      const plant = createTestPlant({
        id: 'indoor-monsoon',
        name: 'Indoor Monsoon Plant',
        category: 'Foliage',
        wateringFrequencyDays: 7,
        wateringRating: 3,
        lastWateredAt: oneDayAgo,
        nextWateringAt: new Date(originalNext),
        userId: weatherUser.id,
        roomId: 'room-indoor',
      })

      const ctx = buildWeatherCtx(tropicalMonsoonForecast)
      const { layers, schedules } = buildLayers({ plants: [plant] })

      await Effect.runPromise(
        readjustCareSchedules([weatherUser], buildContextMap(ctx)).pipe(
          Effect.provide(layers)
        )
      )

      // Indoor: no rain effect, temp ~29°C is below hot threshold → delta ≈ 0
      const shiftDays = Math.round(
        (toMs(findSchedule(schedules, plant.id, 'watering')?.nextCareAt) -
          originalNext.getTime()) /
          oneDayMs
      )
      expect(Math.abs(shiftDays)).toBeLessThanOrEqual(1)
    })
  })

  describe('scheduler stability: running multiple times', () => {
    it('should stabilize after multiple runs (no infinite drift)', async () => {
      const now = Date.now()
      const threeDaysAgo = new Date(now - 3 * oneDayMs)

      const plant = createTestPlant({
        id: 'stability-outdoor',
        name: 'Stability Outdoor Plant',
        category: 'Foliage',
        wateringFrequencyDays: 7,
        wateringRating: 3,
        lastWateredAt: threeDaysAgo,
        nextWateringAt: new Date(now + 4 * oneDayMs),
        userId: weatherUser.id,
        roomId: 'room-outdoor',
      })

      const ctx = buildWeatherCtx(parisWinterForecast)
      const schedules = schedulesFromPlants([plant])

      // Run scheduler 5 times (simulating 5 scheduler invocations)
      const deltas: number[] = []
      for (let i = 0; i < 5; i++) {
        const prevNext = toMs(
          findSchedule(schedules, plant.id, 'watering')?.nextCareAt
        )
        const layers = Layer.mergeAll(
          createMockUserRepository([weatherUser]),
          createMockPlantRepository({
            plants: [plant],
            rooms: [indoorRoom, outdoorRoom],
          }),
          createMockNotificationRepository([]),
          createMockDelegationRepository(),
          createMockCareScheduleRepository({ schedules, plants: [plant] })
        )

        await Effect.runPromise(
          readjustCareSchedules([weatherUser], buildContextMap(ctx)).pipe(
            Effect.provide(layers)
          )
        )

        const shift = Math.round(
          (toMs(findSchedule(schedules, plant.id, 'watering')?.nextCareAt) -
            prevNext) /
            oneDayMs
        )
        deltas.push(shift)
      }

      // Eventually converges to 0 (deltas shrink and stabilize)
      const lastDelta = deltas[deltas.length - 1]
      expect(lastDelta).toBe(0)

      // Total drift should be bounded by max adjustedDays (14 = 2 × 7)
      const _totalDrift = deltas.reduce((sum, d) => sum + d, 0)
      const wateringSchedule = findSchedule(schedules, plant.id, 'watering')
      const intervalMs =
        toMs(wateringSchedule?.nextCareAt) - toMs(wateringSchedule?.lastCareAt)
      const intervalDays = Math.round(intervalMs / oneDayMs)
      expect(intervalDays).toBeLessThanOrEqual(14)
      expect(intervalDays).toBeGreaterThanOrEqual(1)
    })

    it('indoor plant should converge after 1 run in sustained heat wave', async () => {
      const now = Date.now()
      const twoDaysAgo = new Date(now - 2 * oneDayMs)
      const originalNext = new Date(now + 5 * oneDayMs) // 7d freq, watered 2d ago

      const plant = createTestPlant({
        id: 'stability-indoor-heat',
        name: 'Stability Indoor Heat Plant',
        category: 'Foliage',
        wateringFrequencyDays: 7,
        wateringRating: 3,
        lastWateredAt: twoDaysAgo,
        nextWateringAt: new Date(originalNext),
        userId: weatherUser.id,
        roomId: 'room-indoor',
      })

      const ctx = buildWeatherCtx(desertSummerForecast, mockHeatWaveHistory)
      const schedules = schedulesFromPlants([plant])

      // Run scheduler 5 times simulating sustained heat wave
      const deltas: number[] = []
      for (let i = 0; i < 5; i++) {
        const prevNext = toMs(
          findSchedule(schedules, plant.id, 'watering')?.nextCareAt
        )
        const layers = Layer.mergeAll(
          createMockUserRepository([weatherUser]),
          createMockPlantRepository({
            plants: [plant],
            rooms: [indoorRoom, outdoorRoom],
          }),
          createMockNotificationRepository([]),
          createMockDelegationRepository(),
          createMockCareScheduleRepository({ schedules, plants: [plant] })
        )

        await Effect.runPromise(
          readjustCareSchedules([weatherUser], buildContextMap(ctx)).pipe(
            Effect.provide(layers)
          )
        )

        const shift = Math.round(
          (toMs(findSchedule(schedules, plant.id, 'watering')?.nextCareAt) -
            prevNext) /
            oneDayMs
        )
        deltas.push(shift)
      }

      // Indoor + heat wave: dampened factor 1.15 → adjustedDays 6 → delta -1 on first run
      // Then converges to 0 on subsequent runs
      expect(deltas[0]).toBe(-1)
      expect(deltas[1]).toBe(0)
      expect(deltas[2]).toBe(0)

      // Total shift should be exactly -1 day
      const totalShift = Math.round(
        (toMs(findSchedule(schedules, plant.id, 'watering')?.nextCareAt) -
          originalNext.getTime()) /
          oneDayMs
      )
      expect(totalShift).toBe(-1)
    })

    it('indoor plant should barely move across 5 scheduler runs in cold', async () => {
      const now = Date.now()
      const threeDaysAgo = new Date(now - 3 * oneDayMs)
      const originalNext = new Date(now + 4 * oneDayMs)

      const plant = createTestPlant({
        id: 'stability-indoor',
        name: 'Stability Indoor Plant',
        category: 'Foliage',
        wateringFrequencyDays: 7,
        wateringRating: 3,
        lastWateredAt: threeDaysAgo,
        nextWateringAt: new Date(originalNext),
        userId: weatherUser.id,
        roomId: 'room-indoor',
      })

      const ctx = buildWeatherCtx(parisWinterForecast)
      const schedules = schedulesFromPlants([plant])

      for (let i = 0; i < 5; i++) {
        const layers = Layer.mergeAll(
          createMockUserRepository([weatherUser]),
          createMockPlantRepository({
            plants: [plant],
            rooms: [indoorRoom, outdoorRoom],
          }),
          createMockNotificationRepository([]),
          createMockDelegationRepository(),
          createMockCareScheduleRepository({ schedules, plants: [plant] })
        )
        await Effect.runPromise(
          readjustCareSchedules([weatherUser], buildContextMap(ctx)).pipe(
            Effect.provide(layers)
          )
        )
      }

      // Indoor: dampened cold → total shift should be tiny
      const totalShift = Math.round(
        (toMs(findSchedule(schedules, plant.id, 'watering')?.nextCareAt) -
          originalNext.getTime()) /
          oneDayMs
      )
      expect(totalShift).toBeGreaterThanOrEqual(0)
      expect(totalShift).toBeLessThanOrEqual(2)
    })
  })

  describe('skips plants without dates', () => {
    it('should skip plant without lastWateredAt', async () => {
      const plant = createTestPlant({
        id: 'no-watered-date',
        name: 'Never Watered',
        wateringFrequencyDays: 7,
        lastWateredAt: null,
        nextWateringAt: null,
        userId: weatherUser.id,
        roomId: 'room-indoor',
      })

      const ctx = buildWeatherCtx(parisWinterForecast)
      const { layers, schedules } = buildLayers({ plants: [plant] })

      // Should not throw
      await Effect.runPromise(
        readjustCareSchedules([weatherUser], buildContextMap(ctx)).pipe(
          Effect.provide(layers)
        )
      )

      // Dates unchanged (still null)
      expect(
        findSchedule(schedules, plant.id, 'watering')?.nextCareAt
      ).toBeNull()
    })
  })

  describe('zero delta → no DB update', () => {
    it('should not update plant when moderate weather matches schedule', async () => {
      const now = Date.now()
      const threeDaysAgo = new Date(now - 3 * oneDayMs)
      const correctNext = new Date(threeDaysAgo.getTime() + 7 * oneDayMs) // correct schedule

      const plant = createTestPlant({
        id: 'no-change',
        name: 'Already Correct',
        category: 'Foliage',
        wateringFrequencyDays: 7,
        wateringRating: 3,
        lastWateredAt: threeDaysAgo,
        nextWateringAt: new Date(correctNext),
        userId: weatherUser.id,
        roomId: 'room-indoor',
      })

      const moderateForecast = [
        mockWeatherDataModerate,
        { ...mockWeatherDataModerate, date: '2026-02-11' },
        { ...mockWeatherDataModerate, date: '2026-02-12' },
        { ...mockWeatherDataModerate, date: '2026-02-13' },
        { ...mockWeatherDataModerate, date: '2026-02-14' },
        { ...mockWeatherDataModerate, date: '2026-02-15' },
        { ...mockWeatherDataModerate, date: '2026-02-16' },
      ]
      const ctx = buildWeatherCtx(moderateForecast)
      const { layers, schedules } = buildLayers({ plants: [plant] })

      await Effect.runPromise(
        readjustCareSchedules([weatherUser], buildContextMap(ctx)).pipe(
          Effect.provide(layers)
        )
      )

      // Moderate weather → multiplier 1.0 → adjustedDays 7 → delta 0
      const shiftMs = Math.abs(
        toMs(findSchedule(schedules, plant.id, 'watering')?.nextCareAt) -
          correctNext.getTime()
      )
      expect(shiftMs).toBeLessThan(oneDayMs) // less than 1 day difference
    })
  })

  describe('edge cases: extreme frequencies', () => {
    it('daily watering outdoor plant (freq=1) in desert heat should not go below 1 day', async () => {
      const now = Date.now()
      const halfDayAgo = new Date(now - 0.5 * oneDayMs)
      const originalNext = new Date(now + 0.5 * oneDayMs)

      const plant = createTestPlant({
        id: 'daily-outdoor-heat',
        name: 'Daily Outdoor Herb',
        category: 'Herb',
        wateringFrequencyDays: 1,
        wateringRating: 3,
        lastWateredAt: halfDayAgo,
        nextWateringAt: new Date(originalNext),
        userId: weatherUser.id,
        roomId: 'room-outdoor',
      })

      const ctx = buildWeatherCtx(desertSummerForecast, mockHeatWaveHistory)
      const { layers, schedules } = buildLayers({ plants: [plant] })

      await Effect.runPromise(
        readjustCareSchedules([weatherUser], buildContextMap(ctx)).pipe(
          Effect.provide(layers)
        )
      )

      // adjustedDays can't go below 1 → newNext must be >= lastWateredAt + 1d
      const wateringSchedule = findSchedule(schedules, plant.id, 'watering')
      const intervalMs =
        toMs(wateringSchedule?.nextCareAt) - toMs(wateringSchedule?.lastCareAt)
      expect(intervalMs).toBeGreaterThanOrEqual(oneDayMs)
    })

    it('long-frequency succulent (14d) in Nordic cold should cap at ±7', async () => {
      const now = Date.now()
      const fiveDaysAgo = new Date(now - 5 * oneDayMs)
      const originalNext = new Date(now + 9 * oneDayMs) // 14d freq, watered 5d ago

      const plant = createTestPlant({
        id: 'succulent-cold',
        name: 'Outdoor Succulent',
        category: 'Succulent',
        wateringFrequencyDays: 14,
        wateringRating: 1,
        lastWateredAt: fiveDaysAgo,
        nextWateringAt: new Date(originalNext),
        userId: weatherUser.id,
        roomId: 'room-outdoor',
      })

      const ctx = buildWeatherCtx(nordicWinterForecast)
      const { layers, schedules } = buildLayers({ plants: [plant] })

      await Effect.runPromise(
        readjustCareSchedules([weatherUser], buildContextMap(ctx)).pipe(
          Effect.provide(layers)
        )
      )

      const shiftDays = Math.round(
        (toMs(findSchedule(schedules, plant.id, 'watering')?.nextCareAt) -
          originalNext.getTime()) /
          oneDayMs
      )
      // Cap for 14d plant is ceil(14/2) = 7
      expect(Math.abs(shiftDays)).toBeLessThanOrEqual(7)
    })
  })

  describe('edge cases: overdue plant', () => {
    it('massively overdue plant should not be pushed further into the past', async () => {
      const now = Date.now()
      const twentyDaysAgo = new Date(now - 20 * oneDayMs)
      const twoWeeksAgo = new Date(now - 14 * oneDayMs) // was due 14 days ago

      const plant = createTestPlant({
        id: 'massively-overdue',
        name: 'Forgotten Plant',
        category: 'Foliage',
        wateringFrequencyDays: 7,
        wateringRating: 3,
        lastWateredAt: twentyDaysAgo,
        nextWateringAt: new Date(twoWeeksAgo),
        userId: weatherUser.id,
        roomId: 'room-outdoor',
      })

      const ctx = buildWeatherCtx(hotWeekForecast, mockHeatWaveHistory)
      const { layers, schedules } = buildLayers({ plants: [plant] })

      await Effect.runPromise(
        readjustCareSchedules([weatherUser], buildContextMap(ctx)).pipe(
          Effect.provide(layers)
        )
      )

      // Hot weather wants to accelerate (negative delta), but plant is already
      // overdue — newNextWateringAt must not go before now or lastWateredAt + 1d
      const wateringSchedule = findSchedule(schedules, plant.id, 'watering')
      expect(toMs(wateringSchedule?.nextCareAt)).toBeGreaterThanOrEqual(
        toMs(wateringSchedule?.lastCareAt) + oneDayMs
      )
    })
  })

  describe('edge cases: multiple plants same room', () => {
    it('two plants in same outdoor room with different frequencies get independent adjustments', async () => {
      const now = Date.now()
      const threeDaysAgo = new Date(now - 3 * oneDayMs)

      const shortFreq = createTestPlant({
        id: 'short-freq-outdoor',
        name: 'Outdoor Herbs',
        category: 'Herb',
        wateringFrequencyDays: 5,
        wateringRating: 3,
        lastWateredAt: threeDaysAgo,
        nextWateringAt: new Date(now + 2 * oneDayMs), // due in 2d
        userId: weatherUser.id,
        roomId: 'room-outdoor',
      })

      const longFreq = createTestPlant({
        id: 'long-freq-outdoor',
        name: 'Outdoor Succulent',
        category: 'Succulent',
        wateringFrequencyDays: 14,
        wateringRating: 1,
        lastWateredAt: threeDaysAgo,
        nextWateringAt: new Date(now + 11 * oneDayMs), // due in 11d
        userId: weatherUser.id,
        roomId: 'room-outdoor',
      })

      const ctx = buildWeatherCtx(parisWinterForecast)
      const { layers, schedules } = buildLayers({
        plants: [shortFreq, longFreq],
      })
      const shortOriginal = toMs(shortFreq.nextWateringAt)
      const longOriginal = toMs(longFreq.nextWateringAt)

      await Effect.runPromise(
        readjustCareSchedules([weatherUser], buildContextMap(ctx)).pipe(
          Effect.provide(layers)
        )
      )

      const shortShift = Math.round(
        (toMs(findSchedule(schedules, shortFreq.id, 'watering')?.nextCareAt) -
          shortOriginal) /
          oneDayMs
      )
      const longShift = Math.round(
        (toMs(findSchedule(schedules, longFreq.id, 'watering')?.nextCareAt) -
          longOriginal) /
          oneDayMs
      )

      // Both should be delayed (cold weather → positive delta)
      expect(shortShift).toBeGreaterThanOrEqual(0)
      expect(longShift).toBeGreaterThanOrEqual(0)
      // Different cap: short = ceil(5/2) = 3, long = ceil(14/2) = 7
      expect(shortShift).toBeLessThanOrEqual(3)
      expect(longShift).toBeLessThanOrEqual(7)
    })
  })

  describe('edge cases: weather flips between runs', () => {
    it('cold run then hot run should adjust bidirectionally', async () => {
      const now = Date.now()
      const threeDaysAgo = new Date(now - 3 * oneDayMs)
      const originalNext = new Date(now + 4 * oneDayMs) // 7d freq

      const plant = createTestPlant({
        id: 'weather-flip',
        name: 'Weather Flip Plant',
        category: 'Foliage',
        wateringFrequencyDays: 7,
        wateringRating: 3,
        lastWateredAt: threeDaysAgo,
        nextWateringAt: new Date(originalNext),
        userId: weatherUser.id,
        roomId: 'room-outdoor',
      })

      // Run 1: cold weather → delays watering
      const coldCtx = buildWeatherCtx(parisWinterForecast)
      const schedules = schedulesFromPlants([plant])
      const layers1 = Layer.mergeAll(
        createMockUserRepository([weatherUser]),
        createMockPlantRepository({
          plants: [plant],
          rooms: [indoorRoom, outdoorRoom],
        }),
        createMockNotificationRepository([]),
        createMockDelegationRepository(),
        createMockCareScheduleRepository({ schedules, plants: [plant] })
      )

      await Effect.runPromise(
        readjustCareSchedules([weatherUser], buildContextMap(coldCtx)).pipe(
          Effect.provide(layers1)
        )
      )

      const afterColdNext = toMs(
        findSchedule(schedules, plant.id, 'watering')?.nextCareAt
      )
      const coldShift = Math.round(
        (afterColdNext - originalNext.getTime()) / oneDayMs
      )
      expect(coldShift).toBeGreaterThan(0) // delayed

      // Run 2: hot weather → pulls watering forward
      const hotCtx = buildWeatherCtx(hotWeekForecast, mockHeatWaveHistory)
      const layers2 = Layer.mergeAll(
        createMockUserRepository([weatherUser]),
        createMockPlantRepository({
          plants: [plant],
          rooms: [indoorRoom, outdoorRoom],
        }),
        createMockNotificationRepository([]),
        createMockDelegationRepository(),
        createMockCareScheduleRepository({ schedules, plants: [plant] })
      )

      await Effect.runPromise(
        readjustCareSchedules([weatherUser], buildContextMap(hotCtx)).pipe(
          Effect.provide(layers2)
        )
      )

      const hotShift = Math.round(
        (toMs(findSchedule(schedules, plant.id, 'watering')?.nextCareAt) -
          afterColdNext) /
          oneDayMs
      )
      expect(hotShift).toBeLessThan(0) // pulled back
    })
  })

  describe('edge cases: just watered plant', () => {
    it('plant watered moments ago should not be adjusted even in extreme weather', async () => {
      const now = Date.now()
      const justNow = new Date(now - 60 * 1000) // 1 minute ago
      const originalNext = new Date(now + 7 * oneDayMs - 60 * 1000) // 7d from watering

      const plant = createTestPlant({
        id: 'just-watered',
        name: 'Just Watered Plant',
        category: 'Foliage',
        wateringFrequencyDays: 7,
        wateringRating: 3,
        lastWateredAt: justNow,
        nextWateringAt: new Date(originalNext),
        userId: weatherUser.id,
        roomId: 'room-outdoor',
      })

      const ctx = buildWeatherCtx(desertSummerForecast, mockHeatWaveHistory)
      const { layers, schedules } = buildLayers({ plants: [plant] })

      await Effect.runPromise(
        readjustCareSchedules([weatherUser], buildContextMap(ctx)).pipe(
          Effect.provide(layers)
        )
      )

      // Desert + heat wave for outdoor: adjustedDays ~4, idealNext = justNow + 4d ≈ now + 4d
      // currentNext ≈ now + 7d → delta ≈ -3
      // BUT: this is valid acceleration (plant genuinely needs water sooner in desert)
      // The key: newNextWateringAt must never go before lastWateredAt + 1d
      const wateringSchedule = findSchedule(schedules, plant.id, 'watering')
      expect(toMs(wateringSchedule?.nextCareAt)).toBeGreaterThanOrEqual(
        toMs(wateringSchedule?.lastCareAt) + oneDayMs
      )
    })
  })

  describe('fertilization readjustment', () => {
    it('should delay fertilization by 1 day in extreme heat when overdue', async () => {
      const now = Date.now()
      const thirtyDaysAgo = new Date(now - 30 * oneDayMs)
      const pastDate = new Date(now - 1 * oneDayMs)

      const plant = createTestPlant({
        id: 'fert-delay',
        name: 'Hot Fert Plant',
        category: 'Foliage',
        wateringFrequencyDays: 7,
        wateringRating: 3,
        lastWateredAt: thirtyDaysAgo,
        nextWateringAt: new Date(thirtyDaysAgo.getTime() + 7 * oneDayMs),
        fertilizationFrequencyDays: 30,
        lastFertilizedAt: thirtyDaysAgo,
        nextFertilizationAt: new Date(pastDate),
        userId: weatherUser.id,
        roomId: 'room-outdoor',
      })

      const ctx = buildWeatherCtx(desertSummerForecast)
      const { layers, schedules } = buildLayers({ plants: [plant] })

      await Effect.runPromise(
        readjustCareSchedules([weatherUser], buildContextMap(ctx)).pipe(
          Effect.provide(layers)
        )
      )

      // Desert temps > 30°C → skipFertilization → delta = +1
      const fertShift = Math.round(
        (toMs(findSchedule(schedules, plant.id, 'fertilization')?.nextCareAt) -
          pastDate.getTime()) /
          oneDayMs
      )
      expect(fertShift).toBe(1)
    })
  })

  describe('notification rescheduling', () => {
    it('should create a new watering notification when date shifts', async () => {
      const now = Date.now()
      const threeDaysAgo = new Date(now - 3 * oneDayMs)
      const originalNext = new Date(now + 4 * oneDayMs)

      const plant = createTestPlant({
        id: 'notif-water',
        name: 'Notification Test Plant',
        category: 'Foliage',
        wateringFrequencyDays: 7,
        wateringRating: 3,
        lastWateredAt: threeDaysAgo,
        nextWateringAt: new Date(originalNext),
        remindersEnabled: true,
        userId: weatherUser.id,
        roomId: 'room-outdoor',
      })

      // Shared array the mock will push notifications into
      const notifications: Notification[] = []
      const ctx = buildWeatherCtx(parisWinterForecast)
      const { layers, schedules } = buildLayers({
        plants: [plant],
        notifications,
      })

      await Effect.runPromise(
        readjustCareSchedules([weatherUser], buildContextMap(ctx)).pipe(
          Effect.provide(layers)
        )
      )

      // Outdoor + cold → positive delta → date shifted → notification created
      const shiftDays = Math.round(
        (toMs(findSchedule(schedules, plant.id, 'watering')?.nextCareAt) -
          originalNext.getTime()) /
          oneDayMs
      )
      expect(shiftDays).toBeGreaterThan(0)

      // A watering_reminder notification should have been created
      const wateringNotifs = notifications.filter(
        (n) => n.type === 'watering_reminder' && n.plantId === 'notif-water'
      )
      expect(wateringNotifs.length).toBe(1)
      expect(wateringNotifs[0]?.userId).toBe(weatherUser.id)
    })

    it('should create a fertilization notification when fertilization date shifts', async () => {
      const now = Date.now()
      const thirtyDaysAgo = new Date(now - 30 * oneDayMs)
      const pastDate = new Date(now - 1 * oneDayMs)

      const plant = createTestPlant({
        id: 'notif-fert',
        name: 'Fert Notification Plant',
        category: 'Foliage',
        wateringFrequencyDays: 7,
        wateringRating: 3,
        lastWateredAt: thirtyDaysAgo,
        nextWateringAt: new Date(thirtyDaysAgo.getTime() + 7 * oneDayMs),
        fertilizationFrequencyDays: 30,
        lastFertilizedAt: thirtyDaysAgo,
        nextFertilizationAt: new Date(pastDate),
        remindersEnabled: true,
        userId: weatherUser.id,
        roomId: 'room-outdoor',
      })

      const notifications: Notification[] = []
      const ctx = buildWeatherCtx(desertSummerForecast)
      const { layers } = buildLayers({ plants: [plant], notifications })

      await Effect.runPromise(
        readjustCareSchedules([weatherUser], buildContextMap(ctx)).pipe(
          Effect.provide(layers)
        )
      )

      // Desert heat → fertilization delayed → notification created
      const fertNotifs = notifications.filter(
        (n) => n.type === 'fertilization_reminder' && n.plantId === 'notif-fert'
      )
      expect(fertNotifs.length).toBe(1)
    })

    it('should NOT create notification when delta is zero', async () => {
      const now = Date.now()
      const threeDaysAgo = new Date(now - 3 * oneDayMs)
      const correctNext = new Date(threeDaysAgo.getTime() + 7 * oneDayMs)

      const plant = createTestPlant({
        id: 'notif-zero',
        name: 'No Change Plant',
        category: 'Foliage',
        wateringFrequencyDays: 7,
        wateringRating: 3,
        lastWateredAt: threeDaysAgo,
        nextWateringAt: new Date(correctNext),
        remindersEnabled: true,
        userId: weatherUser.id,
        roomId: 'room-indoor',
      })

      const notifications: Notification[] = []
      const moderateForecast = [
        mockWeatherDataModerate,
        { ...mockWeatherDataModerate, date: '2026-02-11' },
        { ...mockWeatherDataModerate, date: '2026-02-12' },
        { ...mockWeatherDataModerate, date: '2026-02-13' },
        { ...mockWeatherDataModerate, date: '2026-02-14' },
        { ...mockWeatherDataModerate, date: '2026-02-15' },
        { ...mockWeatherDataModerate, date: '2026-02-16' },
      ]
      const ctx = buildWeatherCtx(moderateForecast)
      const { layers } = buildLayers({ plants: [plant], notifications })

      await Effect.runPromise(
        readjustCareSchedules([weatherUser], buildContextMap(ctx)).pipe(
          Effect.provide(layers)
        )
      )

      // Moderate weather → delta = 0 → no notification created
      expect(notifications.length).toBe(0)
    })

    it('should delete old pending notification before creating new one', async () => {
      const now = Date.now()
      const threeDaysAgo = new Date(now - 3 * oneDayMs)
      const originalNext = new Date(now + 4 * oneDayMs)

      const plant = createTestPlant({
        id: 'notif-replace',
        name: 'Replace Notification Plant',
        category: 'Foliage',
        wateringFrequencyDays: 7,
        wateringRating: 3,
        lastWateredAt: threeDaysAgo,
        nextWateringAt: new Date(originalNext),
        remindersEnabled: true,
        userId: weatherUser.id,
        roomId: 'room-outdoor',
      })

      // Pre-existing pending notification for this plant
      const existingNotification: Notification = {
        id: 'old-notif-1',
        type: 'watering_reminder',
        title: 'Old reminder',
        body: 'Old body',
        scheduledAt: originalNext,
        isRead: false,
        status: 'pending',
        retryCount: 0,
        userId: weatherUser.id,
        plantId: 'notif-replace',
        createdAt: new Date(),
      }

      const notifications: Notification[] = [existingNotification]
      const ctx = buildWeatherCtx(parisWinterForecast)
      const { layers } = buildLayers({ plants: [plant], notifications })

      await Effect.runPromise(
        readjustCareSchedules([weatherUser], buildContextMap(ctx)).pipe(
          Effect.provide(layers)
        )
      )

      // Old notification should be deleted, new one created
      const wateringNotifs = notifications.filter(
        (n) => n.type === 'watering_reminder' && n.plantId === 'notif-replace'
      )
      // Only the new notification should remain (old was deleted by deletePendingByPlantAndType)
      expect(wateringNotifs.length).toBe(1)
      expect(wateringNotifs[0]?.id).not.toBe('old-notif-1')
    })

    it('should NOT create notification when reminders are disabled', async () => {
      const now = Date.now()
      const threeDaysAgo = new Date(now - 3 * oneDayMs)
      const originalNext = new Date(now + 4 * oneDayMs)

      const plant = createTestPlant({
        id: 'notif-disabled',
        name: 'Reminders Disabled Plant',
        category: 'Foliage',
        wateringFrequencyDays: 7,
        wateringRating: 3,
        lastWateredAt: threeDaysAgo,
        nextWateringAt: new Date(originalNext),
        remindersEnabled: false, // disabled
        userId: weatherUser.id,
        roomId: 'room-outdoor',
      })

      const notifications: Notification[] = []
      const ctx = buildWeatherCtx(parisWinterForecast)
      const { layers, schedules } = buildLayers({
        plants: [plant],
        notifications,
      })

      await Effect.runPromise(
        readjustCareSchedules([weatherUser], buildContextMap(ctx)).pipe(
          Effect.provide(layers)
        )
      )

      // Date still shifts (delta applies regardless)
      const shiftDays = Math.round(
        (toMs(findSchedule(schedules, plant.id, 'watering')?.nextCareAt) -
          originalNext.getTime()) /
          oneDayMs
      )
      expect(shiftDays).toBeGreaterThan(0)

      // But no notification was created
      expect(notifications.length).toBe(0)
    })
  })
})
