import type { TipCategory } from '@lily/api/services/blog-generator/types'
import type { LocalizedText } from '@lily/db/schema'

export interface GeneratedTip {
  readonly title: LocalizedText
  readonly body: LocalizedText
  readonly category: TipCategory
  readonly tags: readonly string[]
}
