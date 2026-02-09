import { createTestUser } from '@lily/api/__tests__/fixtures/users'
import { createMockNotificationRepository } from '@lily/api/__tests__/mocks/notification.repository'
import { createMockUserRepository } from '@lily/api/__tests__/mocks/user.repository'
import { NotificationRepository } from '@lily/api/repositories/notification.repository'
import { scheduleCareReminder } from '@lily/api/services/plants/helpers/schedule-care-reminder'
import { Effect, Logger, LogLevel } from 'effect'
import { describe, expect, it } from 'vitest'

// Helper to create a future date for scheduling
const createFutureDate = (daysFromNow: number, hours = 12): Date => {
  const date = new Date()
  date.setDate(date.getDate() + daysFromNow)
  date.setUTCHours(hours, 0, 0, 0)
  return date
}

// Helper to run scheduleCareReminder and check created notifications
const runAndGetPendingNotifications = (
  params: Parameters<typeof scheduleCareReminder>[0],
  user: ReturnType<typeof createTestUser>
) =>
  Effect.runPromise(
    Effect.gen(function* () {
      yield* scheduleCareReminder(params)
      const repo = yield* NotificationRepository
      return yield* repo.findPendingByUserId(user.id)
    }).pipe(
      Effect.provide(createMockNotificationRepository([])),
      Effect.provide(createMockUserRepository([user])),
      Logger.withMinimumLogLevel(LogLevel.None)
    )
  )

describe('scheduleCareReminder', () => {
  describe('careReminders enforcement', () => {
    it('should not create notification when user.careReminders is false', async () => {
      const user = createTestUser({
        id: 'user-1',
        careReminders: false,
        timezone: 'UTC',
        preferredNotificationTime: '09:00',
      })

      const pending = await runAndGetPendingNotifications(
        {
          plantId: 'plant-1',
          plantName: 'Monstera',
          userId: user.id,
          type: 'watering_reminder',
          scheduledDate: createFutureDate(7),
          remindersEnabled: true,
        },
        user
      )

      expect(pending).toHaveLength(0)
    })

    it('should create notification when user.careReminders is true', async () => {
      const user = createTestUser({
        id: 'user-1',
        careReminders: true,
        timezone: 'UTC',
        preferredNotificationTime: '09:00',
        doNotDisturb: false,
      })

      const pending = await runAndGetPendingNotifications(
        {
          plantId: 'plant-1',
          plantName: 'Monstera',
          userId: user.id,
          type: 'watering_reminder',
          scheduledDate: createFutureDate(7),
          remindersEnabled: true,
        },
        user
      )

      expect(pending).toHaveLength(1)
      expect(pending[0]?.type).toBe('watering_reminder')
    })

    it('should not create notification when plant.remindersEnabled is false', async () => {
      const user = createTestUser({
        id: 'user-1',
        careReminders: true,
        timezone: 'UTC',
      })

      const pending = await runAndGetPendingNotifications(
        {
          plantId: 'plant-1',
          plantName: 'Monstera',
          userId: user.id,
          type: 'watering_reminder',
          scheduledDate: createFutureDate(7),
          remindersEnabled: false,
        },
        user
      )

      expect(pending).toHaveLength(0)
    })

    it('should not create notification when both careReminders and remindersEnabled are false', async () => {
      const user = createTestUser({
        id: 'user-1',
        careReminders: false,
        timezone: 'UTC',
      })

      const pending = await runAndGetPendingNotifications(
        {
          plantId: 'plant-1',
          plantName: 'Monstera',
          userId: user.id,
          type: 'watering_reminder',
          scheduledDate: createFutureDate(7),
          remindersEnabled: false,
        },
        user
      )

      expect(pending).toHaveLength(0)
    })
  })

  describe('DND integration in scheduling', () => {
    it('should not adjust scheduledAt when DND is disabled', async () => {
      const user = createTestUser({
        id: 'user-1',
        careReminders: true,
        timezone: 'UTC',
        preferredNotificationTime: '23:00',
        doNotDisturb: false,
        doNotDisturbStart: '22:00',
        doNotDisturbEnd: '07:00',
      })

      const pending = await runAndGetPendingNotifications(
        {
          plantId: 'plant-1',
          plantName: 'Monstera',
          userId: user.id,
          type: 'watering_reminder',
          scheduledDate: createFutureDate(7),
          remindersEnabled: true,
        },
        user
      )

      expect(pending).toHaveLength(1)
      // When DND is disabled, preferred time is 23:00 which would be in DND window
      // but DND is disabled so it should stay at 23:00
      expect(pending[0]?.scheduledAt.getUTCHours()).toBe(23)
    })

    it('should adjust scheduledAt when DND is enabled and time is inside window', async () => {
      const user = createTestUser({
        id: 'user-1',
        careReminders: true,
        timezone: 'UTC',
        preferredNotificationTime: '23:00',
        doNotDisturb: true,
        doNotDisturbStart: '22:00',
        doNotDisturbEnd: '07:00',
      })

      const pending = await runAndGetPendingNotifications(
        {
          plantId: 'plant-1',
          plantName: 'Monstera',
          userId: user.id,
          type: 'watering_reminder',
          scheduledDate: createFutureDate(7),
          remindersEnabled: true,
        },
        user
      )

      expect(pending).toHaveLength(1)
      // 23:00 is in DND window (22:00-07:00), should be adjusted to 07:00
      expect(pending[0]?.scheduledAt.getUTCHours()).toBe(7)
    })

    it('should not adjust scheduledAt when DND is enabled but time is outside window', async () => {
      const user = createTestUser({
        id: 'user-1',
        careReminders: true,
        timezone: 'UTC',
        preferredNotificationTime: '09:00',
        doNotDisturb: true,
        doNotDisturbStart: '22:00',
        doNotDisturbEnd: '07:00',
      })

      const pending = await runAndGetPendingNotifications(
        {
          plantId: 'plant-1',
          plantName: 'Monstera',
          userId: user.id,
          type: 'watering_reminder',
          scheduledDate: createFutureDate(7),
          remindersEnabled: true,
        },
        user
      )

      expect(pending).toHaveLength(1)
      // 09:00 is outside DND window, should remain at 09:00
      expect(pending[0]?.scheduledAt.getUTCHours()).toBe(9)
    })

    it('should use default DND times when start/end are null', async () => {
      const user = createTestUser({
        id: 'user-1',
        careReminders: true,
        timezone: 'UTC',
        preferredNotificationTime: '23:00',
        doNotDisturb: true,
        doNotDisturbStart: null,
        doNotDisturbEnd: null,
      })

      const pending = await runAndGetPendingNotifications(
        {
          plantId: 'plant-1',
          plantName: 'Monstera',
          userId: user.id,
          type: 'watering_reminder',
          scheduledDate: createFutureDate(7),
          remindersEnabled: true,
        },
        user
      )

      expect(pending).toHaveLength(1)
      // Default DND is 22:00-07:00, 23:00 is in window, should adjust to 07:00
      expect(pending[0]?.scheduledAt.getUTCHours()).toBe(7)
    })
  })

  describe('combined scenarios', () => {
    it('should skip notification when careReminders is false even with DND enabled', async () => {
      const user = createTestUser({
        id: 'user-1',
        careReminders: false,
        doNotDisturb: true,
        doNotDisturbStart: '22:00',
        doNotDisturbEnd: '07:00',
        timezone: 'UTC',
      })

      const pending = await runAndGetPendingNotifications(
        {
          plantId: 'plant-1',
          plantName: 'Monstera',
          userId: user.id,
          type: 'watering_reminder',
          scheduledDate: createFutureDate(7),
          remindersEnabled: true,
        },
        user
      )

      // careReminders check wins, no notification created
      expect(pending).toHaveLength(0)
    })

    it('should create adjusted notification when careReminders true + DND enabled + time in window', async () => {
      const user = createTestUser({
        id: 'user-1',
        careReminders: true,
        timezone: 'UTC',
        preferredNotificationTime: '23:00',
        doNotDisturb: true,
        doNotDisturbStart: '22:00',
        doNotDisturbEnd: '07:00',
      })

      const pending = await runAndGetPendingNotifications(
        {
          plantId: 'plant-1',
          plantName: 'Monstera',
          userId: user.id,
          type: 'watering_reminder',
          scheduledDate: createFutureDate(7),
          remindersEnabled: true,
        },
        user
      )

      expect(pending).toHaveLength(1)
      expect(pending[0]?.scheduledAt.getUTCHours()).toBe(7)
    })

    it('should create notification at original time when careReminders true + DND disabled', async () => {
      const user = createTestUser({
        id: 'user-1',
        careReminders: true,
        timezone: 'UTC',
        preferredNotificationTime: '23:00',
        doNotDisturb: false,
      })

      const pending = await runAndGetPendingNotifications(
        {
          plantId: 'plant-1',
          plantName: 'Monstera',
          userId: user.id,
          type: 'watering_reminder',
          scheduledDate: createFutureDate(7),
          remindersEnabled: true,
        },
        user
      )

      expect(pending).toHaveLength(1)
      // DND disabled, time stays at 23:00 even though it would be in DND window
      expect(pending[0]?.scheduledAt.getUTCHours()).toBe(23)
    })
  })
})
