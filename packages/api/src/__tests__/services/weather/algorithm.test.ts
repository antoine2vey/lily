import {
  mockForecast,
  mockForecastWithRain,
  mockHeatWaveHistory,
  mockWeatherDataCalm,
  mockWeatherDataCold,
  mockWeatherDataDry,
  mockWeatherDataExtremeCold,
  mockWeatherDataExtremeHeat,
  mockWeatherDataHot,
  mockWeatherDataHumid,
  mockWeatherDataModerate,
  mockWeatherDataRainy,
  mockWeatherDataWindy,
} from '@lily/api/__tests__/fixtures/weather'
import {
  calculatePlantAdjustment,
  type PlantForAdjustment,
} from '@lily/api/services/weather/algorithm'
import { describe, expect, it } from 'vitest'

// Standard indoor plant for testing
const defaultPlant: PlantForAdjustment = {
  id: 'plant-1',
  category: 'Foliage',
  wateringFrequencyDays: 7,
  wateringRating: 3,
  isOutdoor: false,
}

// Outdoor plant for testing weather effects
const outdoorPlant: PlantForAdjustment = {
  ...defaultPlant,
  isOutdoor: true,
}

describe('calculatePlantAdjustment', () => {
  // ─── Crop Coefficient (Kc) Tests ───────────────────────────────────────

  describe('crop coefficient mapping', () => {
    it('should use category-specific Kc for known categories', () => {
      const result = calculatePlantAdjustment(
        { ...defaultPlant, category: 'Succulent', wateringRating: 3 },
        mockWeatherDataModerate,
        []
      )
      expect(result.plantId).toBe('plant-1')
    })

    it('should use default Kc for unknown categories', () => {
      const result = calculatePlantAdjustment(
        { ...defaultPlant, category: 'UnknownPlant' },
        mockWeatherDataModerate,
        []
      )
      expect(result.plantId).toBe('plant-1')
    })

    it('should use default Kc when category is null', () => {
      const result = calculatePlantAdjustment(
        { ...defaultPlant, category: null },
        mockWeatherDataModerate,
        []
      )
      expect(result.plantId).toBe('plant-1')
    })

    it('should modify Kc based on wateringRating', () => {
      const lowRating = calculatePlantAdjustment(
        { ...defaultPlant, wateringRating: 1 },
        mockWeatherDataModerate,
        []
      )
      const highRating = calculatePlantAdjustment(
        { ...defaultPlant, wateringRating: 5 },
        mockWeatherDataModerate,
        []
      )
      expect(highRating.adjustedWateringDays).toBeLessThanOrEqual(
        lowRating.adjustedWateringDays
      )
    })
  })

  // ─── Temperature Factor Tests (Outdoor — full strength) ───────────────

  describe('temperature factor (outdoor)', () => {
    it('should return factor 1.0 for moderate temperature', () => {
      const result = calculatePlantAdjustment(
        outdoorPlant,
        mockWeatherDataModerate,
        []
      )
      expect(result.factors.temperature).toBe(1.0)
    })

    it('should return factor 1.2 for a single hot day', () => {
      const result = calculatePlantAdjustment(
        outdoorPlant,
        mockWeatherDataHot,
        []
      )
      expect(result.factors.temperature).toBe(1.2)
    })

    it('should return factor 1.5 for 3+ consecutive hot days (heat wave)', () => {
      const result = calculatePlantAdjustment(
        outdoorPlant,
        mockWeatherDataHot,
        mockHeatWaveHistory
      )
      expect(result.factors.temperature).toBe(1.5)
    })

    it('should return factor 0.5 for cold day', () => {
      const result = calculatePlantAdjustment(
        outdoorPlant,
        mockWeatherDataCold,
        []
      )
      expect(result.factors.temperature).toBe(0.5)
    })
  })

  // ─── Temperature Factor Tests (Indoor — dampened) ─────────────────────

  describe('temperature factor (indoor dampening)', () => {
    it('should return factor 1.0 for moderate temperature', () => {
      const result = calculatePlantAdjustment(
        defaultPlant,
        mockWeatherDataModerate,
        []
      )
      expect(result.factors.temperature).toBe(1.0)
    })

    it('should return dampened factor 1.1 for indoor hot day (not 1.2)', () => {
      const result = calculatePlantAdjustment(
        defaultPlant,
        mockWeatherDataHot,
        []
      )
      expect(result.factors.temperature).toBe(1.1)
    })

    it('should return dampened factor 1.15 for indoor heat wave (not 1.5)', () => {
      const result = calculatePlantAdjustment(
        defaultPlant,
        mockWeatherDataHot,
        mockHeatWaveHistory
      )
      expect(result.factors.temperature).toBe(1.15)
    })

    it('should return dampened factor 0.85 for indoor cold day (not 0.5)', () => {
      const result = calculatePlantAdjustment(
        defaultPlant,
        mockWeatherDataCold,
        []
      )
      expect(result.factors.temperature).toBe(0.85)
    })

    it('Indoor 7d + cold → adjustedDays ~8 (not 14)', () => {
      const result = calculatePlantAdjustment(
        defaultPlant,
        mockWeatherDataCold,
        []
      )
      // 7 / 0.85 ≈ 8.2 → rounds to 8
      expect(result.adjustedWateringDays).toBe(8)
    })
  })

  // ─── Humidity Factor Tests ─────────────────────────────────────────────

  describe('humidity factor (outdoor)', () => {
    it('should return factor 0.85 for high humidity (>80%)', () => {
      const result = calculatePlantAdjustment(
        outdoorPlant,
        mockWeatherDataHumid,
        []
      )
      expect(result.factors.humidity).toBe(0.85)
    })

    it('should return factor 1.15 for low humidity (<50%)', () => {
      const result = calculatePlantAdjustment(
        outdoorPlant,
        mockWeatherDataDry,
        []
      )
      expect(result.factors.humidity).toBe(1.15)
    })

    it('should return factor 1.0 for normal humidity', () => {
      const result = calculatePlantAdjustment(
        outdoorPlant,
        mockWeatherDataModerate,
        []
      )
      expect(result.factors.humidity).toBe(1.0)
    })
  })

  describe('humidity factor (indoor — always 1.0)', () => {
    it('should return factor 1.0 for indoor plant even with high humidity', () => {
      const result = calculatePlantAdjustment(
        defaultPlant,
        mockWeatherDataHumid,
        []
      )
      expect(result.factors.humidity).toBe(1.0)
    })

    it('should return factor 1.0 for indoor plant even with low humidity', () => {
      const result = calculatePlantAdjustment(
        defaultPlant,
        mockWeatherDataDry,
        []
      )
      expect(result.factors.humidity).toBe(1.0)
    })

    it('should return factor 1.0 for indoor plant with normal humidity', () => {
      const result = calculatePlantAdjustment(
        defaultPlant,
        mockWeatherDataModerate,
        []
      )
      expect(result.factors.humidity).toBe(1.0)
    })
  })

  // ─── Wind Factor Tests ─────────────────────────────────────────────────

  describe('wind factor', () => {
    it('should return factor 1.1 for outdoor plant in high wind (>5 m/s)', () => {
      const result = calculatePlantAdjustment(
        outdoorPlant,
        mockWeatherDataWindy,
        []
      )
      expect(result.factors.wind).toBe(1.1)
    })

    it('should return factor 0.9 for outdoor plant in low wind (<2 m/s)', () => {
      const result = calculatePlantAdjustment(
        outdoorPlant,
        mockWeatherDataCalm,
        []
      )
      expect(result.factors.wind).toBe(0.9)
    })

    it('should return factor 1.0 for outdoor plant in moderate wind', () => {
      const result = calculatePlantAdjustment(
        outdoorPlant,
        mockWeatherDataModerate,
        []
      )
      expect(result.factors.wind).toBe(1.0)
    })

    it('should return factor 1.0 for indoor plant regardless of wind', () => {
      const result = calculatePlantAdjustment(
        defaultPlant,
        mockWeatherDataWindy,
        []
      )
      expect(result.factors.wind).toBe(1.0)
    })
  })

  // ─── Precipitation Skip Tests ──────────────────────────────────────────

  describe('precipitation skip', () => {
    it('should skip watering for outdoor plant when current precipitation > 6mm', () => {
      const result = calculatePlantAdjustment(
        outdoorPlant,
        mockWeatherDataRainy,
        []
      )
      expect(result.skipWatering).toBe(true)
      expect(result.skipWateringReason).toBeDefined()
    })

    it('should skip watering for outdoor plant when tomorrow forecast has > 6mm rain', () => {
      const result = calculatePlantAdjustment(
        outdoorPlant,
        mockWeatherDataModerate,
        [],
        mockForecastWithRain.daily
      )
      expect(result.skipWatering).toBe(true)
    })

    it('should not skip watering for outdoor plant with light rain (<6mm)', () => {
      const lightRain = {
        ...mockWeatherDataModerate,
        precipitation: 3,
      }
      const result = calculatePlantAdjustment(
        outdoorPlant,
        lightRain,
        [],
        mockForecast.daily
      )
      expect(result.skipWatering).toBe(false)
    })

    it('should not skip watering for outdoor plant with no precipitation', () => {
      const result = calculatePlantAdjustment(
        outdoorPlant,
        mockWeatherDataModerate,
        [],
        mockForecast.daily
      )
      expect(result.skipWatering).toBe(false)
    })

    it('should NOT skip watering for indoor plant even with heavy rain', () => {
      const result = calculatePlantAdjustment(
        defaultPlant,
        mockWeatherDataRainy,
        []
      )
      expect(result.skipWatering).toBe(false)
    })

    it('should NOT skip watering for indoor plant even with rain forecast', () => {
      const result = calculatePlantAdjustment(
        defaultPlant,
        mockWeatherDataModerate,
        [],
        mockForecastWithRain.daily
      )
      expect(result.skipWatering).toBe(false)
    })
  })

  // ─── Fertilization Skip Tests ──────────────────────────────────────────

  describe('fertilization skip', () => {
    it('should skip fertilization in extreme heat (>30°C max)', () => {
      const result = calculatePlantAdjustment(
        defaultPlant,
        mockWeatherDataExtremeHeat,
        []
      )
      expect(result.skipFertilization).toBe(true)
      expect(result.skipFertilizationReason).toContain('too high')
    })

    it('should skip fertilization in extreme cold (<5°C min)', () => {
      const result = calculatePlantAdjustment(
        defaultPlant,
        mockWeatherDataExtremeCold,
        []
      )
      expect(result.skipFertilization).toBe(true)
      expect(result.skipFertilizationReason).toContain('too low')
    })

    it('should not skip fertilization in normal temperature', () => {
      const result = calculatePlantAdjustment(
        defaultPlant,
        mockWeatherDataModerate,
        []
      )
      expect(result.skipFertilization).toBe(false)
    })
  })

  // ─── Combined Multiplier & Clamping Tests ──────────────────────────────

  describe('combined multiplier and clamping', () => {
    it('should combine factors multiplicatively for outdoor plant', () => {
      const hotDryWindy = {
        ...mockWeatherDataHot,
        humidity: 35,
        windSpeed: 8,
      }
      const result = calculatePlantAdjustment(outdoorPlant, hotDryWindy, [])
      // 1.2 (hot) × 1.15 (dry) × 1.1 (windy) = 1.518
      expect(result.wateringMultiplier).toBeCloseTo(1.52, 1)
    })

    it('should reduce watering days for outdoor hot plant', () => {
      const result = calculatePlantAdjustment(
        outdoorPlant,
        mockWeatherDataHot,
        []
      )
      // 7 / 1.2 ≈ 6 days
      expect(result.adjustedWateringDays).toBeLessThan(7)
    })

    it('should increase watering days for outdoor cold plant', () => {
      const result = calculatePlantAdjustment(
        outdoorPlant,
        mockWeatherDataCold,
        []
      )
      // 7 / 0.5 = 14 days, clamped to 2× original = 14
      expect(result.adjustedWateringDays).toBeGreaterThan(7)
    })

    it('should clamp minimum to 1 day', () => {
      const shortFreqPlant: PlantForAdjustment = {
        ...outdoorPlant,
        wateringFrequencyDays: 1,
      }
      const result = calculatePlantAdjustment(
        shortFreqPlant,
        mockWeatherDataHot,
        mockHeatWaveHistory
      )
      expect(result.adjustedWateringDays).toBeGreaterThanOrEqual(1)
    })

    it('should clamp maximum to 2x original frequency', () => {
      const result = calculatePlantAdjustment(
        outdoorPlant,
        mockWeatherDataCold,
        []
      )
      expect(result.adjustedWateringDays).toBeLessThanOrEqual(14)
    })
  })

  // ─── Edge Cases ────────────────────────────────────────────────────────

  describe('edge cases', () => {
    it('should handle null values gracefully (use defaults)', () => {
      const nullWeather = {
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
      const result = calculatePlantAdjustment(defaultPlant, nullWeather, [])
      expect(result.factors.temperature).toBe(1.0)
      expect(result.factors.humidity).toBe(1.0)
      expect(result.factors.wind).toBe(1.0)
      expect(result.adjustedWateringDays).toBe(7)
    })

    it('should handle empty history array', () => {
      const result = calculatePlantAdjustment(
        defaultPlant,
        mockWeatherDataModerate,
        []
      )
      expect(result.factors.temperature).toBe(1.0)
    })

    it('should handle zero ET0', () => {
      const zeroEt0 = { ...mockWeatherDataModerate, et0: 0 }
      const result = calculatePlantAdjustment(defaultPlant, zeroEt0, [])
      expect(result.factors.et0).toBe(0)
    })

    it('should include the correct plantId in output', () => {
      const result = calculatePlantAdjustment(
        { ...defaultPlant, id: 'my-unique-plant' },
        mockWeatherDataModerate,
        []
      )
      expect(result.plantId).toBe('my-unique-plant')
    })

    it('should handle each plant category correctly', () => {
      const categories = [
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

      for (const category of categories) {
        const result = calculatePlantAdjustment(
          { ...defaultPlant, category },
          mockWeatherDataModerate,
          []
        )
        expect(result.plantId).toBe('plant-1')
        expect(result.adjustedWateringDays).toBeGreaterThanOrEqual(1)
      }
    })
  })
})
