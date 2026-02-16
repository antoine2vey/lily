import {
  mockDelegation1,
  mockDelegation2,
} from '@lily/api/__tests__/fixtures/delegations'
import { createMockDelegationRepository } from '@lily/api/__tests__/mocks/delegation.repository'
import type { DelegationRow } from '@lily/api/repositories/delegation.repository'
import { pollAndTransition } from '@lily/api/services/delegation-scheduler/scheduler'
import { Effect } from 'effect'
import { describe, expect, it } from 'vitest'

const pastDate = new Date('2024-01-01')
const futureDate = new Date('2099-12-31')

const createLayer = (delegations: DelegationRow[]) =>
  createMockDelegationRepository({ delegations })

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
      const layer = createLayer(delegations)

      await Effect.runPromise(pollAndTransition.pipe(Effect.provide(layer)))

      expect(delegations[0]?.status).toBe('active')
      expect(delegations[1]?.status).toBe('completed')
    })
  })
})
