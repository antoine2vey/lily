import { schedulesFromPlants } from '@lily/api/__tests__/fixtures/care-schedules'
import {
  createTestPlant,
  mockOverduePlants,
  mockPlants,
} from '@lily/api/__tests__/fixtures/plants'
import { mockUsers } from '@lily/api/__tests__/fixtures/users'
import {
  createMockPlantRepository,
  type MockCaretakingPlant,
} from '@lily/api/__tests__/mocks/plant.repository'
import { createMockCurrentUser } from '@lily/api/__tests__/mocks/session'
import { createMockUserRepository } from '@lily/api/__tests__/mocks/user.repository'
import { findPlants } from '@lily/api/services/plants/endpoints/find-plants'
import { Array, Effect, Layer, Option, pipe } from 'effect'
import { describe, expect, it } from 'vitest'

// Helper to create test layer with CurrentUser
const createTestLayer = (userId = 'user-1') =>
  Layer.mergeAll(
    createMockPlantRepository({ plants: mockPlants }),
    createMockCurrentUser({ id: userId }),
    createMockUserRepository(mockUsers)
  )

// Caretaking plants for includeCaretaking tests
const mockCaretakingPlants: MockCaretakingPlant[] = [
  {
    plant: createTestPlant({
      id: 'caretaking-plant-1',
      name: 'Delegated Orchid',
      userId: 'user-2',
      health: 'HEALTHY',
      dateAdded: new Date('2024-01-05'),
    }),
    ownerName: 'Alice',
  },
  {
    plant: createTestPlant({
      id: 'caretaking-plant-2',
      name: 'Delegated Cactus',
      userId: 'user-2',
      health: 'NEEDS_ATTENTION',
      dateAdded: new Date('2024-01-06'),
    }),
    ownerName: 'Bob',
  },
]

const createCaretakingTestLayer = (userId = 'user-1') =>
  Layer.mergeAll(
    createMockPlantRepository({
      plants: mockPlants,
      caretakingPlants: mockCaretakingPlants,
    }),
    createMockCurrentUser({ id: userId }),
    createMockUserRepository(mockUsers)
  )

describe('findPlants', () => {
  it('should return items with pagination info', async () => {
    const result = await Effect.runPromise(
      findPlants({}).pipe(Effect.provide(createTestLayer()))
    )

    expect(result.items).toBeDefined()
    // user-1 has 2 plants (plant-1, plant-2)
    expect(result.total).toBe(2)
    expect(result.page).toBe(1)
    expect(result.limit).toBe(20)
    expect(result.hasMore).toBe(false)
  })

  it('should return only plants for the current user', async () => {
    const result = await Effect.runPromise(
      findPlants({}).pipe(Effect.provide(createTestLayer('user-1')))
    )

    expect(Array.every(result.items, (p) => p.userId === 'user-1')).toBe(true)
    expect(result.total).toBe(2)
  })

  it('should return empty array when user has no plants', async () => {
    const result = await Effect.runPromise(
      findPlants({}).pipe(Effect.provide(createTestLayer('non-existent-user')))
    )

    expect(result.items).toEqual([])
    expect(result.total).toBe(0)
    expect(result.hasMore).toBe(false)
  })

  it('should respect page parameter', async () => {
    const result = await Effect.runPromise(
      findPlants({ page: 2, limit: 1 }).pipe(Effect.provide(createTestLayer()))
    )

    expect(result.page).toBe(2)
    expect(result.items.length).toBeLessThanOrEqual(1)
  })

  it('should respect limit parameter', async () => {
    const result = await Effect.runPromise(
      findPlants({ limit: 1 }).pipe(Effect.provide(createTestLayer()))
    )

    expect(result.items.length).toBe(1)
    expect(result.limit).toBe(1)
    // user-1 has 2 plants, so hasMore should be true with limit 1
    expect(result.hasMore).toBe(true)
  })

  it('should filter by needsAttention for current user only', async () => {
    // user-2 has the only NEEDS_ATTENTION plant
    const result = await Effect.runPromise(
      findPlants({ filter: 'needsAttention' }).pipe(
        Effect.provide(createTestLayer('user-2'))
      )
    )

    expect(
      Array.every(result.items, (p) => p.health === 'NEEDS_ATTENTION')
    ).toBe(true)
    expect(Array.every(result.items, (p) => p.userId === 'user-2')).toBe(true)
  })

  it('should return empty when filtering needsAttention but user has none', async () => {
    // user-1 has no NEEDS_ATTENTION plants
    const result = await Effect.runPromise(
      findPlants({ filter: 'needsAttention' }).pipe(
        Effect.provide(createTestLayer('user-1'))
      )
    )

    expect(result.items).toEqual([])
    expect(result.total).toBe(0)
  })

  it('should sort by name when specified', async () => {
    const result = await Effect.runPromise(
      findPlants({ sort: 'name' }).pipe(Effect.provide(createTestLayer()))
    )

    const names = Array.map(result.items, (p) => p.name)
    const sortedNames = [...names].sort()
    expect(names).toEqual(sortedNames)
  })

  describe('includeCaretaking', () => {
    it('should return only owned plants when includeCaretaking is false', async () => {
      const result = await Effect.runPromise(
        findPlants({ includeCaretaking: false }).pipe(
          Effect.provide(createCaretakingTestLayer())
        )
      )

      expect(Array.every(result.items, (p) => p.ownership === 'owned')).toBe(
        true
      )
      expect(result.total).toBe(2) // user-1 owns 2 plants
    })

    it('should return only owned plants by default (no includeCaretaking param)', async () => {
      const result = await Effect.runPromise(
        findPlants({}).pipe(Effect.provide(createCaretakingTestLayer()))
      )

      expect(Array.every(result.items, (p) => p.ownership === 'owned')).toBe(
        true
      )
      expect(result.total).toBe(2)
    })

    it('should return owned + caretaking plants when includeCaretaking is true', async () => {
      const result = await Effect.runPromise(
        findPlants({ includeCaretaking: true }).pipe(
          Effect.provide(createCaretakingTestLayer())
        )
      )

      // user-1 owns 2 plants + 2 caretaking plants
      expect(result.total).toBe(4)

      const owned = Array.filter(result.items, (p) => p.ownership === 'owned')
      const caretaking = Array.filter(
        result.items,
        (p) => p.ownership === 'caretaking'
      )
      expect(owned.length).toBe(2)
      expect(caretaking.length).toBe(2)
    })

    it('should set ownerName on caretaking plants', async () => {
      const result = await Effect.runPromise(
        findPlants({ includeCaretaking: true }).pipe(
          Effect.provide(createCaretakingTestLayer())
        )
      )

      const caretaking = Array.filter(
        result.items,
        (p) => p.ownership === 'caretaking'
      )
      const orchid = pipe(
        Array.findFirst(caretaking, (p) => p.id === 'caretaking-plant-1'),
        Option.getOrThrow
      )
      expect(orchid.ownerName).toBe('Alice')

      const cactus = pipe(
        Array.findFirst(caretaking, (p) => p.id === 'caretaking-plant-2'),
        Option.getOrThrow
      )
      expect(cactus.ownerName).toBe('Bob')
    })

    it('should set ownerName to null on owned plants', async () => {
      const result = await Effect.runPromise(
        findPlants({ includeCaretaking: true }).pipe(
          Effect.provide(createCaretakingTestLayer())
        )
      )

      const owned = Array.filter(result.items, (p) => p.ownership === 'owned')
      expect(Array.every(owned, (p) => p.ownerName === null)).toBe(true)
    })

    it('should apply needsAttention filter to caretaking plants too', async () => {
      const result = await Effect.runPromise(
        findPlants({
          includeCaretaking: true,
          filter: 'needsAttention',
        }).pipe(Effect.provide(createCaretakingTestLayer()))
      )

      // user-1 has no NEEDS_ATTENTION owned plants
      // caretaking-plant-2 is NEEDS_ATTENTION
      expect(result.total).toBe(1)
      expect(
        Array.every(result.items, (p) => p.ownership === 'caretaking')
      ).toBe(true)
    })

    it('should respect pagination with mixed owned + caretaking plants', async () => {
      const result = await Effect.runPromise(
        findPlants({ includeCaretaking: true, limit: 2 }).pipe(
          Effect.provide(createCaretakingTestLayer())
        )
      )

      expect(result.items.length).toBe(2)
      expect(result.total).toBe(4)
      expect(result.hasMore).toBe(true)
    })
  })

  describe('overdue filter', () => {
    const createOverdueTestLayer = (userId = 'user-1') =>
      Layer.mergeAll(
        createMockPlantRepository({
          plants: mockOverduePlants,
          schedules: schedulesFromPlants(mockOverduePlants),
        }),
        createMockCurrentUser({ id: userId }),
        createMockUserRepository(mockUsers)
      )

    it('should return only plants with nextWateringAt <= end of today', async () => {
      const result = await Effect.runPromise(
        findPlants({ filter: 'overdue' }).pipe(
          Effect.provide(createOverdueTestLayer())
        )
      )

      // plant-overdue-1 (past) and plant-today-1 (today) should be included
      // plant-tomorrow-1 (future) and plant-null-water (null) should be excluded
      expect(result.items.length).toBe(2)
      const ids = Array.map(result.items, (p) => p.id)
      expect(ids).toContain('plant-overdue-1')
      expect(ids).toContain('plant-today-1')
    })

    it('should exclude plants with null nextWateringAt', async () => {
      const result = await Effect.runPromise(
        findPlants({ filter: 'overdue' }).pipe(
          Effect.provide(createOverdueTestLayer())
        )
      )

      const ids = Array.map(result.items, (p) => p.id)
      expect(ids).not.toContain('plant-null-water')
    })

    it('should respect pagination with overdue filter', async () => {
      const result = await Effect.runPromise(
        findPlants({ filter: 'overdue', limit: 1 }).pipe(
          Effect.provide(createOverdueTestLayer())
        )
      )

      expect(result.items.length).toBe(1)
      expect(result.hasMore).toBe(true)
      expect(result.total).toBe(2)
    })

    it('should isolate overdue plants by user', async () => {
      const result = await Effect.runPromise(
        findPlants({ filter: 'overdue' }).pipe(
          Effect.provide(createOverdueTestLayer('user-2'))
        )
      )

      // user-2 has one overdue plant
      expect(result.items.length).toBe(1)
      expect(Array.head(result.items)).toEqual(
        Option.some(expect.objectContaining({ id: 'plant-overdue-user2' }))
      )
    })
  })
})
