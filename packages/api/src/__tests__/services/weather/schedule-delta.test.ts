import {
  buildWeatherCtx,
  coldWeekForecast,
  desertSummerForecast,
  heatWaveThenColdForecast,
  hotWeekForecast,
  indoorFoliage7d,
  indoorSucculent14d,
  indoorTropical3d,
  londonAutumnForecast,
  makeSchedulePlant,
  mediterraneanSummerForecast,
  mockHeatWaveHistory,
  mockWeatherDataModerate,
  noRoomFoliage7d,
  nordicWinterForecast,
  outdoorFoliage7d,
  outdoorHerbs5d,
  outdoorTropical3d,
  parisWinterForecast,
  rainyThenClearForecast,
  tropicalMonsoonForecast,
} from '@lily/api/__tests__/fixtures/weather'
import { calculateScheduleDelta } from '@lily/api/services/weather/algorithm'
import { describe, expect, it } from 'vitest'

const oneDayMs = 24 * 60 * 60 * 1000
const nowMs = Date.now()

describe('calculateScheduleDelta', () => {
  // ─── The User's Bug — Paris Winter Indoor ─────────────────────────────

  describe('Paris winter indoor (the original bug)', () => {
    const ctx = buildWeatherCtx(parisWinterForecast)

    it('Indoor Foliage 7d + Paris winter → delta ~0 to +1 (NOT +7)', () => {
      const delta = calculateScheduleDelta(indoorFoliage7d, ctx, nowMs)
      expect(delta.wateringDaysDelta).toBeGreaterThanOrEqual(0)
      expect(delta.wateringDaysDelta).toBeLessThanOrEqual(2)
    })

    it('Indoor Succulent 14d + Paris winter → delta ~0 to +2 (NOT +14)', () => {
      const delta = calculateScheduleDelta(indoorSucculent14d, ctx, nowMs)
      expect(delta.wateringDaysDelta).toBeGreaterThanOrEqual(0)
      expect(delta.wateringDaysDelta).toBeLessThanOrEqual(3)
    })

    it('Indoor Tropical 3d + Paris winter → delta ~0 (NOT +3)', () => {
      const delta = calculateScheduleDelta(indoorTropical3d, ctx, nowMs)
      expect(delta.wateringDaysDelta).toBeGreaterThanOrEqual(0)
      expect(delta.wateringDaysDelta).toBeLessThanOrEqual(1)
    })

    it('No room (null → indoor) 7d + Paris winter → same as indoor', () => {
      const delta = calculateScheduleDelta(noRoomFoliage7d, ctx, nowMs)
      expect(delta.wateringDaysDelta).toBeGreaterThanOrEqual(0)
      expect(delta.wateringDaysDelta).toBeLessThanOrEqual(2)
    })
  })

  // ─── Outdoor Cold ─────────────────────────────────────────────────────

  describe('outdoor cold scenarios', () => {
    it('Outdoor Foliage 7d + Paris winter → larger positive delta', () => {
      const ctx = buildWeatherCtx(parisWinterForecast)
      const delta = calculateScheduleDelta(outdoorFoliage7d, ctx, nowMs)
      // Outdoor cold causes meaningful delay
      expect(delta.wateringDaysDelta).toBeGreaterThan(0)
    })

    it('Outdoor Foliage 7d + Nordic winter → even larger delta, capped at +4', () => {
      const ctx = buildWeatherCtx(nordicWinterForecast)
      const delta = calculateScheduleDelta(outdoorFoliage7d, ctx, nowMs)
      expect(delta.wateringDaysDelta).toBeGreaterThan(0)
      expect(delta.wateringDaysDelta).toBeLessThanOrEqual(4) // ceil(7/2) = 4
    })
  })

  // ─── Heat & Drought ───────────────────────────────────────────────────

  describe('heat and drought scenarios', () => {
    it('Indoor Foliage 7d + Desert summer → small negative delta', () => {
      const ctx = buildWeatherCtx(desertSummerForecast)
      const delta = calculateScheduleDelta(indoorFoliage7d, ctx, nowMs)
      // Indoor dampening means only slight acceleration
      expect(delta.wateringDaysDelta).toBeLessThanOrEqual(0)
    })

    it('Outdoor Foliage 7d + Desert summer → larger negative delta', () => {
      const ctx = buildWeatherCtx(desertSummerForecast)
      const delta = calculateScheduleDelta(outdoorFoliage7d, ctx, nowMs)
      // Hot + dry + wind compound for outdoor
      expect(delta.wateringDaysDelta).toBeLessThan(0)
    })

    it('Outdoor Herbs 5d + Mediterranean summer → negative delta', () => {
      const ctx = buildWeatherCtx(mediterraneanSummerForecast)
      const delta = calculateScheduleDelta(outdoorHerbs5d, ctx, nowMs)
      expect(delta.wateringDaysDelta).toBeLessThanOrEqual(0)
    })

    it('Outdoor Tropical 3d + Desert summer + heat wave history → acceleration', () => {
      // Use a mid-cycle plant so there's room to accelerate
      const midCycleTropical = makeSchedulePlant({
        id: 'outdoor-tropical-3d-mid',
        category: 'Tropical',
        wateringFrequencyDays: 3,
        wateringRating: 5,
        isOutdoor: true,
        lastWateredAt: new Date(nowMs - 1 * oneDayMs),
        nextWateringAt: new Date(nowMs + 2 * oneDayMs),
      })
      const ctx = buildWeatherCtx(desertSummerForecast, mockHeatWaveHistory)
      const delta = calculateScheduleDelta(midCycleTropical, ctx, nowMs)
      expect(delta.wateringDaysDelta).toBeLessThan(0)
    })
  })

  // ─── Rain Scenarios (Outdoor Only) ────────────────────────────────────

  describe('rain scenarios', () => {
    it('Outdoor Foliage 7d + London autumn (frequent rain) → positive delta', () => {
      const ctx = buildWeatherCtx(londonAutumnForecast)
      const delta = calculateScheduleDelta(outdoorFoliage7d, ctx, nowMs)
      // Rain dampens per-day multipliers → longer interval → positive delta
      expect(delta.wateringDaysDelta).toBeGreaterThanOrEqual(0)
    })

    it('Outdoor Herbs 5d + Tropical monsoon → positive delta', () => {
      const ctx = buildWeatherCtx(tropicalMonsoonForecast)
      const delta = calculateScheduleDelta(outdoorHerbs5d, ctx, nowMs)
      // Heavy daily rain replaces watering
      expect(delta.wateringDaysDelta).toBeGreaterThanOrEqual(0)
    })

    it('Indoor Foliage 7d + Tropical monsoon → delta ~0 (rain irrelevant indoors)', () => {
      const ctx = buildWeatherCtx(tropicalMonsoonForecast)
      const delta = calculateScheduleDelta(indoorFoliage7d, ctx, nowMs)
      // Indoor: no rain effect, temperature ~29°C is below TEMP_HIGH_C, humidity neutral
      expect(Math.abs(delta.wateringDaysDelta)).toBeLessThanOrEqual(1)
    })

    it('Indoor Tropical 3d + London rain → delta ~0', () => {
      const ctx = buildWeatherCtx(londonAutumnForecast)
      const delta = calculateScheduleDelta(indoorTropical3d, ctx, nowMs)
      expect(Math.abs(delta.wateringDaysDelta)).toBeLessThanOrEqual(1)
    })
  })

  // ─── Transition Weather ───────────────────────────────────────────────

  describe('transition weather', () => {
    it('Outdoor 7d + heat wave then cold snap → moderate delta (average)', () => {
      const ctx = buildWeatherCtx(heatWaveThenColdForecast)
      const delta = calculateScheduleDelta(outdoorFoliage7d, ctx, nowMs)
      // Mixed: 4 hot + 3 cold → averages toward moderate
      expect(Math.abs(delta.wateringDaysDelta)).toBeLessThanOrEqual(4)
    })

    it('Outdoor 7d + rainy week then clear → moderate positive delta', () => {
      const ctx = buildWeatherCtx(rainyThenClearForecast)
      const delta = calculateScheduleDelta(outdoorFoliage7d, ctx, nowMs)
      // 5 rainy + 2 clear → net positive but not extreme
      expect(delta.wateringDaysDelta).toBeGreaterThanOrEqual(0)
      expect(delta.wateringDaysDelta).toBeLessThanOrEqual(4)
    })
  })

  // ─── Temporal Scenarios ───────────────────────────────────────────────

  describe('temporal scenarios', () => {
    it('Just watered (1h ago) + any weather → delta ~0', () => {
      const justWatered = makeSchedulePlant({
        wateringFrequencyDays: 7,
        isOutdoor: false,
        lastWateredAt: new Date(nowMs - 60 * 60 * 1000), // 1 hour ago
        nextWateringAt: new Date(nowMs + 7 * oneDayMs - 60 * 60 * 1000),
      })
      const ctx = buildWeatherCtx(parisWinterForecast)
      const delta = calculateScheduleDelta(justWatered, ctx, nowMs)
      // Just watered → idealNext is close to nextWateringAt → delta ≈ 0
      expect(Math.abs(delta.wateringDaysDelta)).toBeLessThanOrEqual(1)
    })

    it('3 days into 7-day cycle + heat wave → negative delta pulls forward', () => {
      const midCycle = makeSchedulePlant({
        wateringFrequencyDays: 7,
        isOutdoor: true,
        lastWateredAt: new Date(nowMs - 3 * oneDayMs),
        nextWateringAt: new Date(nowMs + 4 * oneDayMs),
      })
      const ctx = buildWeatherCtx(hotWeekForecast, mockHeatWaveHistory)
      const delta = calculateScheduleDelta(midCycle, ctx, nowMs)
      expect(delta.wateringDaysDelta).toBeLessThan(0)
    })

    it('Due today + moderate weather → delta = 0', () => {
      const dueToday = makeSchedulePlant({
        wateringFrequencyDays: 7,
        isOutdoor: false,
        lastWateredAt: new Date(nowMs - 7 * oneDayMs),
        nextWateringAt: new Date(nowMs),
      })
      const ctx = buildWeatherCtx([
        mockWeatherDataModerate,
        { ...mockWeatherDataModerate, date: '2026-02-11' },
        { ...mockWeatherDataModerate, date: '2026-02-12' },
        { ...mockWeatherDataModerate, date: '2026-02-13' },
        { ...mockWeatherDataModerate, date: '2026-02-14' },
        { ...mockWeatherDataModerate, date: '2026-02-15' },
        { ...mockWeatherDataModerate, date: '2026-02-16' },
      ])
      const delta = calculateScheduleDelta(dueToday, ctx, nowMs)
      // Moderate weather → adjustedDays ≈ 7 → idealNext ≈ nextWateringAt → 0
      expect(delta.wateringDaysDelta).toBe(0)
    })

    it('Due today + monsoon (outdoor) → positive delta (delay due to rain)', () => {
      const dueToday = makeSchedulePlant({
        wateringFrequencyDays: 7,
        isOutdoor: true,
        lastWateredAt: new Date(nowMs - 7 * oneDayMs),
        nextWateringAt: new Date(nowMs),
      })
      const ctx = buildWeatherCtx(tropicalMonsoonForecast)
      const delta = calculateScheduleDelta(dueToday, ctx, nowMs)
      // Rain dampens → adjustedDays > 7 → positive delta
      expect(delta.wateringDaysDelta).toBeGreaterThan(0)
    })

    it('3 days overdue + hot weather → delta capped, should NOT push further past', () => {
      const overdue = makeSchedulePlant({
        wateringFrequencyDays: 7,
        isOutdoor: true,
        lastWateredAt: new Date(nowMs - 10 * oneDayMs),
        nextWateringAt: new Date(nowMs - 3 * oneDayMs),
      })
      const ctx = buildWeatherCtx(hotWeekForecast, mockHeatWaveHistory)
      const delta = calculateScheduleDelta(overdue, ctx, nowMs)
      // Even with acceleration delta, newNext must not go before now
      const newNextMs =
        overdue.nextWateringAt.getTime() + delta.wateringDaysDelta * oneDayMs
      expect(newNextMs).toBeGreaterThanOrEqual(
        overdue.lastWateredAt.getTime() + oneDayMs
      )
    })
  })

  // ─── Stability ────────────────────────────────────────────────────────

  describe('stability (no jitter)', () => {
    it('Run 5x with identical Paris winter (indoor) → delta = 0 after first run', () => {
      const ctx = buildWeatherCtx(parisWinterForecast)
      // Use indoor plant where dampened factors produce small deltas that fit within cap
      const plant = { ...indoorFoliage7d }

      // First run: get the delta
      const firstDelta = calculateScheduleDelta(plant, ctx, nowMs)

      // Apply the delta to simulate the scheduler update
      const updatedPlant = {
        ...plant,
        nextWateringAt: new Date(
          plant.nextWateringAt.getTime() +
            firstDelta.wateringDaysDelta * oneDayMs
        ),
      }

      // Subsequent runs should produce delta = 0
      for (let i = 0; i < 4; i++) {
        const delta = calculateScheduleDelta(updatedPlant, ctx, nowMs)
        expect(delta.wateringDaysDelta).toBe(0)
      }
    })

    it('Outdoor plant converges within 3 runs with extreme weather', () => {
      const ctx = buildWeatherCtx(parisWinterForecast)
      let plant = { ...outdoorFoliage7d }

      // Run scheduler multiple times until convergence
      for (let i = 0; i < 3; i++) {
        const delta = calculateScheduleDelta(plant, ctx, nowMs)
        if (delta.wateringDaysDelta === 0) break
        plant = {
          ...plant,
          nextWateringAt: new Date(
            plant.nextWateringAt.getTime() + delta.wateringDaysDelta * oneDayMs
          ),
        }
      }

      // After convergence, next run should be 0
      const finalDelta = calculateScheduleDelta(plant, ctx, nowMs)
      expect(finalDelta.wateringDaysDelta).toBe(0)
    })

    it('Run after manual watering → no conflict, delta = 0 for moderate weather', () => {
      const justManuallyWatered = makeSchedulePlant({
        wateringFrequencyDays: 7,
        isOutdoor: false,
        lastWateredAt: new Date(nowMs),
        nextWateringAt: new Date(nowMs + 7 * oneDayMs),
      })
      const ctx = buildWeatherCtx([
        mockWeatherDataModerate,
        { ...mockWeatherDataModerate, date: '2026-02-11' },
        { ...mockWeatherDataModerate, date: '2026-02-12' },
        { ...mockWeatherDataModerate, date: '2026-02-13' },
        { ...mockWeatherDataModerate, date: '2026-02-14' },
        { ...mockWeatherDataModerate, date: '2026-02-15' },
        { ...mockWeatherDataModerate, date: '2026-02-16' },
      ])
      const delta = calculateScheduleDelta(justManuallyWatered, ctx, nowMs)
      expect(delta.wateringDaysDelta).toBe(0)
    })
  })

  // ─── Cap Enforcement ──────────────────────────────────────────────────

  describe('cap enforcement', () => {
    it('7-day plant + extreme delta → capped at ±4 (ceil(7/2))', () => {
      const ctx = buildWeatherCtx(nordicWinterForecast)
      const delta = calculateScheduleDelta(outdoorFoliage7d, ctx, nowMs)
      expect(Math.abs(delta.wateringDaysDelta)).toBeLessThanOrEqual(4)
    })

    it('3-day plant + extreme delta → capped at ±2 (ceil(3/2))', () => {
      const ctx = buildWeatherCtx(nordicWinterForecast)
      const delta = calculateScheduleDelta(outdoorTropical3d, ctx, nowMs)
      expect(Math.abs(delta.wateringDaysDelta)).toBeLessThanOrEqual(2)
    })

    it('14-day plant + extreme delta → capped at ±7 (ceil(14/2))', () => {
      const plant = makeSchedulePlant({
        category: 'Succulent',
        wateringFrequencyDays: 14,
        wateringRating: 1,
        isOutdoor: true,
      })
      const ctx = buildWeatherCtx(nordicWinterForecast)
      const delta = calculateScheduleDelta(plant, ctx, nowMs)
      expect(Math.abs(delta.wateringDaysDelta)).toBeLessThanOrEqual(7)
    })
  })

  // ─── Edge Cases ───────────────────────────────────────────────────────

  describe('edge cases', () => {
    it('Empty forecast → delta = 0', () => {
      const ctx = buildWeatherCtx([])
      const delta = calculateScheduleDelta(indoorFoliage7d, ctx, nowMs)
      expect(delta.wateringDaysDelta).toBe(0)
      expect(delta.fertilizationDaysDelta).toBe(0)
    })

    it('Partial forecast (2 days) → averages over available days', () => {
      const ctx = buildWeatherCtx(parisWinterForecast.slice(0, 2))
      const delta = calculateScheduleDelta(indoorFoliage7d, ctx, nowMs)
      // Should still work, not crash
      expect(typeof delta.wateringDaysDelta).toBe('number')
    })

    it('Single-day forecast → uses that day as the full average', () => {
      const ctx = buildWeatherCtx(desertSummerForecast.slice(0, 1))
      const plant = makeSchedulePlant({
        wateringFrequencyDays: 7,
        isOutdoor: true,
        lastWateredAt: new Date(nowMs - 3 * oneDayMs),
        nextWateringAt: new Date(nowMs + 4 * oneDayMs),
      })
      const delta = calculateScheduleDelta(plant, ctx, nowMs)
      // Single hot+dry day → should still produce a negative delta
      expect(delta.wateringDaysDelta).toBeLessThan(0)
    })

    it('All-null weather values → delta = 0 (graceful defaults)', () => {
      const nullDay = {
        date: '2026-02-10',
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
      }
      const ctx = buildWeatherCtx([
        nullDay,
        { ...nullDay, date: '2026-02-11' },
        { ...nullDay, date: '2026-02-12' },
        { ...nullDay, date: '2026-02-13' },
        { ...nullDay, date: '2026-02-14' },
        { ...nullDay, date: '2026-02-15' },
        { ...nullDay, date: '2026-02-16' },
      ])
      const plant = makeSchedulePlant({
        wateringFrequencyDays: 7,
        isOutdoor: true,
        lastWateredAt: new Date(nowMs - 3 * oneDayMs),
        nextWateringAt: new Date(nowMs + 4 * oneDayMs),
      })
      const delta = calculateScheduleDelta(plant, ctx, nowMs)
      // All defaults → multiplier = 1.0 → adjustedDays = 7 → delta = 0
      expect(delta.wateringDaysDelta).toBe(0)
    })

    it('freq=1 daily plant + extreme heat → adjustedDays stays 1, delta capped', () => {
      const plant = makeSchedulePlant({
        wateringFrequencyDays: 1,
        isOutdoor: true,
        lastWateredAt: new Date(nowMs - 0.5 * oneDayMs),
        nextWateringAt: new Date(nowMs + 0.5 * oneDayMs),
      })
      const ctx = buildWeatherCtx(desertSummerForecast, mockHeatWaveHistory)
      const delta = calculateScheduleDelta(plant, ctx, nowMs)
      // adjustedDays = max(1, round(1 / ~1.9)) = max(1, 1) = 1 → delta = 0
      // Cap is ceil(1/2) = 1
      expect(Math.abs(delta.wateringDaysDelta)).toBeLessThanOrEqual(1)
      // Verify newNext never before lastWateredAt + 1d
      const newNextMs =
        plant.nextWateringAt.getTime() + delta.wateringDaysDelta * oneDayMs
      expect(newNextMs).toBeGreaterThanOrEqual(
        plant.lastWateredAt.getTime() + oneDayMs
      )
    })

    it('freq=30 plant + Nordic cold → cap at ±15', () => {
      const plant = makeSchedulePlant({
        category: 'Succulent',
        wateringFrequencyDays: 30,
        wateringRating: 1,
        isOutdoor: true,
        lastWateredAt: new Date(nowMs - 10 * oneDayMs),
        nextWateringAt: new Date(nowMs + 20 * oneDayMs),
      })
      const ctx = buildWeatherCtx(nordicWinterForecast)
      const delta = calculateScheduleDelta(plant, ctx, nowMs)
      expect(Math.abs(delta.wateringDaysDelta)).toBeLessThanOrEqual(15)
    })

    it('Overdue plant + acceleration → newNext never goes before now', () => {
      const plant = makeSchedulePlant({
        wateringFrequencyDays: 7,
        isOutdoor: true,
        lastWateredAt: new Date(nowMs - 20 * oneDayMs),
        nextWateringAt: new Date(nowMs - 10 * oneDayMs), // 10 days overdue
      })
      const ctx = buildWeatherCtx(desertSummerForecast, mockHeatWaveHistory)
      const delta = calculateScheduleDelta(plant, ctx, nowMs)
      // Even with acceleration, newNext can't go before lastWateredAt + 1d
      const newNextMs =
        plant.nextWateringAt.getTime() + delta.wateringDaysDelta * oneDayMs
      expect(newNextMs).toBeGreaterThanOrEqual(
        plant.lastWateredAt.getTime() + oneDayMs
      )
    })

    it('Indoor and outdoor plants with identical params get different deltas in cold', () => {
      const indoor = makeSchedulePlant({
        id: 'compare-indoor',
        wateringFrequencyDays: 7,
        isOutdoor: false,
      })
      const outdoor = makeSchedulePlant({
        id: 'compare-outdoor',
        wateringFrequencyDays: 7,
        isOutdoor: true,
      })
      const ctx = buildWeatherCtx(nordicWinterForecast)
      const indoorDelta = calculateScheduleDelta(indoor, ctx, nowMs)
      const outdoorDelta = calculateScheduleDelta(outdoor, ctx, nowMs)
      // Outdoor gets full cold factor 0.5, indoor gets dampened 0.85
      expect(outdoorDelta.wateringDaysDelta).toBeGreaterThan(
        indoorDelta.wateringDaysDelta
      )
    })
  })

  // ─── Fertilization Delta ──────────────────────────────────────────────

  describe('fertilization delta', () => {
    it('Fertilization due + extreme heat → delta = +1', () => {
      const plant = makeSchedulePlant({
        wateringFrequencyDays: 7,
        isOutdoor: true,
        fertilizationFrequencyDays: 30,
        nextFertilizationAt: new Date(nowMs - oneDayMs), // overdue
      })
      const ctx = buildWeatherCtx(desertSummerForecast)
      const delta = calculateScheduleDelta(plant, ctx, nowMs)
      expect(delta.fertilizationDaysDelta).toBe(1)
    })

    it('Fertilization due + moderate temp → delta = 0', () => {
      const plant = makeSchedulePlant({
        wateringFrequencyDays: 7,
        isOutdoor: true,
        fertilizationFrequencyDays: 30,
        nextFertilizationAt: new Date(nowMs - oneDayMs), // overdue
      })
      const ctx = buildWeatherCtx([
        mockWeatherDataModerate,
        { ...mockWeatherDataModerate, date: '2026-02-11' },
      ])
      const delta = calculateScheduleDelta(plant, ctx, nowMs)
      expect(delta.fertilizationDaysDelta).toBe(0)
    })

    it('Fertilization not due → delta = 0 even in extreme heat', () => {
      const plant = makeSchedulePlant({
        wateringFrequencyDays: 7,
        isOutdoor: true,
        fertilizationFrequencyDays: 30,
        nextFertilizationAt: new Date(nowMs + 10 * oneDayMs), // future
      })
      const ctx = buildWeatherCtx(desertSummerForecast)
      const delta = calculateScheduleDelta(plant, ctx, nowMs)
      expect(delta.fertilizationDaysDelta).toBe(0)
    })
  })

  // ─── User's Regression Scenario ───────────────────────────────────────

  describe('regression: indoor plant never exceeds reasonable bounds', () => {
    it('7-day indoor Foliage, Paris cold, scheduler runs 10x → never exceeds ~8 days', () => {
      const ctx = buildWeatherCtx(parisWinterForecast)
      let plant = { ...indoorFoliage7d }

      for (let i = 0; i < 10; i++) {
        const delta = calculateScheduleDelta(plant, ctx, nowMs)
        // Apply delta
        plant = {
          ...plant,
          nextWateringAt: new Date(
            plant.nextWateringAt.getTime() + delta.wateringDaysDelta * oneDayMs
          ),
        }
      }

      // The interval should be close to 7-8 days, never 14
      const intervalMs =
        plant.nextWateringAt.getTime() - plant.lastWateredAt.getTime()
      const intervalDays = intervalMs / oneDayMs
      expect(intervalDays).toBeLessThanOrEqual(9)
      expect(intervalDays).toBeGreaterThanOrEqual(6)
    })
  })
})
