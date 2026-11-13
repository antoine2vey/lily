import { mockCanopyId } from '@lily/api/__tests__/fixtures/canopies'
import { createTestPlant, noCare } from '@lily/api/__tests__/fixtures/plants'
import { createMockEventBus } from '@lily/api/__tests__/mocks/event-bus'
import {
  createMockOutbox,
  MockOutboxLive,
} from '@lily/api/__tests__/mocks/outbox'
import { createMockPlantRepository } from '@lily/api/__tests__/mocks/plant.repository'
import { createMockCurrentUser } from '@lily/api/__tests__/mocks/session'
import { MockSqlClientLive } from '@lily/api/__tests__/mocks/sql-client'
import { Dirty } from '@lily/api/contexts/reminders'
import {
  withCanopyOwner,
  withUserOwner,
} from '@lily/api/repositories/helpers/plant-owner'
import { PlantRepository } from '@lily/api/repositories/plant.repository'
import { markPlantDead } from '@lily/api/services/plants/endpoints/mark-plant-dead'
import { PlantAlreadyDeadError } from '@lily/shared/errors/plant'
import type { AppEvent } from '@lily/shared/server'
import { Cause, Effect, Exit, Layer, Option } from 'effect'
import { describe, expect, it } from 'vitest'

const asPlantWithRoom = (plant: ReturnType<typeof createTestPlant>) => ({
  ...withUserOwner(plant),
  room: null,
  ownership: 'owned' as const,
  ownerName: null,
  ...noCare,
})

describe('markPlantDead', () => {
  it('sets diedAt, cause and note on a living plant', async () => {
    const plant = createTestPlant({ id: 'plant-1', userId: 'user-1' })
    const result = await Effect.runPromise(
      markPlantDead(asPlantWithRoom(plant), {
        cause: 'overwatering',
        note: 'Too much love',
      }).pipe(
        Effect.provide(
          Layer.mergeAll(
            MockSqlClientLive,
            createMockPlantRepository({ plants: [plant] }),
            MockOutboxLive,
            createMockEventBus(),
            createMockCurrentUser({ id: 'user-1' })
          )
        )
      )
    )

    expect(result.diedAt).not.toBeNull()
    expect(result.deathCause).toBe('overwatering')
    expect(result.deathNote).toBe('Too much love')
  })

  it('stores a null note when none is given', async () => {
    const plant = createTestPlant({ id: 'plant-1', userId: 'user-1' })
    const result = await Effect.runPromise(
      markPlantDead(asPlantWithRoom(plant), { cause: 'unknown' }).pipe(
        Effect.provide(
          Layer.mergeAll(
            MockSqlClientLive,
            createMockPlantRepository({ plants: [plant] }),
            MockOutboxLive,
            createMockEventBus(),
            createMockCurrentUser({ id: 'user-1' })
          )
        )
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
      markPlantDead(asPlantWithRoom(plant), { cause: 'unknown' }).pipe(
        Effect.provide(
          Layer.mergeAll(
            MockSqlClientLive,
            createMockPlantRepository({ plants: [plant] }),
            MockOutboxLive,
            createMockEventBus(),
            createMockCurrentUser({ id: 'user-1' })
          )
        )
      )
    )

    expect(Exit.isFailure(exit)).toBe(true)
    if (Exit.isFailure(exit)) {
      const failure = Cause.findErrorOption(exit.cause)
      expect(Option.isSome(failure)).toBe(true)
      if (Option.isSome(failure)) {
        expect(failure.value._tag).toBe('PlantAlreadyDeadError')
      }
    }
  })

  it('asks Reminders to plan the buried plant again', async () => {
    const plant = createTestPlant({ id: 'plant-1', userId: 'user-1' })
    const outbox = createMockOutbox()

    await Effect.runPromise(
      markPlantDead(asPlantWithRoom(plant), { cause: 'cold' }).pipe(
        Effect.provide(
          Layer.mergeAll(
            MockSqlClientLive,
            createMockPlantRepository({ plants: [plant] }),
            outbox.layer,
            createMockEventBus(),
            createMockCurrentUser({ id: 'user-1' })
          )
        )
      )
    )

    expect(outbox.requested).toEqual([Dirty.Plants({ plantIds: ['plant-1'] })])
  })

  it('publishes a PlantLifecycleChanged event', async () => {
    const plant = createTestPlant({ id: 'plant-1', userId: 'user-1' })
    const published: AppEvent[] = []

    await Effect.runPromise(
      markPlantDead(asPlantWithRoom(plant), { cause: 'heat' }).pipe(
        Effect.provide(
          Layer.mergeAll(
            MockSqlClientLive,
            createMockPlantRepository({ plants: [plant] }),
            MockOutboxLive,
            createMockEventBus({ publishedEvents: published }),
            createMockCurrentUser({ id: 'user-1' })
          )
        )
      )
    )

    expect(published).toEqual([
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
    const published: AppEvent[] = []

    await Effect.runPromise(
      markPlantDead(
        {
          ...withCanopyOwner(plant),
          room: null,
          ownership: 'canopy',
          ownerName: null,
          canopy: { id: mockCanopyId, name: 'Home' },
          createdBy: null,
          ...noCare,
        },
        { cause: 'heat' }
      ).pipe(
        Effect.provide(
          Layer.mergeAll(
            MockSqlClientLive,
            createMockPlantRepository({ plants: [plant] }),
            MockOutboxLive,
            createMockEventBus({ publishedEvents: published }),
            createMockCurrentUser({ id: 'user-2' })
          )
        )
      )
    )

    expect(published).toEqual([
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
    const repoLayer = createMockPlantRepository({ plants: [buried] })
    const outbox = createMockOutbox()

    const exit = await Effect.runPromiseExit(
      Effect.gen(function* () {
        const failure = yield* Effect.flip(
          markPlantDead(asPlantWithRoom(seenAlive), {
            cause: 'pests',
            note: 'second',
          })
        )
        const after = yield* Effect.flatMap(PlantRepository, (repo) =>
          repo.findById('plant-1')
        )
        return { failure, after }
      }).pipe(
        Effect.provide(
          Layer.mergeAll(
            MockSqlClientLive,
            repoLayer,
            outbox.layer,
            createMockEventBus(),
            createMockCurrentUser({ id: 'user-1' })
          )
        )
      )
    )

    if (!Exit.isSuccess(exit)) throw new Error('test setup failed')
    expect(exit.value.failure).toEqual(new PlantAlreadyDeadError())
    expect(exit.value.after).toMatchObject({
      deathCause: 'underwatering',
      deathNote: 'first',
    })
    expect(outbox.requested).toEqual([])
  })
})
