import type { LocalizedText } from '@lily/db/schema/blog-posts'
import { jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'

export const dailyTips = pgTable('daily_tips', {
  id: uuid('id').primaryKey().defaultRandom(),
  title: jsonb('title').$type<LocalizedText>().notNull(),
  body: jsonb('body').$type<LocalizedText>().notNull(),
  category: text('category').notNull(),
  tags: text('tags').array().notNull().default([]),
  publishDate: text('publish_date').notNull().unique(),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
})
