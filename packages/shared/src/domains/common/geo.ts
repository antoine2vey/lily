/**
 * Round geographic coordinate to 2 decimal places (~1.1km precision).
 * Used for weather data caching and deduplicating nearby locations.
 */
export const roundCoord = (v: number): number => Math.round(v * 100) / 100
