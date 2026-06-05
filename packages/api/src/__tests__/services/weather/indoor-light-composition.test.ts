/**
 * Composition + snapshot-path tests for the indoor watering-demand model.
 *
 * Complements `indoor-light.test.ts` (which covers each pure term in
 * isolation). Here we focus on:
 *   - properties of `calculateIndoorDemandFactor` as a whole (determinism,
 *     hemisphere flips, equator stability, monotonicity, veto behaviour,
 *     sky/history smoothing, envelope across a wide grid)
 *   - the public snapshot entry point `calculatePlantAdjustment(..., latitude)`,
 *     where an INDOOR plant with a known latitude engages the indoor model and
 *     an OUTDOOR plant (or an indoor plant without latitude) keeps the legacy
 *     temperature × humidity × wind multiplier.
 *
 * Day-of-year is pinned via explicit dates. Northern winter is ~day 41
 * (mid-Feb), summer is ~day 172 (late Jun); December solstice is ~day 355.
 */
import {
  calculateIndoorDemandFactor,
  calculatePlantAdjustment,
  type IndoorDemandInput,
  type PlantForAdjustment,
} from '@lily/api/services/weather/algorithm'
import type { WeatherData } from '@lily/shared'
import { describe, expect, it } from 'vitest'

const makeDay = (
  overrides: Partial<WeatherData> & { date: string }
): WeatherData => ({
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
  ...overrides,
})

const PARIS = 48.86
const SYDNEY = -33.87
const SINGAPORE = 1.35
const TROMSO = 69.65

const DEMAND_MIN = 0.62
const DEMAND_MAX = 1.4

const JUNE = '2026-06-21'
const DECEMBER = '2026-12-21'
const FEB = '2026-02-10'

const baseInput = (
  overrides: Partial<IndoorDemandInput> & { day: WeatherData }
): IndoorDemandInput => ({
  latitude: PARIS,
  recentHistory: [],
  category: 'Foliage',
  roomLuminosity: 2000,
  roomOrientation: null,
  lightingRating: 3,
  humidityRating: 3,
  ...overrides,
})

describe('calculateIndoorDemandFactor — composition properties', () => {
  it('is deterministic: same input twice yields identical output', () => {
    const input = baseInput({
      latitude: SYDNEY,
      day: makeDay({ date: JUNE, temperatureMean: 4, cloudCover: 40 }),
      recentHistory: [
        makeDay({ date: '2026-06-20', cloudCover: 60 }),
        makeDay({ date: '2026-06-19', cloudCover: 30 }),
      ],
      category: 'Tropical',
      roomOrientation: 'N',
    })
    expect(calculateIndoorDemandFactor(input)).toBe(
      calculateIndoorDemandFactor(input)
    )
  })

  it('southern-hemisphere plant waters MORE in December than June', () => {
    // Sydney: December = southern summer (long bright days), June = winter.
    // This is the mirror image of the northern summer>winter case.
    const december = calculateIndoorDemandFactor(
      baseInput({
        latitude: SYDNEY,
        day: makeDay({ date: DECEMBER, temperatureMean: 20 }),
      })
    )
    const june = calculateIndoorDemandFactor(
      baseInput({
        latitude: SYDNEY,
        day: makeDay({ date: JUNE, temperatureMean: 20 }),
      })
    )
    expect(december).toBeGreaterThan(june)
  })

  it('equator plant shows only a small June-vs-December swing', () => {
    // Singapore is ~12h photoperiod year-round, so season barely moves demand.
    const december = calculateIndoorDemandFactor(
      baseInput({
        latitude: SINGAPORE,
        day: makeDay({ date: DECEMBER, temperatureMean: 27 }),
      })
    )
    const june = calculateIndoorDemandFactor(
      baseInput({
        latitude: SINGAPORE,
        day: makeDay({ date: JUNE, temperatureMean: 27 }),
      })
    )
    expect(Math.abs(december - june)).toBeLessThan(0.05)
  })

  it('brighter room raises demand below the veto (gap -1 vs gap 0)', () => {
    // lightingRating 1 → need level 1. Room at level 1 (gap 0) vs level 2
    // (gap +1) — both above the veto, brighter must not lower demand.
    const day = makeDay({ date: JUNE, temperatureMean: 20 })
    const matched = calculateIndoorDemandFactor(
      baseInput({ day, lightingRating: 1, roomLuminosity: 100 })
    )
    const brighter = calculateIndoorDemandFactor(
      baseInput({ day, lightingRating: 1, roomLuminosity: 500 })
    )
    expect(brighter).toBeGreaterThanOrEqual(matched)
  })

  it('dim gap<=-2 room is capped <=1.0 while a gap==-1 room may exceed it', () => {
    // Bright summer day + dry heated air would normally push demand > 1.
    const day = makeDay({ date: JUNE, temperatureMean: -5 })
    // lightingRating 4 → need level 4. Room level 2 (gap -2) → veto.
    const vetoed = calculateIndoorDemandFactor(
      baseInput({ day, lightingRating: 4, roomLuminosity: 500 })
    )
    // lightingRating 3 → need level 3. Room level 2 (gap -1) → no veto.
    const mildDim = calculateIndoorDemandFactor(
      baseInput({ day, lightingRating: 3, roomLuminosity: 500 })
    )
    expect(vetoed).toBeLessThanOrEqual(1)
    expect(mildDim).toBeGreaterThan(vetoed)
  })

  it('cloudy recent history lowers demand vs clear recent history', () => {
    const today = makeDay({ date: JUNE, temperatureMean: 20 })
    const cloudyHistory = [
      makeDay({ date: '2026-06-20', cloudCover: 95 }),
      makeDay({ date: '2026-06-19', cloudCover: 90 }),
      makeDay({ date: '2026-06-18', cloudCover: 95 }),
    ]
    const clearHistory = [
      makeDay({ date: '2026-06-20', cloudCover: 5 }),
      makeDay({ date: '2026-06-19', cloudCover: 10 }),
      makeDay({ date: '2026-06-18', cloudCover: 5 }),
    ]
    const gloomy = calculateIndoorDemandFactor(
      baseInput({ day: today, recentHistory: cloudyHistory })
    )
    const sunny = calculateIndoorDemandFactor(
      baseInput({ day: today, recentHistory: clearHistory })
    )
    expect(gloomy).toBeLessThan(sunny)
  })

  it('null roomLuminosity still varies by season (photoperiod active)', () => {
    const summer = calculateIndoorDemandFactor(
      baseInput({
        roomLuminosity: null,
        day: makeDay({ date: JUNE, temperatureMean: 20 }),
      })
    )
    const winter = calculateIndoorDemandFactor(
      baseInput({
        roomLuminosity: null,
        day: makeDay({ date: DECEMBER, temperatureMean: 20 }),
      })
    )
    expect(summer).not.toBe(winter)
    expect(summer).toBeGreaterThan(winter)
  })

  it('a winter equator-facing window shifts demand above a pole-facing one', () => {
    // Northern winter: South window catches the low sun, North stays shaded.
    const day = makeDay({ date: DECEMBER, temperatureMean: 5 })
    const south = calculateIndoorDemandFactor(
      baseInput({ day, roomOrientation: 'S' })
    )
    const north = calculateIndoorDemandFactor(
      baseInput({ day, roomOrientation: 'N' })
    )
    expect(south).toBeGreaterThan(north)
  })

  it('stays within [0.62, 1.40] across a wide grid', () => {
    for (const latitude of [PARIS, SYDNEY, SINGAPORE, TROMSO, -69.65]) {
      for (const date of [FEB, JUNE, DECEMBER, '2026-09-23']) {
        for (const temperatureMean of [-20, 0, 22, 40]) {
          for (const category of [
            'Succulent',
            'Fern',
            'Tropical',
            null,
            'Tree',
          ]) {
            for (const roomLuminosity of [null, 60, 2000, 40000]) {
              const demand = calculateIndoorDemandFactor(
                baseInput({
                  latitude,
                  category,
                  roomLuminosity,
                  day: makeDay({ date, temperatureMean, cloudCover: 50 }),
                })
              )
              expect(demand).toBeGreaterThanOrEqual(DEMAND_MIN)
              expect(demand).toBeLessThanOrEqual(DEMAND_MAX)
              expect(Number.isNaN(demand)).toBe(false)
            }
          }
        }
      }
    }
  })
})

// ─── Snapshot path: calculatePlantAdjustment(..., latitude) ──────────────────

const basePlant = (
  overrides: Partial<PlantForAdjustment> = {}
): PlantForAdjustment => ({
  id: 'plant-1',
  category: 'Foliage',
  wateringFrequencyDays: 7,
  wateringRating: 3,
  isOutdoor: false,
  lightingRating: 3,
  humidityRating: 3,
  roomLuminosity: 40000,
  roomOrientation: 'S',
  ...overrides,
})

describe('calculatePlantAdjustment — indoor snapshot path', () => {
  it('indoor plant WITH latitude engages the indoor model (differs from legacy)', () => {
    // Bright summer day so the indoor model lands clearly away from 1.0.
    const weather = makeDay({ date: JUNE, temperatureMean: 22 })
    const plant = basePlant()

    const withLat = calculatePlantAdjustment(plant, weather, [], [], PARIS)
    const legacy = calculatePlantAdjustment(plant, weather, [], [], null)

    expect(withLat.wateringMultiplier).not.toBe(legacy.wateringMultiplier)
    expect(withLat.wateringMultiplier).toBeGreaterThanOrEqual(DEMAND_MIN)
    expect(withLat.wateringMultiplier).toBeLessThanOrEqual(DEMAND_MAX)
  })

  it('outdoor plant is UNCHANGED whether latitude is passed or not', () => {
    const weather = makeDay({
      date: JUNE,
      temperatureMean: 22,
      temperatureMax: 24,
      temperatureMin: 14,
    })
    const plant = basePlant({ isOutdoor: true })

    const withLat = calculatePlantAdjustment(plant, weather, [], [], PARIS)
    const without = calculatePlantAdjustment(plant, weather, [], [], null)

    expect(withLat.wateringMultiplier).toBe(without.wateringMultiplier)
    expect(withLat.adjustedWateringDays).toBe(without.adjustedWateringDays)
  })

  it('indoor plant WITHOUT latitude uses the legacy multiplier (model off)', () => {
    // Neutral indoor weather → legacy temp×humidity×wind collapses to 1.0,
    // whereas the indoor model (summer, bright room) would NOT be 1.0.
    const weather = makeDay({ date: JUNE, temperatureMean: 20 })
    const plant = basePlant()

    const legacy = calculatePlantAdjustment(plant, weather, [], [], null)
    expect(legacy.wateringMultiplier).toBe(1)

    const indoor = calculatePlantAdjustment(plant, weather, [], [], PARIS)
    expect(indoor.wateringMultiplier).not.toBe(legacy.wateringMultiplier)
  })

  it('adjustedWateringDays is round(freq/mult) clamped to [1, freq*2]', () => {
    const freq = 9
    for (const date of [JUNE, DECEMBER, FEB]) {
      for (const temperatureMean of [-10, 20, 38]) {
        for (const roomLuminosity of [60, 2000, 40000]) {
          const plant = basePlant({
            wateringFrequencyDays: freq,
            roomLuminosity,
          })
          const adj = calculatePlantAdjustment(
            plant,
            makeDay({ date, temperatureMean }),
            [],
            [],
            PARIS
          )
          const mult = adj.wateringMultiplier
          const expected = Math.max(
            1,
            Math.min(Math.round(freq / mult), freq * 2)
          )
          expect(adj.adjustedWateringDays).toBe(expected)
          expect(adj.adjustedWateringDays).toBeGreaterThanOrEqual(1)
          expect(adj.adjustedWateringDays).toBeLessThanOrEqual(freq * 2)
        }
      }
    }
  })

  it('still populates the factors object on the indoor path', () => {
    const adj = calculatePlantAdjustment(
      basePlant(),
      makeDay({ date: JUNE, temperatureMean: 22 }),
      [],
      [],
      PARIS
    )
    expect(adj.factors).toBeDefined()
    expect(typeof adj.factors.temperature).toBe('number')
    expect(typeof adj.factors.humidity).toBe('number')
    expect(typeof adj.factors.wind).toBe('number')
    expect(typeof adj.factors.precipitation).toBe('number')
    expect(typeof adj.factors.et0).toBe('number')
    expect(adj.plantId).toBe('plant-1')
  })

  it('precipitation/fertilization skip flags are unaffected by the indoor model', () => {
    // Indoor plant: rain never triggers a watering skip even with the indoor
    // model engaged; fertilization skip is still driven purely by temperature.
    const rainy = makeDay({
      date: JUNE,
      temperatureMean: 22,
      temperatureMax: 24,
      temperatureMin: 14,
      precipitation: 50,
    })
    const adj = calculatePlantAdjustment(basePlant(), rainy, [], [rainy], PARIS)
    expect(adj.skipWatering).toBe(false)
    expect(adj.skipFertilization).toBe(false)

    // Cold extreme → fertilization skip fires regardless of the indoor model.
    const frozen = makeDay({
      date: DECEMBER,
      temperatureMean: -10,
      temperatureMax: -2,
      temperatureMin: -8,
    })
    const frozenAdj = calculatePlantAdjustment(
      basePlant(),
      frozen,
      [],
      [],
      PARIS
    )
    expect(frozenAdj.skipFertilization).toBe(true)
  })

  it('indoor watering multiplier stays bounded across a grid of dates/temps', () => {
    for (const date of [FEB, JUNE, DECEMBER]) {
      for (const temperatureMean of [-15, 5, 25, 40]) {
        for (const roomLuminosity of [60, 500, 2000, 40000]) {
          const adj = calculatePlantAdjustment(
            basePlant({ roomLuminosity }),
            makeDay({ date, temperatureMean }),
            [],
            [],
            PARIS
          )
          expect(adj.wateringMultiplier).toBeGreaterThanOrEqual(DEMAND_MIN)
          expect(adj.wateringMultiplier).toBeLessThanOrEqual(DEMAND_MAX)
        }
      }
    }
  })
})
