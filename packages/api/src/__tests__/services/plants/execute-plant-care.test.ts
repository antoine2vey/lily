import type { TestPlant } from '@lily/api/__tests__/fixtures/plants'
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
import type { PlantWithRoom } from '@lily/api/repositories/plant.repository'
import { executePlantCare } from '@lily/api/services/plants/helpers/execute-plant-care'
import type { Notification } from '@lily/shared/notification'
import { Array, Effect, Layer, Logger, LogLevel } from 'effect'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const userId = 'user-1'

const toPlantWithRoom = (plant: TestPlant): PlantWithRoom => ({
  ...plant,
  room: null,
  ownership: 'owned' as const,
  ownerName: null,
  schedules: [],
})

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
      const testPlant = createTestPlant({
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
      const plant = toPlantWithRoom(testPlant)

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
          yield* executePlantCare(plant, {
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
            Layer.mergeAll(
              createMockPlantRepository({
                plants: [testPlant],
                schedules: [schedule],
              }),
              createMockCareScheduleRepository({
                schedules: [schedule],
                plants: [testPlant],
              }),
              createMockNotificationRepository(notifications),
              createMockCareLogRepository([]),
              createMockUserRepository([user]),
              createMockDelegationRepository({}),
              createMockEventBus(),
              createMockCurrentUser({
                id: userId,
                name: 'Test User',
                email: 'test@example.com',
                username: 'testuser',
                createdAt: new Date(),
                updatedAt: new Date(),
                role: 'user',
                status: 'active',
              }),
              createMockWeatherProvider(),
              createMockWeatherCache(),
              createMockWeatherRepository()
            )
          ),
          Logger.withMinimumLogLevel(LogLevel.None)
        )
      )
    })

    it('should not clear overdue_reminder notifications for other plants', async () => {
      const testPlant = createTestPlant({
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
      const plant = toPlantWithRoom(testPlant)

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
          yield* executePlantCare(plant, {
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
            Layer.mergeAll(
              createMockPlantRepository({
                plants: [testPlant],
                schedules: [schedule],
              }),
              createMockCareScheduleRepository({
                schedules: [schedule],
                plants: [testPlant],
              }),
              createMockNotificationRepository(notifications),
              createMockCareLogRepository([]),
              createMockUserRepository([user]),
              createMockDelegationRepository({}),
              createMockEventBus(),
              createMockCurrentUser({
                id: userId,
                name: 'Test User',
                email: 'test@example.com',
                username: 'testuser',
                createdAt: new Date(),
                updatedAt: new Date(),
                role: 'user',
                status: 'active',
              }),
              createMockWeatherProvider(),
              createMockWeatherCache(),
              createMockWeatherRepository()
            )
          ),
          Logger.withMinimumLogLevel(LogLevel.None)
        )
      )
    })

    it('should clear overdue reminders even when no next care date exists', async () => {
      const testPlant = createTestPlant({
        id: 'plant-1',
        userId,
        remindersEnabled: true,
        scheduleSpecs: [],
      })
      const plant = toPlantWithRoom(testPlant)

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
          yield* executePlantCare(plant, {
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
            Layer.mergeAll(
              createMockPlantRepository({
                plants: [testPlant],
              }),
              createMockCareScheduleRepository({
                plants: [testPlant],
              }),
              createMockNotificationRepository(notifications),
              createMockCareLogRepository([]),
              createMockUserRepository([user]),
              createMockDelegationRepository({}),
              createMockEventBus(),
              createMockCurrentUser({
                id: userId,
                name: 'Test User',
                email: 'test@example.com',
                username: 'testuser',
                createdAt: new Date(),
                updatedAt: new Date(),
                role: 'user',
                status: 'active',
              }),
              createMockWeatherProvider(),
              createMockWeatherCache(),
              createMockWeatherRepository()
            )
          ),
          Logger.withMinimumLogLevel(LogLevel.None)
        )
      )
    })
  })

  // Regression: daily-frequency tasks could be revalidated multiple times in
  // the 1–2h window between local midnight and UTC midnight, because the next
  // care date was truncated to UTC midnight instead of the user's local one.
  // After the fix, the next care date must land strictly after the user's
  // local end-of-today regardless of when (in that window) they validate.
  describe('next care date is timezone-aware', () => {
    beforeEach(() => {
      vi.useFakeTimers()
    })
    afterEach(() => {
      vi.useRealTimers()
    })

    it('does not let a daily task re-appear today when validated past local midnight (Paris)', async () => {
      // 2026-05-18 00:30 Europe/Paris (UTC+2 in May) = 2026-05-17 22:30 UTC.
      // Pre-fix: nextCareAt landed at 2026-05-18 00:00 UTC = 2026-05-18 02:00
      // Paris — the same local day, so the task immediately re-appears.
      vi.setSystemTime(new Date('2026-05-17T22:30:00.000Z'))

      const testPlant = createTestPlant({
        id: 'plant-1',
        userId,
        remindersEnabled: false,
        scheduleSpecs: [
          wateringSpec({
            frequencyDays: 1,
            lastCareAt: new Date('2026-05-17T16:00:00.000Z'),
            nextCareAt: new Date('2026-05-18T00:00:00.000Z'),
          }),
        ],
      })
      const plant = toPlantWithRoom(testPlant)
      const schedule = createSchedule('plant-1', {
        frequencyDays: 1,
        lastCareAt: new Date('2026-05-17T16:00:00.000Z'),
        nextCareAt: new Date('2026-05-18T00:00:00.000Z'),
      })
      const schedulesRef = [schedule]

      const user = createTestUser({
        id: userId,
        careReminders: false,
        timezone: 'Europe/Paris',
        preferredNotificationTime: '09:00',
        doNotDisturb: false,
      })

      await Effect.runPromise(
        Effect.gen(function* () {
          yield* executePlantCare(plant, {
            plantId: 'plant-1',
            careType: 'watering',
          })

          // End of "today" in Paris = 2026-05-18 23:59:59.999 Paris = 2026-05-18
          // 21:59:59.999 UTC. nextCareAt must be strictly after this — otherwise
          // the task re-appears in the same local day.
          const endOfTodayParisUtc = new Date('2026-05-18T21:59:59.999Z')
          const updated = schedulesRef[0]!
          expect(updated.nextCareAt).not.toBeNull()
          expect(updated.nextCareAt!.getTime()).toBeGreaterThan(
            endOfTodayParisUtc.getTime()
          )
        }).pipe(
          Effect.provide(
            Layer.mergeAll(
              createMockPlantRepository({
                plants: [testPlant],
                schedules: schedulesRef,
              }),
              createMockCareScheduleRepository({
                schedules: schedulesRef,
                plants: [testPlant],
              }),
              createMockNotificationRepository([]),
              createMockCareLogRepository([]),
              createMockUserRepository([user]),
              createMockDelegationRepository({}),
              createMockEventBus(),
              createMockCurrentUser({
                id: userId,
                name: 'Test User',
                email: 'test@example.com',
                username: 'testuser',
                createdAt: new Date(),
                updatedAt: new Date(),
                role: 'user',
                status: 'active',
              }),
              createMockWeatherProvider(),
              createMockWeatherCache(),
              createMockWeatherRepository()
            )
          ),
          Logger.withMinimumLogLevel(LogLevel.None)
        )
      )
    })
  })
})
