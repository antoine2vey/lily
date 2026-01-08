import { mockNotifications } from '@lily/api/__tests__/fixtures/notifications'
import { createMockNotificationRepository } from '@lily/api/__tests__/mocks/notification.repository'
import { createMockSession } from '@lily/api/__tests__/mocks/session'
import { getNotifications } from '@lily/api/services/notifications/endpoints/get-notifications'
import { Effect, Layer } from 'effect'
import { describe, expect, it } from 'vitest'

describe('getNotifications', () => {
  const createTestLayer = (userId: string = 'user-1') =>
    Layer.mergeAll(
      createMockNotificationRepository([...mockNotifications]),
      createMockSession({ userId })
    )

  it('should return notifications for the current user', async () => {
    const result = await Effect.runPromise(
      getNotifications().pipe(Effect.provide(createTestLayer()))
    )

    expect(result.length).toBe(2)
    expect(result.every((n) => n.userId === 'user-1')).toBe(true)
  })

  it('should return empty array when user has no notifications', async () => {
    const result = await Effect.runPromise(
      getNotifications().pipe(
        Effect.provide(createTestLayer('user-without-notifications'))
      )
    )

    expect(result).toEqual([])
  })

  it('should return notifications with correct properties', async () => {
    const result = await Effect.runPromise(
      getNotifications().pipe(Effect.provide(createTestLayer()))
    )

    const notification = result.find((n) => n.id === 'notification-1')
    expect(notification).toBeDefined()
    expect(notification?.type).toBe('watering_reminder')
    expect(notification?.title).toBe('Time to water your Monstera')
    expect(notification?.isRead).toBe(false)
    expect(notification?.plantId).toBe('plant-1')
  })

  it('should include both read and unread notifications', async () => {
    const result = await Effect.runPromise(
      getNotifications().pipe(Effect.provide(createTestLayer()))
    )

    const readNotifications = result.filter((n) => n.isRead)
    const unreadNotifications = result.filter((n) => !n.isRead)

    expect(readNotifications.length).toBe(1)
    expect(unreadNotifications.length).toBe(1)
  })

  it('should return notifications for different user', async () => {
    const result = await Effect.runPromise(
      getNotifications().pipe(Effect.provide(createTestLayer('user-2')))
    )

    expect(result.length).toBe(1)
    expect(result[0].id).toBe('notification-3')
  })
})
