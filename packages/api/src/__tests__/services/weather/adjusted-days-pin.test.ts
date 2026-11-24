/**
 * Fixed watering days from the api's two entry points, recorded before the
 * frequency clamp and the indoor demand model moved to `@lily/shared`. Two
 * cases hit the cap at twice the base. No multiplier these callers produce
 * exceeds 2, so the one-day floor is out of their reach.
 */
import {
  calculatePlantAdjustment,
  calculateScheduleDelta,
} from '@lily/api/services/weather/algorithm/adjustment'
import type { WeatherData } from '@lily/shared'
import { describe, expect, it } from 'vitest'

const day = (date: string, fields: Partial<WeatherData> = {}): WeatherData => ({
  date,
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
  ...fields,
})

const history = (date: string, fields: ReadonlyArray<Partial<WeatherData>>) =>
  fields.map((f, i) => day(`${date}-h${i}`, f))

const ADJUSTMENTS = [
  {
    name: 'indoor, Paris December, low demand, 1-day base',
    latitude: 48.86,
    date: '2026-12-21',
    today: { temperatureMean: 2 },
    history: [],
    plant: {
      category: 'Tropical',
      isOutdoor: false,
      wateringFrequencyDays: 1,
      lightingRating: 90,
      humidityRating: 50,
      roomLuminosity: 100,
      roomOrientation: 'N',
    },
    adjustedWateringDays: 1,
    wateringMultiplier: 0.78,
  },
  {
    name: 'indoor, Paris December, low demand, 7-day base',
    latitude: 48.86,
    date: '2026-12-21',
    today: { temperatureMean: 2 },
    history: [],
    plant: {
      category: 'Tropical',
      isOutdoor: false,
      wateringFrequencyDays: 7,
      lightingRating: 90,
      humidityRating: 50,
      roomLuminosity: 100,
      roomOrientation: 'N',
    },
    adjustedWateringDays: 9,
    wateringMultiplier: 0.78,
  },
  {
    name: 'indoor, Paris December, low demand, 30-day base',
    latitude: 48.86,
    date: '2026-12-21',
    today: { temperatureMean: 2 },
    history: [],
    plant: {
      category: 'Tropical',
      isOutdoor: false,
      wateringFrequencyDays: 30,
      lightingRating: 90,
      humidityRating: 50,
      roomLuminosity: 100,
      roomOrientation: 'N',
    },
    adjustedWateringDays: 39,
    wateringMultiplier: 0.78,
  },
  {
    name: 'indoor, Singapore March, high demand, 1-day base',
    latitude: 1.35,
    date: '2026-03-20',
    today: { temperatureMean: 33, cloudCover: 10 },
    history: [],
    plant: {
      category: 'Herb',
      isOutdoor: false,
      wateringFrequencyDays: 1,
      lightingRating: 70,
      humidityRating: 40,
      roomLuminosity: 40000,
      roomOrientation: 'SE',
    },
    adjustedWateringDays: 1,
    wateringMultiplier: 1.21,
  },
  {
    name: 'indoor, Singapore March, high demand, 3-day base',
    latitude: 1.35,
    date: '2026-03-20',
    today: { temperatureMean: 33, cloudCover: 10 },
    history: [],
    plant: {
      category: 'Herb',
      isOutdoor: false,
      wateringFrequencyDays: 3,
      lightingRating: 70,
      humidityRating: 40,
      roomLuminosity: 40000,
      roomOrientation: 'SE',
    },
    adjustedWateringDays: 2,
    wateringMultiplier: 1.21,
  },
  {
    name: 'indoor, Singapore March, high demand, 14-day base',
    latitude: 1.35,
    date: '2026-03-20',
    today: { temperatureMean: 33, cloudCover: 10 },
    history: [],
    plant: {
      category: 'Herb',
      isOutdoor: false,
      wateringFrequencyDays: 14,
      lightingRating: 70,
      humidityRating: 40,
      roomLuminosity: 40000,
      roomOrientation: 'SE',
    },
    adjustedWateringDays: 12,
    wateringMultiplier: 1.21,
  },
  {
    name: 'indoor, Sydney June, 10-day base',
    latitude: -33.87,
    date: '2026-06-21',
    today: { temperatureMean: 10 },
    history: [],
    plant: {
      category: 'Tropical',
      isOutdoor: false,
      wateringFrequencyDays: 10,
      lightingRating: 60,
      humidityRating: 60,
      roomLuminosity: 5000,
      roomOrientation: 'N',
    },
    adjustedWateringDays: 9,
    wateringMultiplier: 1.16,
  },
  {
    name: 'indoor, no latitude (legacy multiplier), hot day',
    latitude: null,
    date: '2026-06-21',
    today: {
      temperatureMean: 32,
      temperatureMax: 34,
      temperatureMin: 24,
      humidity: 30,
      windSpeed: 7,
    },
    history: [
      {
        temperatureMean: 32,
        temperatureMax: 34,
        temperatureMin: 24,
        humidity: 30,
        windSpeed: 7,
      },
      {
        temperatureMean: 32,
        temperatureMax: 34,
        temperatureMin: 24,
        humidity: 30,
        windSpeed: 7,
      },
      {
        temperatureMean: 32,
        temperatureMax: 34,
        temperatureMin: 24,
        humidity: 30,
        windSpeed: 7,
      },
    ],
    plant: {
      category: 'Tropical',
      isOutdoor: false,
      wateringFrequencyDays: 7,
      lightingRating: 50,
      humidityRating: 50,
      roomLuminosity: 5000,
      roomOrientation: 'S',
    },
    adjustedWateringDays: 6,
    wateringMultiplier: 1.15,
  },
  {
    name: 'outdoor, cold damp calm day, capped at twice the base',
    latitude: 48.86,
    date: '2026-12-21',
    today: {
      temperatureMean: 5,
      temperatureMax: 8,
      temperatureMin: 2,
      humidity: 92,
      windSpeed: 1,
    },
    history: [],
    plant: {
      category: 'Flowering',
      isOutdoor: true,
      wateringFrequencyDays: 7,
      lightingRating: 50,
      humidityRating: 50,
      roomLuminosity: null,
      roomOrientation: null,
    },
    adjustedWateringDays: 14,
    wateringMultiplier: 0.38,
  },
  {
    name: 'outdoor, cold damp calm day, 1-day base capped at 2',
    latitude: 48.86,
    date: '2026-12-21',
    today: {
      temperatureMean: 5,
      temperatureMax: 8,
      temperatureMin: 2,
      humidity: 92,
      windSpeed: 1,
    },
    history: [],
    plant: {
      category: 'Flowering',
      isOutdoor: true,
      wateringFrequencyDays: 1,
      lightingRating: 50,
      humidityRating: 50,
      roomLuminosity: null,
      roomOrientation: null,
    },
    adjustedWateringDays: 2,
    wateringMultiplier: 0.38,
  },
  {
    name: 'outdoor, heat wave, 1-day base',
    latitude: 48.86,
    date: '2026-06-21',
    today: {
      temperatureMean: 32,
      temperatureMax: 34,
      temperatureMin: 24,
      humidity: 30,
      windSpeed: 7,
    },
    history: [
      {
        temperatureMean: 32,
        temperatureMax: 34,
        temperatureMin: 24,
        humidity: 30,
        windSpeed: 7,
      },
      {
        temperatureMean: 32,
        temperatureMax: 34,
        temperatureMin: 24,
        humidity: 30,
        windSpeed: 7,
      },
      {
        temperatureMean: 32,
        temperatureMax: 34,
        temperatureMin: 24,
        humidity: 30,
        windSpeed: 7,
      },
    ],
    plant: {
      category: 'Flowering',
      isOutdoor: true,
      wateringFrequencyDays: 1,
      lightingRating: 50,
      humidityRating: 50,
      roomLuminosity: null,
      roomOrientation: null,
    },
    adjustedWateringDays: 1,
    wateringMultiplier: 1.9,
  },
  {
    name: 'outdoor, heat wave, 10-day base',
    latitude: 48.86,
    date: '2026-06-21',
    today: {
      temperatureMean: 32,
      temperatureMax: 34,
      temperatureMin: 24,
      humidity: 30,
      windSpeed: 7,
    },
    history: [
      {
        temperatureMean: 32,
        temperatureMax: 34,
        temperatureMin: 24,
        humidity: 30,
        windSpeed: 7,
      },
      {
        temperatureMean: 32,
        temperatureMax: 34,
        temperatureMin: 24,
        humidity: 30,
        windSpeed: 7,
      },
      {
        temperatureMean: 32,
        temperatureMax: 34,
        temperatureMin: 24,
        humidity: 30,
        windSpeed: 7,
      },
    ],
    plant: {
      category: 'Flowering',
      isOutdoor: true,
      wateringFrequencyDays: 10,
      lightingRating: 50,
      humidityRating: 50,
      roomLuminosity: null,
      roomOrientation: null,
    },
    adjustedWateringDays: 5,
    wateringMultiplier: 1.9,
  },
]

describe('calculatePlantAdjustment pinned watering days', () => {
  it.each(ADJUSTMENTS)('$name', (pin) => {
    const result = calculatePlantAdjustment(
      { id: 'pinned-plant', wateringRating: 50, ...pin.plant },
      day(pin.date, pin.today),
      history(pin.date, pin.history),
      [],
      pin.latitude
    )
    expect(result.adjustedWateringDays).toBe(pin.adjustedWateringDays)
    expect(result.wateringMultiplier).toBe(pin.wateringMultiplier)
  })
})

const NOW = 1797840000000
const DAY_MS = 86400000

const DELTAS = [
  {
    name: 'indoor, Paris December forecast, dim room',
    latitude: 48.86,
    forecast: [
      { date: '2026-12-21', fields: { temperatureMean: 2 } },
      { date: '2026-12-22', fields: { temperatureMean: 1, cloudCover: 90 } },
      { date: '2026-12-23', fields: { temperatureMean: 4, cloudCover: 70 } },
    ],
    plant: {
      category: 'Tropical',
      isOutdoor: false,
      wateringFrequencyDays: 7,
      lightingRating: 90,
      humidityRating: 50,
      roomLuminosity: 100,
      roomOrientation: 'N',
    },
    lastWateredDaysAgo: 2,
    nextWateringInDays: 5,
    wateringDaysDelta: 2,
  },
  {
    name: 'indoor, Singapore forecast, bright room',
    latitude: 1.35,
    forecast: [
      { date: '2026-12-21', fields: { temperatureMean: 31, cloudCover: 10 } },
      { date: '2026-12-22', fields: { temperatureMean: 32, cloudCover: 20 } },
    ],
    plant: {
      category: 'Herb',
      isOutdoor: false,
      wateringFrequencyDays: 10,
      lightingRating: 70,
      humidityRating: 40,
      roomLuminosity: 40000,
      roomOrientation: 'SE',
    },
    lastWateredDaysAgo: 1,
    nextWateringInDays: 9,
    wateringDaysDelta: -2,
  },
  {
    name: 'outdoor, cold damp calm forecast',
    latitude: 48.86,
    forecast: [
      {
        date: '2026-12-21',
        fields: {
          temperatureMean: 5,
          temperatureMax: 8,
          temperatureMin: 2,
          humidity: 92,
          windSpeed: 1,
        },
      },
      {
        date: '2026-12-22',
        fields: {
          temperatureMean: 5,
          temperatureMax: 8,
          temperatureMin: 2,
          humidity: 92,
          windSpeed: 1,
        },
      },
    ],
    plant: {
      category: 'Flowering',
      isOutdoor: true,
      wateringFrequencyDays: 8,
      lightingRating: 50,
      humidityRating: 50,
      roomLuminosity: null,
      roomOrientation: null,
    },
    lastWateredDaysAgo: 3,
    nextWateringInDays: 5,
    wateringDaysDelta: 4,
  },
]

describe('calculateScheduleDelta pinned watering deltas', () => {
  it.each(DELTAS)('$name', (pin) => {
    const forecast = pin.forecast.map((f) => day(f.date, f.fields))
    const delta = calculateScheduleDelta(
      {
        id: 'pinned-plant',
        wateringRating: 50,
        ...pin.plant,
        lastWateredAt: new Date(NOW - pin.lastWateredDaysAgo * DAY_MS),
        nextWateringAt: new Date(NOW + pin.nextWateringInDays * DAY_MS),
        nextFertilizationAt: null,
        fertilizationFrequencyDays: null,
      },
      { currentWeather: day('2026-12-21'), recentHistory: [], forecast },
      NOW,
      pin.latitude
    )
    expect(delta.wateringDaysDelta).toBe(pin.wateringDaysDelta)
  })
})
