import { Array } from 'effect'

export const KINDS = [
  'watering',
  'fertilization',
  'misting',
  'repotting',
] as const
export type Kind = (typeof KINDS)[number]
export const isKind = (s: string): s is Kind => Array.contains(KINDS, s)

export const GLYPH: Record<Kind, string> = {
  watering: 'water-drop',
  fertilization: 'eco',
  misting: 'grain',
  repotting: 'compost',
}

export const DOT: Record<Kind, string> = {
  watering: 'w',
  fertilization: 'f',
  misting: 'm',
  repotting: 'r',
}
