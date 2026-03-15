import {
  createTestPlant,
  wateringSpec,
} from '@lily/api/__tests__/fixtures/plants'
import { createTestUser } from '@lily/api/__tests__/fixtures/users'
import { createMockCurrentUser } from '@lily/api/__tests__/mocks/auth'
import { createMockCareLogRepository } from '@lily/api/__tests__/mocks/care-log.repository'
import { createMockCareScheduleRepository } from '@lily/api/__tests__/mocks/care-schedule.repository'
import { createMockDelegationRepository } from '@lily/api/__tests__/mocks/delegation.repository'
import { createMockEventBus } from '@lily/api/__tests__/mocks/event-bus'
import { createMockNotificationRepository } from '@lily/api/__tests__/mocks/notification.repository'
import { createMockPlantRepository } from '@lily/api/__tests__/mocks/plant.repository'
import { createMockUserRepository } from '@lily/api/__tests__/mocks/user.repository'
import { createMockWeatherRepository } from '@lily/api/__tests__/mocks/weather.repository'
import { createMockWeatherCache } from '@lily/api/__tests__/mocks/weather-cache'
import { createMockWeatherProvider } from '@lily/api/__tests__/mocks/weather-provider'
import type { CareScheduleRow } from '@lily/api/repositories/care-schedule.repository'
import { NotificationRepository } from '@lily/api/repositories/notification.repository'
import { executePlantCare } from '@lily/api/services/plants/helpers/execute-plant-care'
import type { Notification } from '@lily/shared/notification'
import { Array, Effect, Logger, LogLevel } from 'effect'
import { describe, expect, it } from 'vitest'

const userId = 'user-1'

const createSchedule = (
  plantId: string,
  overrides: Partial<CareScheduleRow> = {}
): CareScheduleRow => ({
  id: `schedule-${crypto.randomUUID()}`,
  plantId,
  careType: 'watering',
  frequencyDays: 7,
  lastCareAt: new Date('2024-01-01'),
  nextCareAt: new Date('2024-01-08'),
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
})

const createOverdueNotification = (
  plantId: string,
  overrides: Partial<Notification> = {}
): Notification => ({
  id: `notification-${crypto.randomUUID()}`,
  type: 'overdue_reminder',
  title: 'Your plant is overdue!',
  body: 'Time to water your plant',
  scheduledAt: new Date('2024-01-09'),
  isRead: false,
  status: 'pending',
  retryCount: 0,
  userId,
  plantId,
  createdAt: new Date(),
  ...overrides,
})

describe('executePlantCare', () => {
  describe('overdue reminder cleanup', () => {
    it('should clear pending overdue_reminder notifications when care is performed', async () => {
      const plant = createTestPlant({
        id: 'plant-1',
        userId,
        remindersEnabled: true,
        scheduleSpecs: [
          wateringSpec({
            frequencyDays: 7,
            lastCareAt: new Date('2024-01-01'),
            nextCareAt: new Date('2024-01-08'),
          }),
        ],
      })

      const schedule = createSchedule('plant-1')
      const overdueNotification = createOverdueNotification('plant-1')
      const notifications: Notification[] = [overdueNotification]

      const user = createTestUser({
        id: userId,
        careReminders: true,
        timezone: 'UTC',
        preferredNotificationTime: '09:00',
        doNotDisturb: false,
      })

      await Effect.runPromise(
        Effect.gen(function* () {
          yield* executePlantCare({
            plantId: 'plant-1',
            careType: 'watering',
          })

          const repo = yield* NotificationRepository
          const remaining = yield* repo.findPendingByUserId(userId)

          // The overdue_reminder should have been cleared
          const overdueReminders = Array.filter(
            remaining,
            (n) => n.type === 'overdue_reminder'
          )
          expect(overdueReminders).toHaveLength(0)
        }).pipe(
          Effect.provide(
            createMockPlantRepository({
              plants: [plant],
              schedules: [schedule],
            })
          ),
          Effect.provide(
            createMockCareScheduleRepository({
              schedules: [schedule],
              plants: [plant],
            })
          ),
          Effect.provide(createMockNotificationRepository(notifications)),
          Effect.provide(createMockCareLogRepository([])),
          Effect.provide(createMockUserRepository([user])),
          Effect.provide(createMockDelegationRepository({})),
          Effect.provide(createMockEventBus()),
          Effect.provide(
            createMockCurrentUser({
              id: userId,
              name: 'Test User',
              email: 'test@example.com',
              username: 'testuser',
              createdAt: new Date(),
              updatedAt: new Date(),
              role: 'user',
              status: 'active',
            })
          ),
          Effect.provide(createMockWeatherProvider()),
          Effect.provide(createMockWeatherCache()),
          Effect.provide(createMockWeatherRepository()),
          Logger.withMinimumLogLevel(LogLevel.None)
        )
      )
    })

    it('should not clear overdue_reminder notifications for other plants', async () => {
      const plant = createTestPlant({
        id: 'plant-1',
        userId,
        remindersEnabled: true,
        scheduleSpecs: [
          wateringSpec({
            frequencyDays: 7,
            lastCareAt: new Date('2024-01-01'),
            nextCareAt: new Date('2024-01-08'),
          }),
        ],
      })

      const schedule = createSchedule('plant-1')
      const overdueForOtherPlant = createOverdueNotification('plant-2')
      const notifications: Notification[] = [overdueForOtherPlant]

      const user = createTestUser({
        id: userId,
        careReminders: true,
        timezone: 'UTC',
        preferredNotificationTime: '09:00',
        doNotDisturb: false,
      })

      await Effect.runPromise(
        Effect.gen(function* () {
          yield* executePlantCare({
            plantId: 'plant-1',
            careType: 'watering',
          })

          const repo = yield* NotificationRepository
          const remaining = yield* repo.findPendingByUserId(userId)

          // The overdue_reminder for plant-2 should still exist
          const overdueReminders = Array.filter(
            remaining,
            (n) => n.type === 'overdue_reminder' && n.plantId === 'plant-2'
          )
          expect(overdueReminders).toHaveLength(1)
        }).pipe(
          Effect.provide(
            createMockPlantRepository({
              plants: [plant],
              schedules: [schedule],
            })
          ),
          Effect.provide(
            createMockCareScheduleRepository({
              schedules: [schedule],
              plants: [plant],
            })
          ),
          Effect.provide(createMockNotificationRepository(notifications)),
          Effect.provide(createMockCareLogRepository([])),
          Effect.provide(createMockUserRepository([user])),
          Effect.provide(createMockDelegationRepository({})),
          Effect.provide(createMockEventBus()),
          Effect.provide(
            createMockCurrentUser({
              id: userId,
              name: 'Test User',
              email: 'test@example.com',
              username: 'testuser',
              createdAt: new Date(),
              updatedAt: new Date(),
              role: 'user',
              status: 'active',
            })
          ),
          Effect.provide(createMockWeatherProvider()),
          Effect.provide(createMockWeatherCache()),
          Effect.provide(createMockWeatherRepository()),
          Logger.withMinimumLogLevel(LogLevel.None)
        )
      )
    })

    it('should clear overdue reminders even when no next care date exists', async () => {
      const plant = createTestPlant({
        id: 'plant-1',
        userId,
        remindersEnabled: true,
        scheduleSpecs: [],
      })

      // No schedule means no frequency, so no nextCareAt will be computed
      const overdueNotification = createOverdueNotification('plant-1')
      const notifications: Notification[] = [overdueNotification]

      const user = createTestUser({
        id: userId,
        careReminders: true,
        timezone: 'UTC',
        preferredNotificationTime: '09:00',
        doNotDisturb: false,
      })

      await Effect.runPromise(
        Effect.gen(function* () {
          yield* executePlantCare({
            plantId: 'plant-1',
            careType: 'watering',
          })

          const repo = yield* NotificationRepository
          const remaining = yield* repo.findPendingByUserId(userId)

          // The overdue_reminder should have been cleared even without a schedule
          const overdueReminders = Array.filter(
            remaining,
            (n) => n.type === 'overdue_reminder'
          )
          expect(overdueReminders).toHaveLength(0)
        }).pipe(
          Effect.provide(
            createMockPlantRepository({
              plants: [plant],
            })
          ),
          Effect.provide(
            createMockCareScheduleRepository({
              plants: [plant],
            })
          ),
          Effect.provide(createMockNotificationRepository(notifications)),
          Effect.provide(createMockCareLogRepository([])),
          Effect.provide(createMockUserRepository([user])),
          Effect.provide(createMockDelegationRepository({})),
          Effect.provide(createMockEventBus()),
          Effect.provide(
            createMockCurrentUser({
              id: userId,
              name: 'Test User',
              email: 'test@example.com',
              username: 'testuser',
              createdAt: new Date(),
              updatedAt: new Date(),
              role: 'user',
              status: 'active',
            })
          ),
          Effect.provide(createMockWeatherProvider()),
          Effect.provide(createMockWeatherCache()),
          Effect.provide(createMockWeatherRepository()),
          Logger.withMinimumLogLevel(LogLevel.None)
        )
      )
    })
  })
})
