/**
 * Astronomy-focused unit tests for the indoor light/growth model.
 *
 * These exhaustively probe the three pure astronomy primitives:
 *   - dayLengthHours        (FAO-56 eq. 25, with the acos polar clamp)
 *   - solarNoonElevationDeg (floored at 0, hemisphere-symmetric)
 *   - dayOfYearFromIso      (1..366, leap-year aware, None on garbage)
 *
 * Day-of-year is pinned via explicit dates so assertions are deterministic.
 * Hour/angle assertions use toBeCloseTo; everything else is directional /
 * bounds / monotonicity so the suite survives constant tuning.
 */
import {
  dayLengthHours,
  dayOfYearFromIso,
  solarNoonElevationDeg,
} from '@lily/api/services/weather/algorithm'
import { Option } from 'effect'
import { describe, expect, it } from 'vitest'

const PARIS = 48.86
const SYDNEY = -33.87
const EQUATOR = 0
const TROMSO = 69.65 // far-north Norway: polar night / midnight sun
const ANTARCTICA = -78 // far-south: seasons flipped vs Tromsø

// Astronomical landmarks expressed as day-of-year (the model's input unit).
// The FAO-56 declination sine crosses zero at these day-of-year values, so
// they are this model's true equinoxes (declination ≈ 0 → ~12h everywhere).
const EQUINOX_MAR = 81 // ~Mar 22
const EQUINOX_SEP = 263 // ~Sep 20
const SOLSTICE_JUN = 172 // ~Jun 21 (N summer / S winter)
const SOLSTICE_DEC = 355 // ~Dec 21 (N winter / S summer)

describe('dayLengthHours — equinoxes give ~12h everywhere', () => {
  it('March equinox is ~12h at every latitude', () => {
    for (const lat of [PARIS, SYDNEY, EQUATOR, TROMSO, ANTARCTICA]) {
      expect(dayLengthHours(lat, EQUINOX_MAR)).toBeCloseTo(12, 0)
    }
  })

  it('September equinox is ~12h at every latitude', () => {
    for (const lat of [PARIS, SYDNEY, EQUATOR, TROMSO, ANTARCTICA]) {
      expect(dayLengthHours(lat, EQUINOX_SEP)).toBeCloseTo(12, 0)
    }
  })
})

describe('dayLengthHours — equator is ~12h year-round', () => {
  it('holds 12h across the whole calendar', () => {
    for (let doy = 1; doy <= 366; doy += 15) {
      expect(dayLengthHours(EQUATOR, doy)).toBeCloseTo(12, 0)
    }
  })

  it('latitude exactly 0 is symmetric between the two solstices', () => {
    const jun = dayLengthHours(0, SOLSTICE_JUN)
    const dec = dayLengthHours(0, SOLSTICE_DEC)
    // Both essentially 12h, so their difference is negligible.
    expect(Math.abs(jun - dec)).toBeLessThan(0.2)
  })
})

describe('dayLengthHours — hemispheres are mirror images', () => {
  it('Paris and a southern twin swap long/short across the solstices', () => {
    const parisJun = dayLengthHours(PARIS, SOLSTICE_JUN)
    const parisDec = dayLengthHours(PARIS, SOLSTICE_DEC)
    const southJun = dayLengthHours(-PARIS, SOLSTICE_JUN)
    const southDec = dayLengthHours(-PARIS, SOLSTICE_DEC)

    // Northern June ~= Southern December (both that hemisphere's summer).
    expect(parisJun).toBeCloseTo(southDec, 1)
    expect(parisDec).toBeCloseTo(southJun, 1)
    // And each hemisphere's summer is longer than its own winter.
    expect(parisJun).toBeGreaterThan(parisDec)
    expect(southDec).toBeGreaterThan(southJun)
  })

  it('Tromsø (midnight sun in June) and Antarctica (polar day in December) flip', () => {
    const tromsoJun = dayLengthHours(TROMSO, SOLSTICE_JUN)
    const tromsoDec = dayLengthHours(TROMSO, SOLSTICE_DEC)
    const antDec = dayLengthHours(ANTARCTICA, SOLSTICE_DEC)
    const antJun = dayLengthHours(ANTARCTICA, SOLSTICE_JUN)

    expect(tromsoJun).toBeCloseTo(24, 1) // midnight sun
    expect(tromsoDec).toBeCloseTo(0, 1) // polar night
    expect(antDec).toBeCloseTo(24, 1) // southern polar day
    expect(antJun).toBeCloseTo(0, 1) // southern polar night
  })
})

describe('dayLengthHours — polar acos clamp keeps output finite & in [0,24]', () => {
  it('never NaN and always within [0, 24] across an extreme grid', () => {
    for (const lat of [-89, -78, -45, 0, 45, 78, 89]) {
      for (let doy = 1; doy <= 366; doy += 10) {
        const h = dayLengthHours(lat, doy)
        expect(Number.isNaN(h)).toBe(false)
        expect(Number.isFinite(h)).toBe(true)
        expect(h).toBeGreaterThanOrEqual(0)
        expect(h).toBeLessThanOrEqual(24)
      }
    }
  })

  it('a near-pole latitude saturates fully to polar night and midnight sun', () => {
    expect(dayLengthHours(89, SOLSTICE_DEC)).toBeCloseTo(0, 1)
    expect(dayLengthHours(89, SOLSTICE_JUN)).toBeCloseTo(24, 1)
  })
})

describe('dayLengthHours — Paris rises monotonically Dec→Jun solstice', () => {
  it('lengthens (mostly) day by day from the winter to the summer solstice', () => {
    // Sample the half-year window and assert the run is non-decreasing.
    let prev = dayLengthHours(PARIS, SOLSTICE_DEC)
    // Wrap past New Year: Dec 21 (355) → Jun 21 (172) is ~182 days.
    for (let offset = 5; offset <= 180; offset += 5) {
      const doy = ((SOLSTICE_DEC - 1 + offset) % 365) + 1
      const h = dayLengthHours(PARIS, doy)
      // Allow a tiny epsilon for floating-point at the sampling resolution.
      expect(h).toBeGreaterThanOrEqual(prev - 0.05)
      prev = h
    }
    // End of the climb is firmly in long-summer-day territory.
    expect(prev).toBeGreaterThan(15)
  })
})

describe('solarNoonElevationDeg — floored at 0, summer > winter', () => {
  it('is never negative, even in deep high-latitude winter', () => {
    for (const lat of [PARIS, TROMSO, 80, -80]) {
      for (let doy = 1; doy <= 366; doy += 11) {
        expect(solarNoonElevationDeg(lat, doy)).toBeGreaterThanOrEqual(0)
      }
    }
  })

  it('Paris noon sun is higher in summer than winter', () => {
    const summer = solarNoonElevationDeg(PARIS, SOLSTICE_JUN)
    const winter = solarNoonElevationDeg(PARIS, SOLSTICE_DEC)
    expect(summer).toBeGreaterThan(winter)
    expect(winter).toBeGreaterThanOrEqual(0)
  })

  it('Tromsø winter noon sun is clamped to the 0 floor', () => {
    // At 69.65°N the December noon sun is below the horizon → floored at 0.
    expect(solarNoonElevationDeg(TROMSO, SOLSTICE_DEC)).toBe(0)
  })

  it('the equator peaks at the equinoxes (~90° overhead)', () => {
    const mar = solarNoonElevationDeg(EQUATOR, EQUINOX_MAR)
    const sep = solarNoonElevationDeg(EQUATOR, EQUINOX_SEP)
    expect(mar).toBeCloseTo(90, 0)
    expect(sep).toBeCloseTo(90, 0)
    // Solstices push the sub-solar point ~23° off the equator → lower noon sun.
    expect(solarNoonElevationDeg(EQUATOR, SOLSTICE_JUN)).toBeLessThan(mar)
  })

  it('is hemisphere-symmetric for mirror-image latitude/season pairs', () => {
    // Paris in N summer should match its southern twin in S summer.
    const north = solarNoonElevationDeg(PARIS, SOLSTICE_JUN)
    const south = solarNoonElevationDeg(-PARIS, SOLSTICE_DEC)
    expect(north).toBeCloseTo(south, 1)
  })

  it('never exceeds 90° (sun cannot pass the zenith)', () => {
    for (const lat of [0, 10, 23, -23, 48, -48]) {
      for (let doy = 1; doy <= 366; doy += 13) {
        expect(solarNoonElevationDeg(lat, doy)).toBeLessThanOrEqual(90)
      }
    }
  })
})

describe('dayOfYearFromIso — leap-year aware day numbering', () => {
  it('January 1 is day 1', () => {
    expect(dayOfYearFromIso('2026-01-01')).toEqual(Option.some(1))
    expect(dayOfYearFromIso('2024-01-01')).toEqual(Option.some(1))
  })

  it('leap day 2024-02-29 is day 60', () => {
    expect(dayOfYearFromIso('2024-02-29')).toEqual(Option.some(60))
  })

  it('March 1 is day 60 in a non-leap year (no Feb 29 to shift it)', () => {
    expect(dayOfYearFromIso('2026-03-01')).toEqual(Option.some(60))
  })

  it('March 1 is day 61 in a leap year (shifted by Feb 29)', () => {
    expect(dayOfYearFromIso('2024-03-01')).toEqual(Option.some(61))
  })

  it('end of a leap year is day 366, non-leap year is day 365', () => {
    expect(dayOfYearFromIso('2024-12-31')).toEqual(Option.some(366))
    expect(dayOfYearFromIso('2026-12-31')).toEqual(Option.some(365))
  })

  it('a full ISO datetime string still resolves to its calendar day', () => {
    expect(dayOfYearFromIso('2026-02-10T13:45:00.000Z')).toEqual(
      Option.some(41)
    )
  })

  it('every result across a year is a whole number in [1, 366]', () => {
    for (const month of [1, 4, 7, 10, 12]) {
      for (const day of [1, 15, 28]) {
        const iso = `2024-${String(month).padStart(2, '0')}-${String(
          day
        ).padStart(2, '0')}`
        const doy = dayOfYearFromIso(iso)
        expect(Option.isSome(doy)).toBe(true)
        const value = Option.getOrThrow(doy)
        expect(Number.isInteger(value)).toBe(true)
        expect(value).toBeGreaterThanOrEqual(1)
        expect(value).toBeLessThanOrEqual(366)
      }
    }
  })

  it('is strictly increasing within a single year', () => {
    const jan = Option.getOrThrow(dayOfYearFromIso('2026-01-15'))
    const jun = Option.getOrThrow(dayOfYearFromIso('2026-06-15'))
    const dec = Option.getOrThrow(dayOfYearFromIso('2026-12-15'))
    expect(jan).toBeLessThan(jun)
    expect(jun).toBeLessThan(dec)
  })

  it('returns None for an empty string', () => {
    expect(Option.isNone(dayOfYearFromIso(''))).toBe(true)
  })

  it('returns None for malformed / non-date input', () => {
    for (const bad of ['not-a-date', 'garbage', '2026-13-99', 'banana']) {
      expect(Option.isNone(dayOfYearFromIso(bad))).toBe(true)
    }
  })
})
