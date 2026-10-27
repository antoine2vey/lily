import {
  createTestMembership,
  mockCanopyId,
} from '@lily/api/__tests__/fixtures/canopies'
import {
  createCanopyStore,
  createMockCanopyRepository,
} from '@lily/api/__tests__/mocks/canopy.repository'
import { createMockDelegationRepository } from '@lily/api/__tests__/mocks/delegation.repository'
import type { DelegationRow } from '@lily/api/repositories/delegation.repository'
import { reminderRecipients } from '@lily/api/services/plants/helpers/reminder-recipients'
import type { PlantOwner } from '@lily/shared'
import { Effect, Layer } from 'effect'
import { describe, expect, it } from 'vitest'

const activeDelegation = (
  ownerId: string,
  caretakerId: string
): DelegationRow => ({
  id: 'delegation-1',
  ownerId,
  caretakerId,
  status: 'active',
  message: null,
  startDate: new Date('2025-01-01'),
  endDate: new Date('2099-12-31'),
  respondedAt: null,
  canceledAt: null,
  completedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
})

const canopy: PlantOwner = { _tag: 'Canopy', canopyId: mockCanopyId }

const run = (
  owner: PlantOwner,
  layers: {
    delegations?: DelegationRow[]
    delegationPlants?: { delegationId: string; plantId: string }[]
    members?: ReturnType<typeof createTestMembership>[]
    mutes?: { userId: string; plantId: string }[]
  } = {}
) =>
  Effect.runPromise(
    reminderRecipients({ id: 'plant-1', owner }).pipe(
      Effect.provide(
        Layer.mergeAll(
          createMockDelegationRepository({
            delegations: layers.delegations ?? [],
            delegationPlants: layers.delegationPlants ?? [],
          }),
          createMockCanopyRepository(
            createCanopyStore({
              members: layers.members ?? [],
              mutes: layers.mutes ?? [],
            })
          )
        )
      )
    )
  )

describe('reminderRecipients', () => {
  it('addresses a personal plant to its owner', async () => {
    expect(await run({ _tag: 'User', userId: 'alex' })).toEqual(['alex'])
  })

  it('addresses a delegated personal plant to the caretaker only', async () => {
    const delegation = activeDelegation('alex', 'lily')
    expect(
      await run(
        { _tag: 'User', userId: 'alex' },
        {
          delegations: [delegation],
          delegationPlants: [
            { delegationId: delegation.id, plantId: 'plant-1' },
          ],
        }
      )
    ).toEqual(['lily'])
  })

  it('addresses a Canopy plant to every member', async () => {
    const members = [
      createTestMembership({ userId: 'alex', role: 'owner' }),
      createTestMembership({ userId: 'lily' }),
      createTestMembership({ userId: 'sam' }),
    ]
    expect(await run(canopy, { members })).toEqual(['alex', 'lily', 'sam'])
  })

  it('leaves out a member who muted the plant, but not one who muted another plant', async () => {
    const members = [
      createTestMembership({ userId: 'alex', role: 'owner' }),
      createTestMembership({ userId: 'lily' }),
      createTestMembership({ userId: 'sam' }),
    ]
    expect(
      await run(canopy, {
        members,
        mutes: [
          { userId: 'lily', plantId: 'plant-1' },
          { userId: 'sam', plantId: 'plant-2' },
        ],
      })
    ).toEqual(['alex', 'sam'])
  })

  it('leaves out users who are not members of that Canopy', async () => {
    const members = [
      createTestMembership({ userId: 'alex', role: 'owner' }),
      createTestMembership({
        userId: 'stranger',
        canopyId: 'canopy-2' as typeof mockCanopyId,
      }),
    ]
    expect(await run(canopy, { members })).toEqual(['alex'])
  })
})
