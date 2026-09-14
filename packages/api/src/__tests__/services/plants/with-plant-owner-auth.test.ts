import { createTestPlant } from '@lily/api/__tests__/fixtures/plants'
import {
  createMockCurrentUser,
  mockUserProfile,
} from '@lily/api/__tests__/mocks/auth'
import { createMockPlantRepository } from '@lily/api/__tests__/mocks/plant.repository'
import { withPlantOwnerAuth } from '@lily/api/services/plants/helpers/with-plant-access'
import { Cause, Effect, Exit, Layer, Option } from 'effect'
import { describe, expect, it } from 'vitest'

const failureTag = (exit: Exit.Exit<unknown, { _tag: string }>) =>
  Exit.isFailure(exit)
    ? Option.map(Cause.failureOption(exit.cause), (e) => e._tag)
    : Option.none()

describe('withPlantOwnerAuth', () => {
  it('returns the plant for its owner', async () => {
    const plant = createTestPlant({ id: 'plant-1', userId: mockUserProfile.id })
    const result = await Effect.runPromise(
      withPlantOwnerAuth('plant-1').pipe(
        Effect.provide(
          Layer.mergeAll(
            createMockPlantRepository({ plants: [plant] }),
            createMockCurrentUser()
          )
        )
      )
    )

    expect(result.id).toBe('plant-1')
  })

  it('refuses anyone who is not the owner, delegation or not', async () => {
    const plant = createTestPlant({ id: 'plant-1', userId: 'someone-else' })
    const exit = await Effect.runPromiseExit(
      withPlantOwnerAuth('plant-1').pipe(
        Effect.provide(
          Layer.mergeAll(
            createMockPlantRepository({ plants: [plant] }),
            createMockCurrentUser()
          )
        )
      )
    )

    expect(failureTag(exit)).toEqual(Option.some('PlantNotAuthorizedError'))
  })

  it('fails with PlantNotFoundError for an unknown id', async () => {
    const exit = await Effect.runPromiseExit(
      withPlantOwnerAuth('missing').pipe(
        Effect.provide(
          Layer.mergeAll(
            createMockPlantRepository({ plants: [] }),
            createMockCurrentUser()
          )
        )
      )
    )

    expect(failureTag(exit)).toEqual(Option.some('PlantNotFoundError'))
  })
})
