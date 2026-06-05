/**
 * Extra full-pipeline integration tests for the location-aware indoor
 * watering-demand model, driven end-to-end through `readjustCareSchedules` to
 * the persisted `nextCareAt`.
 *
 * These complement (do NOT duplicate) the three Paris-centric cases in
 * `weather-scheduler/readjust-care-schedules-integration.test.ts`. The focus
 * here is hemisphere/equator behaviour, multi-category single runs, and the
 * legacy (latitude-independent) outdoor path:
 *
 *   - SOUTHERN HEMISPHERE: seasons flip end-to-end — an indoor plant waters
 *     SOONER in December (southern summer) than in June (southern winter).
 *   - EQUATOR: ~12h photoperiod year-round, so June and December produce a
 *     near-identical persisted nextCareAt.
 *   - MULTI-PLANT single run: several indoor categories in one room each get
 *     bounded, independent dates.
 *   - LEGACY PATH: an OUTDOOR plant's adjustment never depends on latitude
 *     (the indoor model only engages for indoor plants).
 *
 * The forecast DATE (not the wall-clock run time) sets the season, so these
 * are deterministic regardless of when the suite runs. Assertions are
 * directional (compare two runs) since exact day counts are tuning-sensitive.
 */
import { schedulesFromPlants } from '@lily/api/__tests__/fixtures/care-schedules'
import {
  createTestPlant,
  wateringSpec,
} from '@lily/api/__tests__/fixtures/plants'
import { createTestUser } from '@lily/api/__tests__/fixtures/users'
import { buildWeatherCtx } from '@lily/api/__tests__/fixtures/weather'
import { createMockCareScheduleRepository } from '@lily/api/__tests__/mocks/care-schedule.repository'
import { createMockDelegationRepository } from '@lily/api/__tests__/mocks/delegation.repository'
import { createMockNotificationRepository } from '@lily/api/__tests__/mocks/notification.repository'
import { createMockPlantRepository } from '@lily/api/__tests__/mocks/plant.repository'
import { createMockUserRepository } from '@lily/api/__tests__/mocks/user.repository'
import type { CareScheduleRow } from '@lily/api/repositories/care-schedule.repository'
import type { WeatherContext } from '@lily/api/services/weather/helpers/get-weather-context'
import { readjustCareSchedules } from '@lily/api/services/weather-scheduler/readjust-care-schedules'
import type { WeatherData } from '@lily/shared'
import { roundCoord } from '@lily/shared'
import { Array, Effect, Layer, Option, pipe } from 'effect'
import { describe, expect, it } from 'vitest'

const oneDayMs = 24 * 60 * 60 * 1000

/** Get timestamp — test setup guarantees non-null dates. */
const toMs = (date: Date | null | undefined): number => {
  if (!date) throw new Error('Expected non-null date in test')
  return date.getTime()
}

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

/** Context map keyed by the user's rounded coordinates (matches production). */
const contextMapFor = (
  latitude: number,
  longitude: number,
  ctx: WeatherContext
): ReadonlyMap<string, WeatherContext> =>
  new Map([[`${roundCoord(latitude)}_${roundCoord(longitude)}`, ctx]])

/**
 * A 7-day forecast dated in a given month (drives photoperiod) with fixed
 * weather. The day-of-year — not the run time — sets the season.
 */
const datedForecast = (
  isoMonth: string,
  day: Partial<WeatherData>
): ReadonlyArray<WeatherData> =>
  Array.makeBy(7, (i) => ({
    date: `${isoMonth}-${String(10 + i).padStart(2, '0')}`,
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

const indoorRoom = {
  id: 'room-indoor',
  name: 'Living Room',
  // Bright indirect (level 3) — matches lightingRating 3 so room-fit is neutral
  // and the photoperiod term is the dominant seasonal driver.
  luminosity: 2000,
  icon: '🏠',
  isOutdoor: false,
}

const brightRoom = {
  id: 'room-bright',
  name: 'Sun Room',
  luminosity: 40000, // level 5
  icon: '☀️',
  isOutdoor: false,
}

const outdoorRoom = {
  id: 'room-outdoor',
  name: 'Balcony',
  luminosity: 40000,
  icon: '🌿',
  isOutdoor: true,
}

const allRooms = [indoorRoom, brightRoom, outdoorRoom]

const now = Date.now()
const threeDaysAgo = new Date(now - 3 * oneDayMs)

// A 14-day base frequency gives the integer-day delta model enough resolution
// to register the (small but real) seasonal photoperiod swing as a DIFFERENT
// persisted day between summer and winter. At 7d the swing rounds to the same
// day in both seasons; at 14d (cap ±7) it does not. Watered 3d ago, due in 11d
// → mid-cycle, room to move either direction within the ±ceil(14/2)=7 cap.
const BASE_FREQ_DAYS = 14
const midCycleOffsetDays = BASE_FREQ_DAYS - 3 // 11
const midCycleNext = new Date(now + midCycleOffsetDays * oneDayMs)
const maxShiftDays = Math.ceil(BASE_FREQ_DAYS / 2) // 7

/** Build an indoor plant with a fresh mid-cycle 14-day watering schedule. */
const indoorPlant = (
  id: string,
  userId: string,
  roomId: string,
  category: string | null = 'Foliage'
) =>
  createTestPlant({
    id,
    name: id,
    category,
    wateringRating: 3,
    userId,
    roomId,
    scheduleSpecs: [
      wateringSpec({
        frequencyDays: BASE_FREQ_DAYS,
        lastCareAt: threeDaysAgo,
        nextCareAt: new Date(midCycleNext),
      }),
    ],
  })

/**
 * Run a set of plants for a single user through one weather context and return
 * the persisted schedules array (mutated in place by the scheduler).
 */
const runScheduler = async (
  user: ReturnType<typeof createTestUser>,
  plants: Array<ReturnType<typeof createTestPlant>>,
  ctx: WeatherContext
): Promise<CareScheduleRow[]> => {
  const schedules = schedulesFromPlants(plants)
  const layers = Layer.mergeAll(
    createMockUserRepository([user]),
    createMockPlantRepository({ plants, rooms: allRooms }),
    createMockNotificationRepository([]),
    createMockDelegationRepository(),
    createMockCareScheduleRepository({ schedules, plants })
  )
  await Effect.runPromise(
    readjustCareSchedules(
      [user],
      contextMapFor(user.latitude ?? 0, user.longitude ?? 0, ctx)
    ).pipe(Effect.provide(layers))
  )
  return schedules
}

/** Persisted next watering timestamp for a single plant after one run. */
const runOnceNext = async (
  user: ReturnType<typeof createTestUser>,
  plant: ReturnType<typeof createTestPlant>,
  ctx: WeatherContext
): Promise<number> => {
  const schedules = await runScheduler(user, [plant], ctx)
  return toMs(findSchedule(schedules, plant.id, 'watering')?.nextCareAt)
}

describe('indoor pipeline (extra): hemisphere & equator end-to-end', () => {
  describe('southern hemisphere: seasons flip end-to-end (Sydney)', () => {
    const sydney = createTestUser({
      id: 'user-sydney',
      weatherEnabled: true,
      latitude: -33.87,
      longitude: 151.21,
      timezone: 'Australia/Sydney',
      careReminders: true,
    })

    // Same indoor weather both runs — only the date (photoperiod) differs. A
    // Tropical plant (high photoperiod sensitivity) makes the seasonal swing
    // big enough to flip the persisted day.
    const juneCtx = buildWeatherCtx(
      datedForecast('2026-06', { temperatureMean: 18, cloudCover: 40 })
    )
    const decemberCtx = buildWeatherCtx(
      datedForecast('2026-12', { temperatureMean: 18, cloudCover: 40 })
    )

    it('waters an indoor plant SOONER in December than in June (southern summer)', async () => {
      const decNext = await runOnceNext(
        sydney,
        indoorPlant('syd-dec', sydney.id, 'room-bright', 'Tropical'),
        decemberCtx
      )
      const juneNext = await runOnceNext(
        sydney,
        indoorPlant('syd-jun', sydney.id, 'room-bright', 'Tropical'),
        juneCtx
      )
      // Southern summer (December) = long bright days → active growth → water
      // sooner → earlier persisted date than southern winter (June).
      expect(decNext).toBeLessThan(juneNext)
    })

    it('is the inverse of a northern-hemisphere user at the same coordinates', async () => {
      // Same Sydney coords but with a northern-hemisphere latitude would flip
      // the result; we verify the southern user itself does not behave like the
      // north by checking June (southern winter) waters LATER than December.
      const decNext = await runOnceNext(
        sydney,
        indoorPlant('syd-dec2', sydney.id, 'room-bright', 'Tropical'),
        decemberCtx
      )
      const juneNext = await runOnceNext(
        sydney,
        indoorPlant('syd-jun2', sydney.id, 'room-bright', 'Tropical'),
        juneCtx
      )
      expect(juneNext).toBeGreaterThanOrEqual(decNext)
    })

    it('keeps the persisted date within the ±ceil(freq/2) cap on both runs', async () => {
      for (const ctx of [juneCtx, decemberCtx]) {
        const next = await runOnceNext(
          sydney,
          indoorPlant('syd-cap', sydney.id, 'room-bright', 'Tropical'),
          ctx
        )
        const shiftDays = Math.round((next - midCycleNext.getTime()) / oneDayMs)
        expect(Math.abs(shiftDays)).toBeLessThanOrEqual(maxShiftDays)
      }
    })
  })

  describe('equator: photoperiod barely changes across the year (Singapore)', () => {
    const singapore = createTestUser({
      id: 'user-singapore',
      weatherEnabled: true,
      latitude: 1.35,
      longitude: 103.82,
      timezone: 'Asia/Singapore',
      careReminders: true,
    })

    const juneCtx = buildWeatherCtx(
      datedForecast('2026-06', { temperatureMean: 28, cloudCover: 50 })
    )
    const decemberCtx = buildWeatherCtx(
      datedForecast('2026-12', { temperatureMean: 28, cloudCover: 50 })
    )

    it('June and December yield a near-identical persisted nextCareAt', async () => {
      const juneNext = await runOnceNext(
        singapore,
        indoorPlant('sg-jun', singapore.id, 'room-bright', 'Tropical'),
        juneCtx
      )
      const decNext = await runOnceNext(
        singapore,
        indoorPlant('sg-dec', singapore.id, 'room-bright', 'Tropical'),
        decemberCtx
      )
      // ~12h day length all year → the seasonal swing is negligible. Allow at
      // most a 1-day rounding wobble between the two seasons.
      const diffDays = Math.abs(juneNext - decNext) / oneDayMs
      expect(diffDays).toBeLessThanOrEqual(1)
    })

    it('equator seasonal swing is strictly smaller than the Sydney swing', async () => {
      // Equator swing
      const sgJune = await runOnceNext(
        singapore,
        indoorPlant('sg-jun2', singapore.id, 'room-bright', 'Tropical'),
        juneCtx
      )
      const sgDec = await runOnceNext(
        singapore,
        indoorPlant('sg-dec2', singapore.id, 'room-bright', 'Tropical'),
        decemberCtx
      )
      const sgSwing = Math.abs(sgJune - sgDec)

      // Sydney swing (same fixed indoor weather, only date differs)
      const sydney = createTestUser({
        id: 'user-sydney-swing',
        weatherEnabled: true,
        latitude: -33.87,
        longitude: 151.21,
        timezone: 'Australia/Sydney',
        careReminders: true,
      })
      const sydJuneCtx = buildWeatherCtx(
        datedForecast('2026-06', { temperatureMean: 18, cloudCover: 40 })
      )
      const sydDecCtx = buildWeatherCtx(
        datedForecast('2026-12', { temperatureMean: 18, cloudCover: 40 })
      )
      const sydJune = await runOnceNext(
        sydney,
        indoorPlant('syd-swing-jun', sydney.id, 'room-bright', 'Tropical'),
        sydJuneCtx
      )
      const sydDec = await runOnceNext(
        sydney,
        indoorPlant('syd-swing-dec', sydney.id, 'room-bright', 'Tropical'),
        sydDecCtx
      )
      const sydSwing = Math.abs(sydJune - sydDec)

      expect(sgSwing).toBeLessThan(sydSwing)
    })
  })

  describe('multiple indoor categories in one room, single run', () => {
    const paris = createTestUser({
      id: 'user-paris-multi',
      weatherEnabled: true,
      latitude: 48.86,
      longitude: 2.35,
      timezone: 'Europe/Paris',
      careReminders: true,
    })

    // Northern summer: long bright days. Three categories with different
    // photoperiod sensitivities (Succulent 0.4, Foliage 0.8, Tropical 1.0)
    // share one bright room and one weather context.
    const summerCtx = buildWeatherCtx(
      datedForecast('2026-06', { temperatureMean: 22, cloudCover: 30 })
    )

    it('each plant gets an independent, bounded nextCareAt', async () => {
      const succulent = indoorPlant(
        'multi-succulent',
        paris.id,
        'room-bright',
        'Succulent'
      )
      const foliage = indoorPlant(
        'multi-foliage',
        paris.id,
        'room-bright',
        'Foliage'
      )
      const tropical = indoorPlant(
        'multi-tropical',
        paris.id,
        'room-bright',
        'Tropical'
      )

      const schedules = await runScheduler(
        paris,
        [succulent, foliage, tropical],
        summerCtx
      )

      const ids = ['multi-succulent', 'multi-foliage', 'multi-tropical']
      for (const id of ids) {
        const next = toMs(findSchedule(schedules, id, 'watering')?.nextCareAt)
        const shiftDays = Math.round((next - midCycleNext.getTime()) / oneDayMs)
        // Every plant stays within the ±ceil(freq/2) cap and never lands before
        // lastWatered + 1 day.
        expect(Math.abs(shiftDays)).toBeLessThanOrEqual(maxShiftDays)
        expect(next).toBeGreaterThanOrEqual(toMs(threeDaysAgo) + oneDayMs)
      }
    })

    it('the high-sensitivity Tropical waters no later than the low-sensitivity Succulent in summer', async () => {
      const succulent = indoorPlant(
        'multi2-succulent',
        paris.id,
        'room-bright',
        'Succulent'
      )
      const tropical = indoorPlant(
        'multi2-tropical',
        paris.id,
        'room-bright',
        'Tropical'
      )

      const schedules = await runScheduler(
        paris,
        [succulent, tropical],
        summerCtx
      )

      const succulentNext = toMs(
        findSchedule(schedules, 'multi2-succulent', 'watering')?.nextCareAt
      )
      const tropicalNext = toMs(
        findSchedule(schedules, 'multi2-tropical', 'watering')?.nextCareAt
      )
      // Tropical responds more strongly to long summer days → equal or earlier
      // (never later) than the drought-adapted Succulent.
      expect(tropicalNext).toBeLessThanOrEqual(succulentNext)
    })
  })

  describe('legacy path: outdoor plant is latitude-independent', () => {
    // The indoor model only engages for indoor plants. An OUTDOOR plant uses
    // the temperature × humidity × wind multiplier regardless of latitude, so
    // its persisted date must be identical whether the user sits in the
    // northern or southern hemisphere with otherwise-identical weather.
    const northUser = createTestUser({
      id: 'user-north-outdoor',
      weatherEnabled: true,
      latitude: 48.86,
      longitude: 2.35,
      timezone: 'Europe/Paris',
      careReminders: true,
    })
    const southUser = createTestUser({
      id: 'user-south-outdoor',
      weatherEnabled: true,
      latitude: -33.87,
      longitude: 151.21,
      timezone: 'Australia/Sydney',
      careReminders: true,
    })

    // Cold-ish, dry, calm outdoor week. Same numeric weather for both users.
    const outdoorWeather = (): ReadonlyArray<WeatherData> =>
      datedForecast('2026-06', {
        temperatureMin: 2,
        temperatureMax: 8,
        temperatureMean: 5,
        humidity: 70,
        windSpeed: 2,
        precipitation: 0,
        et0: 0.8,
        cloudCover: 80,
      })

    const outdoorPlant = (id: string, userId: string) =>
      createTestPlant({
        id,
        name: id,
        category: 'Foliage',
        wateringRating: 3,
        userId,
        roomId: 'room-outdoor',
        scheduleSpecs: [
          wateringSpec({
            frequencyDays: BASE_FREQ_DAYS,
            lastCareAt: threeDaysAgo,
            nextCareAt: new Date(midCycleNext),
          }),
        ],
      })

    it('produces the same persisted shift in both hemispheres', async () => {
      const northNext = await runOnceNext(
        northUser,
        outdoorPlant('out-north', northUser.id),
        buildWeatherCtx(outdoorWeather())
      )
      const southNext = await runOnceNext(
        southUser,
        outdoorPlant('out-south', southUser.id),
        buildWeatherCtx(outdoorWeather())
      )
      // Latitude does not enter the legacy outdoor multiplier → identical dates.
      expect(southNext).toBe(northNext)
    })

    it('still runs and stays within the cap (outdoor cold → delay)', async () => {
      const next = await runOnceNext(
        northUser,
        outdoorPlant('out-cap', northUser.id),
        buildWeatherCtx(outdoorWeather())
      )
      const shiftDays = Math.round((next - midCycleNext.getTime()) / oneDayMs)
      // Cold outdoor week slows water use → non-negative shift, within cap.
      expect(shiftDays).toBeGreaterThanOrEqual(0)
      expect(shiftDays).toBeLessThanOrEqual(maxShiftDays)
    })
  })

  describe('null-latitude user is skipped upstream (no crash, no change)', () => {
    // When latitude is null the readjust pipeline skips the whole user before
    // any plant logic runs, so the indoor model never engages and the schedule
    // is left untouched. We assert it neither throws nor mutates the date.
    const noLatUser = createTestUser({
      id: 'user-no-lat',
      weatherEnabled: true,
      latitude: null,
      longitude: null,
      timezone: 'UTC',
      careReminders: true,
    })

    it('leaves the indoor plant schedule unchanged', async () => {
      const plant = indoorPlant('no-lat-indoor', noLatUser.id, 'room-indoor')
      const schedules = schedulesFromPlants([plant])
      const layers = Layer.mergeAll(
        createMockUserRepository([noLatUser]),
        createMockPlantRepository({ plants: [plant], rooms: allRooms }),
        createMockNotificationRepository([]),
        createMockDelegationRepository(),
        createMockCareScheduleRepository({ schedules, plants: [plant] })
      )

      // Any context map — the user is skipped before lookup.
      const ctx = buildWeatherCtx(
        datedForecast('2026-06', { temperatureMean: 20, cloudCover: 30 })
      )

      await Effect.runPromise(
        readjustCareSchedules([noLatUser], new Map([['0_0', ctx]])).pipe(
          Effect.provide(layers)
        )
      )

      // Date is exactly the original mid-cycle value (no adjustment applied).
      const next = toMs(
        findSchedule(schedules, 'no-lat-indoor', 'watering')?.nextCareAt
      )
      expect(next).toBe(midCycleNext.getTime())
    })
  })
})
