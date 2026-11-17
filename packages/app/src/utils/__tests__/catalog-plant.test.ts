import type { CatalogPlant } from '@lily/shared'
import { catalogPlantToCreateRequest } from '@/utils/catalog-plant'

const peaceLily: CatalogPlant = {
  id: 'catalog-peace-lily',
  name: 'Peace lily',
  scientificName: 'Spathiphyllum wallisii',
  family: 'Araceae',
  description: null,
  category: 'Tropical',
  imageUrl: null,
  wateringFrequencyDays: 7,
  fertilizationFrequencyDays: null,
  mistingFrequencyDays: 3,
  repottingFrequencyDays: 365,
  humidityRating: 70,
  lightingRating: 30,
  petToxicityRating: 80,
  wateringRating: 40,
  luxNeeded: null,
}

describe('catalogPlantToCreateRequest', () => {
  it('sends the catalog ratings, so the api never has to guess them', () => {
    expect(catalogPlantToCreateRequest(peaceLily)).toEqual({
      name: 'Peace lily',
      category: 'Tropical',
      wateringFrequencyDays: 7,
      mistingFrequencyDays: 3,
      repottingFrequencyDays: 365,
      luxNeeded: 2500,
      humidityRating: 70,
      petToxicityRating: 80,
      wateringRating: 40,
      remindersEnabled: true,
    })
  })
})
