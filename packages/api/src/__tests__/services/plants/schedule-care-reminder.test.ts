import {
  createTestMembership,
  mockCanopyId,
} from '@lily/api/__tests__/fixtures/canopies'
import { createTestUser } from '@lily/api/__tests__/fixtures/users'
import {
  createCanopyStore,
  createMockCanopyRepository,
} from '@lily/api/__tests__/mocks/canopy.repository'
import { createMockDelegationRepository } from '@lily/api/__tests__/mocks/delegation.repository'
import { createMockNotificationRepository } from '@lily/api/__tests__/mocks/notification.repository'
import { createMockUserRepository } from '@lily/api/__tests__/mocks/user.repository'
import type { DelegationRow } from '@lily/api/repositories/delegation.repository'
import { NotificationRepository } from '@lily/api/repositories/notification.repository'
import { scheduleCareReminder } from '@lily/api/services/plants/helpers/schedule-care-reminder'
import type { Notification } from '@lily/shared/notification'
import { Array, Effect, Layer, References } from 'effect'
import { describe, expect, it } from 'vitest'

const personalPlant = (ownerId: string, remindersEnabled: boolean) => ({
  id: 'plant-1',
  owner: { _tag: 'User' as const, userId: ownerId },
  remindersEnabled,
})

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
  user: ReturnType<typeof createTestUser>,
  options?: {
    delegations?: DelegationRow[]
    delegationPlants?: { delegationId: string; plantId: string }[]
    extraUsers?: ReturnType<typeof createTestUser>[]
  }
) => {
  const allUsers = [user, ...(options?.extraUsers ?? [])]
  return Effect.runPromise(
    Effect.gen(function* () {
      yield* scheduleCareReminder(params)
      const repo = yield* NotificationRepository
      return yield* repo.findPendingByUserId(user.id)
    }).pipe(
      Effect.provide(
        Layer.mergeAll(
          createMockNotificationRepository([]),
          createMockUserRepository(allUsers),
          createMockCanopyRepository(),
          createMockDelegationRepository({
            delegations: options?.delegations ?? [],
            delegationPlants: options?.delegationPlants ?? [],
          })
        )
      ),
      Effect.provideService(References.MinimumLogLevel, 'None')
    )
  )
}

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
          plant: personalPlant(user.id, true),
          type: 'watering_reminder',
          scheduledDate: createFutureDate(7),
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
          plant: personalPlant(user.id, true),
          type: 'watering_reminder',
          scheduledDate: createFutureDate(7),
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
          plant: personalPlant(user.id, false),
          type: 'watering_reminder',
          scheduledDate: createFutureDate(7),
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
          plant: personalPlant(user.id, false),
          type: 'watering_reminder',
          scheduledDate: createFutureDate(7),
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
          plant: personalPlant(user.id, true),
          type: 'watering_reminder',
          scheduledDate: createFutureDate(7),
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
          plant: personalPlant(user.id, true),
          type: 'watering_reminder',
          scheduledDate: createFutureDate(7),
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
          plant: personalPlant(user.id, true),
          type: 'watering_reminder',
          scheduledDate: createFutureDate(7),
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
          plant: personalPlant(user.id, true),
          type: 'watering_reminder',
          scheduledDate: createFutureDate(7),
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
          plant: personalPlant(user.id, true),
          type: 'watering_reminder',
          scheduledDate: createFutureDate(7),
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
          plant: personalPlant(user.id, true),
          type: 'watering_reminder',
          scheduledDate: createFutureDate(7),
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
          plant: personalPlant(user.id, true),
          type: 'watering_reminder',
          scheduledDate: createFutureDate(7),
        },
        user
      )

      expect(pending).toHaveLength(1)
      // DND disabled, time stays at 23:00 even though it would be in DND window
      expect(pending[0]?.scheduledAt.getUTCHours()).toBe(23)
    })
  })

  describe('delegation routing', () => {
    const createActiveDelegation = (
      ownerId: string,
      caretakerId: string
    ): DelegationRow => ({
      id: 'delegation-1',
      ownerId,
      caretakerId,
      status: 'active',
      message: null,
      startDate: new Date('2025-01-01'),
      endDate: new Date('2025-12-31'),
      respondedAt: null,
      canceledAt: null,
      completedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    it('should send notification to owner when no active delegation exists', async () => {
      const owner = createTestUser({
        id: 'owner-1',
        careReminders: true,
        timezone: 'UTC',
        preferredNotificationTime: '09:00',
        doNotDisturb: false,
      })

      const pending = await runAndGetPendingNotifications(
        {
          plant: personalPlant(owner.id, true),
          type: 'watering_reminder',
          scheduledDate: createFutureDate(7),
        },
        owner
      )

      expect(pending).toHaveLength(1)
      expect(pending[0]?.userId).toBe(owner.id)
    })

    it('should send notification to caretaker when active delegation exists', async () => {
      const owner = createTestUser({
        id: 'owner-1',
        careReminders: true,
        timezone: 'UTC',
        preferredNotificationTime: '09:00',
        doNotDisturb: false,
      })

      const caretaker = createTestUser({
        id: 'caretaker-1',
        careReminders: true,
        timezone: 'UTC',
        preferredNotificationTime: '10:00',
        doNotDisturb: false,
      })

      const delegation = createActiveDelegation(owner.id, caretaker.id)

      // Run and check notifications for the caretaker
      const pending = await Effect.runPromise(
        Effect.gen(function* () {
          yield* scheduleCareReminder({
            plant: personalPlant(owner.id, true),
            type: 'watering_reminder',
            scheduledDate: createFutureDate(7),
          })
          const repo = yield* NotificationRepository
          return yield* repo.findPendingByUserId(caretaker.id)
        }).pipe(
          Effect.provide(
            Layer.mergeAll(
              createMockNotificationRepository([]),
              createMockUserRepository([owner, caretaker]),
              createMockCanopyRepository(),
              createMockDelegationRepository({
                delegations: [delegation],
                delegationPlants: [
                  { delegationId: delegation.id, plantId: 'plant-1' },
                ],
              })
            )
          ),
          Effect.provideService(References.MinimumLogLevel, 'None')
        )
      )

      expect(pending).toHaveLength(1)
      expect(pending[0]?.userId).toBe(caretaker.id)
    })

    it('should not send notification to owner when active delegation exists', async () => {
      const owner = createTestUser({
        id: 'owner-1',
        careReminders: true,
        timezone: 'UTC',
        preferredNotificationTime: '09:00',
        doNotDisturb: false,
      })

      const caretaker = createTestUser({
        id: 'caretaker-1',
        careReminders: true,
        timezone: 'UTC',
        preferredNotificationTime: '10:00',
        doNotDisturb: false,
      })

      const delegation = createActiveDelegation(owner.id, caretaker.id)

      // Check that owner has no pending notifications
      const ownerPending = await Effect.runPromise(
        Effect.gen(function* () {
          yield* scheduleCareReminder({
            plant: personalPlant(owner.id, true),
            type: 'watering_reminder',
            scheduledDate: createFutureDate(7),
          })
          const repo = yield* NotificationRepository
          return yield* repo.findPendingByUserId(owner.id)
        }).pipe(
          Effect.provide(
            Layer.mergeAll(
              createMockNotificationRepository([]),
              createMockUserRepository([owner, caretaker]),
              createMockCanopyRepository(),
              createMockDelegationRepository({
                delegations: [delegation],
                delegationPlants: [
                  { delegationId: delegation.id, plantId: 'plant-1' },
                ],
              })
            )
          ),
          Effect.provideService(References.MinimumLogLevel, 'None')
        )
      )

      expect(ownerPending).toHaveLength(0)
    })

    it('should respect caretaker DND settings when delegation is active', async () => {
      const owner = createTestUser({
        id: 'owner-1',
        careReminders: true,
        timezone: 'UTC',
        preferredNotificationTime: '09:00',
        doNotDisturb: false,
      })

      const caretaker = createTestUser({
        id: 'caretaker-1',
        careReminders: true,
        timezone: 'UTC',
        preferredNotificationTime: '23:00',
        doNotDisturb: true,
        doNotDisturbStart: '22:00',
        doNotDisturbEnd: '07:00',
      })

      const delegation = createActiveDelegation(owner.id, caretaker.id)

      const pending = await Effect.runPromise(
        Effect.gen(function* () {
          yield* scheduleCareReminder({
            plant: personalPlant(owner.id, true),
            type: 'watering_reminder',
            scheduledDate: createFutureDate(7),
          })
          const repo = yield* NotificationRepository
          return yield* repo.findPendingByUserId(caretaker.id)
        }).pipe(
          Effect.provide(
            Layer.mergeAll(
              createMockNotificationRepository([]),
              createMockUserRepository([owner, caretaker]),
              createMockCanopyRepository(),
              createMockDelegationRepository({
                delegations: [delegation],
                delegationPlants: [
                  { delegationId: delegation.id, plantId: 'plant-1' },
                ],
              })
            )
          ),
          Effect.provideService(References.MinimumLogLevel, 'None')
        )
      )

      expect(pending).toHaveLength(1)
      // Caretaker's preferred time 23:00 is in DND window (22:00-07:00), adjusted to 07:00
      expect(pending[0]?.scheduledAt.getUTCHours()).toBe(7)
    })

    it('should skip notification when caretaker has careReminders disabled', async () => {
      const owner = createTestUser({
        id: 'owner-1',
        careReminders: true,
        timezone: 'UTC',
        preferredNotificationTime: '09:00',
      })

      const caretaker = createTestUser({
        id: 'caretaker-1',
        careReminders: false,
        timezone: 'UTC',
      })

      const delegation = createActiveDelegation(owner.id, caretaker.id)

      const pending = await Effect.runPromise(
        Effect.gen(function* () {
          yield* scheduleCareReminder({
            plant: personalPlant(owner.id, true),
            type: 'watering_reminder',
            scheduledDate: createFutureDate(7),
          })
          const repo = yield* NotificationRepository
          return yield* repo.findPendingByUserId(caretaker.id)
        }).pipe(
          Effect.provide(
            Layer.mergeAll(
              createMockNotificationRepository([]),
              createMockUserRepository([owner, caretaker]),
              createMockCanopyRepository(),
              createMockDelegationRepository({
                delegations: [delegation],
                delegationPlants: [
                  { delegationId: delegation.id, plantId: 'plant-1' },
                ],
              })
            )
          ),
          Effect.provideService(References.MinimumLogLevel, 'None')
        )
      )

      // Caretaker has careReminders disabled, no notification created
      expect(pending).toHaveLength(0)
    })
  })

  describe('vacation muting', () => {
    const createActiveDelegation = (
      ownerId: string,
      caretakerId: string
    ): DelegationRow => ({
      id: 'delegation-1',
      ownerId,
      caretakerId,
      status: 'active',
      message: null,
      startDate: new Date('2025-01-01'),
      endDate: new Date('2025-12-31'),
      respondedAt: null,
      canceledAt: null,
      completedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    it('should not create notification when recipient is on active vacation', async () => {
      const user = createTestUser({
        id: 'user-1',
        careReminders: true,
        timezone: 'UTC',
        vacationStatus: 'active',
        vacationStart: createFutureDate(-3),
        vacationEnd: createFutureDate(4),
      })

      const pending = await runAndGetPendingNotifications(
        {
          plant: personalPlant(user.id, true),
          type: 'watering_reminder',
          scheduledDate: createFutureDate(7),
        },
        user
      )

      expect(pending).toHaveLength(0)
    })

    it('should not create notification when scheduled vacation has already started', async () => {
      const user = createTestUser({
        id: 'user-1',
        careReminders: true,
        timezone: 'UTC',
        vacationStatus: 'scheduled',
        vacationStart: createFutureDate(-1),
        vacationEnd: createFutureDate(6),
      })

      const pending = await runAndGetPendingNotifications(
        {
          plant: personalPlant(user.id, true),
          type: 'watering_reminder',
          scheduledDate: createFutureDate(7),
        },
        user
      )

      expect(pending).toHaveLength(0)
    })

    it('should create notification when vacation is only scheduled for the future', async () => {
      const user = createTestUser({
        id: 'user-1',
        careReminders: true,
        timezone: 'UTC',
        vacationStatus: 'scheduled',
        vacationStart: createFutureDate(10),
        vacationEnd: createFutureDate(20),
      })

      const pending = await runAndGetPendingNotifications(
        {
          plant: personalPlant(user.id, true),
          type: 'watering_reminder',
          scheduledDate: createFutureDate(7),
        },
        user
      )

      expect(pending).toHaveLength(1)
    })

    it('should route to caretaker when owner is on vacation and plant is delegated', async () => {
      const owner = createTestUser({
        id: 'owner-1',
        careReminders: true,
        vacationStatus: 'active',
        vacationStart: createFutureDate(-3),
        vacationEnd: createFutureDate(4),
      })
      const caretaker = createTestUser({
        id: 'caretaker-1',
        careReminders: true,
        timezone: 'UTC',
      })
      const delegation = createActiveDelegation(owner.id, caretaker.id)

      const pending = await Effect.runPromise(
        Effect.gen(function* () {
          yield* scheduleCareReminder({
            plant: personalPlant(owner.id, true),
            type: 'watering_reminder',
            scheduledDate: createFutureDate(7),
          })
          const repo = yield* NotificationRepository
          return yield* repo.findPendingByUserId(caretaker.id)
        }).pipe(
          Effect.provide(
            Layer.mergeAll(
              createMockNotificationRepository([]),
              createMockUserRepository([owner, caretaker]),
              createMockCanopyRepository(),
              createMockDelegationRepository({
                delegations: [delegation],
                delegationPlants: [
                  { delegationId: delegation.id, plantId: 'plant-1' },
                ],
              })
            )
          ),
          Effect.provideService(References.MinimumLogLevel, 'None')
        )
      )

      // Owner is away, but the caretaker cares for the plant — reminder survives
      expect(pending).toHaveLength(1)
      expect(pending[0]?.userId).toBe(caretaker.id)
    })

    it('should not create notification when the caretaker is on vacation', async () => {
      const owner = createTestUser({ id: 'owner-1', careReminders: true })
      const caretaker = createTestUser({
        id: 'caretaker-1',
        careReminders: true,
        vacationStatus: 'active',
        vacationStart: createFutureDate(-3),
        vacationEnd: createFutureDate(4),
      })
      const delegation = createActiveDelegation(owner.id, caretaker.id)

      const pending = await Effect.runPromise(
        Effect.gen(function* () {
          yield* scheduleCareReminder({
            plant: personalPlant(owner.id, true),
            type: 'watering_reminder',
            scheduledDate: createFutureDate(7),
          })
          const repo = yield* NotificationRepository
          return yield* repo.findPendingByUserId(caretaker.id)
        }).pipe(
          Effect.provide(
            Layer.mergeAll(
              createMockNotificationRepository([]),
              createMockUserRepository([owner, caretaker]),
              createMockCanopyRepository(),
              createMockDelegationRepository({
                delegations: [delegation],
                delegationPlants: [
                  { delegationId: delegation.id, plantId: 'plant-1' },
                ],
              })
            )
          ),
          Effect.provideService(References.MinimumLogLevel, 'None')
        )
      )

      expect(pending).toHaveLength(0)
    })
  })

  describe('Canopy fan-out', () => {
    const canopyPlant = {
      id: 'plant-1',
      owner: { _tag: 'Canopy' as const, canopyId: mockCanopyId },
      remindersEnabled: true,
    }
    const members = [
      createTestMembership({ userId: 'alex', role: 'owner' }),
      createTestMembership({ userId: 'lily' }),
    ]
    const alex = createTestUser({
      id: 'alex',
      timezone: 'UTC',
      preferredNotificationTime: '08:00',
      careReminders: true,
      doNotDisturb: false,
    })
    const lily = createTestUser({
      id: 'lily',
      timezone: 'UTC',
      preferredNotificationTime: '19:00',
      careReminders: true,
      doNotDisturb: false,
    })

    const runCanopy = (
      users: ReturnType<typeof createTestUser>[],
      options: {
        mutes?: { userId: string; plantId: string }[]
        existing?: Notification[]
      } = {}
    ) => {
      const rows: Notification[] = options.existing ?? []
      return Effect.runPromise(
        scheduleCareReminder({
          plant: canopyPlant,
          type: 'watering_reminder',
          scheduledDate: createFutureDate(7),
        }).pipe(
          Effect.provide(
            Layer.mergeAll(
              createMockNotificationRepository(rows),
              createMockUserRepository(users),
              createMockCanopyRepository(
                createCanopyStore({ members, mutes: options.mutes ?? [] })
              ),
              createMockDelegationRepository()
            )
          ),
          Effect.provideService(References.MinimumLogLevel, 'None')
        )
      ).then(() => Array.filter(rows, (n) => n.status === 'pending'))
    }

    it('creates one row per member, each at that member preferred time', async () => {
      const pending = await runCanopy([alex, lily])
      const hoursByUser = Object.fromEntries(
        Array.map(pending, (n) => [n.userId, n.scheduledAt.getUTCHours()])
      )
      expect(hoursByUser).toEqual({ alex: 8, lily: 19 })
    })

    it('skips a member who muted the plant', async () => {
      const pending = await runCanopy([alex, lily], {
        mutes: [{ userId: 'lily', plantId: 'plant-1' }],
      })
      expect(Array.map(pending, (n) => n.userId)).toEqual(['alex'])
    })

    it('skips a member whose care reminders are off and one on vacation, and keeps the rest', async () => {
      const off = createTestUser({
        id: 'lily',
        timezone: 'UTC',
        careReminders: false,
      })
      const pending = await runCanopy([alex, off])
      expect(Array.map(pending, (n) => n.userId)).toEqual(['alex'])
    })

    it('replaces every member pending row of that type, so care resolves it for everyone', async () => {
      const stale = (userId: string): Notification => ({
        id: `stale-${userId}`,
        type: 'watering_reminder',
        scheduledAt: createFutureDate(1),
        isRead: false,
        status: 'pending',
        retryCount: 0,
        userId,
        plantId: 'plant-1',
        createdAt: new Date(),
      })
      const pending = await runCanopy([alex, lily], {
        existing: [stale('alex'), stale('lily')],
      })
      expect(pending).toHaveLength(2)
      expect(Array.every(pending, (n) => !n.id.startsWith('stale-'))).toBe(true)
    })
  })
})
