import { mockNotifications } from '@lily/api/__tests__/fixtures/notifications'
import { createMockNotificationRepository } from '@lily/api/__tests__/mocks/notification.repository'
import { createMockCurrentUser } from '@lily/api/__tests__/mocks/session'
import { markNotificationRead } from '@lily/api/services/notifications/endpoints/mark-notification-read'
import { NotificationNotFoundError } from '@lily/shared'
import { Effect, Exit, Layer } from 'effect'
import { describe, expect, it } from 'vitest'

describe('markNotificationRead', () => {
  const createTestLayer = (userId: string = 'user-1') =>
    Layer.mergeAll(
      createMockNotificationRepository([...mockNotifications]),
      createMockCurrentUser({ id: userId })
    )

  it('should mark notification as read', async () => {
    const result = await Effect.runPromise(
      markNotificationRead('notification-1').pipe(
        Effect.provide(createTestLayer())
      )
    )

    expect(result.isRead).toBe(true)
    expect(result.id).toBe('notification-1')
  })

  it('should return the updated notification', async () => {
    const result = await Effect.runPromise(
      markNotificationRead('notification-1').pipe(
        Effect.provide(createTestLayer())
      )
    )

    expect(result.type).toBe('watering_reminder')
    expect(result.title).toBe('Time to water your Monstera')
    expect(result.userId).toBe('user-1')
  })

  it('should fail when notification does not exist', async () => {
    const exit = await Effect.runPromiseExit(
      markNotificationRead('non-existent').pipe(
        Effect.provide(createTestLayer())
      )
    )

    expect(Exit.isFailure(exit)).toBe(true)
    if (Exit.isFailure(exit)) {
      const error = exit.cause._tag === 'Fail' ? exit.cause.error : null
      expect(error).toBeInstanceOf(NotificationNotFoundError)
    }
  })

  it('should fail when notification belongs to another user', async () => {
    const exit = await Effect.runPromiseExit(
      markNotificationRead('notification-3').pipe(
        Effect.provide(createTestLayer())
      )
    )

    expect(Exit.isFailure(exit)).toBe(true)
    if (Exit.isFailure(exit)) {
      const error = exit.cause._tag === 'Fail' ? exit.cause.error : null
      expect(error).toBeInstanceOf(NotificationNotFoundError)
    }
  })

  it('should allow user to mark their own notification as read', async () => {
    const result = await Effect.runPromise(
      markNotificationRead('notification-3').pipe(
        Effect.provide(createTestLayer('user-2'))
      )
    )

    expect(result.isRead).toBe(true)
    expect(result.userId).toBe('user-2')
  })

  it('should work with already read notification', async () => {
    const result = await Effect.runPromise(
      markNotificationRead('notification-2').pipe(
        Effect.provide(createTestLayer())
      )
    )

    expect(result.isRead).toBe(true)
  })
})
