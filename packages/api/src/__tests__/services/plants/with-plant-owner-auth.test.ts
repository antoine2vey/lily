import { mockDelegation2 } from '@lily/api/__tests__/fixtures/delegations'
import { createTestPlant } from '@lily/api/__tests__/fixtures/plants'
import {
  createMockCurrentUser,
  mockUserProfile,
} from '@lily/api/__tests__/mocks/auth'
import { createMockDelegationRepository } from '@lily/api/__tests__/mocks/delegation.repository'
import { createMockPlantRepository } from '@lily/api/__tests__/mocks/plant.repository'
import { withPlantOwnerAuth } from '@lily/api/services/plants/helpers/with-plant-access'
import { Cause, Effect, Exit, Layer, Option } from 'effect'
import { describe, expect, it } from 'vitest'

const failureTag = (exit: Exit.Exit<unknown, { _tag: string }>) =>
  Exit.isFailure(exit)
    ? Option.map(Cause.findErrorOption(exit.cause), (e) => e._tag)
    : Option.none()

const layerWith = (
  plants: ReturnType<typeof createTestPlant>[],
  caretakerOf: readonly string[] = []
) =>
  Layer.mergeAll(
    createMockPlantRepository({ plants }),
    createMockCurrentUser(),
    createMockDelegationRepository({
      delegations: [
        {
          ...mockDelegation2,
          id: 'delegation-1',
          caretakerId: mockUserProfile.id,
          status: 'active',
        },
      ],
      delegationPlants: caretakerOf.map((plantId) => ({
        delegationId: 'delegation-1',
        plantId,
      })),
    })
  )

describe('withPlantOwnerAuth', () => {
  it('returns the plant for its owner', async () => {
    const plant = createTestPlant({ id: 'plant-1', userId: mockUserProfile.id })
    const result = await Effect.runPromise(
      withPlantOwnerAuth('plant-1').pipe(Effect.provide(layerWith([plant])))
    )

    expect(result.id).toBe('plant-1')
  })

  it("answers someone else's plant exactly like a missing one", async () => {
    const plant = createTestPlant({ id: 'plant-1', userId: 'someone-else' })
    const [othersPlant, missing] = await Promise.all([
      Effect.runPromiseExit(
        withPlantOwnerAuth('plant-1').pipe(Effect.provide(layerWith([plant])))
      ),
      Effect.runPromiseExit(
        withPlantOwnerAuth('missing').pipe(Effect.provide(layerWith([plant])))
      ),
    ])

    expect(failureTag(othersPlant)).toEqual(Option.some('PlantNotFoundError'))
    expect(failureTag(missing)).toEqual(Option.some('PlantNotFoundError'))
  })

  it('refuses a caretaker, who already knows the plant exists', async () => {
    const plant = createTestPlant({ id: 'plant-1', userId: 'someone-else' })
    const exit = await Effect.runPromiseExit(
      withPlantOwnerAuth('plant-1').pipe(
        Effect.provide(layerWith([plant], ['plant-1']))
      )
    )

    expect(failureTag(exit)).toEqual(Option.some('PlantNotAuthorizedError'))
  })
})
