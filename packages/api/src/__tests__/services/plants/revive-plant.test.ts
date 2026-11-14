import {
  createTestMembership,
  mockCanopyId,
} from '@lily/api/__tests__/fixtures/canopies'
import {
  createTestCareLine,
  createTestCarePlant,
} from '@lily/api/__tests__/fixtures/care-plants'
import { failureOf } from '@lily/api/__tests__/fixtures/exit'
import { createTestPlant, noCare } from '@lily/api/__tests__/fixtures/plants'
import { createInMemoryCanopy } from '@lily/api/__tests__/mocks/canopy'
import {
  createCanopyStore,
  createMockCanopyRepository,
  createTestCanopyRow,
} from '@lily/api/__tests__/mocks/canopy.repository'
import {
  createInMemoryCare,
  permitTo,
  toldToTheApp,
} from '@lily/api/__tests__/mocks/care'
import { createMockLimitChecker } from '@lily/api/__tests__/mocks/limit-checker'
import { createMockPlantRepository } from '@lily/api/__tests__/mocks/plant.repository'
import { createMockCurrentUser } from '@lily/api/__tests__/mocks/session'
import { LifeState } from '@lily/api/contexts/care/domain/care-plant'
import { Dirty } from '@lily/api/contexts/reminders'
import { staleAfterCare } from '@lily/api/contexts/reminders/triggers'
import {
  withCanopyOwner,
  withUserOwner,
} from '@lily/api/repositories/helpers/plant-owner'
import type { PlantWithRoom } from '@lily/api/repositories/plant.repository'
import { revivePlant } from '@lily/api/services/plants/endpoints/revive-plant'
import type { CanopyId, PlantOwner } from '@lily/shared'
import { PlantNotFoundError } from '@lily/shared/errors/plant'
import { Array, Cause, Effect, Exit, Layer, Option } from 'effect'
import { describe, expect, it } from 'vitest'

type Row = ReturnType<typeof createTestPlant>

const deadPlant = () =>
  createTestPlant({
    id: 'plant-1',
    userId: 'user-1',
    diedAt: new Date('2026-01-01'),
    deathCause: 'underwatering',
    deathNote: 'Forgot it on holiday',
  })

const asPlantWithRoom = (plant: Row): PlantWithRoom => ({
  ...withUserOwner(plant),
  room: null,
  ownership: 'owned' as const,
  ownerName: null,
  ...noCare,
})

const deadCanopyPlant = () =>
  createTestPlant({
    id: 'canopy-plant',
    userId: null,
    canopyId: 'canopy-1',
    createdByUserId: 'user-2',
    diedAt: new Date('2026-01-01'),
    deathCause: 'underwatering',
    deathNote: null,
  })

const asCanopyPlantWithRoom = (plant: Row): PlantWithRoom => ({
  ...withCanopyOwner(plant),
  room: null,
  ownership: 'canopy' as const,
  ownerName: null,
  canopy: { id: 'canopy-1' as CanopyId, name: 'Home' },
  createdBy: null,
  ...noCare,
})

const world = (options: {
  plant: Row
  care?: Parameters<typeof createInMemoryCare>[0]
  plantLimitReached?: boolean | ((owner: PlantOwner) => boolean)
  checkedOwners?: PlantOwner[]
}) => {
  const home = createCanopyStore({
    canopies: [createTestCanopyRow()],
    members: [createTestMembership({ userId: 'user-1' })],
  })
  const rows = [{ ...options.plant }]
  const care = createInMemoryCare(options.care ?? [], { plantRows: rows })
  return {
    care,
    rows,
    layer: Layer.mergeAll(
      createMockPlantRepository({ plants: rows, sharesPlantsArray: true }),
      createMockCurrentUser({ id: 'user-1' }),
      createMockLimitChecker({
        plantLimitReached: options.plantLimitReached ?? false,
        checkedOwners: options.checkedOwners,
      }),
      createMockCanopyRepository(home),
      createInMemoryCanopy(home).layer,
      care.layer
    ),
  }
}

const revived = (seen: PlantWithRoom, requestedId?: string) =>
  revivePlant(seen, permitTo('revive', seen.id), requestedId)

const failureTag = (exit: Exit.Exit<unknown, { _tag: string }>) =>
  Exit.isFailure(exit)
    ? Option.map(Cause.findErrorOption(exit.cause), (e) => e._tag)
    : Option.none()

describe('revivePlant', () => {
  it("checks a Canopy revive against the Canopy's limit, not the member's", async () => {
    const plant = deadCanopyPlant()
    const checkedOwners: PlantOwner[] = []
    const result = await Effect.runPromise(
      revived(asCanopyPlantWithRoom(plant)).pipe(
        Effect.provide(
          world({
            plant,
            plantLimitReached: (owner) => owner._tag === 'User',
            checkedOwners,
          }).layer
        )
      )
    )

    expect(result.diedAt).toBeNull()
    expect(checkedOwners).toEqual([{ _tag: 'Canopy', canopyId: 'canopy-1' }])
  })

  it('keeps a Canopy plant buried when the Canopy is at its cap', async () => {
    const plant = deadCanopyPlant()
    const exit = await Effect.runPromiseExit(
      revived(asCanopyPlantWithRoom(plant)).pipe(
        Effect.provide(world({ plant, plantLimitReached: true }).layer)
      )
    )

    expect(failureTag(exit)).toEqual(Option.some('LimitExceededError'))
  })

  it('clears the death columns', async () => {
    const plant = deadPlant()
    const result = await Effect.runPromise(
      revived(asPlantWithRoom(plant)).pipe(
        Effect.provide(world({ plant }).layer)
      )
    )

    expect(result.diedAt).toBeNull()
    expect(result.deathCause).toBeNull()
    expect(result.deathNote).toBeNull()
  })

  it('restarts every due day at today plus its frequency', async () => {
    const plant = deadPlant()
    const { care, layer } = world({
      plant,
      care: [
        createTestCarePlant('plant-1', {
          life: LifeState.Dead(),
          lines: [
            createTestCareLine('watering', { dueDay: '2026-01-03' }),
            createTestCareLine('misting', { dueDay: '2027-03-01' }),
          ],
        }),
      ],
    })

    await Effect.runPromise(
      revived(asPlantWithRoom(plant)).pipe(Effect.provide(layer))
    )

    expect(
      Array.map(
        [...(care.plants.get('plant-1')?.lines.values() ?? [])],
        (line) => [
          line.careType,
          Option.getOrNull(
            Option.map(line.schedule, (schedule) => schedule.dueDay)
          ),
        ]
      )
    ).toEqual([
      ['watering', '2026-11-19'],
      ['misting', '2026-11-19'],
    ])
  })

  it('fails with PlantNotDeadError on a living plant', async () => {
    const plant = createTestPlant({ id: 'plant-1', userId: 'user-1' })
    const exit = await Effect.runPromiseExit(
      revived(asPlantWithRoom(plant)).pipe(
        Effect.provide(world({ plant }).layer)
      )
    )

    expect(failureTag(exit)).toEqual(Option.some('PlantNotDeadError'))
  })

  it('enforces the plant limit like create does', async () => {
    const plant = deadPlant()
    const { care, rows, layer } = world({ plant, plantLimitReached: true })
    const exit = await Effect.runPromiseExit(
      revived(asPlantWithRoom(plant)).pipe(Effect.provide(layer))
    )

    expect(failureTag(exit)).toEqual(Option.some('LimitExceededError'))
    expect(rows[0]?.diedAt).not.toBeNull()
    expect(care.events).toEqual([])
  })

  it('makes Reminders plan the revived plant again', async () => {
    const plant = deadPlant()
    const { care, layer } = world({ plant })

    await Effect.runPromise(
      revived(asPlantWithRoom(plant)).pipe(Effect.provide(layer))
    )

    expect(care.events).toEqual([
      {
        _tag: 'PlantLifeChanged',
        plantId: 'plant-1',
        owner: { _tag: 'User', userId: 'user-1' },
        life: 'Revived',
        by: 'user-1',
      },
    ])
    expect(Array.flatMap(care.events, staleAfterCare)).toEqual([
      Dirty.Plants({ plantIds: ['plant-1'] }),
    ])
  })

  it('publishes a PlantLifecycleChanged event', async () => {
    const plant = deadPlant()
    const { care, layer } = world({ plant })

    await Effect.runPromise(
      revived(asPlantWithRoom(plant)).pipe(Effect.provide(layer))
    )

    expect(await toldToTheApp(care.events)).toEqual([
      { _tag: 'PlantLifecycleChanged', userId: 'user-1', plantId: 'plant-1' },
    ])
  })

  it('answers PlantNotDeadError, not the limit, to a second revive', async () => {
    const alive = createTestPlant({ id: 'plant-1', userId: 'user-1' })
    const exit = await Effect.runPromiseExit(
      revived(asPlantWithRoom(deadPlant())).pipe(
        Effect.provide(world({ plant: alive, plantLimitReached: true }).layer)
      )
    )

    expect(failureTag(exit)).toEqual(Option.some('PlantNotDeadError'))
  })

  it('answers not found, with the id as the caller sent it, once the plant has left the owner the caller saw', async () => {
    const seen = deadPlant()
    const shared = { ...seen, userId: null, canopyId: mockCanopyId }
    const { care, rows, layer } = world({ plant: shared })

    const exit = await Effect.runPromiseExit(
      revived(asPlantWithRoom(seen), 'PLANT-1').pipe(Effect.provide(layer))
    )

    expect(failureOf(exit)).toEqual(
      new PlantNotFoundError({ plantId: 'PLANT-1' })
    )
    expect(rows[0]?.diedAt).not.toBeNull()
    expect(care.events).toEqual([])
  })
})
