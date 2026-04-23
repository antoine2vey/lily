import {
  activityStatusEnum,
  activityTokenKindEnum,
} from '@lily/db/schema/enums'
import { deviceTokens } from '@lily/db/schema/notifications'
import { users } from '@lily/db/schema/users'
import { relations, sql } from 'drizzle-orm'
import {
  check,
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'

export const activityPushTokens = pgTable(
  'activity_push_tokens',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    deviceTokenId: uuid('device_token_id')
      .notNull()
      .references(() => deviceTokens.id, { onDelete: 'cascade' }),
    kind: activityTokenKindEnum('kind').notNull(),
    activityId: varchar('activity_id', { length: 64 }),
    token: text('token').notNull(),
    status: activityStatusEnum('status').notNull().default('active'),
    startedAt: timestamp('started_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    endsAt: timestamp('ends_at', { withTimezone: true }),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index('activity_push_tokens_user_status_idx').on(
      table.userId,
      table.status
    ),
    uniqueIndex('activity_push_tokens_activity_id_idx').on(table.activityId),
    uniqueIndex('activity_push_tokens_device_start_idx').on(
      table.deviceTokenId,
      table.kind
    ),
    // Backs the every-5-min reconciliation sweep (kind='update' AND
    // status='active'), scoped by a partial predicate so the index stays
    // small as ended/expired rows accumulate.
    index('activity_push_tokens_active_updates_idx')
      .on(table.kind, table.status)
      .where(sql`${table.status} = 'active'`),
    // Encodes the invariant that start-rows have no activityId and
    // update-rows do. Without this, application code is the only thing
    // stopping the two from getting out of sync.
    check(
      'activity_push_tokens_kind_activity_id_check',
      sql`(${table.kind} = 'start' AND ${table.activityId} IS NULL)
          OR (${table.kind} = 'update' AND ${table.activityId} IS NOT NULL)`
    ),
  ]
)

export const activityPushTokensRelations = relations(
  activityPushTokens,
  ({ one }) => ({
    user: one(users, {
      fields: [activityPushTokens.userId],
      references: [users.id],
    }),
    deviceToken: one(deviceTokens, {
      fields: [activityPushTokens.deviceTokenId],
      references: [deviceTokens.id],
    }),
  })
)
