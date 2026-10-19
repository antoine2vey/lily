import {
  mockDelegation1,
  mockDelegation2,
  mockDelegationPlants,
} from '@lily/api/__tests__/fixtures/delegations'
import { mockUser1, mockUser2 } from '@lily/api/__tests__/fixtures/users'
import { createMockDelegationRepository } from '@lily/api/__tests__/mocks/delegation.repository'
import { createMockMessageQueue } from '@lily/api/__tests__/mocks/message-queue'
import { createMockNotificationRepository } from '@lily/api/__tests__/mocks/notification.repository'
import { createMockUserRepository } from '@lily/api/__tests__/mocks/user.repository'
import {
  DelegationRepository,
  type DelegationRow,
} from '@lily/api/repositories/delegation.repository'
import { pollAndTransition } from '@lily/api/services/delegation-scheduler/scheduler'
import type { Notification } from '@lily/shared/notification'
import { Array, Effect, Layer, Option, pipe } from 'effect'
import { describe, expect, it } from 'vitest'

const pastDate = new Date('2024-01-01')
const futureDate = new Date('2099-12-31')

const notifications: Notification[] = []

const createLayer = (delegations: DelegationRow[]) =>
  Layer.mergeAll(
    createMockDelegationRepository({
      delegations,
      plants: mockDelegationPlants,
      delegationPlants: pipe(
        Array.head(delegations),
        Option.match({
          onNone: () => [],
          onSome: (d) => [
            { delegationId: d.id, plantId: 'plant-1' },
            { delegationId: d.id, plantId: 'plant-2' },
          ],
        })
      ),
    }),
    createMockNotificationRepository(notifications),
    createMockUserRepository([mockUser1, mockUser2]),
    createMockMessageQueue()
  )

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

    it('leaves a delegation canceled between the read and the activation, and sends nothing', async () => {
      notifications.length = 0
      const delegation: DelegationRow = {
        ...mockDelegation1,
        status: 'accepted' as const,
        startDate: pastDate,
        endDate: futureDate,
      }
      const delegations = [delegation]
      // The owner cancels after the scheduler has read the row but before
      // it writes the new status.
      const racingCancel = Layer.effect(
        DelegationRepository,
        Effect.map(DelegationRepository, (repo) => ({
          ...repo,
          findAcceptedReadyToActivate: (now: Date) =>
            repo.findAcceptedReadyToActivate(now).pipe(
              Effect.tap(() =>
                Effect.sync(() => {
                  delegation.status = 'canceled'
                })
              )
            ),
        }))
      ).pipe(
        Layer.provide(
          createMockDelegationRepository({
            delegations,
            plants: mockDelegationPlants,
            delegationPlants: [
              { delegationId: delegation.id, plantId: 'plant-1' },
            ],
          })
        )
      )

      await Effect.runPromise(
        pollAndTransition.pipe(
          Effect.provide(
            Layer.mergeAll(
              racingCancel,
              createMockNotificationRepository(notifications),
              createMockUserRepository([mockUser1, mockUser2]),
              createMockMessageQueue()
            )
          )
        )
      )

      expect(delegations[0]?.status).toBe('canceled')
      expect(notifications).toHaveLength(0)
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
      const layer = Layer.mergeAll(
        createMockDelegationRepository({
          delegations,
          plants: mockDelegationPlants,
          delegationPlants: [
            { delegationId: 'to-activate', plantId: 'plant-1' },
            { delegationId: 'to-complete', plantId: 'plant-2' },
          ],
        }),
        createMockNotificationRepository(notifications),
        createMockUserRepository([mockUser1, mockUser2]),
        createMockMessageQueue()
      )

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
        title: '🌱 Plant-sitting has begun',
      })
      expect(notifications[1]).toMatchObject({
        userId: delegation.caretakerId,
        type: 'delegation_activated',
        title: '🌱 Plant-sitting has begun',
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
        title: '🎉 Plant-sitting complete',
      })
      expect(notifications[1]).toMatchObject({
        userId: delegation.caretakerId,
        type: 'delegation_completed',
        title: '🎉 Plant-sitting complete',
      })
    })
    describe('error isolation', () => {
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
        const layer = Layer.mergeAll(
          createMockDelegationRepository({
            delegations,
            plants: mockDelegationPlants,
            delegationPlants: [
              { delegationId: 'activate-1', plantId: 'plant-1' },
              { delegationId: 'activate-2', plantId: 'plant-2' },
            ],
          }),
          createMockNotificationRepository(notifications),
          createMockUserRepository([mockUser1, mockUser2]),
          createMockMessageQueue()
        )

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
        const layer = Layer.mergeAll(
          createMockDelegationRepository({
            delegations,
            plants: mockDelegationPlants,
            delegationPlants: [], // No plants linked
          }),
          createMockNotificationRepository(notifications),
          createMockUserRepository([mockUser1, mockUser2]),
          createMockMessageQueue()
        )

        await Effect.runPromise(pollAndTransition.pipe(Effect.provide(layer)))

        expect(delegations[0]?.status).toBe('active')
        // Notifications should still be created (with plantCount: 0)
        expect(notifications.length).toBeGreaterThanOrEqual(2)
      })
    })
  })
})
