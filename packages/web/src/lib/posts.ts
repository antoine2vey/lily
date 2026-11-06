import { Schema } from 'effect'

export const PostMeta = Schema.Struct({
  title: Schema.String,
  description: Schema.String,
  date: Schema.String,
  slug: Schema.String,
  category: Schema.String,
  tags: Schema.Array(Schema.String),
  coverImage: Schema.optional(Schema.String),
  readingTime: Schema.Finite,
})
export type PostMeta = typeof PostMeta.Type

export interface Post {
  readonly meta: PostMeta
  readonly html: string
}
