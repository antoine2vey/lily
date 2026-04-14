import { Schema } from 'effect'

export const CatalogPlant = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  scientificName: Schema.NullOr(Schema.String),
  family: Schema.NullOr(Schema.String),
  description: Schema.NullOr(Schema.String),
  category: Schema.NullOr(Schema.String),
  imageUrl: Schema.NullOr(Schema.String),
  wateringFrequencyDays: Schema.Number,
  fertilizationFrequencyDays: Schema.NullOr(Schema.Number),
  mistingFrequencyDays: Schema.NullOr(Schema.Number),
  repottingFrequencyDays: Schema.NullOr(Schema.Number),
  humidityRating: Schema.Number,
  lightingRating: Schema.Number,
  petToxicityRating: Schema.Number,
  wateringRating: Schema.Number,
  luxNeeded: Schema.NullOr(Schema.Number),
})

export type CatalogPlant = typeof CatalogPlant.Type

export const CatalogPlantListResponse = Schema.Array(CatalogPlant)
export type CatalogPlantListResponse = typeof CatalogPlantListResponse.Type
