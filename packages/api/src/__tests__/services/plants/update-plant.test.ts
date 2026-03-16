import { schedulesFromPlants } from '@lily/api/__tests__/fixtures/care-schedules'
import { mockPlants } from '@lily/api/__tests__/fixtures/plants'
import { createMockCareScheduleRepository } from '@lily/api/__tests__/mocks/care-schedule.repository'
import { createMockPlantRepository } from '@lily/api/__tests__/mocks/plant.repository'
import type { CareScheduleRow } from '@lily/api/repositories/care-schedule.repository'
import type { PlantWithRoom } from '@lily/api/repositories/plant.repository'
import { updatePlant } from '@lily/api/services/plants/endpoints/update-plant'
import { Array, Effect, Layer, Option, pipe } from 'effect'
import { describe, expect, it } from 'vitest'

const toPlantWithRoom = (
  plant: (typeof mockPlants)[number]
): PlantWithRoom => ({
  ...plant,
  room: null,
  ownership: 'owned' as const,
  ownerName: null,
  schedules: [],
})

const findSchedule = (
  schedules: CareScheduleRow[],
  plantId: string,
  careType: string
) =>
  pipe(
    Array.findFirst(
      schedules,
      (s) => s.plantId === plantId && s.careType === careType
    ),
    Option.getOrNull
  )

describe('updatePlant', () => {
  const createTestLayer = (plants = mockPlants) => {
    const schedules = schedulesFromPlants(plants)
    return {
      layer: Layer.mergeAll(
        createMockPlantRepository({ plants }),
        createMockCareScheduleRepository({ schedules, plants })
      ),
      schedules,
    }
  }

  it('should update plant fields', async () => {
    const { layer } = createTestLayer()
    const plant = toPlantWithRoom(mockPlants[0]!)
    const result = await Effect.runPromise(
      updatePlant(plant, { id: 'plant-1', name: 'Updated Name' }).pipe(
        Effect.provide(layer)
      )
    )

    expect(result.name).toBe('Updated Name')
  })

  it('should preserve other fields when updating', async () => {
    const { layer } = createTestLayer()
    const plant = toPlantWithRoom(mockPlants[0]!)
    const result = await Effect.runPromise(
      updatePlant(plant, { id: 'plant-1', name: 'Updated Name' }).pipe(
        Effect.provide(layer)
      )
    )

    expect(result.category).toBe(mockPlants[0]?.category)
    expect(result.id).toBe('plant-1')
  })

  it('should update multiple fields at once', async () => {
    const { layer, schedules } = createTestLayer()
    const plant = toPlantWithRoom(mockPlants[0]!)
    const result = await Effect.runPromise(
      updatePlant(plant, {
        id: 'plant-1',
        name: 'Updated Name',
        description: 'Updated description',
        wateringFrequencyDays: 14,
      }).pipe(Effect.provide(layer))
    )

    expect(result.name).toBe('Updated Name')
    expect(result.description).toBe('Updated description')
    const wateringSchedule = findSchedule(schedules, 'plant-1', 'watering')
    expect(wateringSchedule?.frequencyDays).toBe(14)
  })

  it('should update health status', async () => {
    const { layer } = createTestLayer()
    const plant = toPlantWithRoom(mockPlants[0]!)
    const result = await Effect.runPromise(
      updatePlant(plant, { id: 'plant-1', health: 'THRIVING' } as Parameters<
        typeof updatePlant
      >[1]).pipe(Effect.provide(layer))
    )

    expect(result.health).toBe('THRIVING')
  })
})
