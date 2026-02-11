import { Duration } from 'effect'

// Geospatial cache radius — users within this distance share cached weather data
export const WEATHER_ZONE_RADIUS_KM = 50

// Crop coefficient (Kc) by plant category (from FAO Irrigation & Drainage Paper No. 56)
// Kc represents the ratio of a specific crop's water use to a reference grass surface
export const CROP_COEFFICIENTS: Record<string, number> = {
  Succulent: 0.2,
  Cactus: 0.2,
  Tropical: 1.0,
  Fern: 0.9,
  Herb: 0.8,
  Flowering: 0.85,
  Foliage: 0.7,
  Tree: 1.1,
  Vine: 0.9,
  Grass: 1.0,
  Vegetable: 1.05,
  Aquatic: 1.2,
}
export const DEFAULT_KC = 0.6

// Algorithm thresholds — temperature
export const TEMP_HIGH_C = 29.4 // ~85F — hot stress threshold
export const TEMP_LOW_C = 15.6 // ~60F — reduced needs threshold
export const TEMP_FERT_HIGH_C = 30 // Skip fertilization above this
export const TEMP_FERT_LOW_C = 5 // Skip fertilization below this

// Algorithm thresholds — humidity (%)
export const HUMIDITY_HIGH = 80
export const HUMIDITY_LOW = 50

// Algorithm thresholds — wind speed (m/s)
export const WIND_HIGH = 5
export const WIND_LOW = 2

// Algorithm thresholds — precipitation
export const PRECIP_SKIP_MM = 6 // Skip watering if >6mm rain in 24h

// Redis keys
export const WEATHER_GEO_KEY = 'lily:weather:locations'
export const WEATHER_DATA_PREFIX = 'lily:weather:data:'
export const WEATHER_DATA_TTL_SECONDS = Duration.toSeconds(Duration.hours(6)) // 6 hours

// Scheduler — local timezone hours to fetch weather
export const WEATHER_FETCH_HOURS = [6, 12, 18]
