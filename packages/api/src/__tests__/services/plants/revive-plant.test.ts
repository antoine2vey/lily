import { createTestMembership } from '@lily/api/__tests__/fixtures/canopies'
import { createTestPlant, noCare } from '@lily/api/__tests__/fixtures/plants'
import {
  createCanopyStore,
  createMockCanopyRepository,
  createTestCanopyRow,
} from '@lily/api/__tests__/mocks/canopy.repository'
import { createMockEventBus } from '@lily/api/__tests__/mocks/event-bus'
import { createMockLimitChecker } from '@lily/api/__tests__/mocks/limit-checker'
import { createMockOutbox } from '@lily/api/__tests__/mocks/outbox'
import { createMockPlantRepository } from '@lily/api/__tests__/mocks/plant.repository'
import { createMockCurrentUser } from '@lily/api/__tests__/mocks/session'
import { MockSqlClientLive } from '@lily/api/__tests__/mocks/sql-client'
import { Dirty } from '@lily/api/contexts/reminders'
import {
  withCanopyOwner,
  withUserOwner,
} from '@lily/api/repositories/helpers/plant-owner'
import { revivePlant } from '@lily/api/services/plants/endpoints/revive-plant'
import type { CanopyId, PlantOwner } from '@lily/shared'
import type { AppEvent } from '@lily/shared/server'
import { Cause, Effect, Exit, Layer, Option } from 'effect'
import { describe, expect, it } from 'vitest'

const deadPlant = () =>
  createTestPlant({
    id: 'plant-1',
    userId: 'user-1',
    diedAt: new Date('2026-01-01'),
    deathCause: 'underwatering',
    deathNote: 'Forgot it on holiday',
  })

const asPlantWithRoom = (plant: ReturnType<typeof createTestPlant>) => ({
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

const asCanopyPlantWithRoom = (plant: ReturnType<typeof createTestPlant>) => ({
  ...withCanopyOwner(plant),
  room: null,
  ownership: 'canopy' as const,
  ownerName: null,
  canopy: { id: 'canopy-1' as CanopyId, name: 'Home' },
  createdBy: null,
  ...noCare,
})

const makeLayer = (options: {
  plant: ReturnType<typeof createTestPlant>
  requested?: Dirty[]
  plantLimitReached?: boolean | ((owner: PlantOwner) => boolean)
  checkedOwners?: PlantOwner[]
  publishedEvents?: AppEvent[]
}) =>
  Layer.mergeAll(
    createMockPlantRepository({ plants: [options.plant] }),
    createMockOutbox(options.requested).layer,
    createMockCurrentUser({ id: 'user-1' }),
    createMockLimitChecker({
      plantLimitReached: options.plantLimitReached ?? false,
      checkedOwners: options.checkedOwners,
    }),
    createMockEventBus({ publishedEvents: options.publishedEvents ?? [] }),
    createMockCanopyRepository(
      createCanopyStore({
        canopies: [createTestCanopyRow()],
        members: [createTestMembership({ userId: 'user-1' })],
      })
    ),
    MockSqlClientLive
  )

const failureTag = (exit: Exit.Exit<unknown, { _tag: string }>) =>
  Exit.isFailure(exit)
    ? Option.map(Cause.findErrorOption(exit.cause), (e) => e._tag)
    : Option.none()

describe('revivePlant', () => {
  it("checks a Canopy revive against the Canopy's limit, not the member's", async () => {
    const plant = deadCanopyPlant()
    const checkedOwners: PlantOwner[] = []
    const result = await Effect.runPromise(
      revivePlant(asCanopyPlantWithRoom(plant)).pipe(
        Effect.provide(
          makeLayer({
            plant,
            plantLimitReached: (owner) => owner._tag === 'User',
            checkedOwners,
          })
        )
      )
    )

    expect(result.diedAt).toBeNull()
    expect(checkedOwners).toEqual([{ _tag: 'Canopy', canopyId: 'canopy-1' }])
  })

  it('keeps a Canopy plant buried when the Canopy is at its cap', async () => {
    const plant = deadCanopyPlant()
    const exit = await Effect.runPromiseExit(
      revivePlant(asCanopyPlantWithRoom(plant)).pipe(
        Effect.provide(makeLayer({ plant, plantLimitReached: true }))
      )
    )

    expect(failureTag(exit)).toEqual(Option.some('LimitExceededError'))
  })

  it('clears the death columns', async () => {
    const plant = deadPlant()
    const result = await Effect.runPromise(
      revivePlant(asPlantWithRoom(plant)).pipe(
        Effect.provide(makeLayer({ plant }))
      )
    )

    expect(result.diedAt).toBeNull()
    expect(result.deathCause).toBeNull()
    expect(result.deathNote).toBeNull()
  })

  it('fails with PlantNotDeadError on a living plant', async () => {
    const plant = createTestPlant({ id: 'plant-1', userId: 'user-1' })
    const exit = await Effect.runPromiseExit(
      revivePlant(asPlantWithRoom(plant)).pipe(
        Effect.provide(makeLayer({ plant }))
      )
    )

    expect(failureTag(exit)).toEqual(Option.some('PlantNotDeadError'))
  })

  it('enforces the plant limit like create does', async () => {
    const plant = deadPlant()
    const requested: Dirty[] = []
    const exit = await Effect.runPromiseExit(
      revivePlant(asPlantWithRoom(plant)).pipe(
        Effect.provide(makeLayer({ plant, plantLimitReached: true, requested }))
      )
    )

    expect(failureTag(exit)).toEqual(Option.some('LimitExceededError'))
    // The plant stays in the cemetery when the paywall blocks the revive
    expect(plant.diedAt).not.toBeNull()
    expect(requested).toEqual([])
  })

  it('asks Reminders to plan the revived plant again', async () => {
    const plant = deadPlant()
    const requested: Dirty[] = []

    await Effect.runPromise(
      revivePlant(asPlantWithRoom(plant)).pipe(
        Effect.provide(makeLayer({ plant, requested }))
      )
    )

    expect(requested).toEqual([Dirty.Plants({ plantIds: ['plant-1'] })])
  })

  it('publishes a PlantLifecycleChanged event', async () => {
    const plant = deadPlant()
    const publishedEvents: AppEvent[] = []

    await Effect.runPromise(
      revivePlant(asPlantWithRoom(plant)).pipe(
        Effect.provide(makeLayer({ plant, publishedEvents }))
      )
    )

    expect(publishedEvents).toEqual([
      { _tag: 'PlantLifecycleChanged', userId: 'user-1', plantId: 'plant-1' },
    ])
  })

  it('answers PlantNotDeadError, not the limit, to a second revive', async () => {
    const alive = createTestPlant({ id: 'plant-1', userId: 'user-1' })
    const exit = await Effect.runPromiseExit(
      revivePlant(asPlantWithRoom(deadPlant())).pipe(
        Effect.provide(makeLayer({ plant: alive, plantLimitReached: true }))
      )
    )

    expect(failureTag(exit)).toEqual(Option.some('PlantNotDeadError'))
  })
})
