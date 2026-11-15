import { Duration } from 'effect'

// Geospatial cache radius — users within this distance share cached weather data
export const WEATHER_ZONE_RADIUS_KM = 50

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
