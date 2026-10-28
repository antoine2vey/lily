import {
  createTestMembership,
  mockCanopyId,
} from '@lily/api/__tests__/fixtures/canopies'
import { createTestSchedule } from '@lily/api/__tests__/fixtures/care-schedules'
import { createTestPlant } from '@lily/api/__tests__/fixtures/plants'
import { createTestUser } from '@lily/api/__tests__/fixtures/users'
import {
  createCanopyStore,
  createMockCanopyRepository,
  createTestCanopyRow,
} from '@lily/api/__tests__/mocks/canopy.repository'
import { createMockCareScheduleRepository } from '@lily/api/__tests__/mocks/care-schedule.repository'
import { createMockDelegationRepository } from '@lily/api/__tests__/mocks/delegation.repository'
import { createMockNotificationRepository } from '@lily/api/__tests__/mocks/notification.repository'
import { MockSqlClientLive } from '@lily/api/__tests__/mocks/sql-client'
import { createMockUserRepository } from '@lily/api/__tests__/mocks/user.repository'
import { rebuildMemberReminders } from '@lily/api/services/plants/helpers/member-reminders'
import type { Notification } from '@lily/shared/notification'
import { Array, Effect, Layer, References } from 'effect'
import { afterEach, describe, expect, it, vi } from 'vitest'

const inDays = (days: number) => new Date(Date.now() + days * 86_400_000)

const run = (
  userId: string,
  plantIds?: ReadonlyArray<string>,
  existing: Notification[] = [],
  options: { dueToday?: Date } = {}
) => {
  const members = [
    createTestMembership({ userId: 'alex', role: 'owner' }),
    createTestMembership({ userId: 'lily' }),
  ]
  const fern = createTestPlant({
    id: 'fern',
    userId: null,
    canopyId: mockCanopyId,
  })
  const cactus = createTestPlant({
    id: 'cactus',
    userId: null,
    canopyId: mockCanopyId,
  })
  const overdue = createTestPlant({
    id: 'overdue',
    userId: null,
    canopyId: mockCanopyId,
  })
  const dueToday = createTestPlant({
    id: 'due-today',
    userId: null,
    canopyId: mockCanopyId,
  })
  const personal = createTestPlant({ id: 'personal', userId: 'lily' })
  const plants = [fern, cactus, overdue, dueToday, personal]
  const schedules = [
    createTestSchedule({ plantId: 'fern', nextCareAt: inDays(3) }),
    createTestSchedule({
      plantId: 'fern',
      careType: 'fertilization',
      nextCareAt: inDays(20),
    }),
    createTestSchedule({ plantId: 'cactus', nextCareAt: inDays(5) }),
    createTestSchedule({ plantId: 'overdue', nextCareAt: inDays(-1) }),
    ...(options.dueToday === undefined
      ? []
      : [
          createTestSchedule({
            plantId: 'due-today',
            nextCareAt: options.dueToday,
          }),
        ]),
    createTestSchedule({ plantId: 'personal', nextCareAt: inDays(2) }),
  ]
  return Effect.runPromise(
    rebuildMemberReminders(userId, plantIds).pipe(
      Effect.provide(
        Layer.mergeAll(
          MockSqlClientLive,
          createMockNotificationRepository(existing),
          createMockUserRepository([
            createTestUser({
              id: 'alex',
              timezone: 'UTC',
              preferredNotificationTime: '08:00',
            }),
            createTestUser({
              id: 'lily',
              timezone: 'UTC',
              preferredNotificationTime: '19:00',
            }),
          ]),
          createMockCanopyRepository(
            createCanopyStore({
              canopies: [createTestCanopyRow({ id: mockCanopyId })],
              members,
            })
          ),
          createMockCareScheduleRepository({
            plants,
            schedules,
            memberships: members,
          }),
          createMockDelegationRepository()
        )
      ),
      Effect.provideService(References.MinimumLogLevel, 'None')
    )
  ).then(() =>
    Array.map(existing, (n) => [n.userId, n.plantId, n.type] as const)
  )
}

describe('rebuildMemberReminders', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('gives a joiner a row for a Canopy schedule due earlier today in the Canopy zone', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2099-06-15T10:00:00.000Z'))
    const parisMidnightJun15 = new Date('2099-06-14T22:00:00.000Z')
    const rows = await run('lily', ['due-today', 'overdue'], [], {
      dueToday: parisMidnightJun15,
    })
    expect(rows).toEqual([['lily', 'due-today', 'watering_reminder']])
  })

  it('gives a joiner a row for every future Canopy schedule, and nobody else', async () => {
    const rows = await run('lily')
    expect(rows.sort()).toEqual([
      ['lily', 'cactus', 'watering_reminder'],
      ['lily', 'fern', 'fertilization_reminder'],
      ['lily', 'fern', 'watering_reminder'],
    ])
  })

  it('sends no second reminder today for a plant the member already heard about today', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2099-06-15T10:00:00.000Z'))
    const sentThisMorning: Notification = {
      id: 'sent-today',
      type: 'watering_reminder',
      scheduledAt: new Date('2099-06-15T06:00:00.000Z'),
      sentAt: new Date('2099-06-15T06:00:05.000Z'),
      isRead: false,
      status: 'sent',
      retryCount: 0,
      userId: 'lily',
      plantId: 'due-today',
      createdAt: new Date('2099-06-14T12:00:00.000Z'),
    }
    const existing = [sentThisMorning]
    await run('lily', ['due-today'], existing, {
      dueToday: new Date('2099-06-14T22:00:00.000Z'),
    })
    expect(Array.map(existing, (n) => n.id)).toEqual(['sent-today'])
  })

  it('keeps the member overdue rows for the plant', async () => {
    const overdue: Notification = {
      id: 'overdue-row',
      type: 'overdue_reminder',
      scheduledAt: inDays(0.1),
      isRead: false,
      status: 'pending',
      retryCount: 0,
      userId: 'lily',
      plantId: 'fern',
      createdAt: new Date(),
    }
    const rows = await run('lily', ['fern'], [overdue])
    expect(rows.sort()).toEqual([
      ['lily', 'fern', 'fertilization_reminder'],
      ['lily', 'fern', 'overdue_reminder'],
      ['lily', 'fern', 'watering_reminder'],
    ])
  })

  it('limits an unmute to that plant and replaces the rows it already had', async () => {
    const stale: Notification = {
      id: 'stale',
      type: 'watering_reminder',
      scheduledAt: inDays(1),
      isRead: false,
      status: 'queued',
      retryCount: 0,
      userId: 'lily',
      plantId: 'fern',
      createdAt: new Date(),
    }
    const rows = await run('lily', ['fern'], [stale])
    expect(rows.sort()).toEqual([
      ['lily', 'fern', 'fertilization_reminder'],
      ['lily', 'fern', 'watering_reminder'],
    ])
  })
})
