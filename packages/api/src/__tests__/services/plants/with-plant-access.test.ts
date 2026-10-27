import {
  createTestMembership,
  mockCanopyId,
} from '@lily/api/__tests__/fixtures/canopies'
import { mockDelegation2 } from '@lily/api/__tests__/fixtures/delegations'
import { failureOf } from '@lily/api/__tests__/fixtures/exit'
import { createTestPlant } from '@lily/api/__tests__/fixtures/plants'
import { createMockCanopyRepository } from '@lily/api/__tests__/mocks/canopy.repository'
import { createMockDelegationRepository } from '@lily/api/__tests__/mocks/delegation.repository'
import { createMockPlantRepository } from '@lily/api/__tests__/mocks/plant.repository'
import { createMockCurrentUser } from '@lily/api/__tests__/mocks/session'
import type { PlantAction } from '@lily/api/services/plants/helpers/plant-access'
import { withPlantAuth } from '@lily/api/services/plants/helpers/with-plant-access'
import {
  PlantNotAuthorizedError,
  PlantNotFoundError,
} from '@lily/shared/errors/plant'
import { Effect, Layer } from 'effect'
import { describe, expect, it } from 'vitest'

const alex = 'user-alex'
const lily = 'user-lily'
const sam = 'user-sam'

const alexPlant = createTestPlant({ id: 'alex-plant', userId: alex })
const canopyPlant = createTestPlant({
  id: 'canopy-plant',
  userId: null,
  canopyId: mockCanopyId,
  createdByUserId: lily,
})

const members = [
  createTestMembership({ userId: alex, role: 'owner' }),
  createTestMembership({ userId: lily }),
  createTestMembership({ userId: sam }),
]

const layerFor = (userId: string, caretakerOf: readonly string[] = []) =>
  Layer.mergeAll(
    createMockPlantRepository({
      plants: [alexPlant, canopyPlant],
      memberships: members,
    }),
    createMockCurrentUser({ id: userId }),
    createMockCanopyRepository(members),
    createMockDelegationRepository({
      delegations: [
        {
          ...mockDelegation2,
          id: 'delegation-1',
          caretakerId: userId,
          status: 'active',
        },
      ],
      delegationPlants: caretakerOf.map((plantId) => ({
        delegationId: 'delegation-1',
        plantId,
      })),
    })
  )

const run = (
  userId: string,
  plantId: string,
  action: PlantAction,
  caretakerOf: readonly string[] = []
) =>
  Effect.runPromiseExit(
    withPlantAuth(plantId, action).pipe(
      Effect.provide(layerFor(userId, caretakerOf))
    )
  )

describe('withPlantAuth', () => {
  it('returns a personal plant to its owner', async () => {
    const plant = await Effect.runPromise(
      withPlantAuth('alex-plant', 'delete').pipe(Effect.provide(layerFor(alex)))
    )
    expect(plant.id).toBe('alex-plant')
    expect(plant.ownership).toBe('owned')
  })

  it('returns a personal plant to its active caretaker for care', async () => {
    const plant = await Effect.runPromise(
      withPlantAuth('alex-plant', 'care').pipe(
        Effect.provide(layerFor(lily, ['alex-plant']))
      )
    )
    expect(plant.id).toBe('alex-plant')
  })

  it('refuses a caretaker with a pending delegation', async () => {
    const exit = await Effect.runPromiseExit(
      withPlantAuth('alex-plant', 'view').pipe(
        Effect.provide(
          Layer.mergeAll(
            createMockPlantRepository({ plants: [alexPlant] }),
            createMockCurrentUser({ id: lily }),
            createMockCanopyRepository(),
            createMockDelegationRepository({
              delegations: [
                {
                  ...mockDelegation2,
                  id: 'delegation-1',
                  caretakerId: lily,
                  status: 'pending',
                },
              ],
              delegationPlants: [
                { delegationId: 'delegation-1', plantId: 'alex-plant' },
              ],
            })
          )
        )
      )
    )
    expect(failureOf(exit)).toEqual(
      new PlantNotFoundError({ plantId: 'alex-plant' })
    )
  })

  it("answers someone else's plant with the same error as a missing one", async () => {
    const [othersPlant, missing] = await Promise.all([
      run(sam, 'alex-plant', 'view'),
      run(sam, 'missing', 'view'),
    ])
    expect(failureOf(othersPlant)).toEqual(
      new PlantNotFoundError({ plantId: 'alex-plant' })
    )
    expect(failureOf(missing)).toEqual(
      new PlantNotFoundError({ plantId: 'missing' })
    )
    expect(Object.keys(failureOf(othersPlant))).toEqual(
      Object.keys(failureOf(missing))
    )
  })

  it('answers a caretaker 403 for an owner-only action, since they can see the plant', async () => {
    const exit = await run(lily, 'alex-plant', 'markDead', ['alex-plant'])
    expect(failureOf(exit)).toBeInstanceOf(PlantNotAuthorizedError)
  })

  it('returns a Canopy plant to a member with its Canopy', async () => {
    const plant = await Effect.runPromise(
      withPlantAuth('canopy-plant', 'view').pipe(Effect.provide(layerFor(sam)))
    )
    expect(plant.ownership).toBe('canopy')
    expect(plant.ownership === 'canopy' && plant.canopy.id).toBe(mockCanopyId)
  })

  it('lets a member mark a Canopy plant dead and revive it', async () => {
    const dead = await run(sam, 'canopy-plant', 'markDead')
    const revived = await run(sam, 'canopy-plant', 'revive')
    expect(dead._tag).toBe('Success')
    expect(revived._tag).toBe('Success')
  })

  it('refuses a member who did not create the Canopy plant from deleting it', async () => {
    const exit = await run(sam, 'canopy-plant', 'delete')
    expect(failureOf(exit)).toBeInstanceOf(PlantNotAuthorizedError)
  })

  it('lets the creator and the Canopy owner delete a Canopy plant', async () => {
    const byCreator = await run(lily, 'canopy-plant', 'delete')
    const byOwner = await run(alex, 'canopy-plant', 'delete')
    expect(byCreator._tag).toBe('Success')
    expect(byOwner._tag).toBe('Success')
  })

  it('answers a non-member exactly like a missing plant', async () => {
    const stranger = 'user-stranger'
    const exit = await run(stranger, 'canopy-plant', 'view')
    expect(failureOf(exit)).toEqual(
      new PlantNotFoundError({ plantId: 'canopy-plant' })
    )
  })

  it('ignores a delegation on a Canopy plant', async () => {
    const exit = await run('user-stranger', 'canopy-plant', 'care', [
      'canopy-plant',
    ])
    expect(failureOf(exit)).toEqual(
      new PlantNotFoundError({ plantId: 'canopy-plant' })
    )
  })
})
