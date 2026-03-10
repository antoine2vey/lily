import type { LocalizedText } from '@lily/db/schema'

export const TIP_CATEGORIES = [
  'watering',
  'light',
  'soil',
  'pests',
  'propagation',
  'seasonal',
  'general',
] as const

export type TipCategory = (typeof TIP_CATEGORIES)[number]

export interface GeneratedTip {
  readonly title: LocalizedText
  readonly body: LocalizedText
  readonly category: TipCategory
  readonly tags: readonly string[]
}
