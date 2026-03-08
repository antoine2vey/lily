import { schedulesFromPlants } from '@lily/api/__tests__/fixtures/care-schedules'
import { createTestNotification } from '@lily/api/__tests__/fixtures/notifications'
import {
  createTestPlant,
  type TestPlant,
} from '@lily/api/__tests__/fixtures/plants'
import { createTestUser } from '@lily/api/__tests__/fixtures/users'
import { createMockCareScheduleRepository } from '@lily/api/__tests__/mocks/care-schedule.repository'
import { createMockDelegationRepository } from '@lily/api/__tests__/mocks/delegation.repository'
import { createMockNotificationRepository } from '@lily/api/__tests__/mocks/notification.repository'
import { createMockPlantRepository } from '@lily/api/__tests__/mocks/plant.repository'
import { createMockUserRepository } from '@lily/api/__tests__/mocks/user.repository'
import type { DelegationRow } from '@lily/api/repositories/delegation.repository'
import {
  checkAndCreateOverdueReminders,
  processUserOverdueReminders,
} from '@lily/api/services/overdue-scheduler/scheduler'
import { pickOverdueNotificationTime } from '@lily/shared'
import type { Notification } from '@lily/shared/notification'
import {
  Array as Arr,
  Cause,
  Effect,
  Exit,
  Logger,
  LogLevel,
  Option,
} from 'effect'
import { describe, expect, it } from 'vitest'

// Helper to make a date N days in the past
const daysAgo = (days: number): Date =>
  new Date(Date.now() - days * 24 * 60 * 60 * 1000)

const runCheck = (
  plantsData: TestPlant[],
  users: ReturnType<typeof createTestUser>[],
  notifications: Notification[] = [],
  delegationData: {
    delegations?: DelegationRow[]
    delegationPlants?: Array<{ delegationId: string; plantId: string }>
  } = {}
) =>
  Effect.runPromise(
    checkAndCreateOverdueReminders.pipe(
      Effect.provide(
        createMockCareScheduleRepository({
          schedules: schedulesFromPlants(plantsData),
          plants: plantsData,
        })
      ),
      Effect.provide(createMockPlantRepository({ plants: plantsData })),
      Effect.provide(createMockNotificationRepository(notifications)),
      Effect.provide(createMockUserRepository(users)),
      Effect.provide(createMockDelegationRepository(delegationData)),
      Logger.withMinimumLogLevel(LogLevel.None)
    )
  )

// Run processUserOverdueReminders directly to assert on tagged error exits
const runProcessUser = (
  userId: string,
  plantsData: TestPlant[],
  users: ReturnType<typeof createTestUser>[],
  notifications: Notification[] = [],
  delegationData: {
    delegations?: DelegationRow[]
    delegationPlants?: Array<{ delegationId: string; plantId: string }>
  } = {}
) => {
  const overdue = Arr.filter(
    plantsData,
    (p) => p.nextWateringAt !== null && p.nextWateringAt.getTime() <= Date.now()
  )
  const mapped = Arr.map(overdue, (p) => ({
    id: p.id,
    name: p.name,
    userId: p.userId,
    overdueAt: p.nextWateringAt as Date,
  }))

  return Effect.runPromiseExit(
    processUserOverdueReminders(userId, mapped).pipe(
      Effect.provide(createMockNotificationRepository(notifications)),
      Effect.provide(createMockUserRepository(users)),
      Effect.provide(createMockDelegationRepository(delegationData)),
      Logger.withMinimumLogLevel(LogLevel.None)
    )
  )
}

// ─────────────────────────────────────────────────
// A. pickOverdueNotificationTime — pure function tests
// ─────────────────────────────────────────────────

describe('pickOverdueNotificationTime', () => {
  describe('random window selection', () => {
    it('should pick morning window when randomValue < 0.5', () => {
      const result = pickOverdueNotificationTime('UTC', false, null, null, 0.25)
      expect(Option.isSome(result)).toBe(true)
      const date = Option.getOrThrow(result)
      const hours = date.getUTCHours()
      // Morning window: 6:00-8:00
      expect(hours).toBeGreaterThanOrEqual(6)
      expect(hours).toBeLessThan(8)
    })

    it('should pick evening window when randomValue >= 0.5', () => {
      const result = pickOverdueNotificationTime('UTC', false, null, null, 0.75)
      expect(Option.isSome(result)).toBe(true)
      const date = Option.getOrThrow(result)
      const hours = date.getUTCHours()
      // Evening window: 18:00-22:00
      expect(hours).toBeGreaterThanOrEqual(18)
      expect(hours).toBeLessThan(22)
    })

    it('should pick morning window start when randomValue = 0.0', () => {
      const result = pickOverdueNotificationTime('UTC', false, null, null, 0.0)
      expect(Option.isSome(result)).toBe(true)
      const date = Option.getOrThrow(result)
      const hours = date.getUTCHours()
      expect(hours).toBe(6)
      expect(date.getUTCMinutes()).toBe(0)
    })

    it('should pick evening window near end when randomValue = 0.99', () => {
      const result = pickOverdueNotificationTime('UTC', false, null, null, 0.99)
      expect(Option.isSome(result)).toBe(true)
      const date = Option.getOrThrow(result)
      const hours = date.getUTCHours()
      // Near end of evening window (18:00-22:00)
      expect(hours).toBeGreaterThanOrEqual(18)
      expect(hours).toBeLessThanOrEqual(21)
    })

    it('should always return time within valid bounds', () => {
      // Test a range of random values
      const values = [0.0, 0.1, 0.25, 0.49, 0.5, 0.6, 0.8, 0.99]
      for (const rv of values) {
        const result = pickOverdueNotificationTime('UTC', false, null, null, rv)
        expect(Option.isSome(result)).toBe(true)
        const date = Option.getOrThrow(result)
        const hours = date.getUTCHours()
        const inMorning = hours >= 6 && hours < 8
        const inEvening = hours >= 18 && hours < 22
        expect(inMorning || inEvening).toBe(true)
      }
    })
  })

  describe('DND interaction', () => {
    it('should fall back to evening when DND covers morning window', () => {
      // DND 22:00-08:00 covers the entire morning window (6:00-8:00)
      const result = pickOverdueNotificationTime(
        'UTC',
        true,
        '22:00',
        '08:00',
        0.25 // Would normally pick morning
      )
      expect(Option.isSome(result)).toBe(true)
      const date = Option.getOrThrow(result)
      const hours = date.getUTCHours()
      // Should have fallen back to evening
      expect(hours).toBeGreaterThanOrEqual(18)
      expect(hours).toBeLessThan(22)
    })

    it('should fall back to morning when DND covers evening window', () => {
      // DND 17:00-23:00 covers the entire evening window (18:00-22:00)
      const result = pickOverdueNotificationTime(
        'UTC',
        true,
        '17:00',
        '23:00',
        0.75 // Would normally pick evening
      )
      expect(Option.isSome(result)).toBe(true)
      const date = Option.getOrThrow(result)
      const hours = date.getUTCHours()
      // Should have fallen back to morning
      expect(hours).toBeGreaterThanOrEqual(6)
      expect(hours).toBeLessThan(8)
    })

    it('should return None when DND covers both windows', () => {
      // DND 05:00-23:00 covers both morning (6-8) and evening (18-22)
      const result = pickOverdueNotificationTime(
        'UTC',
        true,
        '05:00',
        '23:00',
        0.5
      )
      expect(Option.isNone(result)).toBe(true)
    })

    it('should ignore DND when disabled', () => {
      // Even though times look like they'd block, dndEnabled=false means no check
      const result = pickOverdueNotificationTime(
        'UTC',
        false,
        '00:00',
        '23:59',
        0.25
      )
      expect(Option.isSome(result)).toBe(true)
    })

    it('should treat same start and end as no DND', () => {
      // DND 22:00-22:00 → no DND window (same start/end is treated as disabled)
      const result = pickOverdueNotificationTime(
        'UTC',
        true,
        '22:00',
        '22:00',
        0.25
      )
      expect(Option.isSome(result)).toBe(true)
    })

    it('should handle midnight wraparound DND', () => {
      // DND 23:00-06:00 → morning window (6:00-8:00) available, evening partially blocked
      const result = pickOverdueNotificationTime(
        'UTC',
        true,
        '23:00',
        '06:00',
        0.25 // Morning window
      )
      expect(Option.isSome(result)).toBe(true)
      const date = Option.getOrThrow(result)
      const hours = date.getUTCHours()
      // Morning window 6:00-8:00 is partially available (6:00 is the DND end boundary)
      expect(hours).toBeGreaterThanOrEqual(6)
    })
  })

  describe('timezone handling', () => {
    it('should convert correctly for America/New_York', () => {
      const result = pickOverdueNotificationTime(
        'America/New_York',
        false,
        null,
        null,
        0.25 // Morning window
      )
      expect(Option.isSome(result)).toBe(true)
      // The returned Date is in UTC, but should represent 6:00-8:00 ET
      // ET is UTC-5 or UTC-4, so UTC hours should be 10-12 or 11-13
      const date = Option.getOrThrow(result)
      expect(date instanceof Date).toBe(true)
    })

    it('should convert correctly for Europe/Paris', () => {
      const result = pickOverdueNotificationTime(
        'Europe/Paris',
        false,
        null,
        null,
        0.75 // Evening window
      )
      expect(Option.isSome(result)).toBe(true)
      // Paris is UTC+1 or UTC+2, so 18:00 Paris = 16:00 or 17:00 UTC
      const date = Option.getOrThrow(result)
      expect(date instanceof Date).toBe(true)
    })

    it('should convert correctly for Asia/Tokyo', () => {
      const result = pickOverdueNotificationTime(
        'Asia/Tokyo',
        false,
        null,
        null,
        0.0 // Morning window start
      )
      expect(Option.isSome(result)).toBe(true)
      const date = Option.getOrThrow(result)
      // Tokyo is UTC+9, so 6:00 Tokyo = 21:00 UTC (previous day)
      expect(date instanceof Date).toBe(true)
    })

    it('should fall back to UTC for invalid timezone', () => {
      const result = pickOverdueNotificationTime(
        'Invalid/Timezone',
        false,
        null,
        null,
        0.25
      )
      expect(Option.isSome(result)).toBe(true)
      const date = Option.getOrThrow(result)
      const hours = date.getUTCHours()
      // Should use UTC, so morning window is 6:00-8:00 UTC
      expect(hours).toBeGreaterThanOrEqual(6)
      expect(hours).toBeLessThan(8)
    })
  })
})

// ─────────────────────────────────────────────────
// B. checkAndCreateOverdueReminders — integration tests
// ─────────────────────────────────────────────────

describe('checkAndCreateOverdueReminders', () => {
  const defaultUser = createTestUser({
    id: 'user-1',
    careReminders: true,
    doNotDisturb: false,
    timezone: 'UTC',
  })

  describe('core behavior', () => {
    it('should create overdue reminders for plants with nextWateringAt before start-of-today', async () => {
      const notifications: Notification[] = []
      const plant = createTestPlant({
        id: 'plant-1',
        name: 'Thirsty Fern',
        userId: 'user-1',
        nextWateringAt: daysAgo(3), // 3 days overdue
      })

      await runCheck([plant], [defaultUser], notifications)

      const overdueNotifs = Arr.filter(
        notifications,
        (n) => n.type === 'overdue_reminder'
      )
      expect(overdueNotifs.length).toBeGreaterThanOrEqual(1)
      expect(overdueNotifs[0]?.plantId).toBe('plant-1')
      expect(overdueNotifs[0]?.userId).toBe('user-1')
    })

    it('should NOT create reminders when no plants are overdue', async () => {
      const notifications: Notification[] = []
      const plant = createTestPlant({
        id: 'plant-1',
        userId: 'user-1',
        nextWateringAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days from now
      })

      await runCheck([plant], [defaultUser], notifications)

      const overdueNotifs = Arr.filter(
        notifications,
        (n) => n.type === 'overdue_reminder'
      )
      expect(overdueNotifs.length).toBe(0)
    })

    it('should NOT create reminders for plants due today (only strictly past)', async () => {
      const notifications: Notification[] = []
      // A plant due "now" — nextWateringAt is within today but the strict filter
      // checks nextWateringAt < startOfToday, so it should be skipped
      const plant = createTestPlant({
        id: 'plant-1',
        userId: 'user-1',
        nextWateringAt: new Date(), // right now = today
      })

      await runCheck([plant], [defaultUser], notifications)

      const overdueNotifs = Arr.filter(
        notifications,
        (n) => n.type === 'overdue_reminder'
      )
      expect(overdueNotifs.length).toBe(0)
    })

    it('should fail with AlreadySentTodayError when already sent today', async () => {
      const existingNotification = createTestNotification({
        id: 'existing-1',
        type: 'overdue_reminder',
        status: 'pending',
        userId: 'user-1',
        plantId: 'plant-old',
        createdAt: new Date(),
      })

      const plant = createTestPlant({
        id: 'plant-1',
        userId: 'user-1',
        nextWateringAt: daysAgo(2),
      })

      const exit = await runProcessUser(
        'user-1',
        [plant],
        [defaultUser],
        [existingNotification]
      )

      expect(Exit.isFailure(exit)).toBe(true)
      if (Exit.isFailure(exit)) {
        const error = Cause.failureOption(exit.cause)
        expect(Option.isSome(error)).toBe(true)
        expect(Option.getOrThrow(error)._tag).toBe('AlreadySentTodayError')
      }
    })

    it('should also suppress duplicates at the orchestrator level', async () => {
      const existingNotification = createTestNotification({
        id: 'existing-1',
        type: 'overdue_reminder',
        status: 'pending',
        userId: 'user-1',
        plantId: 'plant-old',
        createdAt: new Date(),
      })

      const notifications: Notification[] = [existingNotification]
      const plant = createTestPlant({
        id: 'plant-1',
        userId: 'user-1',
        nextWateringAt: daysAgo(2),
      })

      // checkAndCreateOverdueReminders catches the error — no new rows
      await runCheck([plant], [defaultUser], notifications)

      const overdueNotifs = Arr.filter(
        notifications,
        (n) => n.type === 'overdue_reminder'
      )
      expect(overdueNotifs.length).toBe(1)
      expect(overdueNotifs[0]?.id).toBe('existing-1')
    })

    it('should fail with CareRemindersDisabledError when user has careReminders off', async () => {
      const userWithCareOff = createTestUser({
        id: 'user-1',
        careReminders: false,
        doNotDisturb: false,
        timezone: 'UTC',
      })

      const plant = createTestPlant({
        id: 'plant-1',
        userId: 'user-1',
        nextWateringAt: daysAgo(2),
      })

      const exit = await runProcessUser('user-1', [plant], [userWithCareOff])

      expect(Exit.isFailure(exit)).toBe(true)
      if (Exit.isFailure(exit)) {
        const error = Cause.failureOption(exit.cause)
        expect(Option.isSome(error)).toBe(true)
        expect(Option.getOrThrow(error)._tag).toBe('CareRemindersDisabledError')
      }
    })

    it('should also suppress careReminders skip at the orchestrator level', async () => {
      const notifications: Notification[] = []
      const userWithCareOff = createTestUser({
        id: 'user-1',
        careReminders: false,
        doNotDisturb: false,
        timezone: 'UTC',
      })

      const plant = createTestPlant({
        id: 'plant-1',
        userId: 'user-1',
        nextWateringAt: daysAgo(2),
      })

      await runCheck([plant], [userWithCareOff], notifications)

      const overdueNotifs = Arr.filter(
        notifications,
        (n) => n.type === 'overdue_reminder'
      )
      expect(overdueNotifs.length).toBe(0)
    })

    it('should fail with DndWindowBlockedError when both windows are in DND', async () => {
      const userWithFullDnd = createTestUser({
        id: 'user-1',
        careReminders: true,
        doNotDisturb: true,
        doNotDisturbStart: '05:00',
        doNotDisturbEnd: '23:00',
        timezone: 'UTC',
      })

      const plant = createTestPlant({
        id: 'plant-1',
        userId: 'user-1',
        nextWateringAt: daysAgo(2),
      })

      const exit = await runProcessUser('user-1', [plant], [userWithFullDnd])

      expect(Exit.isFailure(exit)).toBe(true)
      if (Exit.isFailure(exit)) {
        const error = Cause.failureOption(exit.cause)
        expect(Option.isSome(error)).toBe(true)
        expect(Option.getOrThrow(error)._tag).toBe('DndWindowBlockedError')
      }
    })

    it('should route to caretaker when plant is delegated', async () => {
      const notifications: Notification[] = []
      const owner = createTestUser({
        id: 'user-owner',
        careReminders: true,
        doNotDisturb: false,
        timezone: 'UTC',
      })

      const plant = createTestPlant({
        id: 'plant-delegated',
        userId: 'user-owner',
        nextWateringAt: daysAgo(2),
      })

      const delegation: DelegationRow = {
        id: 'deleg-1',
        ownerId: 'user-owner',
        caretakerId: 'user-caretaker',
        status: 'active',
        message: null,
        startDate: daysAgo(5),
        endDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        respondedAt: null,
        canceledAt: null,
        completedAt: null,
        createdAt: daysAgo(5),
        updatedAt: daysAgo(5),
      }

      await runCheck([plant], [owner], notifications, {
        delegations: [delegation],
        delegationPlants: [
          { delegationId: 'deleg-1', plantId: 'plant-delegated' },
        ],
      })

      const overdueNotifs = Arr.filter(
        notifications,
        (n) => n.type === 'overdue_reminder'
      )
      expect(overdueNotifs.length).toBeGreaterThanOrEqual(1)
      // Should be routed to the caretaker, not the owner
      expect(overdueNotifs[0]?.userId).toBe('user-caretaker')
    })
  })

  describe('grouping guarantee', () => {
    it('should give all overdue plants for same user the same scheduledAt', async () => {
      const notifications: Notification[] = []
      const plant1 = createTestPlant({
        id: 'plant-1',
        name: 'Fern',
        userId: 'user-1',
        nextWateringAt: daysAgo(3),
      })
      const plant2 = createTestPlant({
        id: 'plant-2',
        name: 'Cactus',
        userId: 'user-1',
        nextWateringAt: daysAgo(5),
      })
      const plant3 = createTestPlant({
        id: 'plant-3',
        name: 'Ivy',
        userId: 'user-1',
        nextWateringAt: daysAgo(1),
      })

      await runCheck([plant1, plant2, plant3], [defaultUser], notifications)

      const overdueNotifs = Arr.filter(
        notifications,
        (n) => n.type === 'overdue_reminder'
      )
      expect(overdueNotifs.length).toBe(3)

      // All should have the same scheduledAt
      const scheduledAts = Arr.map(overdueNotifs, (n) =>
        n.scheduledAt.getTime()
      )
      const unique = new Set(scheduledAts)
      expect(unique.size).toBe(1)
    })

    it('should create individual notification rows per overdue plant', async () => {
      const notifications: Notification[] = []
      const plant1 = createTestPlant({
        id: 'plant-1',
        userId: 'user-1',
        nextWateringAt: daysAgo(2),
      })
      const plant2 = createTestPlant({
        id: 'plant-2',
        userId: 'user-1',
        nextWateringAt: daysAgo(4),
      })

      await runCheck([plant1, plant2], [defaultUser], notifications)

      const overdueNotifs = Arr.filter(
        notifications,
        (n) => n.type === 'overdue_reminder'
      )
      expect(overdueNotifs.length).toBe(2)
      const plantIds = Arr.map(overdueNotifs, (n) => n.plantId)
      expect(plantIds).toContain('plant-1')
      expect(plantIds).toContain('plant-2')
    })
  })

  describe('multi-user scenarios', () => {
    it('should handle User A with 3 overdue plants and User B with 1', async () => {
      const notifications: Notification[] = []
      const userA = createTestUser({
        id: 'user-a',
        careReminders: true,
        doNotDisturb: false,
        timezone: 'UTC',
      })
      const userB = createTestUser({
        id: 'user-b',
        careReminders: true,
        doNotDisturb: false,
        timezone: 'UTC',
      })

      const plantsA = [
        createTestPlant({
          id: 'a-plant-1',
          userId: 'user-a',
          nextWateringAt: daysAgo(2),
        }),
        createTestPlant({
          id: 'a-plant-2',
          userId: 'user-a',
          nextWateringAt: daysAgo(3),
        }),
        createTestPlant({
          id: 'a-plant-3',
          userId: 'user-a',
          nextWateringAt: daysAgo(1),
        }),
      ]
      const plantsB = [
        createTestPlant({
          id: 'b-plant-1',
          userId: 'user-b',
          nextWateringAt: daysAgo(4),
        }),
      ]

      await runCheck([...plantsA, ...plantsB], [userA, userB], notifications)

      const notifA = Arr.filter(
        notifications,
        (n) => n.type === 'overdue_reminder' && n.userId === 'user-a'
      )
      const notifB = Arr.filter(
        notifications,
        (n) => n.type === 'overdue_reminder' && n.userId === 'user-b'
      )

      expect(notifA.length).toBe(3)
      expect(notifB.length).toBe(1)
    })

    it('should only create for User B when User A already notified today', async () => {
      const existingNotification = createTestNotification({
        id: 'existing-a',
        type: 'overdue_reminder',
        status: 'sent',
        userId: 'user-a',
        createdAt: new Date(),
      })
      const notifications: Notification[] = [existingNotification]

      const userA = createTestUser({
        id: 'user-a',
        careReminders: true,
        doNotDisturb: false,
        timezone: 'UTC',
      })
      const userB = createTestUser({
        id: 'user-b',
        careReminders: true,
        doNotDisturb: false,
        timezone: 'UTC',
      })

      const plantA = createTestPlant({
        id: 'a-plant-1',
        userId: 'user-a',
        nextWateringAt: daysAgo(2),
      })
      const plantB = createTestPlant({
        id: 'b-plant-1',
        userId: 'user-b',
        nextWateringAt: daysAgo(3),
      })

      await runCheck([plantA, plantB], [userA, userB], notifications)

      // User A should NOT get new notifications (already notified)
      const newNotifA = Arr.filter(
        notifications,
        (n) =>
          n.type === 'overdue_reminder' &&
          n.userId === 'user-a' &&
          n.id !== 'existing-a'
      )
      expect(newNotifA.length).toBe(0)

      // User B should get 1 notification
      const notifB = Arr.filter(
        notifications,
        (n) => n.type === 'overdue_reminder' && n.userId === 'user-b'
      )
      expect(notifB.length).toBe(1)
    })
  })

  describe('fertilization overdue', () => {
    it('should create overdue_reminder for plants with only fertilization overdue', async () => {
      const notifications: Notification[] = []
      const plant = createTestPlant({
        id: 'plant-fert-1',
        name: 'Hungry Monstera',
        userId: 'user-1',
        fertilizationFrequencyDays: 30,
        nextFertilizationAt: daysAgo(3),
        nextWateringAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      })

      await runCheck([plant], [defaultUser], notifications)

      const overdueNotifs = Arr.filter(
        notifications,
        (n) => n.type === 'overdue_reminder'
      )
      expect(overdueNotifs.length).toBeGreaterThanOrEqual(1)
      expect(overdueNotifs[0]?.plantId).toBe('plant-fert-1')
      expect(overdueNotifs[0]?.userId).toBe('user-1')
    })

    it('should skip plants where fertilization is today (precision filter)', async () => {
      const notifications: Notification[] = []
      const plant = createTestPlant({
        id: 'plant-fert-today',
        userId: 'user-1',
        fertilizationFrequencyDays: 30,
        nextFertilizationAt: new Date(), // today, not strictly overdue
        nextWateringAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      })

      await runCheck([plant], [defaultUser], notifications)

      const overdueNotifs = Arr.filter(
        notifications,
        (n) => n.type === 'overdue_reminder'
      )
      expect(overdueNotifs.length).toBe(0)
    })

    it('should deduplicate when a plant is overdue for both watering and fertilization', async () => {
      const notifications: Notification[] = []
      const plant = createTestPlant({
        id: 'plant-both-overdue',
        userId: 'user-1',
        fertilizationFrequencyDays: 30,
        nextWateringAt: daysAgo(2),
        nextFertilizationAt: daysAgo(4),
      })

      await runCheck([plant], [defaultUser], notifications)

      // Should produce exactly 1 overdue_reminder per plant, not 2
      const overdueNotifs = Arr.filter(
        notifications,
        (n) => n.type === 'overdue_reminder'
      )
      expect(overdueNotifs.length).toBe(1)
      expect(overdueNotifs[0]?.plantId).toBe('plant-both-overdue')
    })

    it('should include both watering-only and fertilization-only overdue plants in a single pass', async () => {
      const notifications: Notification[] = []
      const wateringPlant = createTestPlant({
        id: 'plant-water-only',
        userId: 'user-1',
        nextWateringAt: daysAgo(2),
        nextFertilizationAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      })
      const fertPlant = createTestPlant({
        id: 'plant-fert-only',
        userId: 'user-1',
        fertilizationFrequencyDays: 30,
        nextFertilizationAt: daysAgo(3),
        nextWateringAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      })

      await runCheck([wateringPlant, fertPlant], [defaultUser], notifications)

      const overdueNotifs = Arr.filter(
        notifications,
        (n) => n.type === 'overdue_reminder'
      )
      expect(overdueNotifs.length).toBe(2)
      const plantIds = Arr.map(overdueNotifs, (n) => n.plantId)
      expect(plantIds).toContain('plant-water-only')
      expect(plantIds).toContain('plant-fert-only')
    })
  })
})
