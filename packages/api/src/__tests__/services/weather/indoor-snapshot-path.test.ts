/**
 * The snapshot entry point `calculatePlantAdjustment(..., latitude)`. An
 * INDOOR plant with a known latitude engages the indoor demand model of
 * `@lily/shared/indoor-demand`. An OUTDOOR plant, or an indoor plant without
 * latitude, keeps the legacy temperature × humidity × wind multiplier.
 */
import {
  calculatePlantAdjustment,
  type PlantForAdjustment,
} from '@lily/api/services/weather/algorithm/adjustment'
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

const DEMAND_MIN = 0.62
const DEMAND_MAX = 1.4

const JUNE = '2026-06-21'
const DECEMBER = '2026-12-21'
const FEB = '2026-02-10'

const basePlant = (
  overrides: Partial<PlantForAdjustment> = {}
): PlantForAdjustment => ({
  id: 'plant-1',
  category: 'Foliage',
  wateringFrequencyDays: 7,
  wateringRating: 50,
  isOutdoor: false,
  lightingRating: 50,
  humidityRating: 50,
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
