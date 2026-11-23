import type { CatalogPlant } from '@lily/shared'
import { Rating } from '@lily/shared'
import { catalogPlantToCreateRequest } from '@/utils/catalog-plant'

const peaceLily: CatalogPlant = {
  id: 'catalog-peace-lily',
  name: 'Peace lily',
  scientificName: 'Spathiphyllum wallisii',
  family: 'Araceae',
  description: 'Glossy leaves and white spathes.',
  category: 'Tropical',
  imageUrl: null,
  wateringFrequencyDays: 7,
  fertilizationFrequencyDays: 30,
  mistingFrequencyDays: 3,
  repottingFrequencyDays: 365,
  humidityRating: Rating.make(70),
  lightingRating: Rating.make(30),
  petToxicityRating: Rating.make(80),
  wateringRating: Rating.make(40),
  luxNeeded: null,
}

describe('catalogPlantToCreateRequest', () => {
  it('sends the catalog ratings, so the api never has to guess them', () => {
    expect(catalogPlantToCreateRequest(peaceLily)).toEqual({
      name: 'Peace lily',
      description: 'Glossy leaves and white spathes.',
      category: 'Tropical',
      wateringFrequencyDays: 7,
      fertilizationFrequencyDays: 30,
      mistingFrequencyDays: 3,
      repottingFrequencyDays: 365,
      luxNeeded: 2500,
      lightingRating: Rating.make(30),
      humidityRating: Rating.make(70),
      petToxicityRating: Rating.make(80),
      wateringRating: Rating.make(40),
      remindersEnabled: true,
    })
  })
})
