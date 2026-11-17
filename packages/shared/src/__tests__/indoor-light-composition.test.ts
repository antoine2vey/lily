/**
 * Composition tests for the indoor watering-demand model.
 *
 * Complements `indoor-light.test.ts` (which covers each pure term in
 * isolation). Here we focus on properties of `calculateIndoorDemandFactor` as
 * a whole (determinism, hemisphere flips, equator stability, monotonicity,
 * veto behaviour, sky/history smoothing, envelope across a wide grid).
 *
 * Day-of-year is pinned via explicit dates. Northern winter is ~day 41
 * (mid-Feb), summer is ~day 172 (late Jun); December solstice is ~day 355.
 */

import { describe, expect, it } from 'vitest'
import {
  calculateIndoorDemandFactor,
  type IndoorDemandInput,
} from '../domains/weather/indoor-demand'
import type { WeatherData } from '../domains/weather/schema'

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
  lightingRating: 50,
  humidityRating: 50,
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
    // lightingRating 10 → need level 1. Room at level 1 (gap 0) vs level 2
    // (gap +1) — both above the veto, brighter must not lower demand.
    const day = makeDay({ date: JUNE, temperatureMean: 20 })
    const matched = calculateIndoorDemandFactor(
      baseInput({ day, lightingRating: 10, roomLuminosity: 100 })
    )
    const brighter = calculateIndoorDemandFactor(
      baseInput({ day, lightingRating: 10, roomLuminosity: 500 })
    )
    expect(brighter).toBeGreaterThanOrEqual(matched)
  })

  it('dim gap<=-2 room is capped <=1.0 while a gap==-1 room may exceed it', () => {
    // Bright summer day + dry heated air would normally push demand > 1.
    const day = makeDay({ date: JUNE, temperatureMean: -5 })
    // lightingRating 70 → need level 4. Room level 2 (gap -2) → veto.
    const vetoed = calculateIndoorDemandFactor(
      baseInput({ day, lightingRating: 70, roomLuminosity: 500 })
    )
    // lightingRating 50 → need level 3. Room level 2 (gap -1) → no veto.
    const mildDim = calculateIndoorDemandFactor(
      baseInput({ day, lightingRating: 50, roomLuminosity: 500 })
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
