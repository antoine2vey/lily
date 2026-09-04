import { createTestSchedule } from '@lily/api/__tests__/fixtures/care-schedules'
import { createTestPlant } from '@lily/api/__tests__/fixtures/plants'
import { createTestUser } from '@lily/api/__tests__/fixtures/users'
import { createMockCareScheduleRepository } from '@lily/api/__tests__/mocks/care-schedule.repository'
import { createMockDelegationRepository } from '@lily/api/__tests__/mocks/delegation.repository'
import { createMockNotificationRepository } from '@lily/api/__tests__/mocks/notification.repository'
import { createMockUserRepository } from '@lily/api/__tests__/mocks/user.repository'
import type { CareScheduleRow } from '@lily/api/repositories/care-schedule.repository'
import type { DelegationRow } from '@lily/api/repositories/delegation.repository'
import { endVacation } from '@lily/api/services/vacation/helpers/end-vacation'
import type { Notification } from '@lily/shared/notification'
import { Array, Effect, Layer, Logger, LogLevel, Option, pipe } from 'effect'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Fixed scenario, user timezone Europe/Paris (UTC+2 in August):
//   vacationStart  = 2026-08-10T00:00:00Z (local day Aug 10)
//   effectiveEnd   = 2026-08-17T06:00:00Z (local day Aug 17)
//   day delta      = 7 days
//   floor          = start of Aug 18 in Paris = 2026-08-17T22:00:00Z
const VACATION_START = new Date('2026-08-10T00:00:00.000Z')
const EFFECTIVE_END = new Date('2026-08-17T06:00:00.000Z')
const FLOOR = new Date('2026-08-17T22:00:00.000Z')
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000

const buildScenario = () => {
  const owner = createTestUser({
    id: 'owner-1',
    timezone: 'Europe/Paris',
    careReminders: true,
    vacationStatus: 'active',
    vacationStart: VACATION_START,
    vacationEnd: EFFECTIVE_END,
  })
  const caretaker = createTestUser({ id: 'caretaker-1', careReminders: true })

  const plantOverdue = createTestPlant({
    id: 'plant-overdue',
    userId: owner.id,
  })
  const plantMid = createTestPlant({ id: 'plant-mid', userId: owner.id })
  const plantFuture = createTestPlant({ id: 'plant-future', userId: owner.id })
  const plantDelegated = createTestPlant({
    id: 'plant-delegated',
    userId: owner.id,
  })
  const plantDelegatedFuture = createTestPlant({
    id: 'plant-delegated-future',
    userId: owner.id,
  })

  const schedules: CareScheduleRow[] = [
    // Overdue before the vacation even started: clamped to the floor
    createTestSchedule({
      plantId: plantOverdue.id,
      careType: 'watering',
      nextCareAt: new Date('2026-08-03T00:00:00.000Z'),
    }),
    // Fell due mid-vacation: shifted by the full day delta
    createTestSchedule({
      plantId: plantMid.id,
      careType: 'watering',
      nextCareAt: new Date('2026-08-13T00:00:00.000Z'),
    }),
    // Due after the vacation: untouched, but its reminder is rebuilt
    createTestSchedule({
      plantId: plantFuture.id,
      careType: 'watering',
      nextCareAt: new Date('2026-08-29T00:00:00.000Z'),
    }),
    // Delegated plant that fell due mid-vacation: the caretaker handled it.
    // Not shifted, and — being past due at the effective end — not rebuilt
    // either; the overdue scheduler owns it from here.
    createTestSchedule({
      plantId: plantDelegated.id,
      careType: 'watering',
      nextCareAt: new Date('2026-08-13T00:00:00.000Z'),
    }),
    // Delegated plant due after the vacation: reminder rebuilt for the caretaker
    createTestSchedule({
      plantId: plantDelegatedFuture.id,
      careType: 'watering',
      nextCareAt: new Date('2026-08-25T00:00:00.000Z'),
    }),
  ]

  const delegation: DelegationRow = {
    id: 'delegation-1',
    ownerId: owner.id,
    caretakerId: caretaker.id,
    status: 'active',
    message: null,
    startDate: new Date('2026-08-01T00:00:00.000Z'),
    endDate: new Date('2026-09-01T00:00:00.000Z'),
    respondedAt: null,
    canceledAt: null,
    completedAt: null,
    createdAt: new Date('2026-08-01T00:00:00.000Z'),
    updatedAt: new Date('2026-08-01T00:00:00.000Z'),
  }

  const users = [owner, caretaker]
  const notifications: Notification[] = []

  const layer = Layer.mergeAll(
    createMockUserRepository(users),
    createMockNotificationRepository(notifications),
    createMockCareScheduleRepository({
      schedules,
      plants: [
        plantOverdue,
        plantMid,
        plantFuture,
        plantDelegated,
        plantDelegatedFuture,
      ],
    }),
    createMockDelegationRepository({
      delegations: [delegation],
      delegationPlants: [
        { delegationId: delegation.id, plantId: plantDelegated.id },
        { delegationId: delegation.id, plantId: plantDelegatedFuture.id },
      ],
    })
  )

  return { owner, caretaker, schedules, notifications, users, layer }
}

const findNext = (
  schedules: ReadonlyArray<CareScheduleRow>,
  plantId: string
): Date | null =>
  pipe(
    Array.findFirst(schedules, (s) => s.plantId === plantId),
    Option.flatMap((s) => Option.fromNullable(s.nextCareAt)),
    Option.getOrNull
  )

const run = (effect: Effect.Effect<void, unknown, never>): Promise<void> =>
  Effect.runPromise(
    effect.pipe(Logger.withMinimumLogLevel(LogLevel.None))
  ) as Promise<void>

describe('endVacation', () => {
  // endVacation rebuilds reminders only for schedules due after the real
  // clock, so pin "now" to the moment the vacation ends. Without this the
  // fixed August fixtures silently fall into the past once the calendar
  // moves on and the reminder assertions stop seeing any rows.
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(EFFECTIVE_END)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('should shift mid-vacation schedules by the whole-day delta', async () => {
    const { owner, schedules, layer } = buildScenario()

    await run(
      endVacation({ userId: owner.id, effectiveEnd: EFFECTIVE_END }).pipe(
        Effect.provide(layer)
      )
    )

    expect(findNext(schedules, 'plant-mid')).toEqual(
      new Date(new Date('2026-08-13T00:00:00.000Z').getTime() + SEVEN_DAYS_MS)
    )
  })

  it('should clamp pre-vacation overdue schedules to the day after the vacation ends', async () => {
    const { owner, schedules, layer } = buildScenario()

    await run(
      endVacation({ userId: owner.id, effectiveEnd: EFFECTIVE_END }).pipe(
        Effect.provide(layer)
      )
    )

    expect(findNext(schedules, 'plant-overdue')).toEqual(FLOOR)
  })

  it('should leave schedules due after the vacation untouched', async () => {
    const { owner, schedules, layer } = buildScenario()

    await run(
      endVacation({ userId: owner.id, effectiveEnd: EFFECTIVE_END }).pipe(
        Effect.provide(layer)
      )
    )

    expect(findNext(schedules, 'plant-future')).toEqual(
      new Date('2026-08-29T00:00:00.000Z')
    )
  })

  it('should not shift schedules of plants with an active caretaker', async () => {
    const { owner, schedules, layer } = buildScenario()

    await run(
      endVacation({ userId: owner.id, effectiveEnd: EFFECTIVE_END }).pipe(
        Effect.provide(layer)
      )
    )

    expect(findNext(schedules, 'plant-delegated')).toEqual(
      new Date('2026-08-13T00:00:00.000Z')
    )
  })

  it('should reset the vacation state on the user', async () => {
    const { owner, users, layer } = buildScenario()

    await run(
      endVacation({ userId: owner.id, effectiveEnd: EFFECTIVE_END }).pipe(
        Effect.provide(layer)
      )
    )

    const updated = pipe(
      Array.findFirst(users, (u) => u.id === owner.id),
      Option.getOrNull
    )
    expect(updated?.vacationStatus).toBe('none')
    expect(updated?.vacationStart).toBeNull()
    expect(updated?.vacationEnd).toBeNull()
  })

  it('should rebuild reminders for every future schedule, routing delegated plants to the caretaker', async () => {
    const { owner, caretaker, notifications, layer } = buildScenario()

    await run(
      endVacation({ userId: owner.id, effectiveEnd: EFFECTIVE_END }).pipe(
        Effect.provide(layer)
      )
    )

    const byPlant = (plantId: string) =>
      pipe(
        Array.findFirst(notifications, (n) => n.plantId === plantId),
        Option.getOrNull
      )

    expect(byPlant('plant-overdue')?.userId).toBe(owner.id)
    expect(byPlant('plant-mid')?.userId).toBe(owner.id)
    expect(byPlant('plant-future')?.userId).toBe(owner.id)
    expect(byPlant('plant-delegated-future')?.userId).toBe(caretaker.id)
    // Past due and unshifted: left to the overdue scheduler, no reminder row.
    expect(byPlant('plant-delegated')).toBeNull()
  })

  it('should be a no-op when rerun after completion (crash-retry safety)', async () => {
    const { owner, schedules, layer } = buildScenario()

    await run(
      endVacation({ userId: owner.id, effectiveEnd: EFFECTIVE_END }).pipe(
        Effect.provide(layer)
      )
    )
    const afterFirstRun = Array.map(schedules, (s) => s.nextCareAt?.getTime())

    await run(
      endVacation({ userId: owner.id, effectiveEnd: EFFECTIVE_END }).pipe(
        Effect.provide(layer)
      )
    )
    const afterSecondRun = Array.map(schedules, (s) => s.nextCareAt?.getTime())

    expect(afterSecondRun).toEqual(afterFirstRun)
  })
})
