import { Schema } from 'effect'

export const CATEGORIES = [
  'care-guides',
  'watering',
  'plant-problems',
  'pests',
  'houseplant-basics',
] as const
export type Category = (typeof CATEGORIES)[number]

export const PostMeta = Schema.Struct({
  title: Schema.String,
  description: Schema.String,
  date: Schema.String,
  updated: Schema.optional(Schema.String),
  slug: Schema.String,
  category: Schema.Literals(CATEGORIES),
  tags: Schema.Array(Schema.String),
  coverImage: Schema.optional(Schema.String),
  readingTime: Schema.Finite,
})
export type PostMeta = typeof PostMeta.Type

export interface Post {
  readonly meta: PostMeta
  readonly html: string
}
