import { Schema } from 'effect'

export const CARE_TYPES = [
  'watering',
  'fertilization',
  'misting',
  'repotting',
] as const

export const CareType = Schema.Literals([
  'watering',
  'fertilization',
  'misting',
  'repotting',
])

export type CareType = typeof CareType.Type
