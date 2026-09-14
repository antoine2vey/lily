import { createTestSchedule } from '@lily/api/__tests__/fixtures/care-schedules'
import { createTestPlant } from '@lily/api/__tests__/fixtures/plants'
import { createTestUser } from '@lily/api/__tests__/fixtures/users'
import { createMockCareScheduleRepository } from '@lily/api/__tests__/mocks/care-schedule.repository'
import { createMockDelegationRepository } from '@lily/api/__tests__/mocks/delegation.repository'
import { createMockEventBus } from '@lily/api/__tests__/mocks/event-bus'
import { createMockLimitChecker } from '@lily/api/__tests__/mocks/limit-checker'
import { createMockNotificationRepository } from '@lily/api/__tests__/mocks/notification.repository'
import { createMockPlantRepository } from '@lily/api/__tests__/mocks/plant.repository'
import { createMockUserRepository } from '@lily/api/__tests__/mocks/user.repository'
import { revivePlant } from '@lily/api/services/plants/endpoints/revive-plant'
import type { Notification } from '@lily/shared/notification'
import type { AppEvent } from '@lily/shared/server'
import { Cause, Effect, Exit, Layer, Option } from 'effect'
import { describe, expect, it } from 'vitest'

const DAY_MS = 24 * 60 * 60 * 1000

const deadPlant = () =>
  createTestPlant({
    id: 'plant-1',
    userId: 'user-1',
    diedAt: new Date('2026-01-01'),
    deathCause: 'underwatering',
    deathNote: 'Forgot it on holiday',
  })

const asPlantWithRoom = (plant: ReturnType<typeof createTestPlant>) => ({
  ...plant,
  room: null,
  ownership: 'owned' as const,
  ownerName: null,
  schedules: [],
})

const makeLayer = (options: {
  plant: ReturnType<typeof createTestPlant>
  schedules?: ReturnType<typeof createTestSchedule>[]
  notifications?: Notification[]
  plantLimitReached?: boolean
  publishedEvents?: AppEvent[]
}) =>
  Layer.mergeAll(
    createMockPlantRepository({ plants: [options.plant] }),
    createMockCareScheduleRepository({
      plants: [options.plant],
      schedules: options.schedules ?? [],
    }),
    createMockNotificationRepository(options.notifications ?? []),
    createMockUserRepository([
      createTestUser({ id: 'user-1', timezone: 'UTC', careReminders: true }),
    ]),
    createMockDelegationRepository({}),
    createMockLimitChecker({
      plantLimitReached: options.plantLimitReached ?? false,
    }),
    createMockEventBus({ publishedEvents: options.publishedEvents ?? [] })
  )

const failureTag = (exit: Exit.Exit<unknown, { _tag: string }>) =>
  Exit.isFailure(exit)
    ? Option.map(Cause.failureOption(exit.cause), (e) => e._tag)
    : Option.none()

describe('revivePlant', () => {
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
    const exit = await Effect.runPromiseExit(
      revivePlant(asPlantWithRoom(plant)).pipe(
        Effect.provide(makeLayer({ plant, plantLimitReached: true }))
      )
    )

    expect(failureTag(exit)).toEqual(Option.some('LimitExceededError'))
    // The plant stays in the cemetery when the paywall blocks the revive
    expect(plant.diedAt).not.toBeNull()
  })

  it('re-schedules reminders only for future due dates', async () => {
    const plant = deadPlant()
    const notifications: Notification[] = []
    const schedules = [
      createTestSchedule({
        plantId: 'plant-1',
        careType: 'watering',
        nextCareAt: new Date(Date.now() + 3 * DAY_MS),
      }),
      createTestSchedule({
        plantId: 'plant-1',
        careType: 'fertilization',
        nextCareAt: new Date(Date.now() - 3 * DAY_MS),
      }),
    ]

    await Effect.runPromise(
      revivePlant(asPlantWithRoom(plant)).pipe(
        Effect.provide(makeLayer({ plant, schedules, notifications }))
      )
    )

    const types = notifications.map((n) => n.type)
    expect(types).toContain('watering_reminder')
    expect(types).not.toContain('fertilization_reminder')
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
})
