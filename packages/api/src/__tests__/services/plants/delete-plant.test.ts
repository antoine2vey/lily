import { mockCanopyId } from '@lily/api/__tests__/fixtures/canopies'
import { failureOf } from '@lily/api/__tests__/fixtures/exit'
import { createTestPlant, noCare } from '@lily/api/__tests__/fixtures/plants'
import {
  createInMemoryCare,
  permitTo,
  toldToTheApp,
} from '@lily/api/__tests__/mocks/care'
import { withUserOwner } from '@lily/api/repositories/helpers/plant-owner'
import type { PlantWithRoom } from '@lily/api/repositories/plant.repository'
import { deletePlant } from '@lily/api/services/plants/endpoints/delete-plant'
import { PlantNotFoundError } from '@lily/shared/errors/plant'
import { Effect } from 'effect'
import { describe, expect, it } from 'vitest'

type Row = ReturnType<typeof createTestPlant>

const asPlantWithRoom = (plant: Row): PlantWithRoom => ({
  ...withUserOwner(plant),
  room: null,
  ownership: 'owned',
  ownerName: null,
  ...noCare,
})

const world = (stored: ReadonlyArray<Row>) => {
  const rows = stored.map((row) => ({ ...row }))
  const care = createInMemoryCare([], { plantRows: rows })
  return { care, rows, layer: care.layer }
}

const remove = (seen: PlantWithRoom, requestedId?: string) =>
  deletePlant(seen, permitTo('delete', seen.id), requestedId)

describe('deletePlant', () => {
  it('returns the plant it deleted', async () => {
    const plant = createTestPlant({ id: 'plant-1', name: 'Monstera' })
    const { rows, layer } = world([plant])
    const result = await Effect.runPromise(
      remove(asPlantWithRoom(plant)).pipe(Effect.provide(layer))
    )

    expect(result).toMatchObject({
      id: 'plant-1',
      name: 'Monstera',
      room: null,
      ownership: 'owned',
      ownerName: null,
    })
    expect(rows).toEqual([])
  })

  it('deletes a plant of the cemetery too', async () => {
    const plant = createTestPlant({
      id: 'plant-1',
      diedAt: new Date('2026-01-01'),
    })
    const { rows, layer } = world([plant])

    await Effect.runPromise(
      remove(asPlantWithRoom(plant)).pipe(Effect.provide(layer))
    )

    expect(rows).toEqual([])
  })

  it("refreshes the caller's card", async () => {
    const plant = createTestPlant({ id: 'plant-1' })
    const { care, layer } = world([plant])

    await Effect.runPromise(
      remove(asPlantWithRoom(plant)).pipe(Effect.provide(layer))
    )

    expect(care.events).toEqual([
      {
        _tag: 'PlantLifeChanged',
        plantId: 'plant-1',
        owner: { _tag: 'User', userId: 'user-1' },
        life: 'Removed',
        by: 'user-1',
      },
    ])
    expect(await toldToTheApp(care.events)).toEqual([
      { _tag: 'PlantLifecycleChanged', userId: 'user-1', plantId: 'plant-1' },
    ])
  })

  it('fails with PlantNotFoundError when the row is already gone', async () => {
    const plant = createTestPlant({ id: 'plant-1' })
    const exit = await Effect.runPromiseExit(
      remove(asPlantWithRoom(plant), 'PLANT-1').pipe(
        Effect.provide(world([]).layer)
      )
    )

    expect(failureOf(exit)).toEqual(
      new PlantNotFoundError({ plantId: 'PLANT-1' })
    )
  })

  it('leaves a plant that has left the owner the caller saw', async () => {
    const seen = createTestPlant({ id: 'plant-1', userId: 'user-1' })
    const shared = { ...seen, userId: null, canopyId: mockCanopyId }
    const { care, rows, layer } = world([shared])

    const exit = await Effect.runPromiseExit(
      remove(asPlantWithRoom(seen)).pipe(Effect.provide(layer))
    )

    expect(failureOf(exit)).toEqual(
      new PlantNotFoundError({ plantId: 'plant-1' })
    )
    expect(rows).toHaveLength(1)
    expect(care.events).toEqual([])
  })
})
