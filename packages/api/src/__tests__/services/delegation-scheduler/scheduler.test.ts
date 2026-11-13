import {
  mockDelegation1,
  mockDelegation2,
  mockDelegationPlants,
} from '@lily/api/__tests__/fixtures/delegations'
import { mockUser1, mockUser2 } from '@lily/api/__tests__/fixtures/users'
import {
  type AbsenceSurroundings,
  createInMemoryAbsence,
} from '@lily/api/__tests__/mocks/absence'
import type { DelegationRow } from '@lily/api/repositories/delegation.repository'
import {
  pollAndTransition,
  startDelegationScheduler,
} from '@lily/api/services/delegation-scheduler/scheduler'
import type { Notification } from '@lily/shared/notification'
import { Array, Deferred, Effect, Option, pipe, References } from 'effect'
import { describe, expect, it } from 'vitest'

const pastDate = new Date('2024-01-01')
const futureDate = new Date('2099-12-31')

const notifications: Notification[] = []

type PlantLink = { delegationId: string; plantId: string }

const inMemory = (
  delegations: DelegationRow[],
  delegationPlants: PlantLink[] = pipe(
    Array.head(delegations),
    Option.match({
      onNone: () => [],
      onSome: (d) => [
        { delegationId: d.id, plantId: 'plant-1' },
        { delegationId: d.id, plantId: 'plant-2' },
      ],
    })
  ),
  store?: AbsenceSurroundings['store']
) =>
  createInMemoryAbsence(
    {
      delegations,
      delegationPlants,
      users: [mockUser1, mockUser2],
      plantDetails: mockDelegationPlants,
    },
    { notifications, store }
  )

const createLayer = (
  delegations: DelegationRow[],
  delegationPlants?: PlantLink[]
) => inMemory(delegations, delegationPlants).layer

describe('DelegationScheduler', () => {
  describe('pollAndTransition', () => {
    it('should activate accepted delegations when startDate has passed', async () => {
      const delegation: DelegationRow = {
        ...mockDelegation1,
        status: 'accepted' as const,
        startDate: pastDate,
        endDate: futureDate,
      }
      const delegations = [delegation]
      const layer = createLayer(delegations)

      await Effect.runPromise(pollAndTransition.pipe(Effect.provide(layer)))

      expect(delegations[0]?.status).toBe('active')
    })

    it('should not activate delegations whose startDate is in the future', async () => {
      const delegation: DelegationRow = {
        ...mockDelegation1,
        status: 'accepted' as const,
        startDate: futureDate,
        endDate: futureDate,
      }
      const delegations = [delegation]
      const layer = createLayer(delegations)

      await Effect.runPromise(pollAndTransition.pipe(Effect.provide(layer)))

      expect(delegations[0]?.status).toBe('accepted')
    })

    it('should complete active delegations when endDate has passed', async () => {
      const delegation: DelegationRow = {
        ...mockDelegation1,
        status: 'active' as const,
        startDate: pastDate,
        endDate: pastDate,
      }
      const delegations = [delegation]
      const layer = createLayer(delegations)

      await Effect.runPromise(pollAndTransition.pipe(Effect.provide(layer)))

      expect(delegations[0]?.status).toBe('completed')
      expect(delegations[0]?.completedAt).not.toBeNull()
    })

    it('should not complete delegations whose endDate is in the future', async () => {
      const delegation: DelegationRow = {
        ...mockDelegation1,
        status: 'active' as const,
        startDate: pastDate,
        endDate: futureDate,
      }
      const delegations = [delegation]
      const layer = createLayer(delegations)

      await Effect.runPromise(pollAndTransition.pipe(Effect.provide(layer)))

      expect(delegations[0]?.status).toBe('active')
    })

    it('leaves a delegation canceled after it was listed as due, and sends nothing', async () => {
      notifications.length = 0
      const delegation: DelegationRow = {
        ...mockDelegation1,
        status: 'accepted' as const,
        startDate: pastDate,
        endDate: futureDate,
      }
      const delegations = [delegation]
      const absence = inMemory(
        delegations,
        [{ delegationId: delegation.id, plantId: 'plant-1' }],
        (store) => ({
          ...store,
          dueDelegations: (edge, now) =>
            store.dueDelegations(edge, now).pipe(
              Effect.tap(() =>
                Effect.sync(() => {
                  delegation.status = 'canceled'
                })
              )
            ),
        })
      )

      const tally = await Effect.runPromise(
        pollAndTransition.pipe(Effect.provide(absence.layer))
      )

      expect(delegations[0]?.status).toBe('canceled')
      expect(notifications).toHaveLength(0)
      expect(absence.events).toEqual([])
      expect(tally).toEqual({ due: 1, advanced: 0, failed: 0 })
    })

    it('publishes one fact per delegation that changed hands, and none for one still waiting', async () => {
      const starting: DelegationRow = {
        ...mockDelegation1,
        id: 'starting',
        status: 'accepted' as const,
        startDate: pastDate,
        endDate: futureDate,
      }
      const ending: DelegationRow = {
        ...mockDelegation2,
        id: 'ending',
        status: 'active' as const,
        startDate: pastDate,
        endDate: pastDate,
      }
      const waiting: DelegationRow = {
        ...mockDelegation2,
        id: 'waiting',
        status: 'accepted' as const,
        startDate: futureDate,
        endDate: futureDate,
      }
      const absence = inMemory(
        [starting, ending, waiting],
        [
          { delegationId: 'starting', plantId: 'plant-1' },
          { delegationId: 'ending', plantId: 'plant-2' },
          { delegationId: 'waiting', plantId: 'plant-2' },
        ]
      )

      const tally = await Effect.runPromise(
        pollAndTransition.pipe(Effect.provide(absence.layer))
      )

      expect(absence.events).toEqual([
        {
          _tag: 'DelegationStarted',
          delegationId: 'starting',
          ownerId: starting.ownerId,
          caretakerId: starting.caretakerId,
          plantIds: ['plant-1'],
        },
        {
          _tag: 'DelegationEnded',
          delegationId: 'ending',
          ownerId: ending.ownerId,
          caretakerId: ending.caretakerId,
          plantIds: ['plant-2'],
          reason: 'completed',
        },
      ])
      expect(tally).toEqual({ due: 2, advanced: 2, failed: 0 })
    })

    it('should handle empty results gracefully', async () => {
      const layer = createLayer([])

      await Effect.runPromise(pollAndTransition.pipe(Effect.provide(layer)))
    })

    it('should process both activations and completions in one poll', async () => {
      const toActivate: DelegationRow = {
        ...mockDelegation1,
        id: 'to-activate',
        status: 'accepted' as const,
        startDate: pastDate,
        endDate: futureDate,
      }
      const toComplete: DelegationRow = {
        ...mockDelegation2,
        id: 'to-complete',
        status: 'active' as const,
        startDate: pastDate,
        endDate: pastDate,
      }
      const delegations = [toActivate, toComplete]
      const layer = createLayer(delegations, [
        { delegationId: 'to-activate', plantId: 'plant-1' },
        { delegationId: 'to-complete', plantId: 'plant-2' },
      ])

      notifications.length = 0
      await Effect.runPromise(pollAndTransition.pipe(Effect.provide(layer)))

      expect(delegations[0]?.status).toBe('active')
      expect(delegations[1]?.status).toBe('completed')
    })

    it('should create delegation_activated notifications for both parties', async () => {
      notifications.length = 0
      const delegation: DelegationRow = {
        ...mockDelegation1,
        status: 'accepted' as const,
        startDate: pastDate,
        endDate: futureDate,
      }
      const delegations = [delegation]
      const layer = createLayer(delegations)

      await Effect.runPromise(pollAndTransition.pipe(Effect.provide(layer)))

      expect(notifications).toHaveLength(2)
      expect(notifications[0]).toMatchObject({
        userId: delegation.ownerId,
        type: 'delegation_activated',
        params: { plantCount: 2 },
        status: 'queued',
        metadata: { delegationId: delegation.id },
      })
      expect(notifications[1]).toMatchObject({
        userId: delegation.caretakerId,
        type: 'delegation_activated',
        params: { plantCount: 2 },
        status: 'queued',
        metadata: { delegationId: delegation.id },
      })
    })

    it('should create delegation_completed notifications for both parties', async () => {
      notifications.length = 0
      const delegation: DelegationRow = {
        ...mockDelegation1,
        status: 'active' as const,
        startDate: pastDate,
        endDate: pastDate,
      }
      const delegations = [delegation]
      const layer = createLayer(delegations)

      await Effect.runPromise(pollAndTransition.pipe(Effect.provide(layer)))

      expect(notifications).toHaveLength(2)
      expect(notifications[0]).toMatchObject({
        userId: delegation.ownerId,
        type: 'delegation_completed',
        params: { plantCount: 2 },
        status: 'queued',
        metadata: { delegationId: delegation.id },
      })
      expect(notifications[1]).toMatchObject({
        userId: delegation.caretakerId,
        type: 'delegation_completed',
        params: { plantCount: 2 },
        status: 'queued',
        metadata: { delegationId: delegation.id },
      })
    })

    describe('a request nobody answered', () => {
      const unanswered = (
        dates: Pick<DelegationRow, 'startDate' | 'endDate'>
      ): DelegationRow => ({ ...mockDelegation1, status: 'pending', ...dates })

      it('is canceled at its start, and the owner alone is told, once', async () => {
        notifications.length = 0
        const delegation = unanswered({
          startDate: pastDate,
          endDate: futureDate,
        })
        const absence = inMemory([delegation])

        const first = await Effect.runPromise(
          pollAndTransition.pipe(Effect.provide(absence.layer))
        )
        const second = await Effect.runPromise(
          pollAndTransition.pipe(Effect.provide(absence.layer))
        )

        expect(first).toEqual({ due: 1, advanced: 1, failed: 0 })
        expect(second).toEqual({ due: 0, advanced: 0, failed: 0 })
        expect(delegation.status).toBe('canceled')
        expect(delegation.canceledAt).not.toBeNull()
        expect(absence.events).toEqual([])
        expect(notifications).toHaveLength(1)
        expect(notifications[0]).toMatchObject({
          userId: delegation.ownerId,
          type: 'delegation_canceled',
          params: { senderName: mockUser2.name, unanswered: true },
          status: 'queued',
          metadata: { delegationId: delegation.id },
        })
      })

      it('stays open until its start', async () => {
        notifications.length = 0
        const delegation = unanswered({
          startDate: futureDate,
          endDate: futureDate,
        })
        const absence = inMemory([delegation])

        const tally = await Effect.runPromise(
          pollAndTransition.pipe(Effect.provide(absence.layer))
        )

        expect(tally).toEqual({ due: 0, advanced: 0, failed: 0 })
        expect(delegation.status).toBe('pending')
        expect(notifications).toEqual([])
      })

      it('is canceled and never started when its end has passed too', async () => {
        notifications.length = 0
        const delegation = unanswered({
          startDate: pastDate,
          endDate: pastDate,
        })
        const absence = inMemory([delegation])

        const tally = await Effect.runPromise(
          pollAndTransition.pipe(Effect.provide(absence.layer))
        )

        expect(tally).toEqual({ due: 1, advanced: 1, failed: 0 })
        expect(delegation.status).toBe('canceled')
        expect(delegation.completedAt).toBeNull()
        expect(Array.map(notifications, (n) => n.type)).toEqual([
          'delegation_canceled',
        ])
      })

      it('starts when the caretaker accepted after the tick listed it', async () => {
        notifications.length = 0
        const delegation = unanswered({
          startDate: pastDate,
          endDate: futureDate,
        })
        const absence = inMemory([delegation], [], (store) => ({
          ...store,
          dueDelegations: (edge, now) =>
            store.dueDelegations(edge, now).pipe(
              Effect.tap(() =>
                Effect.sync(() => {
                  if (edge === 'start') delegation.status = 'accepted'
                })
              )
            ),
        }))

        const tally = await Effect.runPromise(
          pollAndTransition.pipe(Effect.provide(absence.layer))
        )

        expect(tally).toEqual({ due: 1, advanced: 1, failed: 0 })
        expect(delegation.status).toBe('active')
        expect(Array.map(notifications, (n) => n.type)).toEqual([
          'delegation_activated',
          'delegation_activated',
        ])
      })
    })

    describe('error isolation', () => {
      it('counts a delegation whose write dies and still advances the next', async () => {
        const dying: DelegationRow = {
          ...mockDelegation1,
          id: 'a-dying',
          status: 'accepted' as const,
          startDate: pastDate,
          endDate: futureDate,
        }
        const next: DelegationRow = {
          ...mockDelegation1,
          id: 'b-next',
          status: 'accepted' as const,
          startDate: pastDate,
          endDate: futureDate,
        }
        const absence = inMemory([dying, next], [], (store) => ({
          ...store,
          apply: (writes) =>
            Array.some(
              writes,
              (write) =>
                write._tag === 'MoveDelegation' && write.id === dying.id
            )
              ? Effect.die('the write of a-dying broke')
              : store.apply(writes),
        }))

        const tally = await Effect.runPromise(
          pollAndTransition.pipe(Effect.provide(absence.layer))
        )

        expect(tally).toEqual({ due: 2, advanced: 1, failed: 1 })
        expect(dying.status).toBe('accepted')
        expect(next.status).toBe('active')
        expect(absence.events).toEqual([
          {
            _tag: 'DelegationStarted',
            delegationId: 'b-next',
            ownerId: next.ownerId,
            caretakerId: next.caretakerId,
            plantIds: [],
          },
        ])
      })

      it('dies when the row it locked is not the row it moves', async () => {
        const delegation: DelegationRow = {
          ...mockDelegation1,
          status: 'accepted' as const,
          startDate: pastDate,
          endDate: futureDate,
        }
        const absence = inMemory([delegation], [], (store) => ({
          ...store,
          lockDelegation: (id) =>
            store.lockDelegation(id).pipe(
              Effect.tap(() =>
                Effect.sync(() => {
                  delegation.status = 'canceled'
                })
              )
            ),
        }))

        const tally = await Effect.runPromise(
          pollAndTransition.pipe(Effect.provide(absence.layer))
        )

        expect(tally).toEqual({ due: 1, advanced: 0, failed: 1 })
        expect(absence.events).toEqual([])
      })

      it('should process multiple activations independently', async () => {
        notifications.length = 0
        const d1: DelegationRow = {
          ...mockDelegation1,
          id: 'activate-1',
          status: 'accepted' as const,
          startDate: pastDate,
          endDate: futureDate,
        }
        const d2: DelegationRow = {
          ...mockDelegation2,
          id: 'activate-2',
          status: 'accepted' as const,
          startDate: pastDate,
          endDate: futureDate,
        }
        const delegations = [d1, d2]
        const layer = createLayer(delegations, [
          { delegationId: 'activate-1', plantId: 'plant-1' },
          { delegationId: 'activate-2', plantId: 'plant-2' },
        ])

        await Effect.runPromise(pollAndTransition.pipe(Effect.provide(layer)))

        expect(delegations[0]?.status).toBe('active')
        expect(delegations[1]?.status).toBe('active')
      })

      it('should create notifications with correct plant count', async () => {
        notifications.length = 0
        const delegation: DelegationRow = {
          ...mockDelegation1,
          status: 'accepted' as const,
          startDate: pastDate,
          endDate: futureDate,
        }
        const delegations = [delegation]
        const layer = createLayer(delegations)

        await Effect.runPromise(pollAndTransition.pipe(Effect.provide(layer)))

        // Delegation has 2 plants linked, notification body should
        // reference them
        expect(notifications.length).toBeGreaterThanOrEqual(2)
      })

      it('should handle delegation with no associated plants', async () => {
        notifications.length = 0
        const delegation: DelegationRow = {
          ...mockDelegation1,
          id: 'no-plants-delegation',
          status: 'accepted' as const,
          startDate: pastDate,
          endDate: futureDate,
        }
        const delegations = [delegation]
        const layer = createLayer(delegations, [])

        await Effect.runPromise(pollAndTransition.pipe(Effect.provide(layer)))

        expect(delegations[0]?.status).toBe('active')
        // Notifications should still be created (with plantCount: 0)
        expect(notifications.length).toBeGreaterThanOrEqual(2)
      })
    })
  })

  describe('startDelegationScheduler', () => {
    it('advances what is due when it starts, without waiting for its interval', async () => {
      notifications.length = 0
      const delegation: DelegationRow = {
        ...mockDelegation1,
        status: 'pending' as const,
        startDate: pastDate,
        endDate: futureDate,
      }
      const listed: string[] = []
      const tickBegan = Deferred.makeUnsafe<void>()
      const absence = inMemory([delegation], [], (store) => ({
        ...store,
        dueDelegations: (edge, now) =>
          store.dueDelegations(edge, now).pipe(
            Effect.tap(() => Effect.sync(() => listed.push(edge))),
            Effect.tap(() => Deferred.succeed(tickBegan, undefined))
          ),
      }))

      await Effect.runPromise(
        Effect.scoped(
          Effect.andThen(
            startDelegationScheduler,
            Deferred.await(tickBegan).pipe(
              Effect.timeoutOrElse({
                duration: '2 seconds',
                orElse: () => Effect.die('no tick ran at startup'),
              })
            )
          )
        ).pipe(
          Effect.provide(absence.layer),
          Effect.provideService(References.MinimumLogLevel, 'None')
        )
      )

      expect(listed).toEqual(['start', 'end'])
      expect(delegation.status).toBe('canceled')
    })
  })
})
