import {
  date,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
} from 'drizzle-orm/pg-core'

export const analyticsDailySnapshots = pgTable(
  'analytics_daily_snapshots',
  {
    date: date('date', { mode: 'string' }).notNull(),
    metricKey: text('metric_key').notNull(),
    value: jsonb('value').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [primaryKey({ columns: [table.date, table.metricKey] })]
)
