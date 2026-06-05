/**
 * Unit tests for the indoor light/growth watering-demand model.
 *
 * These exercise the pure functions directly (no repositories, no Effect
 * runtime). Day-of-year is pinned via explicit dates so assertions are
 * deterministic. Northern-hemisphere winter is ~day 41 (mid-Feb), summer is
 * ~day 172 (late Jun).
 */
import {
  calculateIndoorDemandFactor,
  dayLengthHours,
  dayOfYearFromIso,
  type IndoorDemandInput,
  indoorVpdFactor,
  lightEnergyFactor,
  orientationFactor,
  roomFitFactor,
  skyFactor,
} from '@lily/api/services/weather/algorithm'
import type { WeatherData } from '@lily/shared'
import { Option } from 'effect'
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

const WINTER = 41 // ~Feb 10
const SUMMER = 172 // ~Jun 21
const SOLSTICE_DEC = 355 // ~Dec 21

describe('dayLengthHours', () => {
  it('Paris: short winter days, long summer days', () => {
    const winter = dayLengthHours(PARIS, SOLSTICE_DEC)
    const summer = dayLengthHours(PARIS, SUMMER)
    expect(winter).toBeGreaterThan(7)
    expect(winter).toBeLessThan(9)
    expect(summer).toBeGreaterThan(15)
    expect(summer).toBeLessThan(16.5)
    expect(summer).toBeGreaterThan(winter)
  })

  it('Sydney (southern hemisphere): seasons are flipped', () => {
    // December = southern summer (long), June = southern winter (short)
    expect(dayLengthHours(SYDNEY, SOLSTICE_DEC)).toBeGreaterThan(
      dayLengthHours(SYDNEY, SUMMER)
    )
  })

  it('Singapore (equator): ~12h year-round', () => {
    expect(dayLengthHours(SINGAPORE, WINTER)).toBeCloseTo(12, 0)
    expect(dayLengthHours(SINGAPORE, SUMMER)).toBeCloseTo(12, 0)
  })

  it('Tromsø (polar): saturates to 0h / 24h with no NaN (acos clamp)', () => {
    const polarNight = dayLengthHours(TROMSO, SOLSTICE_DEC)
    const midnightSun = dayLengthHours(TROMSO, SUMMER)
    expect(Number.isNaN(polarNight)).toBe(false)
    expect(Number.isNaN(midnightSun)).toBe(false)
    expect(polarNight).toBeCloseTo(0, 1)
    expect(midnightSun).toBeCloseTo(24, 1)
  })
})

describe('dayOfYearFromIso', () => {
  it('parses YYYY-MM-DD to day-of-year', () => {
    expect(dayOfYearFromIso('2026-01-01')).toEqual(Option.some(1))
    expect(dayOfYearFromIso('2026-02-10')).toEqual(Option.some(41))
  })

  it('returns None for unparseable input', () => {
    expect(Option.isNone(dayOfYearFromIso('not-a-date'))).toBe(true)
  })
})

describe('lightEnergyFactor', () => {
  it('winter < 1 < summer for a mid-latitude plant', () => {
    const winter = lightEnergyFactor(PARIS, WINTER, 'Foliage')
    const summer = lightEnergyFactor(PARIS, SUMMER, 'Foliage')
    expect(winter).toBeLessThan(1)
    expect(summer).toBeGreaterThan(1)
  })

  it('succulents (CAM, low sensitivity) swing less than tropicals', () => {
    const succulentSwing = Math.abs(
      lightEnergyFactor(PARIS, SUMMER, 'Succulent') -
        lightEnergyFactor(PARIS, WINTER, 'Succulent')
    )
    const tropicalSwing = Math.abs(
      lightEnergyFactor(PARIS, SUMMER, 'Tropical') -
        lightEnergyFactor(PARIS, WINTER, 'Tropical')
    )
    expect(succulentSwing).toBeLessThan(tropicalSwing)
  })

  it('stays within [0.8, 1.2]', () => {
    for (const lat of [PARIS, SYDNEY, SINGAPORE, TROMSO]) {
      for (const doy of [WINTER, SUMMER, SOLSTICE_DEC, 1, 200]) {
        const f = lightEnergyFactor(lat, doy, 'Tropical')
        expect(f).toBeGreaterThanOrEqual(0.8)
        expect(f).toBeLessThanOrEqual(1.2)
      }
    }
  })
})

describe('orientationFactor', () => {
  it('null / unknown orientation is neutral', () => {
    expect(orientationFactor(PARIS, WINTER, null)).toBe(1)
    expect(orientationFactor(PARIS, WINTER, 'banana')).toBe(1)
  })

  it('equator-facing window (south in N hemisphere) > pole-facing in winter', () => {
    const south = orientationFactor(PARIS, SOLSTICE_DEC, 'S')
    const north = orientationFactor(PARIS, SOLSTICE_DEC, 'N')
    expect(south).toBeGreaterThan(1)
    expect(north).toBeLessThan(1)
  })

  it('hemisphere-aware: N window favoured in southern hemisphere', () => {
    // Southern-hemisphere winter (~June): the equator-facing wall is North.
    const north = orientationFactor(SYDNEY, SUMMER, 'N')
    const south = orientationFactor(SYDNEY, SUMMER, 'S')
    expect(north).toBeGreaterThan(south)
  })
})

describe('roomFitFactor', () => {
  it('null luminosity is neutral with gap 0', () => {
    expect(roomFitFactor(null, 3, 'Foliage')).toEqual({ factor: 1, gap: 0 })
  })

  it('matched room/plant level → neutral; dimmer → lower; brighter → higher', () => {
    // lightingRating 3 → need level 3 (2000 lux)
    expect(roomFitFactor(2000, 3, 'Foliage').factor).toBeCloseTo(1, 5)
    expect(roomFitFactor(100, 3, 'Foliage').factor).toBeLessThan(1) // dim
    expect(roomFitFactor(40000, 3, 'Foliage').factor).toBeGreaterThan(1) // bright
  })

  it('dim room two+ levels below need flags the veto gap', () => {
    // lightingRating 4 → need level 4; room 100 lux → level 1; gap = -3
    expect(roomFitFactor(100, 4, 'Foliage').gap).toBeLessThanOrEqual(-2)
  })

  it('CAM plants (succulent/cactus) are capped — a bright room cannot accelerate', () => {
    const succulent = roomFitFactor(40000, 2, 'Succulent').factor
    expect(succulent).toBeLessThanOrEqual(1.05)
  })
})

describe('skyFactor', () => {
  it('overcast < 1 < clear, within [0.92, 1.08]', () => {
    const cloudy = skyFactor(
      makeDay({ date: '2026-02-10', cloudCover: 95 }),
      []
    )
    const clear = skyFactor(makeDay({ date: '2026-02-10', cloudCover: 5 }), [])
    expect(cloudy).toBeLessThan(1)
    expect(clear).toBeGreaterThan(1)
    expect(cloudy).toBeGreaterThanOrEqual(0.92)
    expect(clear).toBeLessThanOrEqual(1.08)
  })

  it('falls back to neutral when no cloud or radiation data', () => {
    expect(skyFactor(makeDay({ date: '2026-02-10' }), [])).toBe(1)
  })
})

describe('indoorVpdFactor', () => {
  it('cold outdoors (heating → dry air) raises demand above warm shoulder weather', () => {
    const cold = indoorVpdFactor(-5, 3)
    const mild = indoorVpdFactor(18, 3)
    expect(cold).toBeGreaterThan(mild)
    expect(cold).toBeGreaterThan(1)
  })

  it('high-humidity-loving plants (high humidityRating) are penalised more by dry air', () => {
    const fern = indoorVpdFactor(-5, 5)
    const cactus = indoorVpdFactor(-5, 1)
    expect(fern).toBeGreaterThan(cactus)
  })

  it('stays within [0.85, 1.25]', () => {
    for (const temp of [-15, 0, 15, 30, 40]) {
      for (const rating of [1, 3, 5]) {
        const f = indoorVpdFactor(temp, rating)
        expect(f).toBeGreaterThanOrEqual(0.85)
        expect(f).toBeLessThanOrEqual(1.25)
      }
    }
  })
})

describe('calculateIndoorDemandFactor', () => {
  const base = (
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

  it('an outdoor heat wave does NOT accelerate a well-lit indoor plant', () => {
    // Same indoor plant, same summer date — only outdoor temperature differs.
    const hot = calculateIndoorDemandFactor(
      base({ day: makeDay({ date: '2026-06-21', temperatureMean: 36 }) })
    )
    const mild = calculateIndoorDemandFactor(
      base({ day: makeDay({ date: '2026-06-21', temperatureMean: 18 }) })
    )
    // Outdoor temperature only nudges demand via indoor VPD — no big swing.
    expect(Math.abs(hot - mild)).toBeLessThan(0.15)
  })

  it('a light-starved (dim-room) plant is never told to water sooner', () => {
    const demand = calculateIndoorDemandFactor(
      base({
        day: makeDay({ date: '2026-02-10', temperatureMean: -5 }), // dry heated air
        roomLuminosity: 80, // level 1, vs lightingRating 4 → veto
        lightingRating: 4,
      })
    )
    expect(demand).toBeLessThanOrEqual(1)
  })

  it('stays within the demand envelope [0.62, 1.40] across a grid', () => {
    for (const latitude of [PARIS, SYDNEY, SINGAPORE, TROMSO]) {
      for (const date of ['2026-02-10', '2026-06-21', '2026-12-21']) {
        for (const temperatureMean of [-10, 20, 38]) {
          for (const roomLuminosity of [null, 80, 2000, 40000]) {
            const demand = calculateIndoorDemandFactor(
              base({
                latitude,
                day: makeDay({ date, temperatureMean, cloudCover: 50 }),
                roomLuminosity,
              })
            )
            expect(demand).toBeGreaterThanOrEqual(0.62)
            expect(demand).toBeLessThanOrEqual(1.4)
          }
        }
      }
    }
  })

  it('summer (long bright days) drives more demand than winter for the same plant', () => {
    const summer = calculateIndoorDemandFactor(
      base({ day: makeDay({ date: '2026-06-21', temperatureMean: 20 }) })
    )
    const winter = calculateIndoorDemandFactor(
      base({ day: makeDay({ date: '2026-12-21', temperatureMean: 20 }) })
    )
    expect(summer).toBeGreaterThan(winter)
  })

  it('an unparseable date degrades gracefully (no throw, bounded)', () => {
    const demand = calculateIndoorDemandFactor(
      base({ day: makeDay({ date: 'garbage', temperatureMean: 18 }) })
    )
    expect(demand).toBeGreaterThanOrEqual(0.62)
    expect(demand).toBeLessThanOrEqual(1.4)
  })
})
