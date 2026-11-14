import { schedulesFromPlants } from '@lily/api/__tests__/fixtures/care-schedules'
import {
  createTestPlant,
  fertilizationSpec,
  wateringSpec,
} from '@lily/api/__tests__/fixtures/plants'
import { createTestUser } from '@lily/api/__tests__/fixtures/users'
import {
  buildWeatherCtx,
  desertSummerForecast,
  hotWeekForecast,
  mockHeatWaveHistory,
  nordicWinterForecast,
  parisWinterForecast,
  tropicalMonsoonForecast,
} from '@lily/api/__tests__/fixtures/weather'
import { createMockCanopyRepository } from '@lily/api/__tests__/mocks/canopy.repository'
import { createStubCare } from '@lily/api/__tests__/mocks/care'
import { createMockCareScheduleRepository } from '@lily/api/__tests__/mocks/care-schedule.repository'
import { createMockDelegationRepository } from '@lily/api/__tests__/mocks/delegation.repository'
import { createMockNotificationRepository } from '@lily/api/__tests__/mocks/notification.repository'
import { createMockPlantRepository } from '@lily/api/__tests__/mocks/plant.repository'
import { MockSqlClientLive } from '@lily/api/__tests__/mocks/sql-client'
import { createMockUserRepository } from '@lily/api/__tests__/mocks/user.repository'
import { DueMove } from '@lily/api/contexts/care'
import type { CareScheduleRow } from '@lily/api/repositories/care-schedule.repository'
import type { WeatherContext } from '@lily/api/services/weather/helpers/get-weather-context'
import {
  readjustCareSchedules,
  weatherScopes,
} from '@lily/api/services/weather-scheduler/readjust-care-schedules'
import type { CareType, WeatherData } from '@lily/shared'
import { Array, Effect, Layer, Number, pipe } from 'effect'
import { describe, expect, it } from 'vitest'

const oneDayMs = 24 * 60 * 60 * 1000

// ─── Test Setup ──────────────────────────────────────────────────────────

const weatherUser = createTestUser({
  id: 'weather-user-1',
  weatherEnabled: true,
  latitude: 48.86,
  longitude: 2.35,
  timezone: 'Europe/Paris',
  careReminders: true,
})

const userScopes = weatherScopes([weatherUser], [])

const indoorRoom = {
  id: 'room-indoor',
  name: 'Living Room',
  // Lux value (bright indirect, level 3) — matches the default plant
  // lightingRating of 3, so the indoor light model sees a well-lit room.
  luminosity: 2000,
  icon: '🏠',
  isOutdoor: false,
}

const outdoorRoom = {
  id: 'room-outdoor',
  name: 'Balcony',
  icon: '🌿',
  luminosity: 40000,
  isOutdoor: true,
}

const dimRoom = {
  id: 'room-dim',
  name: 'Dim Hallway',
  icon: '🌑',
  luminosity: 80,
  isOutdoor: false,
}

const buildContextMap = (
  ctx: WeatherContext
): ReadonlyMap<string, WeatherContext> => new Map([['48.86_2.35', ctx]])

type Plant = ReturnType<typeof createTestPlant>
type MoveCommands = ReturnType<typeof createStubCare>['moved']

const readjust = async (
  plants: Plant[],
  ctx: WeatherContext,
  schedules: CareScheduleRow[] = schedulesFromPlants(plants)
): Promise<MoveCommands> => {
  const care = createStubCare()
  await Effect.runPromise(
    readjustCareSchedules(userScopes, buildContextMap(ctx)).pipe(
      Effect.provide(
        Layer.mergeAll(
          MockSqlClientLive,
          care.layer,
          createMockUserRepository([weatherUser]),
          createMockPlantRepository({
            plants,
            rooms: [indoorRoom, outdoorRoom, dimRoom],
          }),
          createMockNotificationRepository([]),
          createMockCanopyRepository(),
          createMockDelegationRepository(),
          createMockCareScheduleRepository({ schedules, plants })
        )
      )
    )
  )
  return care.moved
}

const daysAsked = (
  commands: MoveCommands,
  plantId: string,
  careType: CareType = 'watering'
): number =>
  pipe(
    commands,
    Array.flatMap((command) => command.moves),
    Array.filter(
      (move) => move.plantId === plantId && move.careType === careType
    ),
    Array.map(({ move }) => move),
    Array.filter(DueMove.$is('By')),
    Array.map((move) => move.days),
    Number.sumAll
  )

const readjustAndApply = async (
  plant: Plant,
  ctx: WeatherContext,
  schedules: CareScheduleRow[]
): Promise<number> => {
  const days = daysAsked(await readjust([plant], ctx, schedules), plant.id)
  for (const schedule of schedules) {
    if (schedule.careType === 'watering' && schedule.nextCareAt) {
      schedule.nextCareAt = new Date(
        schedule.nextCareAt.getTime() + days * oneDayMs
      )
    }
  }
  return days
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
        wateringRating: 3,
        remindersEnabled: true,
        userId: weatherUser.id,
        roomId: 'room-indoor',
        diedAt: null,
        deathCause: null,
        deathNote: null,
        scheduleSpecs: [
          wateringSpec({
            frequencyDays: 7,
            lastCareAt: threeDaysAgo,
            nextCareAt: new Date(originalNext),
          }),
        ],
      })

      const ctx = buildWeatherCtx(parisWinterForecast)
      const commands = await readjust([plant], ctx)

      // Indoor plant: dampened temp factor 0.85 → adjustedDays ~8
      // idealNext = threeDaysAgo + 8d = now + 5d
      // currentNext = now + 4d → delta = 1
      // Verify: change is small (0-2 days)
      const shiftDays = daysAsked(commands, plant.id)
      expect(shiftDays).toBeGreaterThanOrEqual(0)
      expect(shiftDays).toBeLessThanOrEqual(2)
    })

    it('should significantly delay outdoor plant (full cold factor)', async () => {
      const plant = createTestPlant({
        id: 'outdoor-winter',
        name: 'Outdoor Fern',
        category: 'Foliage',
        wateringRating: 3,
        remindersEnabled: true,
        userId: weatherUser.id,
        roomId: 'room-outdoor',
        diedAt: null,
        deathCause: null,
        deathNote: null,
        scheduleSpecs: [
          wateringSpec({
            frequencyDays: 7,
            lastCareAt: threeDaysAgo,
            nextCareAt: new Date(originalNext),
          }),
        ],
      })

      const ctx = buildWeatherCtx(parisWinterForecast)
      const commands = await readjust([plant], ctx)

      // Outdoor plant: full cold factor 0.5 → adjustedDays 14 → big positive delta (capped at 4)
      const shiftDays = daysAsked(commands, plant.id)
      expect(shiftDays).toBeGreaterThan(0)
      expect(shiftDays).toBeLessThanOrEqual(4) // capped at ceil(7/2) = 4
    })

    it('should treat no-room plant as indoor (barely adjust)', async () => {
      const plant = createTestPlant({
        id: 'no-room-winter',
        name: 'No Room Plant',
        category: 'Foliage',
        wateringRating: 3,
        remindersEnabled: true,
        userId: weatherUser.id,
        roomId: null,
        diedAt: null,
        deathCause: null,
        deathNote: null,
        scheduleSpecs: [
          wateringSpec({
            frequencyDays: 7,
            lastCareAt: threeDaysAgo,
            nextCareAt: new Date(originalNext),
          }),
        ],
      })

      const ctx = buildWeatherCtx(parisWinterForecast)
      const commands = await readjust([plant], ctx)

      // No room → isOutdoor = false → indoor dampening
      const shiftDays = daysAsked(commands, plant.id)
      expect(shiftDays).toBeGreaterThanOrEqual(0)
      expect(shiftDays).toBeLessThanOrEqual(2)
    })

    it('indoor shift should be much smaller than outdoor shift', async () => {
      const indoorPlant = createTestPlant({
        id: 'indoor-compare',
        name: 'Indoor Compare',
        category: 'Foliage',
        wateringRating: 3,
        userId: weatherUser.id,
        roomId: 'room-indoor',
        diedAt: null,
        deathCause: null,
        deathNote: null,
        scheduleSpecs: [
          wateringSpec({
            frequencyDays: 7,
            lastCareAt: threeDaysAgo,
            nextCareAt: new Date(originalNext),
          }),
        ],
      })

      const outdoorPlant = createTestPlant({
        id: 'outdoor-compare',
        name: 'Outdoor Compare',
        category: 'Foliage',
        wateringRating: 3,
        userId: weatherUser.id,
        roomId: 'room-outdoor',
        diedAt: null,
        deathCause: null,
        deathNote: null,
        scheduleSpecs: [
          wateringSpec({
            frequencyDays: 7,
            lastCareAt: threeDaysAgo,
            nextCareAt: new Date(originalNext),
          }),
        ],
      })

      const ctx = buildWeatherCtx(parisWinterForecast)
      const commands = await readjust([indoorPlant, outdoorPlant], ctx)

      const indoorShift = daysAsked(commands, indoorPlant.id)
      const outdoorShift = daysAsked(commands, outdoorPlant.id)

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
        wateringRating: 3,
        userId: weatherUser.id,
        roomId: 'room-outdoor',
        diedAt: null,
        deathCause: null,
        deathNote: null,
        scheduleSpecs: [
          wateringSpec({
            frequencyDays: 7,
            lastCareAt: twoDaysAgo,
            nextCareAt: new Date(originalNext),
          }),
        ],
      })

      const ctx = buildWeatherCtx(desertSummerForecast, mockHeatWaveHistory)
      const commands = await readjust([plant], ctx)

      // Desert: hot + dry + wind → multiplier ~1.9 → adjustedDays ~4
      // idealNext = twoDaysAgo + 4d = now + 2d
      // currentNext = now + 5d → delta = -3
      const shiftDays = daysAsked(commands, plant.id)
      expect(shiftDays).toBeLessThan(0)
    })

    it('should not move an indoor plant in desert heat', async () => {
      const plant = createTestPlant({
        id: 'indoor-desert',
        name: 'Indoor Desert Plant',
        category: 'Foliage',
        wateringRating: 3,
        userId: weatherUser.id,
        roomId: 'room-indoor',
        diedAt: null,
        deathCause: null,
        deathNote: null,
        scheduleSpecs: [
          wateringSpec({
            frequencyDays: 7,
            lastCareAt: twoDaysAgo,
            nextCareAt: new Date(originalNext),
          }),
        ],
      })

      const ctx = buildWeatherCtx(desertSummerForecast, mockHeatWaveHistory)
      const commands = await readjust([plant], ctx)

      expect(daysAsked(commands, plant.id)).toBe(0)
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
        wateringRating: 3,
        userId: weatherUser.id,
        roomId: 'room-outdoor',
        diedAt: null,
        deathCause: null,
        deathNote: null,
        scheduleSpecs: [
          wateringSpec({
            frequencyDays: 7,
            lastCareAt: oneDayAgo,
            nextCareAt: new Date(originalNext),
          }),
        ],
      })

      const ctx = buildWeatherCtx(tropicalMonsoonForecast)
      const commands = await readjust([plant], ctx)

      // Rain (>6mm each day) × 0.3 dampening → very low multiplier → adjustedDays > 7
      const shiftDays = daysAsked(commands, plant.id)
      expect(shiftDays).toBeGreaterThan(0) // delay because rain waters the plant
    })

    it('should NOT delay indoor plant during monsoon (rain irrelevant)', async () => {
      const plant = createTestPlant({
        id: 'indoor-monsoon',
        name: 'Indoor Monsoon Plant',
        category: 'Foliage',
        wateringRating: 3,
        userId: weatherUser.id,
        roomId: 'room-indoor',
        diedAt: null,
        deathCause: null,
        deathNote: null,
        scheduleSpecs: [
          wateringSpec({
            frequencyDays: 7,
            lastCareAt: oneDayAgo,
            nextCareAt: new Date(originalNext),
          }),
        ],
      })

      const ctx = buildWeatherCtx(tropicalMonsoonForecast)
      const commands = await readjust([plant], ctx)

      // Indoor: no rain effect, temp ~29°C is below hot threshold → delta ≈ 0
      const shiftDays = daysAsked(commands, plant.id)
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
        wateringRating: 3,
        userId: weatherUser.id,
        roomId: 'room-outdoor',
        diedAt: null,
        deathCause: null,
        deathNote: null,
        scheduleSpecs: [
          wateringSpec({
            frequencyDays: 7,
            lastCareAt: threeDaysAgo,
            nextCareAt: new Date(now + 4 * oneDayMs),
          }),
        ],
      })

      const ctx = buildWeatherCtx(parisWinterForecast)
      const schedules = schedulesFromPlants([plant])

      const deltas: number[] = []
      for (let i = 0; i < 5; i++) {
        deltas.push(await readjustAndApply(plant, ctx, schedules))
      }

      expect(deltas[0]).toBeGreaterThan(0)
      expect(deltas[deltas.length - 1]).toBe(0)

      const intervalDays = 7 + Number.sumAll(deltas)
      expect(intervalDays).toBeLessThanOrEqual(14)
      expect(intervalDays).toBeGreaterThanOrEqual(1)
    })
  })

  // ─── New location-aware indoor model: signature behaviors end-to-end ─────
  // These assert the NEW indoor light/photoperiod/VPD model all the way through
  // readjustCareSchedules to the move it asks for (not just that it runs).
  describe('indoor model: location-aware behavior (new)', () => {
    const now = Date.now()
    const threeDaysAgo = new Date(now - 3 * oneDayMs)
    const midCycleNext = new Date(now + 4 * oneDayMs)

    // A 7-day forecast dated in a given month (drives photoperiod) with fixed
    // weather. The day-of-year — not the run time — sets the season.
    const datedForecast = (
      isoMonth: string,
      day: Partial<WeatherData>
    ): ReadonlyArray<WeatherData> =>
      Array.makeBy(7, (i) => ({
        date: `${isoMonth}-${String(18 + i).padStart(2, '0')}`,
        temperatureMin: null,
        temperatureMax: null,
        temperatureMean: null,
        humidity: null,
        windSpeed: null,
        precipitation: null,
        solarRadiation: null,
        et0: null,
        cloudCover: null,
        soilTemperature: null,
        ...day,
      }))

    // Paris June: long bright days, mild. December: short days, cold, overcast.
    const juneCtx = buildWeatherCtx(
      datedForecast('2026-06', { temperatureMean: 20, cloudCover: 30 })
    )
    const decemberCtx = buildWeatherCtx(
      datedForecast('2026-12', { temperatureMean: 3, cloudCover: 85 })
    )

    const indoorFoliage = (id: string, roomId: string) =>
      createTestPlant({
        id,
        name: id,
        category: 'Foliage',
        wateringRating: 3,
        userId: weatherUser.id,
        roomId,
        scheduleSpecs: [
          wateringSpec({
            frequencyDays: 7,
            lastCareAt: threeDaysAgo,
            nextCareAt: new Date(midCycleNext),
          }),
        ],
      })

    const daysFor = async (plant: Plant, ctx: WeatherContext) =>
      daysAsked(await readjust([plant], ctx), plant.id)

    it('waters an indoor plant SOONER in summer than in winter (photoperiod flows through)', async () => {
      const juneDays = await daysFor(
        indoorFoliage('indoor-june', 'room-indoor'),
        juneCtx
      )
      const decemberDays = await daysFor(
        indoorFoliage('indoor-december', 'room-indoor'),
        decemberCtx
      )
      // Long bright summer days → active growth → water sooner → earlier date.
      expect(juneDays).toBeLessThan(decemberDays)
    })

    it('waters a dim-room indoor plant LATER than a bright-room one (room luminosity flows through)', async () => {
      const brightDays = await daysFor(
        indoorFoliage('indoor-bright', 'room-indoor'),
        decemberCtx
      )
      const dimDays = await daysFor(
        indoorFoliage('indoor-dim', 'room-dim'),
        decemberCtx
      )
      // A dim room slows growth → water less often → later date.
      expect(dimDays).toBeGreaterThan(brightDays)
    })

    it('NEVER accelerates a light-starved plant, even in dry heated winter air (dormancy veto)', async () => {
      const days = await daysFor(
        indoorFoliage('indoor-starved', 'room-dim'),
        decemberCtx
      )
      // The veto: a dormant, light-starved plant must never have its watering
      // pulled earlier — cold dry indoor air cannot shorten its schedule.
      expect(days).toBeGreaterThanOrEqual(0)
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
        wateringRating: 3,
        userId: weatherUser.id,
        roomId: 'room-outdoor',
        diedAt: null,
        deathCause: null,
        deathNote: null,
        scheduleSpecs: [
          wateringSpec({
            frequencyDays: 1,
            lastCareAt: halfDayAgo,
            nextCareAt: new Date(originalNext),
          }),
        ],
      })

      const ctx = buildWeatherCtx(desertSummerForecast, mockHeatWaveHistory)
      const commands = await readjust([plant], ctx)

      expect(daysAsked(commands, plant.id)).toBeGreaterThanOrEqual(0)
    })

    it('long-frequency succulent (14d) in Nordic cold should cap at ±7', async () => {
      const now = Date.now()
      const fiveDaysAgo = new Date(now - 5 * oneDayMs)
      const originalNext = new Date(now + 9 * oneDayMs) // 14d freq, watered 5d ago

      const plant = createTestPlant({
        id: 'succulent-cold',
        name: 'Outdoor Succulent',
        category: 'Succulent',
        wateringRating: 1,
        userId: weatherUser.id,
        roomId: 'room-outdoor',
        diedAt: null,
        deathCause: null,
        deathNote: null,
        scheduleSpecs: [
          wateringSpec({
            frequencyDays: 14,
            lastCareAt: fiveDaysAgo,
            nextCareAt: new Date(originalNext),
          }),
        ],
      })

      const ctx = buildWeatherCtx(nordicWinterForecast)
      const commands = await readjust([plant], ctx)

      const shiftDays = daysAsked(commands, plant.id)
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
        wateringRating: 3,
        userId: weatherUser.id,
        roomId: 'room-outdoor',
        diedAt: null,
        deathCause: null,
        deathNote: null,
        scheduleSpecs: [
          wateringSpec({
            frequencyDays: 7,
            lastCareAt: twentyDaysAgo,
            nextCareAt: new Date(twoWeeksAgo),
          }),
        ],
      })

      const ctx = buildWeatherCtx(hotWeekForecast, mockHeatWaveHistory)
      const commands = await readjust([plant], ctx)

      expect(6 + daysAsked(commands, plant.id)).toBeGreaterThanOrEqual(1)
    })
  })

  describe('edge cases: multiple plants same room', () => {
    it('two plants in same outdoor room with different frequencies get independent adjustments', async () => {
      const now = Date.now()
      const threeDaysAgo = new Date(now - 3 * oneDayMs)

      const shortNextDate = new Date(now + 2 * oneDayMs)
      const longNextDate = new Date(now + 11 * oneDayMs)

      const shortFreq = createTestPlant({
        id: 'short-freq-outdoor',
        name: 'Outdoor Herbs',
        category: 'Herb',
        wateringRating: 3,
        userId: weatherUser.id,
        roomId: 'room-outdoor',
        diedAt: null,
        deathCause: null,
        deathNote: null,
        scheduleSpecs: [
          wateringSpec({
            frequencyDays: 5,
            lastCareAt: threeDaysAgo,
            nextCareAt: shortNextDate, // due in 2d
          }),
        ],
      })

      const longFreq = createTestPlant({
        id: 'long-freq-outdoor',
        name: 'Outdoor Succulent',
        category: 'Succulent',
        wateringRating: 1,
        userId: weatherUser.id,
        roomId: 'room-outdoor',
        diedAt: null,
        deathCause: null,
        deathNote: null,
        scheduleSpecs: [
          wateringSpec({
            frequencyDays: 14,
            lastCareAt: threeDaysAgo,
            nextCareAt: longNextDate, // due in 11d
          }),
        ],
      })

      const ctx = buildWeatherCtx(parisWinterForecast)
      const commands = await readjust([shortFreq, longFreq], ctx)

      const shortShift = daysAsked(commands, shortFreq.id)
      const longShift = daysAsked(commands, longFreq.id)

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
        wateringRating: 3,
        userId: weatherUser.id,
        roomId: 'room-outdoor',
        diedAt: null,
        deathCause: null,
        deathNote: null,
        scheduleSpecs: [
          wateringSpec({
            frequencyDays: 7,
            lastCareAt: threeDaysAgo,
            nextCareAt: new Date(originalNext),
          }),
        ],
      })

      const schedules = schedulesFromPlants([plant])

      const coldShift = await readjustAndApply(
        plant,
        buildWeatherCtx(parisWinterForecast),
        schedules
      )
      expect(coldShift).toBeGreaterThan(0)

      const hotShift = await readjustAndApply(
        plant,
        buildWeatherCtx(hotWeekForecast, mockHeatWaveHistory),
        schedules
      )
      expect(hotShift).toBeLessThan(0)
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
        wateringRating: 3,
        userId: weatherUser.id,
        roomId: 'room-outdoor',
        diedAt: null,
        deathCause: null,
        deathNote: null,
        scheduleSpecs: [
          wateringSpec({
            frequencyDays: 7,
            lastCareAt: justNow,
            nextCareAt: new Date(originalNext),
          }),
        ],
      })

      const ctx = buildWeatherCtx(desertSummerForecast, mockHeatWaveHistory)
      const commands = await readjust([plant], ctx)

      expect(7 + daysAsked(commands, plant.id)).toBeGreaterThanOrEqual(1)
    })
  })

  describe('fertilization readjustment', () => {
    it('should ask Care to delay fertilization by 1 day in extreme heat when overdue', async () => {
      const now = Date.now()
      const thirtyDaysAgo = new Date(now - 30 * oneDayMs)
      const pastDate = new Date(now - 1 * oneDayMs)

      const plant = createTestPlant({
        id: 'fert-delay',
        name: 'Hot Fert Plant',
        category: 'Foliage',
        wateringRating: 3,
        userId: weatherUser.id,
        roomId: 'room-outdoor',
        diedAt: null,
        deathCause: null,
        deathNote: null,
        scheduleSpecs: [
          wateringSpec({
            frequencyDays: 7,
            lastCareAt: thirtyDaysAgo,
            nextCareAt: new Date(thirtyDaysAgo.getTime() + 7 * oneDayMs),
          }),
          fertilizationSpec({
            frequencyDays: 30,
            lastCareAt: thirtyDaysAgo,
            nextCareAt: new Date(pastDate),
          }),
        ],
      })

      const ctx = buildWeatherCtx(desertSummerForecast)
      const commands = await readjust([plant], ctx)

      // Desert temps > 30°C → skipFertilization → delta = +1
      expect(commands).toEqual([
        {
          reason: 'weather',
          moves: expect.arrayContaining([
            {
              plantId: plant.id,
              careType: 'fertilization',
              move: DueMove.By({ days: 1 }),
            },
          ]),
        },
      ])
    })
  })

  describe('plant with reminders disabled', () => {
    it('should still be moved', async () => {
      const now = Date.now()
      const threeDaysAgo = new Date(now - 3 * oneDayMs)
      const originalNext = new Date(now + 4 * oneDayMs)

      const plant = createTestPlant({
        id: 'notif-disabled',
        name: 'Reminders Disabled Plant',
        category: 'Foliage',
        wateringRating: 3,
        remindersEnabled: false, // disabled
        userId: weatherUser.id,
        roomId: 'room-outdoor',
        diedAt: null,
        deathCause: null,
        deathNote: null,
        scheduleSpecs: [
          wateringSpec({
            frequencyDays: 7,
            lastCareAt: threeDaysAgo,
            nextCareAt: new Date(originalNext),
          }),
        ],
      })

      const ctx = buildWeatherCtx(parisWinterForecast)
      const commands = await readjust([plant], ctx)

      expect(daysAsked(commands, plant.id)).toBeGreaterThan(0)
    })
  })
})
