import type { Notification } from '@lily/shared/notification'

export const mockNotifications: Notification[] = [
  {
    id: 'notification-1',
    type: 'watering_reminder',
    title: 'Time to water your Monstera',
    body: 'Your Monstera deliciosa needs watering today.',
    scheduledAt: new Date('2024-01-15T10:00:00Z'),
    sentAt: new Date('2024-01-15T10:00:00Z'),
    isRead: false,
    userId: 'user-1',
    plantId: 'plant-1',
    createdAt: new Date('2024-01-15T10:00:00Z'),
  },
  {
    id: 'notification-2',
    type: 'soil_alert',
    title: 'Low soil moisture detected',
    body: 'Your Pothos has low soil moisture levels.',
    scheduledAt: new Date('2024-01-16T09:00:00Z'),
    sentAt: new Date('2024-01-16T09:00:00Z'),
    isRead: true,
    userId: 'user-1',
    plantId: 'plant-2',
    createdAt: new Date('2024-01-16T09:00:00Z'),
  },
  {
    id: 'notification-3',
    type: 'watering_reminder',
    title: 'Water your Snake Plant',
    body: 'Your Snake Plant is due for watering.',
    scheduledAt: new Date('2024-01-17T08:00:00Z'),
    isRead: false,
    userId: 'user-2',
    plantId: 'plant-3',
    createdAt: new Date('2024-01-17T08:00:00Z'),
  },
]

export const createTestNotification = (
  overrides: Partial<Notification> = {}
): Notification => ({
  id: `notification-${crypto.randomUUID()}`,
  type: 'watering_reminder',
  title: 'Test notification',
  body: 'This is a test notification.',
  scheduledAt: new Date(),
  isRead: false,
  userId: 'user-1',
  createdAt: new Date(),
  ...overrides,
})
