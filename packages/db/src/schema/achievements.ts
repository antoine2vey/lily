import { achievementKeyEnum } from '@lily/db/schema/enums'
import { users } from '@lily/db/schema/users'
import { relations } from 'drizzle-orm'
import { pgTable, timestamp, unique, uuid } from 'drizzle-orm/pg-core'

export const userAchievements = pgTable(
  'user_achievements',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    achievement: achievementKeyEnum('achievement').notNull(),
    unlockedAt: timestamp('unlocked_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [unique().on(table.userId, table.achievement)]
)

export const userAchievementsRelations = relations(
  userAchievements,
  ({ one }) => ({
    user: one(users, {
      fields: [userAchievements.userId],
      references: [users.id],
    }),
  })
)
