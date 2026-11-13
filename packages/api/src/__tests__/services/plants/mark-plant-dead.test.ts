import { mockCanopyId } from '@lily/api/__tests__/fixtures/canopies'
import { failureOf } from '@lily/api/__tests__/fixtures/exit'
import { createTestPlant, noCare } from '@lily/api/__tests__/fixtures/plants'
import {
  createInMemoryCare,
  permitTo,
  toldToTheApp,
} from '@lily/api/__tests__/mocks/care'
import { createMockPlantRepository } from '@lily/api/__tests__/mocks/plant.repository'
import { Dirty } from '@lily/api/contexts/reminders'
import { staleAfterCare } from '@lily/api/contexts/reminders/triggers'
import {
  withCanopyOwner,
  withUserOwner,
} from '@lily/api/repositories/helpers/plant-owner'
import {
  PlantRepository,
  type PlantWithRoom,
} from '@lily/api/repositories/plant.repository'
import { markPlantDead } from '@lily/api/services/plants/endpoints/mark-plant-dead'
import {
  PlantAlreadyDeadError,
  PlantNotFoundError,
} from '@lily/shared/errors/plant'
import type { PlantDeathRequest } from '@lily/shared/plant'
import { Array, Effect, Exit, Layer } from 'effect'
import { describe, expect, it } from 'vitest'

type Row = ReturnType<typeof createTestPlant>

const asPlantWithRoom = (plant: Row): PlantWithRoom => ({
  ...withUserOwner(plant),
  room: null,
  ownership: 'owned' as const,
  ownerName: null,
  ...noCare,
})

const asCanopyPlantWithRoom = (plant: Row): PlantWithRoom => ({
  ...withCanopyOwner(plant),
  room: null,
  ownership: 'canopy',
  ownerName: null,
  canopy: { id: mockCanopyId, name: 'Home' },
  createdBy: null,
  ...noCare,
})

const world = (stored: Row) => {
  const rows = [{ ...stored }]
  const care = createInMemoryCare([], { plantRows: rows })
  return {
    care,
    layer: Layer.mergeAll(
      createMockPlantRepository({ plants: rows, sharesPlantsArray: true }),
      care.layer
    ),
  }
}

const bury = (
  seen: PlantWithRoom,
  request: PlantDeathRequest,
  by = 'user-1',
  requestedId?: string
) =>
  markPlantDead(seen, permitTo('markDead', seen.id, by), request, requestedId)

describe('markPlantDead', () => {
  it('sets diedAt, cause and note on a living plant', async () => {
    const plant = createTestPlant({ id: 'plant-1', userId: 'user-1' })
    const result = await Effect.runPromise(
      bury(asPlantWithRoom(plant), {
        cause: 'overwatering',
        note: 'Too much love',
      }).pipe(Effect.provide(world(plant).layer))
    )

    expect(result.diedAt).not.toBeNull()
    expect(result.deathCause).toBe('overwatering')
    expect(result.deathNote).toBe('Too much love')
  })

  it('stores a null note when none is given', async () => {
    const plant = createTestPlant({ id: 'plant-1', userId: 'user-1' })
    const result = await Effect.runPromise(
      bury(asPlantWithRoom(plant), { cause: 'unknown' }).pipe(
        Effect.provide(world(plant).layer)
      )
    )

    expect(result.deathNote).toBeNull()
  })

  it('fails with PlantAlreadyDeadError when the plant is already dead', async () => {
    const plant = createTestPlant({
      id: 'plant-1',
      userId: 'user-1',
      diedAt: new Date('2026-01-01'),
      deathCause: 'pests',
    })
    const exit = await Effect.runPromiseExit(
      bury(asPlantWithRoom(plant), { cause: 'unknown' }).pipe(
        Effect.provide(world(plant).layer)
      )
    )

    expect(failureOf(exit)).toEqual(new PlantAlreadyDeadError())
  })

  it('makes Reminders plan the buried plant again', async () => {
    const plant = createTestPlant({ id: 'plant-1', userId: 'user-1' })
    const { care, layer } = world(plant)

    await Effect.runPromise(
      bury(asPlantWithRoom(plant), { cause: 'cold' }).pipe(
        Effect.provide(layer)
      )
    )

    expect(care.events).toEqual([
      {
        _tag: 'PlantLifeChanged',
        plantId: 'plant-1',
        owner: { _tag: 'User', userId: 'user-1' },
        life: 'Buried',
        by: 'user-1',
      },
    ])
    expect(Array.flatMap(care.events, staleAfterCare)).toEqual([
      Dirty.Plants({ plantIds: ['plant-1'] }),
    ])
  })

  it('publishes a PlantLifecycleChanged event', async () => {
    const plant = createTestPlant({ id: 'plant-1', userId: 'user-1' })
    const { care, layer } = world(plant)

    await Effect.runPromise(
      bury(asPlantWithRoom(plant), { cause: 'heat' }).pipe(
        Effect.provide(layer)
      )
    )

    expect(await toldToTheApp(care.events)).toEqual([
      { _tag: 'PlantLifecycleChanged', userId: 'user-1', plantId: 'plant-1' },
    ])
  })

  it('names the acting member in the event for a Canopy plant', async () => {
    const plant = createTestPlant({
      id: 'canopy-plant',
      userId: null,
      canopyId: mockCanopyId,
      createdByUserId: 'user-1',
    })
    const { care, layer } = world(plant)

    await Effect.runPromise(
      bury(asCanopyPlantWithRoom(plant), { cause: 'heat' }, 'user-2').pipe(
        Effect.provide(layer)
      )
    )

    expect(await toldToTheApp(care.events)).toEqual([
      {
        _tag: 'PlantLifecycleChanged',
        userId: 'user-2',
        plantId: 'canopy-plant',
      },
    ])
  })

  it('answers PlantAlreadyDeadError to a second bury and keeps the first death', async () => {
    const buried = createTestPlant({
      id: 'plant-1',
      userId: 'user-1',
      diedAt: new Date('2026-01-01'),
      deathCause: 'underwatering',
      deathNote: 'first',
    })
    const seenAlive = {
      ...buried,
      diedAt: null,
      deathCause: null,
      deathNote: null,
    }
    const { care, layer } = world(buried)

    const exit = await Effect.runPromiseExit(
      Effect.gen(function* () {
        const failure = yield* Effect.flip(
          bury(asPlantWithRoom(seenAlive), { cause: 'pests', note: 'second' })
        )
        const after = yield* Effect.flatMap(PlantRepository, (repo) =>
          repo.findById('plant-1')
        )
        return { failure, after }
      }).pipe(Effect.provide(layer))
    )

    if (!Exit.isSuccess(exit)) throw new Error('test setup failed')
    expect(exit.value.failure).toEqual(new PlantAlreadyDeadError())
    expect(exit.value.after).toMatchObject({
      deathCause: 'underwatering',
      deathNote: 'first',
    })
    expect(care.events).toEqual([])
  })

  it('answers not found, with the id as the caller sent it, once the plant has left the owner the caller saw', async () => {
    const seen = createTestPlant({ id: 'plant-1', userId: 'user-1' })
    const shared = { ...seen, userId: null, canopyId: mockCanopyId }
    const { care, layer } = world(shared)

    const exit = await Effect.runPromiseExit(
      Effect.gen(function* () {
        const failure = yield* Effect.flip(
          bury(asPlantWithRoom(seen), { cause: 'pests' }, 'user-1', 'PLANT-1')
        )
        const after = yield* Effect.flatMap(PlantRepository, (repo) =>
          repo.findById('plant-1')
        )
        return { failure, after }
      }).pipe(Effect.provide(layer))
    )

    if (!Exit.isSuccess(exit)) throw new Error('test setup failed')
    expect(exit.value.failure).toEqual(
      new PlantNotFoundError({ plantId: 'PLANT-1' })
    )
    expect(exit.value.after?.diedAt).toBeNull()
    expect(care.events).toEqual([])
  })
})
