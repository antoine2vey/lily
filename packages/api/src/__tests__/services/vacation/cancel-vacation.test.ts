import { createTestSchedule } from '@lily/api/__tests__/fixtures/care-schedules'
import { createTestPlant } from '@lily/api/__tests__/fixtures/plants'
import { createTestUser } from '@lily/api/__tests__/fixtures/users'
import { createMockCareScheduleRepository } from '@lily/api/__tests__/mocks/care-schedule.repository'
import { createMockDelegationRepository } from '@lily/api/__tests__/mocks/delegation.repository'
import { createMockNotificationRepository } from '@lily/api/__tests__/mocks/notification.repository'
import { createMockCurrentUser } from '@lily/api/__tests__/mocks/session'
import { createMockUserRepository } from '@lily/api/__tests__/mocks/user.repository'
import type { CareScheduleRow } from '@lily/api/repositories/care-schedule.repository'
import { cancelVacation } from '@lily/api/services/vacation/endpoints/cancel-vacation'
import type { User } from '@lily/shared'
import { Array, Effect, Layer, Logger, LogLevel, Option, pipe } from 'effect'
import { describe, expect, it } from 'vitest'

const daysFromNow = (days: number): Date =>
  new Date(Date.now() + days * 24 * 60 * 60 * 1000)

const createLayer = (
  users: User[],
  schedules: CareScheduleRow[] = [],
  plants: ReturnType<typeof createTestPlant>[] = []
) =>
  Layer.mergeAll(
    createMockUserRepository(users),
    createMockNotificationRepository([]),
    createMockCareScheduleRepository({ schedules, plants }),
    createMockDelegationRepository({}),
    createMockCurrentUser({ id: 'user-1' })
  )

const run = <A, E>(effect: Effect.Effect<A, E, never>): Promise<A> =>
  Effect.runPromise(effect.pipe(Logger.withMinimumLogLevel(LogLevel.None)))

describe('cancelVacation', () => {
  it('should fail with VacationNotFoundError when no vacation exists', async () => {
    const user = createTestUser({ id: 'user-1' })

    const error = await run(
      cancelVacation().pipe(Effect.flip, Effect.provide(createLayer([user])))
    )

    expect(error._tag).toBe('VacationNotFoundError')
  })

  it('should reset a scheduled vacation without touching schedules', async () => {
    const user = createTestUser({
      id: 'user-1',
      vacationStatus: 'scheduled',
      vacationStart: daysFromNow(5),
      vacationEnd: daysFromNow(12),
    })
    const plant = createTestPlant({ id: 'plant-1', userId: 'user-1' })
    const originalNext = daysFromNow(3)
    const schedules = [
      createTestSchedule({ plantId: plant.id, nextCareAt: originalNext }),
    ]
    const users = [user]

    const state = await run(
      cancelVacation().pipe(
        Effect.provide(createLayer(users, schedules, [plant]))
      )
    )

    expect(state).toEqual({ status: 'none', startDate: null, endDate: null })
    // No shift happened
    expect(schedules[0]?.nextCareAt).toEqual(originalNext)
    // State was reset in the repository
    const updated = pipe(
      Array.findFirst(users, (u) => u.id === 'user-1'),
      Option.getOrNull
    )
    expect(updated?.vacationStatus).toBe('none')
    expect(updated?.vacationStart).toBeNull()
  })

  it('should run the end-routine when the vacation is active (end now)', async () => {
    const user = createTestUser({
      id: 'user-1',
      timezone: 'UTC',
      careReminders: true,
      vacationStatus: 'active',
      vacationStart: daysFromNow(-7),
      vacationEnd: daysFromNow(3),
    })
    const plant = createTestPlant({ id: 'plant-1', userId: 'user-1' })
    // Fell due mid-vacation — must be moved into the future on end-now
    const schedules = [
      createTestSchedule({ plantId: plant.id, nextCareAt: daysFromNow(-3) }),
    ]
    const users = [user]

    const state = await run(
      cancelVacation().pipe(
        Effect.provide(createLayer(users, schedules, [plant]))
      )
    )

    expect(state).toEqual({ status: 'none', startDate: null, endDate: null })
    const shifted = schedules[0]?.nextCareAt
    expect(shifted).not.toBeNull()
    expect(shifted!.getTime()).toBeGreaterThan(Date.now())
    const updated = pipe(
      Array.findFirst(users, (u) => u.id === 'user-1'),
      Option.getOrNull
    )
    expect(updated?.vacationStatus).toBe('none')
  })
})
