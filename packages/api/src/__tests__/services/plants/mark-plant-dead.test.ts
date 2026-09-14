import { createTestNotification } from '@lily/api/__tests__/fixtures/notifications'
import { createTestPlant } from '@lily/api/__tests__/fixtures/plants'
import { createMockEventBus } from '@lily/api/__tests__/mocks/event-bus'
import { createMockNotificationRepository } from '@lily/api/__tests__/mocks/notification.repository'
import { createMockPlantRepository } from '@lily/api/__tests__/mocks/plant.repository'
import { markPlantDead } from '@lily/api/services/plants/endpoints/mark-plant-dead'
import type { AppEvent } from '@lily/shared/server'
import { Cause, Effect, Exit, Layer, Option } from 'effect'
import { describe, expect, it } from 'vitest'

const asPlantWithRoom = (plant: ReturnType<typeof createTestPlant>) => ({
  ...plant,
  room: null,
  ownership: 'owned' as const,
  ownerName: null,
  schedules: [],
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
            createMockPlantRepository({ plants: [plant] }),
            createMockNotificationRepository([]),
            createMockEventBus()
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
            createMockPlantRepository({ plants: [plant] }),
            createMockNotificationRepository([]),
            createMockEventBus()
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
            createMockPlantRepository({ plants: [plant] }),
            createMockNotificationRepository([]),
            createMockEventBus()
          )
        )
      )
    )

    expect(Exit.isFailure(exit)).toBe(true)
    if (Exit.isFailure(exit)) {
      const failure = Cause.failureOption(exit.cause)
      expect(Option.isSome(failure)).toBe(true)
      if (Option.isSome(failure)) {
        expect(failure.value._tag).toBe('PlantAlreadyDeadError')
      }
    }
  })

  it('deletes the pending reminders of the buried plant only', async () => {
    const plant = createTestPlant({ id: 'plant-1', userId: 'user-1' })
    const notifications = [
      createTestNotification({
        id: 'n-dead-pending',
        plantId: 'plant-1',
        status: 'pending',
      }),
      createTestNotification({
        id: 'n-dead-sent',
        plantId: 'plant-1',
        status: 'sent',
      }),
      createTestNotification({
        id: 'n-other-pending',
        plantId: 'plant-2',
        status: 'pending',
      }),
    ]

    await Effect.runPromise(
      markPlantDead(asPlantWithRoom(plant), { cause: 'cold' }).pipe(
        Effect.provide(
          Layer.mergeAll(
            createMockPlantRepository({ plants: [plant] }),
            createMockNotificationRepository(notifications),
            createMockEventBus()
          )
        )
      )
    )

    const remaining = notifications.map((n) => n.id)
    expect(remaining).not.toContain('n-dead-pending')
    expect(remaining).toContain('n-dead-sent')
    expect(remaining).toContain('n-other-pending')
  })

  it('publishes a PlantLifecycleChanged event', async () => {
    const plant = createTestPlant({ id: 'plant-1', userId: 'user-1' })
    const published: AppEvent[] = []

    await Effect.runPromise(
      markPlantDead(asPlantWithRoom(plant), { cause: 'heat' }).pipe(
        Effect.provide(
          Layer.mergeAll(
            createMockPlantRepository({ plants: [plant] }),
            createMockNotificationRepository([]),
            createMockEventBus({ publishedEvents: published })
          )
        )
      )
    )

    expect(published).toEqual([
      { _tag: 'PlantLifecycleChanged', userId: 'user-1', plantId: 'plant-1' },
    ])
  })
})
