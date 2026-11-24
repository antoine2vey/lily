import { Option } from 'effect'

/**
 * Round geographic coordinate to 2 decimal places (~1.1km precision).
 * Used for weather data caching and deduplicating nearby locations.
 */
export const roundCoord = (v: number): number => Math.round(v * 100) / 100

/** A place from stored coordinates. 0 is a real latitude or longitude. */
export const weatherPlaceOf = (row: {
  readonly latitude: number | null
  readonly longitude: number | null
}): Option.Option<{ readonly latitude: number; readonly longitude: number }> =>
  Option.all({
    latitude: Option.fromNullishOr(row.latitude),
    longitude: Option.fromNullishOr(row.longitude),
  })
