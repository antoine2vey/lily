import { Schema } from 'effect'

export class PlantNotFoundError extends Schema.Class<PlantNotFoundError>(
  'PlantNotFoundError'
)({}) {}
