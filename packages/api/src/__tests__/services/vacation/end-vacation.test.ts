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
import { createStubCare } from '@lily/api/__tests__/mocks/care'
import { createMockCareScheduleRepository } from '@lily/api/__tests__/mocks/care-schedule.repository'
import { createMockDelegationRepository } from '@lily/api/__tests__/mocks/delegation.repository'
import { createMockNotificationRepository } from '@lily/api/__tests__/mocks/notification.repository'
import { createMockPlantRepository } from '@lily/api/__tests__/mocks/plant.repository'
import { MockSqlClientLive } from '@lily/api/__tests__/mocks/sql-client'
import { createMockUserRepository } from '@lily/api/__tests__/mocks/user.repository'
import { DueMove } from '@lily/api/contexts/care'
import type { CareScheduleRow } from '@lily/api/repositories/care-schedule.repository'
import type { DelegationRow } from '@lily/api/repositories/delegation.repository'
import { endVacation } from '@lily/api/services/vacation/helpers/end-vacation'
import { CARE_TYPES } from '@lily/shared'
import type { Notification } from '@lily/shared/notification'
import {
  Array,
  DateTime,
  Effect,
  Layer,
  Option,
  pipe,
  References,
} from 'effect'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const VACATION_START = new Date('2026-08-09T22:30:00.000Z')
const EFFECTIVE_END = new Date('2026-08-17T06:00:00.000Z')

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
  const plants = [plantMid, plantFuture, plantDelegated, plantDelegatedFuture]

  const schedules: CareScheduleRow[] = [
    createTestSchedule({
      plantId: plantMid.id,
      careType: 'watering',
      nextCareAt: new Date('2026-08-13T00:00:00.000Z'),
    }),
    createTestSchedule({
      plantId: plantFuture.id,
      careType: 'watering',
      nextCareAt: new Date('2026-08-29T00:00:00.000Z'),
    }),
    createTestSchedule({
      plantId: plantDelegated.id,
      careType: 'watering',
      nextCareAt: new Date('2026-08-13T00:00:00.000Z'),
    }),
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
  const care = createStubCare()

  const layer = Layer.mergeAll(
    MockSqlClientLive,
    care.layer,
    createMockUserRepository(users),
    createMockNotificationRepository(notifications),
    createMockCareScheduleRepository({ schedules, plants }),
    createMockPlantRepository({ plants }),
    createMockCanopyRepository(),
    createMockDelegationRepository({
      delegations: [delegation],
      delegationPlants: [
        { delegationId: delegation.id, plantId: plantDelegated.id },
        { delegationId: delegation.id, plantId: plantDelegatedFuture.id },
      ],
    })
  )

  return { owner, caretaker, notifications, users, care, layer }
}

const run = <A>(effect: Effect.Effect<A, unknown, never>): Promise<A> =>
  Effect.runPromise(
    effect.pipe(Effect.provideService(References.MinimumLogLevel, 'None'))
  ) as Promise<A>

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

  it('asks Care to move every care type of each undelegated own plant after the days away in the user timezone', async () => {
    const { owner, care, layer } = buildScenario()

    await run(
      endVacation({ user: owner, effectiveEnd: EFFECTIVE_END }).pipe(
        Effect.provide(layer)
      )
    )

    expect(care.moved).toEqual([
      {
        reason: 'vacation',
        moves: Array.flatMap(['plant-mid', 'plant-future'], (plantId) =>
          Array.map(CARE_TYPES, (careType) => ({
            plantId,
            careType,
            move: DueMove.AfterAbsence({
              endedAt: DateTime.makeUnsafe(EFFECTIVE_END),
              days: 7,
            }),
          }))
        ),
      },
    ])
  })

  it('should reset the vacation state on the user', async () => {
    const { owner, users, layer } = buildScenario()

    await run(
      endVacation({ user: owner, effectiveEnd: EFFECTIVE_END }).pipe(
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

  it('should rebuild reminders for future schedules, routing delegated plants to the caretaker', async () => {
    const { owner, caretaker, notifications, layer } = buildScenario()

    await run(
      endVacation({ user: owner, effectiveEnd: EFFECTIVE_END }).pipe(
        Effect.provide(layer)
      )
    )

    const byPlant = (plantId: string) =>
      pipe(
        Array.findFirst(notifications, (n) => n.plantId === plantId),
        Option.getOrNull
      )

    expect(byPlant('plant-future')?.userId).toBe(owner.id)
    expect(byPlant('plant-delegated-future')?.userId).toBe(caretaker.id)
    expect(byPlant('plant-delegated')).toBeNull()
  })

  it('should ask for no second move when rerun from the same snapshot after completion', async () => {
    const { owner, care, layer } = buildScenario()

    await run(
      endVacation({ user: owner, effectiveEnd: EFFECTIVE_END }).pipe(
        Effect.provide(layer)
      )
    )

    const secondClaim = await run(
      endVacation({ user: owner, effectiveEnd: EFFECTIVE_END }).pipe(
        Effect.provide(layer)
      )
    )

    expect(secondClaim).toBeNull()
    expect(care.moved).toHaveLength(1)
  })

  it('should ask for no move when the vacation changed since the snapshot was read', async () => {
    const { owner, users, care, layer } = buildScenario()
    const extendedEnd = new Date('2026-08-24T06:00:00.000Z')
    users[0] = { ...owner, vacationEnd: extendedEnd }

    const claim = await run(
      endVacation({ user: owner, effectiveEnd: EFFECTIVE_END }).pipe(
        Effect.provide(layer)
      )
    )

    expect(claim).toBeNull()
    expect(care.moved).toEqual([])
    expect(users[0]?.vacationStatus).toBe('active')
    expect(users[0]?.vacationEnd).toEqual(extendedEnd)
  })

  it('asks for no move of a Canopy plant, and rebuilds only the member own future reminder', async () => {
    const owner = createTestUser({
      id: 'owner-1',
      timezone: 'Europe/Paris',
      careReminders: true,
      vacationStatus: 'active',
      vacationStart: VACATION_START,
      vacationEnd: EFFECTIVE_END,
    })
    const housemate = createTestUser({ id: 'housemate-1', careReminders: true })
    const members = [
      createTestMembership({ userId: owner.id, role: 'owner' }),
      createTestMembership({ userId: housemate.id }),
    ]
    const sharedMid = createTestPlant({
      id: 'canopy-mid',
      userId: null,
      canopyId: mockCanopyId,
    })
    const sharedFuture = createTestPlant({
      id: 'canopy-future',
      userId: null,
      canopyId: mockCanopyId,
    })
    const schedules = [
      createTestSchedule({
        plantId: sharedMid.id,
        careType: 'watering',
        nextCareAt: new Date('2026-08-13T00:00:00.000Z'),
      }),
      createTestSchedule({
        plantId: sharedFuture.id,
        careType: 'watering',
        nextCareAt: new Date('2026-08-25T00:00:00.000Z'),
      }),
    ]
    const notifications: Notification[] = []
    const care = createStubCare()
    const layer = Layer.mergeAll(
      MockSqlClientLive,
      care.layer,
      createMockUserRepository([owner, housemate]),
      createMockNotificationRepository(notifications),
      createMockCareScheduleRepository({
        schedules,
        plants: [sharedMid, sharedFuture],
        memberships: members,
      }),
      createMockPlantRepository({ plants: [sharedMid, sharedFuture] }),
      createMockCanopyRepository(
        createCanopyStore({
          canopies: [createTestCanopyRow({ id: mockCanopyId })],
          members,
          plants: Array.map([sharedMid, sharedFuture], (p) => ({
            id: p.id,
            canopyId: mockCanopyId,
            userId: null,
            remindersEnabled: true,
            diedAt: null,
          })),
        })
      ),
      createMockDelegationRepository({})
    )

    await run(
      endVacation({ user: owner, effectiveEnd: EFFECTIVE_END }).pipe(
        Effect.provide(layer)
      )
    )

    expect(Array.flatMap(care.moved, (command) => command.moves)).toEqual([])
    expect(
      Array.map(notifications, (n) => [n.userId, n.plantId]).sort()
    ).toEqual([[owner.id, sharedFuture.id]])
  })

  it('gives the member back a Canopy reminder due earlier today', async () => {
    const owner = createTestUser({
      id: 'owner-1',
      timezone: 'UTC',
      careReminders: true,
      vacationStatus: 'active',
      vacationStart: VACATION_START,
      vacationEnd: EFFECTIVE_END,
    })
    const members = [createTestMembership({ userId: owner.id, role: 'owner' })]
    const dueToday = createTestPlant({
      id: 'canopy-today',
      userId: null,
      canopyId: mockCanopyId,
    })
    const midnightToday = new Date('2026-08-17T00:00:00.000Z')
    const schedules = [
      createTestSchedule({
        plantId: dueToday.id,
        careType: 'watering',
        nextCareAt: midnightToday,
      }),
    ]
    const notifications: Notification[] = []
    const layer = Layer.mergeAll(
      MockSqlClientLive,
      createStubCare().layer,
      createMockUserRepository([owner]),
      createMockNotificationRepository(notifications),
      createMockCareScheduleRepository({
        schedules,
        plants: [dueToday],
        memberships: members,
      }),
      createMockPlantRepository({ plants: [dueToday] }),
      createMockCanopyRepository(
        createCanopyStore({
          canopies: [
            createTestCanopyRow({ id: mockCanopyId, timezone: 'UTC' }),
          ],
          members,
          plants: [
            {
              id: dueToday.id,
              canopyId: mockCanopyId,
              userId: null,
              remindersEnabled: true,
              diedAt: null,
            },
          ],
        })
      ),
      createMockDelegationRepository({})
    )

    await run(
      endVacation({ user: owner, effectiveEnd: EFFECTIVE_END }).pipe(
        Effect.provide(layer)
      )
    )

    expect(
      Array.map(notifications, (n) => [n.userId, n.plantId, n.type])
    ).toEqual([[owner.id, dueToday.id, 'watering_reminder']])
  })
})
