import * as SqlClient from '@effect/sql/SqlClient'
import { mockCareLogs } from '@lily/api/__tests__/fixtures/care-logs'
import { schedulesFromPlants } from '@lily/api/__tests__/fixtures/care-schedules'
import {
  createTestPlant,
  mockPlants,
} from '@lily/api/__tests__/fixtures/plants'
import { mockUsers } from '@lily/api/__tests__/fixtures/users'
import { createMockCareLogRepository } from '@lily/api/__tests__/mocks/care-log.repository'
import { createMockCareScheduleRepository } from '@lily/api/__tests__/mocks/care-schedule.repository'
import { createMockDelegationRepository } from '@lily/api/__tests__/mocks/delegation.repository'
import {
  createMockEventBus,
  type MockEventBusData,
} from '@lily/api/__tests__/mocks/event-bus'
import { createMockNotificationRepository } from '@lily/api/__tests__/mocks/notification.repository'
import { createMockPlantRepository } from '@lily/api/__tests__/mocks/plant.repository'
import { createMockCurrentUser } from '@lily/api/__tests__/mocks/session'
import { createMockUserRepository } from '@lily/api/__tests__/mocks/user.repository'
import type { CareScheduleRow } from '@lily/api/repositories/care-schedule.repository'
import { waterMultiplePlants } from '@lily/api/services/plants/endpoints/water-multiple-plants'
import { Array, Effect, Layer, Option, pipe } from 'effect'
import { describe, expect, it } from 'vitest'

const MockSqlClient = Layer.succeed(SqlClient.SqlClient, {
  withTransaction: <R, E, A>(effect: Effect.Effect<A, E, R>) => effect,
} as unknown as SqlClient.SqlClient)

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

describe('waterMultiplePlants', () => {
  const createTestLayer = (
    userId = 'user-1',
    eventBusData?: MockEventBusData
  ) => {
    const schedules = schedulesFromPlants(mockPlants)
    return {
      layer: Layer.mergeAll(
        createMockPlantRepository({ plants: mockPlants }),
        createMockCareLogRepository(mockCareLogs),
        createMockNotificationRepository([]),
        createMockUserRepository(mockUsers),
        MockSqlClient,
        createMockCurrentUser({ id: userId }),
        createMockDelegationRepository(),
        createMockEventBus(eventBusData),
        createMockCareScheduleRepository({ schedules, plants: mockPlants })
      ),
      schedules,
    }
  }

  it('should water multiple plants and return results', async () => {
    const { layer } = createTestLayer()
    const result = await Effect.runPromise(
      waterMultiplePlants({ plantIds: ['plant-1', 'plant-2'] }).pipe(
        Effect.provide(layer)
      )
    )

    expect(result).toHaveLength(2)
    const allSuccessful = pipe(
      result,
      Array.every((r) => r.success)
    )
    expect(allSuccessful).toBe(true)
  })

  it('should update lastWateredAt and nextWateringAt for each plant', async () => {
    const before = new Date()
    const { layer, schedules } = createTestLayer()
    const result = await Effect.runPromise(
      waterMultiplePlants({ plantIds: ['plant-1'] }).pipe(Effect.provide(layer))
    )

    const plant1Result = pipe(
      Array.findFirst(result, (r) => r.plantId === 'plant-1'),
      (opt) => (opt._tag === 'Some' ? opt.value : undefined)
    )

    expect(plant1Result?.success).toBe(true)
    const wateringSched = findSchedule(schedules, 'plant-1', 'watering')
    expect(wateringSched?.lastCareAt).toBeDefined()
    expect(wateringSched?.lastCareAt?.getTime()).toBeGreaterThanOrEqual(
      before.getTime()
    )
    expect(wateringSched?.nextCareAt).toBeDefined()
  })

  it('should return success:false for non-existent plant IDs', async () => {
    const { layer } = createTestLayer()
    const result = await Effect.runPromise(
      waterMultiplePlants({
        plantIds: ['plant-1', 'non-existent'],
      }).pipe(Effect.provide(layer))
    )

    expect(result).toHaveLength(2)

    const existing = pipe(
      Array.findFirst(result, (r) => r.plantId === 'plant-1'),
      (opt) => (opt._tag === 'Some' ? opt.value : undefined)
    )
    const missing = pipe(
      Array.findFirst(result, (r) => r.plantId === 'non-existent'),
      (opt) => (opt._tag === 'Some' ? opt.value : undefined)
    )

    expect(existing?.success).toBe(true)
    expect(missing?.success).toBe(false)
  })

  it('should return empty results for empty plantIds array', async () => {
    const { layer } = createTestLayer()
    const result = await Effect.runPromise(
      waterMultiplePlants({ plantIds: [] }).pipe(Effect.provide(layer))
    )

    expect(result).toHaveLength(0)
  })

  it('should schedule reminders for plants with remindersEnabled', async () => {
    // plant-1 has remindersEnabled = true
    const { layer, schedules } = createTestLayer()
    const result = await Effect.runPromise(
      waterMultiplePlants({ plantIds: ['plant-1'] }).pipe(Effect.provide(layer))
    )

    const plant1Result = pipe(
      Array.findFirst(result, (r) => r.plantId === 'plant-1'),
      (opt) => (opt._tag === 'Some' ? opt.value : undefined)
    )

    expect(plant1Result?.success).toBe(true)
    const wateringSched = findSchedule(schedules, 'plant-1', 'watering')
    expect(wateringSched?.nextCareAt).toBeDefined()
  })

  it('should return success:false for unauthorized plants', async () => {
    // user-3 does not own plant-1 (owned by user-1) and has no delegation
    const { layer } = createTestLayer('user-3')
    const result = await Effect.runPromise(
      waterMultiplePlants({ plantIds: ['plant-1'] }).pipe(Effect.provide(layer))
    )

    expect(result).toHaveLength(1)
    const plant1Result = pipe(
      Array.findFirst(result, (r) => r.plantId === 'plant-1'),
      (opt) => (opt._tag === 'Some' ? opt.value : undefined)
    )
    expect(plant1Result?.success).toBe(false)
  })

  it('should allow active caretaker to water delegated plants', async () => {
    const delegationSchedules = schedulesFromPlants(mockPlants)
    const result = await Effect.runPromise(
      waterMultiplePlants({ plantIds: ['plant-1'] }).pipe(
        Effect.provide(
          Layer.mergeAll(
            createMockPlantRepository({ plants: mockPlants }),
            createMockCareLogRepository(mockCareLogs),
            createMockNotificationRepository([]),
            createMockUserRepository(mockUsers),
            MockSqlClient,
            createMockCurrentUser({ id: 'user-3' }),
            createMockDelegationRepository({
              delegations: [
                {
                  id: 'delegation-1',
                  ownerId: 'user-1',
                  caretakerId: 'user-3',
                  status: 'active',
                  message: null,
                  startDate: new Date('2024-01-01'),
                  endDate: new Date('2025-12-31'),
                  respondedAt: new Date(),
                  canceledAt: null,
                  completedAt: null,
                  createdAt: new Date(),
                  updatedAt: new Date(),
                },
              ],
              delegationPlants: [
                { delegationId: 'delegation-1', plantId: 'plant-1' },
              ],
            }),
            createMockEventBus(),
            createMockCareScheduleRepository({
              schedules: delegationSchedules,
              plants: mockPlants,
            })
          )
        )
      )
    )

    expect(result).toHaveLength(1)
    const plant1Result = pipe(
      Array.findFirst(result, (r) => r.plantId === 'plant-1'),
      (opt) => (opt._tag === 'Some' ? opt.value : undefined)
    )
    expect(plant1Result?.success).toBe(true)
  })

  it('should publish CareLogCreated events for each watered plant', async () => {
    const eventBusData: MockEventBusData = { publishedEvents: [] }
    const { layer } = createTestLayer('user-1', eventBusData)
    await Effect.runPromise(
      waterMultiplePlants({ plantIds: ['plant-1', 'plant-2'] }).pipe(
        Effect.provide(layer)
      )
    )

    const careLogEvents = Array.filter(
      eventBusData.publishedEvents,
      (e) => e._tag === 'CareLogCreated'
    )
    expect(careLogEvents).toHaveLength(2)
    const plantIds = Array.map(
      careLogEvents,
      (e) => (e as { plantId: string }).plantId
    )
    expect(plantIds).toContain('plant-1')
    expect(plantIds).toContain('plant-2')
  })

  it('should publish AttentionResponded event for NEEDS_ATTENTION plants', async () => {
    const eventBusData: MockEventBusData = { publishedEvents: [] }
    const plantsWithAttention = [
      createTestPlant({ id: 'attention-plant', health: 'NEEDS_ATTENTION' }),
      ...mockPlants,
    ]
    const attentionSchedules = schedulesFromPlants(plantsWithAttention)

    await Effect.runPromise(
      waterMultiplePlants({ plantIds: ['attention-plant'] }).pipe(
        Effect.provide(
          Layer.mergeAll(
            createMockPlantRepository({ plants: plantsWithAttention }),
            createMockCareLogRepository(mockCareLogs),
            createMockNotificationRepository([]),
            createMockUserRepository(mockUsers),
            MockSqlClient,
            createMockCurrentUser({ id: 'user-1' }),
            createMockDelegationRepository(),
            createMockEventBus(eventBusData),
            createMockCareScheduleRepository({
              schedules: attentionSchedules,
              plants: plantsWithAttention,
            })
          )
        )
      )
    )

    const attentionEvents = Array.filter(
      eventBusData.publishedEvents,
      (e) => e._tag === 'AttentionResponded'
    )
    expect(attentionEvents).toHaveLength(1)
    expect(attentionEvents[0]).toMatchObject({
      _tag: 'AttentionResponded',
      plantId: 'attention-plant',
    })
  })

  it('should not publish events for failed waterings', async () => {
    const eventBusData: MockEventBusData = { publishedEvents: [] }
    const { layer } = createTestLayer('user-1', eventBusData)
    await Effect.runPromise(
      waterMultiplePlants({ plantIds: ['non-existent'] }).pipe(
        Effect.provide(layer)
      )
    )

    expect(eventBusData.publishedEvents).toHaveLength(0)
  })
})
