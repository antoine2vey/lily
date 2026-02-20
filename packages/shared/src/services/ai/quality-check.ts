import type { PlantAIResult } from './plant-schema'

/**
 * Check if a plant AI result has all the essential fields filled in.
 * A result is "sufficient" when name, wateringFrequencyDays, luxNeeded,
 * and humidityRating are all non-null.
 */
export const isPlantResultSufficient = (result: PlantAIResult): boolean =>
  result.name !== null &&
  result.wateringFrequencyDays !== null &&
  result.luxNeeded !== null &&
  result.humidityRating !== null
