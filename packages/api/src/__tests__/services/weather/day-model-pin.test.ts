/**
 * Both weather entry points over one table of forecasts. `calculatePlantAdjustment`
 * feeds the app and the due day of a watering logged today;
 * `calculateScheduleDelta` feeds the scheduler that moves due days. The
 * scheduler exposes its multiplier and adjusted days only in its reason, so
 * `scheduler` reads them from there.
 */
import {
  calculatePlantAdjustment,
  calculateScheduleDelta,
  type IndoorPlantContext,
} from '@lily/api/services/weather/algorithm'
import type { WeatherData } from '@lily/shared'
import { describe, expect, it } from 'vitest'

const day = (date: string, fields: Partial<WeatherData>): WeatherData => ({
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

const HOT_DRY = {
  temperatureMean: 32,
  temperatureMax: 35,
  temperatureMin: 24,
  humidity: 25,
  windSpeed: 8,
  precipitation: 0,
  et0: 6,
}
const COLD_WET = {
  temperatureMean: 5,
  temperatureMax: 8,
  temperatureMin: 2,
  humidity: 92,
  windSpeed: 1,
  precipitation: 12,
}
const MILD_RAIN = {
  temperatureMean: 18,
  temperatureMax: 22,
  temperatureMin: 14,
  humidity: 70,
  windSpeed: 3,
  precipitation: 8,
}
const MILD_DRIZZLE = { ...MILD_RAIN, precipitation: 3 }
const MILD = { ...MILD_RAIN, precipitation: 0 }

const OUTDOOR: IndoorPlantContext = {
  category: 'Flowering',
  isOutdoor: true,
  lightingRating: 50,
  humidityRating: 50,
  roomLuminosity: null,
  roomOrientation: null,
}
const INDOOR: IndoorPlantContext = {
  category: 'Tropical',
  isOutdoor: false,
  lightingRating: 70,
  humidityRating: 60,
  roomLuminosity: 5000,
  roomOrientation: 'S',
}

const HISTORY = [
  day('2026-06-18', MILD),
  day('2026-06-19', MILD),
  day('2026-06-20', MILD),
]

const NOW = Date.UTC(2026, 5, 21)
const DAY_MS = 86_400_000
const FREQUENCY = 7

const forecastOf = (days: ReadonlyArray<Partial<WeatherData>>) =>
  days.map((fields, i) => day(`2026-06-${21 + i}`, fields))

const app = (
  plant: IndoorPlantContext,
  forecast: ReadonlyArray<WeatherData>,
  latitude: number | null
) => {
  const [today = day('2026-06-21', {})] = forecast
  const adjustment = calculatePlantAdjustment(
    {
      id: 'pinned-plant',
      wateringFrequencyDays: FREQUENCY,
      wateringRating: 50,
      ...plant,
    },
    today,
    HISTORY,
    forecast,
    latitude
  )
  return {
    multiplier: adjustment.wateringMultiplier.toFixed(2),
    adjustedDays: adjustment.adjustedWateringDays,
    skipWatering: adjustment.skipWatering,
  }
}

const scheduler = (
  plant: IndoorPlantContext,
  forecast: ReadonlyArray<WeatherData>,
  latitude: number | null
) => {
  const [today = day('2026-06-21', {})] = forecast
  const { wateringReason } = calculateScheduleDelta(
    {
      id: 'pinned-plant',
      wateringFrequencyDays: FREQUENCY,
      wateringRating: 50,
      ...plant,
      lastWateredAt: new Date(NOW - DAY_MS),
      nextWateringAt: new Date(NOW + 60 * DAY_MS),
      nextFertilizationAt: null,
      fertilizationFrequencyDays: null,
    },
    { currentWeather: today, recentHistory: HISTORY, forecast },
    NOW,
    latitude
  )
  const match = /multiplier ([\d.]+) .*adjusted (\d+)d/.exec(
    wateringReason ?? ''
  )
  return { multiplier: match?.[1], adjustedDays: Number(match?.[2]) }
}

const CASES = [
  {
    name: 'outdoor, hot and dry',
    plant: OUTDOOR,
    latitude: 48.86,
    days: [HOT_DRY],
    app: { multiplier: '1.52', adjustedDays: 5, skipWatering: false },
    schedulerToday: { multiplier: '1.52', adjustedDays: 5 },
    schedulerForecast: { multiplier: '1.52', adjustedDays: 5 },
  },
  {
    name: 'outdoor, cold and wet',
    plant: OUTDOOR,
    latitude: 48.86,
    days: [COLD_WET],
    app: { multiplier: '0.11', adjustedDays: 14, skipWatering: true },
    schedulerToday: { multiplier: '0.11', adjustedDays: 14 },
    schedulerForecast: { multiplier: '0.11', adjustedDays: 14 },
  },
  {
    name: 'outdoor, mild rain',
    plant: OUTDOOR,
    latitude: 48.86,
    days: [MILD_RAIN],
    app: { multiplier: '0.30', adjustedDays: 14, skipWatering: true },
    schedulerToday: { multiplier: '0.30', adjustedDays: 14 },
    schedulerForecast: { multiplier: '0.30', adjustedDays: 14 },
  },
  {
    name: 'outdoor, drizzle under the rain threshold',
    plant: OUTDOOR,
    latitude: 48.86,
    days: [MILD_DRIZZLE],
    app: { multiplier: '1.00', adjustedDays: 7, skipWatering: false },
    schedulerToday: { multiplier: '1.00', adjustedDays: 7 },
    schedulerForecast: { multiplier: '1.00', adjustedDays: 7 },
  },
  {
    name: 'indoor, hot and dry',
    plant: INDOOR,
    latitude: 48.86,
    days: [HOT_DRY],
    app: { multiplier: '1.13', adjustedDays: 6, skipWatering: false },
    schedulerToday: { multiplier: '1.13', adjustedDays: 6 },
    schedulerForecast: { multiplier: '1.13', adjustedDays: 6 },
  },
  {
    name: 'indoor, cold and wet',
    plant: INDOOR,
    latitude: 48.86,
    days: [COLD_WET],
    app: { multiplier: '1.24', adjustedDays: 6, skipWatering: false },
    schedulerToday: { multiplier: '1.24', adjustedDays: 6 },
    schedulerForecast: { multiplier: '1.24', adjustedDays: 6 },
  },
  {
    name: 'indoor without a location, cold and wet',
    plant: INDOOR,
    latitude: null,
    days: [COLD_WET],
    app: { multiplier: '0.85', adjustedDays: 8, skipWatering: false },
    schedulerToday: { multiplier: '0.85', adjustedDays: 8 },
    schedulerForecast: { multiplier: '0.85', adjustedDays: 8 },
  },
  {
    name: 'outdoor, mixed days, dry first',
    plant: OUTDOOR,
    latitude: 48.86,
    days: [HOT_DRY, MILD_RAIN, COLD_WET],
    app: { multiplier: '1.52', adjustedDays: 5, skipWatering: true },
    schedulerToday: { multiplier: '1.52', adjustedDays: 5 },
    schedulerForecast: { multiplier: '0.64', adjustedDays: 11 },
  },
  {
    name: 'outdoor, mixed days, rain first',
    plant: OUTDOOR,
    latitude: 48.86,
    days: [COLD_WET, HOT_DRY, MILD],
    app: { multiplier: '0.11', adjustedDays: 14, skipWatering: true },
    schedulerToday: { multiplier: '0.11', adjustedDays: 14 },
    schedulerForecast: { multiplier: '0.88', adjustedDays: 8 },
  },
  {
    name: 'indoor, mixed days',
    plant: INDOOR,
    latitude: 48.86,
    days: [HOT_DRY, COLD_WET, MILD],
    app: { multiplier: '1.13', adjustedDays: 6, skipWatering: false },
    schedulerToday: { multiplier: '1.13', adjustedDays: 6 },
    schedulerForecast: { multiplier: '1.18', adjustedDays: 6 },
  },
]

describe('weather day model, both entry points', () => {
  it.each(CASES)('$name', (pin) => {
    const forecast = forecastOf(pin.days)
    expect({
      app: app(pin.plant, forecast, pin.latitude),
      schedulerToday: scheduler(pin.plant, forecast.slice(0, 1), pin.latitude),
      schedulerForecast: scheduler(pin.plant, forecast, pin.latitude),
    }).toEqual({
      app: pin.app,
      schedulerToday: pin.schedulerToday,
      schedulerForecast: pin.schedulerForecast,
    })
  })
})

describe('the app reads the scheduler day model', () => {
  it.each(CASES)('$name', (pin) => {
    const today = forecastOf(pin.days).slice(0, 1)
    const { multiplier, adjustedDays } = app(pin.plant, today, pin.latitude)
    expect({ multiplier, adjustedDays }).toEqual(
      scheduler(pin.plant, today, pin.latitude)
    )
  })
})
