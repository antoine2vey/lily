import type { CatalogPlant } from '@lily/shared'
import type { EnhancedPlantCreateRequest } from '@lily/shared/plant'

export const catalogPlantToCreateRequest = (
  plant: CatalogPlant
): EnhancedPlantCreateRequest => ({
  name: plant.name,
  description: plant.description ?? undefined,
  category: plant.category ?? undefined,
  wateringFrequencyDays: plant.wateringFrequencyDays,
  fertilizationFrequencyDays: plant.fertilizationFrequencyDays ?? undefined,
  mistingFrequencyDays: plant.mistingFrequencyDays ?? undefined,
  repottingFrequencyDays: plant.repottingFrequencyDays ?? undefined,
  luxNeeded: plant.luxNeeded ?? 2500,
  humidityRating: plant.humidityRating,
  petToxicityRating: plant.petToxicityRating,
  wateringRating: plant.wateringRating,
  remindersEnabled: true,
})
