/**
 * Boundary / monotonicity / degradation tests for the indoor demand sub-factors.
 *
 * Companion to `indoor-light.test.ts` — that file covers the headline cases
 * (Paris winter<summer, Sydney flip, CAM cap, dim veto). This file pushes on
 * the EDGES: every plant category, the full 8-point compass, the
 * gap == -2 veto boundary, lightingRating bucketing, the solar-radiation
 * fallback path of skyFactor, the recent-day averaging window, and strict
 * monotonic sweeps for the VPD term.
 *
 * Day-of-year is pinned via explicit ISO dates so assertions are deterministic.
 */

import { describe, expect, it } from 'vitest'
import {
  indoorVpdFactor,
  lightEnergyFactor,
  orientationFactor,
  roomFitFactor,
  skyFactor,
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

const WINTER = 41 // ~Feb 10
const SUMMER = 172 // ~Jun 21
const SOLSTICE_DEC = 355 // ~Dec 21
const EQUINOX = 80 // ~Mar 21

// Every category that has a crop coefficient (the universe of real inputs).
const CROP_CATEGORIES = [
  'Succulent',
  'Cactus',
  'Tropical',
  'Fern',
  'Herb',
  'Flowering',
  'Foliage',
  'Tree',
  'Vine',
  'Grass',
  'Vegetable',
  'Aquatic',
]

describe('lightEnergyFactor — category sensitivity', () => {
  it('null category uses the default sensitivity (swing between succulent and tropical)', () => {
    const swing = (category: string | null) =>
      Math.abs(
        lightEnergyFactor(PARIS, SUMMER, category) -
          lightEnergyFactor(PARIS, WINTER, category)
      )
    const nullSwing = swing(null)
    // Default sensitivity 0.7 sits between succulent (0.4) and tropical (1.0).
    expect(nullSwing).toBeGreaterThan(swing('Succulent'))
    expect(nullSwing).toBeLessThan(swing('Tropical'))
  })

  it('an unknown category string also falls back to the default sensitivity', () => {
    expect(lightEnergyFactor(PARIS, SUMMER, 'NotARealCategory')).toBe(
      lightEnergyFactor(PARIS, SUMMER, null)
    )
  })

  it('Cactus and Succulent share the same (low) seasonal swing', () => {
    const cactus = Math.abs(
      lightEnergyFactor(PARIS, SUMMER, 'Cactus') -
        lightEnergyFactor(PARIS, WINTER, 'Cactus')
    )
    const succulent = Math.abs(
      lightEnergyFactor(PARIS, SUMMER, 'Succulent') -
        lightEnergyFactor(PARIS, WINTER, 'Succulent')
    )
    expect(cactus).toBeCloseTo(succulent, 10)
  })

  it('every crop category stays within [0.8, 1.2] across the year', () => {
    for (const category of CROP_CATEGORIES) {
      for (const doy of [WINTER, EQUINOX, SUMMER, SOLSTICE_DEC, 1, 366]) {
        const f = lightEnergyFactor(PARIS, doy, category)
        expect(f).toBeGreaterThanOrEqual(0.8)
        expect(f).toBeLessThanOrEqual(1.2)
      }
    }
  })

  it('is neutral (~1.0) at the equinox where day length ~= 12h', () => {
    // 12h day + the equinox sun ~= reference => geometric mean near 1.
    expect(lightEnergyFactor(PARIS, EQUINOX, 'Tropical')).toBeCloseTo(1, 1)
  })
})

describe('orientationFactor — the full compass at Paris winter', () => {
  const aspectFactor = (o: string) => orientationFactor(PARIS, SOLSTICE_DEC, o)

  it('east and west windows are exactly neutral (aspect 0)', () => {
    expect(aspectFactor('E')).toBe(1)
    expect(aspectFactor('W')).toBe(1)
  })

  it('orders the eight compass points S > SE/SW > E/W > NE/NW > N', () => {
    const s = aspectFactor('S')
    const se = aspectFactor('SE')
    const sw = aspectFactor('SW')
    const e = aspectFactor('E')
    const w = aspectFactor('W')
    const ne = aspectFactor('NE')
    const nw = aspectFactor('NW')
    const n = aspectFactor('N')

    // South strongest, north weakest.
    expect(s).toBeGreaterThan(se)
    expect(se).toBeGreaterThan(e)
    expect(e).toBeGreaterThan(ne)
    expect(ne).toBeGreaterThan(n)

    // Symmetric diagonals collapse together; E/W are the neutral midpoint.
    expect(se).toBeCloseTo(sw, 10)
    expect(ne).toBeCloseTo(nw, 10)
    expect(e).toBeCloseTo(w, 10)
    expect(e).toBe(1)

    // South above neutral, north below.
    expect(s).toBeGreaterThan(1)
    expect(n).toBeLessThan(1)
  })

  it('trims and uppercases input: lowercase and whitespace match canonical', () => {
    const canonical = aspectFactor('S')
    expect(orientationFactor(PARIS, SOLSTICE_DEC, 's')).toBe(canonical)
    expect(orientationFactor(PARIS, SOLSTICE_DEC, '  S  ')).toBe(canonical)
    expect(orientationFactor(PARIS, SOLSTICE_DEC, ' se ')).toBe(
      aspectFactor('SE')
    )
  })

  it('whitespace-only and empty orientation degrade to neutral', () => {
    expect(orientationFactor(PARIS, SOLSTICE_DEC, '   ')).toBe(1)
    expect(orientationFactor(PARIS, SOLSTICE_DEC, '')).toBe(1)
  })

  it('the orientation effect is weaker in summer (high sun) than winter (low sun)', () => {
    const winterSwing = Math.abs(
      orientationFactor(PARIS, SOLSTICE_DEC, 'S') - 1
    )
    const summerSwing = Math.abs(orientationFactor(PARIS, SUMMER, 'S') - 1)
    expect(summerSwing).toBeLessThan(winterSwing)
  })

  it('stays within [0.85, 1.15] for every aspect and season', () => {
    for (const o of ['N', 'S', 'E', 'W', 'NE', 'NW', 'SE', 'SW']) {
      for (const lat of [PARIS, SYDNEY]) {
        for (const doy of [WINTER, EQUINOX, SUMMER, SOLSTICE_DEC]) {
          const f = orientationFactor(lat, doy, o)
          expect(f).toBeGreaterThanOrEqual(0.85)
          expect(f).toBeLessThanOrEqual(1.15)
        }
      }
    }
  })
})

describe('roomFitFactor — brightness monotonicity and gap boundary', () => {
  it('is non-decreasing as the room gets brighter for a fixed plant', () => {
    // lightingRating 50 (need level 3). Lux sweep spans all five room levels.
    const luxLadder = [100, 300, 1200, 6000, 30000]
    let prev = Number.NEGATIVE_INFINITY
    for (const lux of luxLadder) {
      const f = roomFitFactor(lux, 50, 'Foliage').factor
      expect(f).toBeGreaterThanOrEqual(prev)
      prev = f
    }
  })

  it('lightingRating 0-100 splits into five levels of 20 points', () => {
    const room = 2000 // level 3
    const gapAt = (rating: number) => roomFitFactor(room, rating, 'Foliage').gap
    expect([0, 20, 21, 40, 41, 60, 61, 80, 81, 100].map(gapAt)).toEqual([
      2, 2, 1, 1, 0, 0, -1, -1, -2, -2,
    ])
  })

  it('gap is exactly -2 at a dim room two levels below the plant need', () => {
    // room 100 lux => level 1; lightingRating 50 => plant level 3; gap = -2.
    const result = roomFitFactor(100, 50, 'Foliage')
    expect(result.gap).toBe(-2)
  })

  it('gap is exactly 0 when room level matches plant need exactly', () => {
    // lightingRating 70 => need 10000 lux => level 4; room 12000 => level 4.
    expect(roomFitFactor(12000, 70, 'Foliage').gap).toBe(0)
  })

  it('a positive gap raises the factor above neutral, a negative gap lowers it', () => {
    expect(roomFitFactor(40000, 10, 'Foliage').factor).toBeGreaterThan(1)
    expect(roomFitFactor(100, 90, 'Foliage').factor).toBeLessThan(1)
  })

  it('Cactus is capped at 1.05 even in a very bright over-lit room', () => {
    // Huge positive gap would push a normal plant to 1.15; CAM caps at 1.05.
    const cactus = roomFitFactor(100000, 10, 'Cactus')
    const foliage = roomFitFactor(100000, 10, 'Foliage')
    expect(cactus.factor).toBeLessThanOrEqual(1.05)
    expect(foliage.factor).toBeGreaterThan(cactus.factor)
  })

  it('the CAM cap never lowers a dim-room factor (only caps the upside)', () => {
    // A dim room already pulls the factor below 1; the cap must not touch it.
    const dim = roomFitFactor(100, 90, 'Cactus')
    expect(dim.factor).toBeLessThan(1)
    expect(dim.factor).toBeGreaterThanOrEqual(0.85)
  })

  it('factor stays within [0.85, 1.15] across the lux/rating grid', () => {
    for (const lux of [50, 100, 500, 2000, 10000, 40000, 100000]) {
      for (const rating of [10, 30, 50, 70, 90]) {
        const f = roomFitFactor(lux, rating, 'Foliage').factor
        expect(f).toBeGreaterThanOrEqual(0.85)
        expect(f).toBeLessThanOrEqual(1.15)
      }
    }
  })
})

describe('skyFactor — fallback, averaging and saturation', () => {
  it('falls back to solar radiation when cloud cover is null (high vs low)', () => {
    const sunny = skyFactor(
      makeDay({ date: '2026-02-10', solarRadiation: 28 }),
      []
    )
    const gloomy = skyFactor(
      makeDay({ date: '2026-02-10', solarRadiation: 2 }),
      []
    )
    expect(sunny).toBeGreaterThan(1)
    expect(gloomy).toBeLessThan(1)
    expect(sunny).toBeGreaterThan(gloomy)
  })

  it('cloud cover takes priority over solar radiation when both are present', () => {
    // Overcast (cloud 95) with bright radiation: cloud wins => factor < 1.
    const f = skyFactor(
      makeDay({ date: '2026-02-10', cloudCover: 95, solarRadiation: 30 }),
      []
    )
    expect(f).toBeLessThan(1)
  })

  it('averages today with the recent history window', () => {
    // Today clear, but three overcast recent days pull the average up.
    const today = makeDay({ date: '2026-02-10', cloudCover: 0 })
    const overcast = makeDay({ date: '2026-02-09', cloudCover: 100 })
    const blended = skyFactor(today, [overcast, overcast, overcast])
    const aloneClear = skyFactor(today, [])
    expect(blended).toBeLessThan(aloneClear)
    expect(blended).toBeGreaterThanOrEqual(0.92)
  })

  it('only the first 3 recent days count — a 4th is ignored', () => {
    const today = makeDay({ date: '2026-02-10', cloudCover: 50 })
    const clear = makeDay({ date: '2026-02-09', cloudCover: 0 })
    // 4th entry is wildly overcast; if it were used the average would drop.
    const overcast = makeDay({ date: '2026-02-05', cloudCover: 100 })
    const withFourth = skyFactor(today, [clear, clear, clear, overcast])
    const withoutFourth = skyFactor(today, [clear, clear, clear])
    expect(withFourth).toBe(withoutFourth)
  })

  it('saturates: cloud 100 => floor 0.92, cloud 0 => ceiling 1.08', () => {
    expect(
      skyFactor(makeDay({ date: '2026-02-10', cloudCover: 100 }), [])
    ).toBe(0.92)
    expect(skyFactor(makeDay({ date: '2026-02-10', cloudCover: 0 }), [])).toBe(
      1.08
    )
  })

  it('the solar-radiation fallback respects the same [0.92, 1.08] band', () => {
    for (const rad of [0, 5, 12, 100, 1000]) {
      const f = skyFactor(
        makeDay({ date: '2026-02-10', solarRadiation: rad }),
        []
      )
      expect(f).toBeGreaterThanOrEqual(0.92)
      expect(f).toBeLessThanOrEqual(1.08)
    }
  })

  it('a cloud reading anywhere in the window beats an all-radiation fallback', () => {
    // Today has only radiation, but a recent day has cloud cover => cloud path.
    const today = makeDay({ date: '2026-02-10', solarRadiation: 30 })
    const recent = makeDay({ date: '2026-02-09', cloudCover: 100 })
    // Cloud branch fires on the single 100% reading => below neutral.
    expect(skyFactor(today, [recent])).toBeLessThan(1)
  })
})

describe('indoorVpdFactor — monotonic dryness response', () => {
  it('null outdoor temp lands near neutral (uses the 20°C default)', () => {
    const def = indoorVpdFactor(null, 50)
    const twenty = indoorVpdFactor(20, 50)
    expect(def).toBe(twenty)
  })

  it('factor is strictly decreasing across the unsaturated temp interior', () => {
    // Colder outside => drier heated indoor air => more water. Sweep the
    // linear interior (indoor RH between its 25% floor and 55% ceiling) so the
    // response is strictly monotonic rather than flat at a clamp.
    const sweep = [3, 8, 13, 18, 21]
    let prev = Number.POSITIVE_INFINITY
    for (const temp of sweep) {
      const f = indoorVpdFactor(temp, 50)
      expect(f).toBeLessThan(prev)
      prev = f
    }
  })

  it('factor is non-increasing across the full temp range (clamps included)', () => {
    // Outside the linear interior the response flattens at the RH clamps, but
    // it must never INCREASE as the air warms.
    const sweep = [-30, -20, -10, 0, 10, 20, 30, 40]
    let prev = Number.POSITIVE_INFINITY
    for (const temp of sweep) {
      const f = indoorVpdFactor(temp, 50)
      expect(f).toBeLessThanOrEqual(prev)
      prev = f
    }
  })

  it('orders humidity ratings 10 < 50 < 90 in cold (dry) air', () => {
    const low = indoorVpdFactor(-10, 10)
    const mid = indoorVpdFactor(-10, 50)
    const high = indoorVpdFactor(-10, 90)
    expect(low).toBeLessThan(mid)
    expect(mid).toBeLessThan(high)
  })

  it('reverses the humidity ordering in warm (humid) air', () => {
    // Warm outdoor => indoor RH high => VPD < reference => factor < 1.
    // A high-humidity plant is then helped MORE (further below 1).
    const lowRating = indoorVpdFactor(35, 10)
    const highRating = indoorVpdFactor(35, 90)
    expect(highRating).toBeLessThan(lowRating)
  })

  it('clamps to the [0.85, 1.25] band at temperature extremes', () => {
    for (const temp of [-40, -20, 0, 25, 50, 80]) {
      for (const rating of [10, 30, 50, 70, 90]) {
        const f = indoorVpdFactor(temp, rating)
        expect(f).toBeGreaterThanOrEqual(0.85)
        expect(f).toBeLessThanOrEqual(1.25)
      }
    }
  })

  it('saturates above 1 in deep cold and below 1 in warm air', () => {
    expect(indoorVpdFactor(-30, 90)).toBeGreaterThan(1)
    expect(indoorVpdFactor(40, 90)).toBeLessThan(1)
  })
})
