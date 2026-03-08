import { Schema } from 'effect'

export const CARE_TYPES = ['watering', 'fertilization'] as const

export const CareType = Schema.Union(
  Schema.Literal('watering'),
  Schema.Literal('fertilization')
)

export type CareType = typeof CareType.Type
