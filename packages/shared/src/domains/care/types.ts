import { Schema } from 'effect'

export const CARE_TYPES = [
  'watering',
  'fertilization',
  'misting',
  'repotting',
] as const

export const CareType = Schema.Union(
  Schema.Literal('watering'),
  Schema.Literal('fertilization'),
  Schema.Literal('misting'),
  Schema.Literal('repotting')
)

export type CareType = typeof CareType.Type
