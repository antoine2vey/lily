import { Schema } from 'effect'

export const WeatherData = Schema.Struct({
  date: Schema.String,
  temperatureMin: Schema.NullOr(Schema.Finite),
  temperatureMax: Schema.NullOr(Schema.Finite),
  temperatureMean: Schema.NullOr(Schema.Finite),
  humidity: Schema.NullOr(Schema.Finite),
  windSpeed: Schema.NullOr(Schema.Finite),
  precipitation: Schema.NullOr(Schema.Finite),
  solarRadiation: Schema.NullOr(Schema.Finite),
  et0: Schema.NullOr(Schema.Finite),
  cloudCover: Schema.NullOr(Schema.Finite),
  soilTemperature: Schema.NullOr(Schema.Finite),
})

export type WeatherData = typeof WeatherData.Type

export const WeatherForecast = Schema.Struct({
  latitude: Schema.Finite,
  longitude: Schema.Finite,
  daily: Schema.Array(WeatherData),
})

export type WeatherForecast = typeof WeatherForecast.Type

export const CareAdjustment = Schema.Struct({
  plantId: Schema.String,
  wateringMultiplier: Schema.Finite,
  adjustedWateringDays: Schema.Finite,
  skipWatering: Schema.Boolean,
  skipWateringReason: Schema.optional(Schema.String),
  skipFertilization: Schema.Boolean,
  skipFertilizationReason: Schema.optional(Schema.String),
  factors: Schema.Struct({
    temperature: Schema.Finite,
    humidity: Schema.Finite,
    wind: Schema.Finite,
    precipitation: Schema.Finite,
    et0: Schema.Finite,
  }),
})

export type CareAdjustment = typeof CareAdjustment.Type

// User weather settings (for API responses)
export const UserWeatherSettings = Schema.Struct({
  weatherEnabled: Schema.Boolean,
  latitude: Schema.NullOr(Schema.Finite),
  longitude: Schema.NullOr(Schema.Finite),
})

export type UserWeatherSettings = typeof UserWeatherSettings.Type
