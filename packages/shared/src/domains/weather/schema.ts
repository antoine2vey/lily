import { Schema } from 'effect'

// Single day weather data snapshot
export const WeatherData = Schema.Struct({
  date: Schema.String,
  temperatureMin: Schema.NullOr(Schema.Number),
  temperatureMax: Schema.NullOr(Schema.Number),
  temperatureMean: Schema.NullOr(Schema.Number),
  humidity: Schema.NullOr(Schema.Number),
  windSpeed: Schema.NullOr(Schema.Number),
  precipitation: Schema.NullOr(Schema.Number),
  solarRadiation: Schema.NullOr(Schema.Number),
  et0: Schema.NullOr(Schema.Number),
  cloudCover: Schema.NullOr(Schema.Number),
  soilTemperature: Schema.NullOr(Schema.Number),
})

export type WeatherData = typeof WeatherData.Type

// Multi-day forecast for a location
export const WeatherForecast = Schema.Struct({
  latitude: Schema.Number,
  longitude: Schema.Number,
  daily: Schema.Array(WeatherData),
})

export type WeatherForecast = typeof WeatherForecast.Type

// Algorithm output per plant
export const CareAdjustment = Schema.Struct({
  plantId: Schema.String,
  wateringMultiplier: Schema.Number,
  adjustedWateringDays: Schema.Number,
  skipWatering: Schema.Boolean,
  skipWateringReason: Schema.optional(Schema.String),
  skipFertilization: Schema.Boolean,
  skipFertilizationReason: Schema.optional(Schema.String),
  factors: Schema.Struct({
    temperature: Schema.Number,
    humidity: Schema.Number,
    wind: Schema.Number,
    precipitation: Schema.Number,
    et0: Schema.Number,
  }),
})

export type CareAdjustment = typeof CareAdjustment.Type

// User weather settings (for API responses)
export const UserWeatherSettings = Schema.Struct({
  weatherEnabled: Schema.Boolean,
  latitude: Schema.NullOr(Schema.Number),
  longitude: Schema.NullOr(Schema.Number),
})

export type UserWeatherSettings = typeof UserWeatherSettings.Type
