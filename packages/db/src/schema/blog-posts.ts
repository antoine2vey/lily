import { blogPostStatusEnum } from '@lily/db/schema/enums'
import {
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core'

export type BlogPostSource = {
  url: string
  title: string
  snippet: string
}

/** Record keyed by language code — scales with new languages without migrations */
export type LocalizedText = Record<string, string>

export const blogPosts = pgTable('blog_posts', {
  id: uuid('id').primaryKey().defaultRandom(),
  slug: text('slug').notNull().unique(),
  title: jsonb('title').$type<LocalizedText>().notNull(),
  category: text('category').notNull(),
  tags: text('tags').array().notNull(),
  status: blogPostStatusEnum('status').notNull().default('pending'),
  sources: jsonb('sources').$type<BlogPostSource[]>().notNull().default([]),
  content: jsonb('content').$type<LocalizedText>(),
  reviewScore: integer('review_score'),
  reviewFeedback: text('review_feedback'),
  retryCount: integer('retry_count').notNull().default(0),
  publishedAt: timestamp('published_at', { withTimezone: true }),
  commitShas: jsonb('commit_shas').$type<LocalizedText>(),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
})
