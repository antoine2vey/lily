import { mockNotifications } from '@lily/api/__tests__/fixtures/notifications'
import { createMockNotificationRepository } from '@lily/api/__tests__/mocks/notification.repository'
import { createMockCurrentUser } from '@lily/api/__tests__/mocks/session'
import { getNotifications } from '@lily/api/services/notifications/endpoints/get-notifications'
import { Effect, Layer } from 'effect'
import { describe, expect, it } from 'vitest'

describe('getNotifications', () => {
  const createTestLayer = (userId: string = 'user-1') =>
    Layer.mergeAll(
      createMockNotificationRepository([...mockNotifications]),
      createMockCurrentUser({ id: userId })
    )

  it('should return notifications for the current user with pagination info', async () => {
    const result = await Effect.runPromise(
      getNotifications({}).pipe(Effect.provide(createTestLayer()))
    )

    expect(result.items.length).toBe(2)
    expect(result.items.every((n) => n.userId === 'user-1')).toBe(true)
    expect(result.total).toBe(2)
    expect(result.page).toBe(1)
    expect(result.limit).toBe(20)
    expect(result.hasMore).toBe(false)
  })

  it('should return empty array when user has no notifications', async () => {
    const result = await Effect.runPromise(
      getNotifications({}).pipe(
        Effect.provide(createTestLayer('user-without-notifications'))
      )
    )

    expect(result.items).toEqual([])
    expect(result.total).toBe(0)
    expect(result.hasMore).toBe(false)
  })

  it('should return notifications with correct properties', async () => {
    const result = await Effect.runPromise(
      getNotifications({}).pipe(Effect.provide(createTestLayer()))
    )

    const notification = result.items.find((n) => n.id === 'notification-1')
    expect(notification).toBeDefined()
    expect(notification?.type).toBe('watering_reminder')
    expect(notification?.title).toBe('Time to water your Monstera')
    expect(notification?.isRead).toBe(false)
    expect(notification?.plantId).toBe('plant-1')
  })

  it('should include both read and unread notifications', async () => {
    const result = await Effect.runPromise(
      getNotifications({}).pipe(Effect.provide(createTestLayer()))
    )

    const readNotifications = result.items.filter((n) => n.isRead)
    const unreadNotifications = result.items.filter((n) => !n.isRead)

    expect(readNotifications.length).toBe(1)
    expect(unreadNotifications.length).toBe(1)
  })

  it('should return notifications for different user', async () => {
    const result = await Effect.runPromise(
      getNotifications({}).pipe(Effect.provide(createTestLayer('user-2')))
    )

    expect(result.items.length).toBe(1)
    expect(result.items[0]?.id).toBe('notification-3')
  })

  it('should respect page and limit parameters', async () => {
    const result = await Effect.runPromise(
      getNotifications({ page: 1, limit: 1 }).pipe(
        Effect.provide(createTestLayer())
      )
    )

    expect(result.items.length).toBe(1)
    expect(result.total).toBe(2)
    expect(result.hasMore).toBe(true)
    expect(result.page).toBe(1)
    expect(result.limit).toBe(1)
  })
})
