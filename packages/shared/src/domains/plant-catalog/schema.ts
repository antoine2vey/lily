import { Schema } from 'effect'

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
  humidityRating: Schema.Finite,
  lightingRating: Schema.Finite,
  petToxicityRating: Schema.Finite,
  wateringRating: Schema.Finite,
  luxNeeded: Schema.NullOr(Schema.Finite),
})

export type CatalogPlant = typeof CatalogPlant.Type

export const CatalogPlantListResponse = Schema.Array(CatalogPlant)
export type CatalogPlantListResponse = typeof CatalogPlantListResponse.Type
