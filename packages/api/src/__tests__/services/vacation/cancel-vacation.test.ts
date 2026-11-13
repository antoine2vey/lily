import { createTestPlant } from '@lily/api/__tests__/fixtures/plants'
import { createTestUser } from '@lily/api/__tests__/fixtures/users'
import { createVacationWorld } from '@lily/api/__tests__/mocks/vacation-world'
import { Vacation } from '@lily/api/contexts/absence/domain/vacation'
import {
  type AbsenceStore,
  VacationNotSetDefect,
} from '@lily/api/contexts/absence/store'
import { DueMove } from '@lily/api/contexts/care'
import { cancelVacation } from '@lily/api/services/vacation/endpoints/cancel-vacation'
import { CARE_TYPES, type User } from '@lily/shared'
import {
  Array,
  Cause,
  DateTime,
  Effect,
  Exit,
  Option,
  pipe,
  References,
} from 'effect'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const NOW = new Date('2026-08-17T06:00:00.000Z')

const daysFromNow = (days: number): Date =>
  new Date(Date.now() + days * 24 * 60 * 60 * 1000)

const setup = (
  users: User[],
  plants: ReturnType<typeof createTestPlant>[] = [],
  store?: (store: AbsenceStore['Service']) => AbsenceStore['Service']
) => createVacationWorld({ users, plants, store })

const run = <A, E>(effect: Effect.Effect<A, E, never>): Promise<A> =>
  Effect.runPromise(
    effect.pipe(Effect.provideService(References.MinimumLogLevel, 'None'))
  )

describe('cancelVacation', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(NOW)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('should fail with VacationNotFoundError when no vacation exists', async () => {
    const user = createTestUser({ id: 'user-1' })
    const { layer } = setup([user])

    const error = await run(
      cancelVacation().pipe(Effect.flip, Effect.provide(layer))
    )

    expect(error._tag).toBe('VacationNotFoundError')
  })

  it('should reset a scheduled vacation without asking for any move', async () => {
    const user = createTestUser({
      id: 'user-1',
      vacationStatus: 'scheduled',
      vacationStart: daysFromNow(5),
      vacationEnd: daysFromNow(12),
    })
    const plant = createTestPlant({ id: 'plant-1', userId: 'user-1' })
    const users = [user]
    const { care, layer } = setup(users, [plant])

    const state = await run(cancelVacation().pipe(Effect.provide(layer)))

    expect(state).toEqual({ status: 'none', startDate: null, endDate: null })
    expect(care.moved).toEqual([])
    const updated = pipe(
      Array.findFirst(users, (u) => u.id === 'user-1'),
      Option.getOrNull
    )
    expect(updated?.vacationStatus).toBe('none')
    expect(updated?.vacationStart).toBeNull()
  })

  it('should end an active vacation now, not at its stored end', async () => {
    const user = createTestUser({
      id: 'user-1',
      timezone: 'UTC',
      careReminders: true,
      vacationStatus: 'active',
      vacationStart: daysFromNow(-7),
      vacationEnd: daysFromNow(3),
    })
    const plant = createTestPlant({ id: 'plant-1', userId: 'user-1' })
    const users = [user]
    const { care, layer } = setup(users, [plant])

    const state = await run(cancelVacation().pipe(Effect.provide(layer)))

    expect(state).toEqual({ status: 'none', startDate: null, endDate: null })
    expect(care.moved).toEqual([
      {
        reason: 'vacation',
        moves: Array.map(CARE_TYPES, (careType) => ({
          plantId: plant.id,
          careType,
          move: DueMove.AfterAbsence({
            endedAt: DateTime.makeUnsafe(NOW),
            days: 7,
          }),
        })),
      },
    ])
    const updated = pipe(
      Array.findFirst(users, (u) => u.id === 'user-1'),
      Option.getOrNull
    )
    expect(updated?.vacationStatus).toBe('none')
  })

  it('should end the vacation when the scheduler activates it just before the cancel takes the account', async () => {
    const user = createTestUser({
      id: 'user-1',
      timezone: 'UTC',
      careReminders: true,
      vacationStatus: 'scheduled',
      vacationStart: daysFromNow(-1),
      vacationEnd: daysFromNow(6),
    })
    const plant = createTestPlant({ id: 'plant-1', userId: 'user-1' })
    const users = [user]
    const activateOnce = Effect.sync(() => {
      if (users[0]?.vacationStatus === 'scheduled') {
        users[0] = { ...user, vacationStatus: 'active' }
      }
    })
    const { care, layer } = setup(users, [plant], (store) => ({
      ...store,
      lockVacation: (userId, now) =>
        Effect.andThen(activateOnce, store.lockVacation(userId, now)),
    }))

    const state = await run(cancelVacation().pipe(Effect.provide(layer)))

    expect(state).toEqual({ status: 'none', startDate: null, endDate: null })
    expect(users[0]?.vacationStatus).toBe('none')
    expect(
      pipe(
        Array.flatMap(care.moved, (command) => command.moves),
        Array.map((move) => move.plantId),
        Array.dedupe
      )
    ).toEqual([plant.id])
  })

  it('should die, with nothing written, when the account no longer holds the vacation the command read', async () => {
    const user = createTestUser({
      id: 'user-1',
      vacationStatus: 'scheduled',
      vacationStart: daysFromNow(5),
      vacationEnd: daysFromNow(12),
    })
    const movedEnd = daysFromNow(20)
    const users = [user]
    const { layer, events } = setup(users, [], (store) => ({
      ...store,
      lockVacation: (userId, now) =>
        store.lockVacation(userId, now).pipe(
          Effect.tap(() =>
            Effect.sync(() => {
              users[0] = { ...user, vacationEnd: movedEnd }
            })
          )
        ),
    }))

    const exit = await Effect.runPromiseExit(
      cancelVacation().pipe(
        Effect.provide(layer),
        Effect.provideService(References.MinimumLogLevel, 'None')
      )
    )

    const defect = Exit.match(exit, {
      onFailure: (cause) => Cause.squash(cause),
      onSuccess: () => null,
    })
    expect(defect).toEqual(
      new VacationNotSetDefect({
        userId: 'user-1',
        expected: 'scheduled',
        next: Vacation.None()._tag,
        set: 0,
      })
    )
    expect(users[0]).toMatchObject({
      vacationStatus: 'scheduled',
      vacationEnd: movedEnd,
    })
    expect(events).toEqual([])
  })

  it('answers UserNotFoundError to an account that is gone or not active', async () => {
    const gone = setup([])
    const suspended = setup([
      createTestUser({
        id: 'user-1',
        status: 'suspended',
        vacationStatus: 'scheduled',
        vacationStart: daysFromNow(5),
        vacationEnd: daysFromNow(12),
      }),
    ])

    const errors = await run(
      Effect.forEach([gone, suspended], (world) =>
        cancelVacation().pipe(Effect.flip, Effect.provide(world.layer))
      )
    )

    expect(Array.map(errors, (error) => error._tag)).toEqual([
      'UserNotFoundError',
      'UserNotFoundError',
    ])
    expect(suspended.writes).toEqual([])
  })

  it('says the vacation ended, with its start and the instant it ended, when a running one is called off', async () => {
    const start = daysFromNow(-7)
    const { layer, events } = setup([
      createTestUser({
        id: 'user-1',
        vacationStatus: 'active',
        vacationStart: start,
        vacationEnd: daysFromNow(3),
      }),
    ])

    await run(cancelVacation().pipe(Effect.provide(layer)))

    expect(events).toEqual([
      { _tag: 'VacationEnded', userId: 'user-1', start, endedAt: NOW },
    ])
  })

  it('says nothing when a vacation is called off before it started', async () => {
    const { layer, events } = setup([
      createTestUser({
        id: 'user-1',
        vacationStatus: 'scheduled',
        vacationStart: daysFromNow(5),
        vacationEnd: daysFromNow(12),
      }),
    ])

    await run(cancelVacation().pipe(Effect.provide(layer)))

    expect(events).toEqual([])
  })
})
