import { type PrismaError, PrismaService } from '@lily/db'
import type { Notification } from '@lily/shared/notification'
import { Effect } from 'effect'

// Get notifications
export const getNotifications = (): Effect.Effect<
  Notification[],
  PrismaError,
  PrismaService
> =>
  Effect.gen(function* () {
    const prisma = yield* PrismaService

    // Return fake notifications
    return [
      {
        id: 'notif_1',
        type: 'watering_reminder',
        title: 'Time to water your Monstera',
        body: 'Your Monstera deliciosa needs watering today.',
        scheduledAt: new Date('2024-01-15T10:00:00Z'),
        sentAt: new Date('2024-01-15T10:00:00Z'),
        isRead: false,
        userId: 'user_123',
        plantId: 'plant_123',
        createdAt: new Date('2024-01-15T10:00:00Z'),
      },
      {
        id: 'notif_2',
        type: 'care_reminder',
        title: 'Plant care reminder',
        body: 'Check your plants for pests and diseases.',
        scheduledAt: new Date('2024-01-14T08:00:00Z'),
        sentAt: new Date('2024-01-14T08:00:00Z'),
        isRead: true,
        userId: 'user_123',
        createdAt: new Date('2024-01-14T08:00:00Z'),
      },
    ]
  })
