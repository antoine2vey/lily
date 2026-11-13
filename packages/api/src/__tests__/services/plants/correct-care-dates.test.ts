import { createTestPlant } from '@lily/api/__tests__/fixtures/plants'
import { carePermit, createStubCare } from '@lily/api/__tests__/mocks/care'
import { createMockPlantRepository } from '@lily/api/__tests__/mocks/plant.repository'
import { careWhenOf } from '@lily/api/contexts/care'
import { correctCareDates } from '@lily/api/services/plants/endpoints/correct-care-dates'
import type { PlantCorrectCareDatesRequest } from '@lily/shared/plant'
import { Effect, Layer } from 'effect'
import { describe, expect, it } from 'vitest'

const permit = carePermit('plant-1')

const correct = (
  request: PlantCorrectCareDatesRequest,
  plants = [createTestPlant({ id: 'plant-1', userId: 'user-1' })]
) => {
  const care = createStubCare()
  return {
    care,
    effect: correctCareDates(permit, request).pipe(
      Effect.provide(
        Layer.mergeAll(care.layer, createMockPlantRepository({ plants }))
      )
    ),
  }
}

describe('correctCareDates', () => {
  it('corrects each care type of the request in one command', async () => {
    const lastWateredAt = new Date('2024-01-12T09:00:00.000Z')
    const lastFertilizedAt = new Date('2024-01-03T09:00:00.000Z')
    const { care, effect } = correct({ lastWateredAt, lastFertilizedAt })

    const plant = await Effect.runPromise(effect)

    expect(care.corrected).toEqual([
      {
        permit,
        corrections: [
          { careType: 'watering', on: careWhenOf(lastWateredAt) },
          { careType: 'fertilization', on: careWhenOf(lastFertilizedAt) },
        ],
      },
    ])
    expect(plant.id).toBe('plant-1')
  })

  it('leaves out a care type the request does not name', async () => {
    const lastFertilizedAt = new Date('2024-01-03T09:00:00.000Z')
    const { care, effect } = correct({ lastFertilizedAt })

    await Effect.runPromise(effect)

    expect(care.corrected[0]?.corrections).toEqual([
      { careType: 'fertilization', on: careWhenOf(lastFertilizedAt) },
    ])
  })

  it('corrects nothing and returns the plant when the request is empty', async () => {
    const { care, effect } = correct({})

    const plant = await Effect.runPromise(effect)

    expect(care.corrected[0]?.corrections).toEqual([])
    expect(plant.id).toBe('plant-1')
  })

  it('fails with PlantNotFoundError when the plant is gone after the correction', async () => {
    const { effect } = correct({ lastWateredAt: new Date('2024-01-12') }, [])

    const failure = await Effect.runPromise(Effect.flip(effect))

    expect(failure._tag).toBe('PlantNotFoundError')
  })
})
