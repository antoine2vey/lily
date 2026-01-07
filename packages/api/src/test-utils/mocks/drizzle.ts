import * as PgDrizzle from '@effect/sql-drizzle/Pg'
import type { User } from '@lily/shared'
import type { PgRemoteDatabase } from 'drizzle-orm/pg-proxy'
import { Effect, Layer } from 'effect'

// Mock user data
export const mockUsers: User[] = [
  {
    id: 'user-1',
    name: 'Test User',
    email: 'test@example.com',
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    emailVerified: true,
    image: null,
  },
  {
    id: 'user-2',
    name: 'Another User',
    email: 'another@example.com',
    createdAt: new Date('2024-01-02'),
    updatedAt: new Date('2024-01-02'),
    emailVerified: false,
    image: 'https://example.com/avatar.png',
  },
]

// Mutable store for tests to manipulate
let mockUserStore = [...mockUsers]
let mockWhereFilter: ((user: User) => boolean) | null = null

export const resetMockStore = () => {
  mockUserStore = [...mockUsers]
  mockWhereFilter = null
}

export const getMockStore = () => mockUserStore

export const setMockStore = (users: User[]) => {
  mockUserStore = users
}

// Helper to set a filter for the next where() call
export const setMockWhereFilter = (filter: (user: User) => boolean) => {
  mockWhereFilter = filter
}

// Create a mock query builder that mimics Drizzle's API
const createMockQueryBuilder = () => {
  const queryBuilder = {
    select: () => ({
      from: () => {
        const fromResult = Effect.succeed(mockUserStore)
        // Add where method that can be chained
        return Object.assign(fromResult, {
          where: () => {
            if (mockWhereFilter) {
              const filtered = mockUserStore.filter(mockWhereFilter)
              mockWhereFilter = null
              return Effect.succeed(filtered)
            }
            return Effect.succeed(mockUserStore)
          },
        })
      },
    }),
    insert: () => ({
      values: (data: Partial<User>) => ({
        returning: () => {
          const newUser: User = {
            id: `user-${Date.now()}`,
            name: data.name ?? '',
            email: data.email ?? '',
            createdAt: new Date(),
            updatedAt: new Date(),
            emailVerified: data.emailVerified ?? false,
            image: data.image ?? null,
          }
          mockUserStore.push(newUser)
          return Effect.succeed([newUser])
        },
      }),
    }),
    update: () => ({
      set: (data: Partial<User>) => ({
        where: () => ({
          returning: () => {
            if (mockWhereFilter) {
              const index = mockUserStore.findIndex(mockWhereFilter)
              mockWhereFilter = null
              const existingUser = mockUserStore[index]
              if (index >= 0 && existingUser) {
                const updatedUser = { ...existingUser, ...data }
                mockUserStore[index] = updatedUser
                return Effect.succeed([updatedUser])
              }
            }
            return Effect.succeed([])
          },
        }),
      }),
    }),
    delete: () => ({
      where: () => ({
        returning: () => {
          if (mockWhereFilter) {
            const index = mockUserStore.findIndex(mockWhereFilter)
            mockWhereFilter = null
            if (index >= 0) {
              const [deleted] = mockUserStore.splice(index, 1)
              return Effect.succeed([deleted])
            }
          }
          return Effect.succeed([])
        },
      }),
    }),
  }

  return queryBuilder
}

// Create the mock PgDrizzle layer
export const MockDrizzleLive = Layer.succeed(
  PgDrizzle.PgDrizzle,
  createMockQueryBuilder() as unknown as PgRemoteDatabase<Record<string, never>>
)

// Helper to create a layer that returns specific users
export const createMockDrizzleWithUsers = (users: User[]) => {
  setMockStore(users)
  return MockDrizzleLive
}
