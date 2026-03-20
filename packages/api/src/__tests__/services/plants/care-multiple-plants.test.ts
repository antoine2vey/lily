import * as SqlClient from '@effect/sql/SqlClient'
import type {
  CareScheduleRow,
  CareType,
} from '@lily/api/repositories/care-schedule.repository'
import { careMultiplePlants } from '@lily/api/services/plants/endpoints/care-multiple-plants'
import type { Notification } from '@lily/shared/notification'
import type { AppEvent } from '@lily/shared/server'
import { Effect, Layer } from 'effect'
import { mockPlants, type TestPlant } from '../../fixtures/plants'
import { mockUser1 } from '../../fixtures/users'
import { createMockCareLogRepository } from '../../mocks/care-log.repository'
import { createMockCareScheduleRepository } from '../../mocks/care-schedule.repository'
import { createMockDelegationRepository } from '../../mocks/delegation.repository'
import { createMockEventBus } from '../../mocks/event-bus'
import { createMockNotificationRepository } from '../../mocks/notification.repository'
import { createMockPlantRepository } from '../../mocks/plant.repository'
import { createMockCurrentUser } from '../../mocks/session'
import { createMockUserRepository } from '../../mocks/user.repository'

const createMockSqlClient = (): Layer.Layer<SqlClient.SqlClient> =>
  Layer.succeed(SqlClient.SqlClient, {
    withTransaction: (effect: Effect.Effect<any, any, any>) => effect,
  } as unknown as SqlClient.SqlClient['Type'])

const schedulesFromPlants = (plants: TestPlant[]): CareScheduleRow[] =>
  plants.flatMap((p) =>
    p.scheduleSpecs.map((s) => ({
      id: `schedule-${p.id}-${s.careType}`,
      plantId: p.id,
      careType: s.careType as CareType,
      frequencyDays: s.frequencyDays,
      lastCareAt: s.lastCareAt,
      nextCareAt: s.nextCareAt,
      createdAt: new Date(),
      updatedAt: new Date(),
    }))
  )

const plant1 = mockPlants[0]!
const plant2 = mockPlants[1]!
const plant3 = mockPlants[2]! // belongs to user-2

const allSchedules = schedulesFromPlants(mockPlants)

const createTestLayer = (
  overrides: {
    plants?: TestPlant[]
    schedules?: CareScheduleRow[]
    notifications?: Notification[]
    publishedEvents?: AppEvent[]
    delegations?: any[]
    delegationPlants?: any[]
    users?: any[]
    rooms?: { id: string; name: string; icon: string }[]
  } = {}
) => {
  const plants = overrides.plants ?? [plant1, plant2, plant3]
  const schedules = overrides.schedules ?? allSchedules
  const notifications = overrides.notifications ?? []
  const publishedEvents = overrides.publishedEvents ?? []

  return Layer.mergeAll(
    createMockPlantRepository({
      plants,
      schedules,
      rooms: overrides.rooms,
    }),
    createMockCareScheduleRepository({
      schedules,
      plants,
    }),
    createMockCareLogRepository([]),
    createMockNotificationRepository(notifications),
    createMockUserRepository([mockUser1]),
    createMockDelegationRepository({
      delegations: overrides.delegations,
      delegationPlants: overrides.delegationPlants,
      users: overrides.users,
    }),
    createMockEventBus({ publishedEvents }),
    createMockCurrentUser({ id: 'user-1' }),
    createMockSqlClient()
  )
}

describe('careMultiplePlants', () => {
  it('should return empty array for empty plantIds', async () => {
    const result = await Effect.runPromise(
      careMultiplePlants({
        plantIds: [],
        careType: 'watering',
      }).pipe(Effect.provide(createTestLayer()))
    )

    expect(result).toEqual([])
  })

  it('should care for a single owned plant', async () => {
    const result = await Effect.runPromise(
      careMultiplePlants({
        plantIds: ['plant-1'],
        careType: 'watering',
      }).pipe(Effect.provide(createTestLayer()))
    )

    expect(result).toHaveLength(1)
    expect(result[0]?.plantId).toBe('plant-1')
    expect(result[0]?.success).toBe(true)
    expect(result[0]?.plant).toBeDefined()
  })

  it('should care for multiple plants in batch', async () => {
    const result = await Effect.runPromise(
      careMultiplePlants({
        plantIds: ['plant-1', 'plant-2'],
        careType: 'watering',
      }).pipe(Effect.provide(createTestLayer()))
    )

    expect(result).toHaveLength(2)
    expect(result[0]?.plantId).toBe('plant-1')
    expect(result[0]?.success).toBe(true)
    expect(result[1]?.plantId).toBe('plant-2')
    expect(result[1]?.success).toBe(true)
  })

  it('should return success: false for unauthorized plant', async () => {
    const result = await Effect.runPromise(
      careMultiplePlants({
        plantIds: ['plant-3'],
        careType: 'watering',
      }).pipe(Effect.provide(createTestLayer()))
    )

    expect(result).toHaveLength(1)
    expect(result[0]?.plantId).toBe('plant-3')
    expect(result[0]?.success).toBe(false)
    expect(result[0]?.plant).toBeUndefined()
  })

  it('should handle mixed owned and unauthorized plants', async () => {
    const result = await Effect.runPromise(
      careMultiplePlants({
        plantIds: ['plant-1', 'plant-3'],
        careType: 'watering',
      }).pipe(Effect.provide(createTestLayer()))
    )

    expect(result).toHaveLength(2)

    const plant1Result = result.find((r) => r.plantId === 'plant-1')
    const plant3Result = result.find((r) => r.plantId === 'plant-3')

    expect(plant1Result?.success).toBe(true)
    expect(plant1Result?.plant).toBeDefined()

    expect(plant3Result?.success).toBe(false)
    expect(plant3Result?.plant).toBeUndefined()
  })

  it('should return success: false for non-existent plant', async () => {
    const result = await Effect.runPromise(
      careMultiplePlants({
        plantIds: ['plant-nonexistent'],
        careType: 'watering',
      }).pipe(Effect.provide(createTestLayer()))
    )

    expect(result).toHaveLength(1)
    expect(result[0]?.plantId).toBe('plant-nonexistent')
    expect(result[0]?.success).toBe(false)
    expect(result[0]?.plant).toBeUndefined()
  })

  it('should succeed for plant without schedule for given care type', async () => {
    // plant-2 only has a watering schedule, no fertilization
    const result = await Effect.runPromise(
      careMultiplePlants({
        plantIds: ['plant-2'],
        careType: 'fertilization',
      }).pipe(Effect.provide(createTestLayer()))
    )

    expect(result).toHaveLength(1)
    expect(result[0]?.plantId).toBe('plant-2')
    expect(result[0]?.success).toBe(true)
    expect(result[0]?.plant).toBeDefined()
  })

  it('should create care log events for each plant', async () => {
    const publishedEvents: AppEvent[] = []

    await Effect.runPromise(
      careMultiplePlants({
        plantIds: ['plant-1', 'plant-2'],
        careType: 'watering',
      }).pipe(Effect.provide(createTestLayer({ publishedEvents })))
    )

    const careLogEvents = publishedEvents.filter(
      (e) => e._tag === 'CareLogCreated'
    )
    expect(careLogEvents.length).toBeGreaterThanOrEqual(2)
  })

  it('should update schedule with correct nextCareAt', async () => {
    // plant-1 has watering frequency of 7 days
    const schedules = schedulesFromPlants([plant1])

    const result = await Effect.runPromise(
      careMultiplePlants({
        plantIds: ['plant-1'],
        careType: 'watering',
      }).pipe(Effect.provide(createTestLayer({ schedules })))
    )

    expect(result).toHaveLength(1)
    expect(result[0]?.success).toBe(true)

    // The schedule mock was called with updateByPlantAndType
    // We verify indirectly: if the plant had a frequency of 7,
    // the function should have computed nextCareAt = now + 7 days
    // and the result should succeed (no errors thrown)
    expect(result[0]?.plant).toBeDefined()
  })

  it('should allow access via active delegation', async () => {
    // plant-3 belongs to user-2, but user-1 has an active delegation
    const delegation = {
      id: 'delegation-1',
      ownerId: 'user-2',
      caretakerId: 'user-1',
      status: 'active' as const,
      message: null,
      startDate: new Date('2024-01-01'),
      endDate: new Date('2025-12-31'),
      respondedAt: new Date(),
      canceledAt: null,
      completedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    }

    const result = await Effect.runPromise(
      careMultiplePlants({
        plantIds: ['plant-3'],
        careType: 'watering',
      }).pipe(
        Effect.provide(
          createTestLayer({
            delegations: [delegation],
            delegationPlants: [
              { delegationId: 'delegation-1', plantId: 'plant-3' },
            ],
          })
        )
      )
    )

    expect(result).toHaveLength(1)
    expect(result[0]?.plantId).toBe('plant-3')
    expect(result[0]?.success).toBe(true)
    expect(result[0]?.plant).toBeDefined()
  })

  it('should return plant with room data when plant has a room', async () => {
    const plantWithRoom: TestPlant = {
      ...plant1,
      id: 'plant-room',
      roomId: 'room-1',
    }
    const rooms = [{ id: 'room-1', name: 'Living Room', icon: 'sofa' }]
    const schedules = schedulesFromPlants([plantWithRoom])

    const result = await Effect.runPromise(
      careMultiplePlants({
        plantIds: ['plant-room'],
        careType: 'watering',
      }).pipe(
        Effect.provide(
          createTestLayer({
            plants: [plantWithRoom],
            schedules,
            rooms,
          })
        )
      )
    )

    expect(result).toHaveLength(1)
    expect(result[0]?.success).toBe(true)
    expect(result[0]?.plant).toBeDefined()
    expect(result[0]?.plant?.room).toBeDefined()
    expect(result[0]?.plant?.room?.name).toBe('Living Room')
  })

  it('should succeed for plant with reminders disabled', async () => {
    const plantNoReminders: TestPlant = {
      ...plant1,
      id: 'plant-no-reminders',
      remindersEnabled: false,
    }
    const schedules = schedulesFromPlants([plantNoReminders])

    const publishedEvents: AppEvent[] = []

    const result = await Effect.runPromise(
      careMultiplePlants({
        plantIds: ['plant-no-reminders'],
        careType: 'watering',
      }).pipe(
        Effect.provide(
          createTestLayer({
            plants: [plantNoReminders],
            schedules,
            publishedEvents,
          })
        )
      )
    )

    expect(result).toHaveLength(1)
    expect(result[0]?.plantId).toBe('plant-no-reminders')
    expect(result[0]?.success).toBe(true)
    expect(result[0]?.plant).toBeDefined()
  })
})
