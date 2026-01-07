import * as PgDrizzle from '@effect/sql-drizzle/Pg'
import type { Notification } from '@lily/shared/notification'
import { Effect } from 'effect'

// Mark notification as read
export const markNotificationRead = (
  notificationId: string
): Effect.Effect<Notification, never, PgDrizzle.PgDrizzle> =>
  Effect.gen(function* () {
    const _db = yield* PgDrizzle.PgDrizzle

    // Return fake updated notification
    return {
      id: notificationId,
      type: 'watering_reminder',
      title: 'Time to water your Monstera',
      body: 'Your Monstera deliciosa needs watering today.',
      scheduledAt: new Date('2024-01-15T10:00:00Z'),
      sentAt: new Date('2024-01-15T10:00:00Z'),
      isRead: true,
      userId: 'user_123',
      plantId: 'plant_123',
      createdAt: new Date('2024-01-15T10:00:00Z'),
    }
  })
