import { Schema } from 'effect'
import { Rating } from '../plant/schema'

export const CatalogPlant = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  scientificName: Schema.NullOr(Schema.String),
  family: Schema.NullOr(Schema.String),
  description: Schema.NullOr(Schema.String),
  category: Schema.NullOr(Schema.String),
  imageUrl: Schema.NullOr(Schema.String),
  wateringFrequencyDays: Schema.Finite,
  fertilizationFrequencyDays: Schema.NullOr(Schema.Finite),
  mistingFrequencyDays: Schema.NullOr(Schema.Finite),
  repottingFrequencyDays: Schema.NullOr(Schema.Finite),
  humidityRating: Rating,
  lightingRating: Rating,
  petToxicityRating: Rating,
  wateringRating: Rating,
  luxNeeded: Schema.NullOr(Schema.Finite),
})

export type CatalogPlant = typeof CatalogPlant.Type

export const CatalogPlantListResponse = Schema.Array(CatalogPlant)
export type CatalogPlantListResponse = typeof CatalogPlantListResponse.Type
