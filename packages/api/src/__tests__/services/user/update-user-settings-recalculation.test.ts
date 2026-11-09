import {
  createTestMembership,
  mockCanopyId,
} from '@lily/api/__tests__/fixtures/canopies'
import { schedulesFromPlants } from '@lily/api/__tests__/fixtures/care-schedules'
import {
  createTestPlant,
  type ScheduleSpec,
  type TestPlant,
  wateringSpec,
} from '@lily/api/__tests__/fixtures/plants'
import { mockUser1 } from '@lily/api/__tests__/fixtures/users'
import {
  createCanopyStore,
  createMockCanopyRepository,
  createTestCanopyRow,
  type MockCanopyStore,
} from '@lily/api/__tests__/mocks/canopy.repository'
import { createMockCareLogRepository } from '@lily/api/__tests__/mocks/care-log.repository'
import { createMockCareScheduleRepository } from '@lily/api/__tests__/mocks/care-schedule.repository'
import { createMockDelegationRepository } from '@lily/api/__tests__/mocks/delegation.repository'
import { createMockNotificationRepository } from '@lily/api/__tests__/mocks/notification.repository'
import { createMockPlantRepository } from '@lily/api/__tests__/mocks/plant.repository'
import { createMockRateLimiterService } from '@lily/api/__tests__/mocks/rate-limiter.service'
import { createMockRecipientRepository } from '@lily/api/__tests__/mocks/recipient.repository'
import { createMockCurrentUser } from '@lily/api/__tests__/mocks/session'
import { MockSqlClientLive } from '@lily/api/__tests__/mocks/sql-client'
import { createMockUserRepository } from '@lily/api/__tests__/mocks/user.repository'
import { updateUserSettings } from '@lily/api/services/user/endpoints/update-user-settings'
import type { CareType } from '@lily/shared'
import type { Notification } from '@lily/shared/notification'
import type { UserSettingsUpdateRequest } from '@lily/shared/user'
import { Effect, Layer } from 'effect'
import { describe, expect, it } from 'vitest'

const futureDate = new Date('2030-06-15T12:00:00.000Z')

const spec = (careType: CareType): ScheduleSpec => ({
  careType,
  frequencyDays: 7,
  lastCareAt: null,
  nextCareAt: futureDate,
})

const testPlant = createTestPlant({
  id: 'plant-recalc',
  name: 'Test Plant',
  userId: 'user-1',
  scheduleSpecs: [wateringSpec({ nextCareAt: futureDate })],
})

const testUser = {
  ...mockUser1,
  timezone: 'UTC',
  preferredNotificationTime: '09:00',
}

const pendingWatering = (overrides: Partial<Notification> = {}) => [
  {
    id: 'notif-1',
    type: 'watering_reminder',
    scheduledAt: new Date('2030-06-15T09:00:00.000Z'),
    isRead: false,
    status: 'pending',
    retryCount: 0,
    userId: 'user-1',
    plantId: 'plant-recalc',
    createdAt: new Date(),
    ...overrides,
  } satisfies Notification,
]

const update = (
  request: UserSettingsUpdateRequest,
  scenario: {
    readonly notifications: Notification[]
    readonly user?: typeof testUser
    readonly plants?: TestPlant[]
    readonly canopy?: MockCanopyStore
  }
) => {
  const plants = scenario.plants ?? [testPlant]
  const canopy = scenario.canopy ?? createCanopyStore()
  return Effect.runPromise(
    updateUserSettings(request).pipe(
      Effect.provide(
        Layer.mergeAll(
          createMockDelegationRepository(),
          createMockRecipientRepository({ plants, members: canopy.members }),
          MockSqlClientLive,
          createMockCanopyRepository(canopy),
          createMockRateLimiterService(),
          createMockUserRepository([scenario.user ?? testUser]),
          createMockCurrentUser({ id: 'user-1' }),
          createMockNotificationRepository(scenario.notifications),
          createMockPlantRepository({ plants }),
          createMockCareLogRepository([]),
          createMockCareScheduleRepository({
            schedules: schedulesFromPlants(plants),
            plants,
          })
        )
      )
    )
  )
}

const pending = (notifications: Notification[]) =>
  notifications
    .filter((n) => n.status === 'pending')
    .map((n) => ({ type: n.type, at: n.scheduledAt.toISOString() }))

describe('updateUserSettings - reminder rebuild', () => {
  it('moves pending reminders to the new preferredNotificationTime', async () => {
    const notifications = pendingWatering()

    await update({ preferredNotificationTime: '14:00' }, { notifications })

    expect(pending(notifications)).toEqual([
      { type: 'watering_reminder', at: '2030-06-15T14:00:00.000Z' },
    ])
  })

  it('moves pending reminders to the new timezone', async () => {
    const notifications = pendingWatering()

    await update({ timezone: 'America/New_York' }, { notifications })

    expect(pending(notifications)).toEqual([
      { type: 'watering_reminder', at: '2030-06-15T13:00:00.000Z' },
    ])
  })

  it('keeps a rescheduled reminder out of the do-not-disturb window', async () => {
    const notifications = pendingWatering()

    await update(
      { timezone: 'America/New_York' },
      {
        notifications,
        user: {
          ...testUser,
          doNotDisturb: true,
          doNotDisturbStart: '08:00',
          doNotDisturbEnd: '10:00',
        },
      }
    )

    expect(pending(notifications)).toEqual([
      { type: 'watering_reminder', at: '2030-06-15T14:00:00.000Z' },
    ])
  })

  it('rebuilds every care reminder when care reminders turn back on', async () => {
    const notifications: Notification[] = []

    await update(
      { notifications: { careReminders: true } },
      {
        notifications,
        user: { ...testUser, careReminders: false },
        plants: [
          createTestPlant({
            id: 'plant-recalc',
            userId: 'user-1',
            scheduleSpecs: [spec('misting'), spec('repotting')],
          }),
        ],
      }
    )

    expect(pending(notifications)).toEqual([
      { type: 'misting_reminder', at: '2030-06-15T09:00:00.000Z' },
      { type: 'repotting_reminder', at: '2030-06-15T09:00:00.000Z' },
    ])
  })

  it('keeps a Canopy plant reminder on the Canopy calendar day when the member moves west', async () => {
    const canopyPlant = createTestPlant({
      id: 'plant-canopy',
      userId: null,
      canopyId: mockCanopyId,
      scheduleSpecs: [
        wateringSpec({ nextCareAt: new Date('2030-07-14T22:00:00.000Z') }),
      ],
    })
    const notifications = pendingWatering({
      id: 'notif-canopy',
      plantId: 'plant-canopy',
      scheduledAt: new Date('2030-07-15T09:00:00.000Z'),
    })

    await update(
      { timezone: 'America/New_York' },
      {
        notifications,
        plants: [canopyPlant],
        canopy: createCanopyStore({
          canopies: [
            createTestCanopyRow({
              id: mockCanopyId,
              timezone: 'Europe/Paris',
            }),
          ],
          members: [createTestMembership({ userId: 'user-1' })],
          plants: [
            {
              id: 'plant-canopy',
              canopyId: mockCanopyId,
              userId: null,
              remindersEnabled: true,
              diedAt: null,
            },
          ],
        }),
      }
    )

    expect(pending(notifications)).toEqual([
      { type: 'watering_reminder', at: '2030-07-15T13:00:00.000Z' },
    ])
  })

  it('leaves reminders untouched when preferredNotificationTime stays the same', async () => {
    const notifications = pendingWatering()
    const before = [...notifications]

    await update({ preferredNotificationTime: '09:00' }, { notifications })

    expect(notifications).toEqual(before)
  })

  it('leaves reminders untouched when unrelated settings change', async () => {
    const notifications = pendingWatering()
    const before = [...notifications]

    await update({ name: 'new_name' }, { notifications })

    expect(notifications).toEqual(before)
  })
})
