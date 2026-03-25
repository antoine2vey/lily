import type { BlogPostSource, LocalizedText } from '@lily/db/schema'

export interface TopicSuggestion {
  readonly slug: string
  readonly title: LocalizedText
  readonly category: string
  readonly tags: readonly string[]
  readonly outline: string
}

export interface ResearchBrief {
  readonly sources: readonly BlogPostSource[]
  readonly keyFacts: string
  readonly uniqueAngles: string
}

export interface ReviewResult {
  readonly uniqueness: number
  readonly organicFeel: number
  readonly factualAccuracy: number
  readonly seoQuality: number
  readonly contentDepth: number
  readonly overallScore: number
  readonly feedback: string
}

export interface GeneratedContent {
  readonly content: LocalizedText
}

export interface GitHubCommitResult {
  readonly sha: string
  readonly path: string
}

export const BLOG_CATEGORIES = [
  'care-guide',
  'seasonal',
  'troubleshooting',
  'plant-profile',
  'how-to',
  'beginner',
  'advanced',
  'indoor',
  'outdoor',
  'propagation',
] as const

export type BlogCategory = (typeof BLOG_CATEGORIES)[number]
